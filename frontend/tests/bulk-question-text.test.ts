import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BULK_EXAMPLE_TEXT,
  parseBulkQuestionText,
  parseContentBlocks,
  type BulkParseItem,
  type BulkParseOk,
} from '@/lib/bulk-question-text';

function ok(item: BulkParseItem | undefined): BulkParseOk {
  assert.ok(item, 'missing item');
  assert.ok(item.ok, `parse failed: ${item.ok ? '' : item.message}`);
  return item;
}

describe('parseContentBlocks', () => {
  it('splits text and LaTeX with all delimiters', () => {
    assert.deepEqual(parseContentBlocks('Tính $x^2$ và \\(y\\) rồi $$z$$'), [
      { type: 'text', value: 'Tính ' },
      { type: 'latex', value: 'x^2' },
      { type: 'text', value: ' và ' },
      { type: 'latex', value: 'y' },
      { type: 'text', value: ' rồi ' },
      { type: 'latex', value: 'z' },
    ]);
  });

  it('supports escaped dollar and latex: field', () => {
    assert.deepEqual(parseContentBlocks('Giá \\$5'), [{ type: 'text', value: 'Giá $5' }]);
    assert.deepEqual(parseContentBlocks('latex: \\\\frac{1}{2}'), [{ type: 'latex', value: '\\frac{1}{2}' }]);
  });

  it('rejects unbalanced input', () => {
    assert.throws(() => parseContentBlocks('Tính $x^2'), /thiếu cặp đóng \$/);
    assert.throws(() => parseContentBlocks('$\\frac{1}{2$'), /không cân bằng/);
  });
});

describe('parseBulkQuestionText', () => {
  it('parses the built-in example without errors', () => {
    const items = parseBulkQuestionText(BULK_EXAMPLE_TEXT);
    assert.equal(items.length, 4);
    const [mc, tf, fill, short] = items.map(ok);
    assert.deepEqual(mc!.payload.answer, { type: 'single', value: 'B' });
    assert.deepEqual(mc!.payload.topicNames, ['Phân số']);
    assert.deepEqual(tf!.payload.answer, { type: 'single', value: 'A' });
    assert.deepEqual(fill!.payload.answer, { type: 'text', value: ['2x', '2x'] });
    assert.equal(short!.payload.type, 'short_answer');
  });

  it('multiple choice via ANSWER letter, points with comma, Vietnamese difficulty', () => {
    const [item] = parseBulkQuestionText(`Q: 1 + 1 = ?
A) 1
B) 2
ANSWER: B
ĐIỂM: 1,5
ĐỘ KHÓ: dễ`);
    const p = ok(item).payload;
    assert.equal(p.type, 'multiple_choice');
    assert.deepEqual(p.answer, { type: 'single', value: 'B' });
    assert.equal(p.points, 1.5);
    assert.equal(p.difficulty, 'easy');
  });

  it('reports errors per block without breaking the others', () => {
    const items = parseBulkQuestionText(`Q: thiếu đáp án
A) 1
B) 2
===
Q: 2 + 2 = ?
A) 4*
B) 5`);
    assert.equal(items[0]!.ok, false);
    assert.equal(ok(items[1]).payload.answer.type, 'single');
  });

  it('true/false ANSWER maps to the option text, not to a fixed letter', () => {
    const [item] = parseBulkQuestionText(`Q: 2 là số nguyên tố.
A) Sai
B) Đúng
ANSWER: đúng`);
    const p = ok(item).payload;
    assert.equal(p.type, 'true_false');
    assert.deepEqual(p.answer, { type: 'single', value: 'B' });
  });

  it('true/false: default options, A/B letters and * markers', () => {
    const [byWord, byLetter, byMarker] = parseBulkQuestionText(`TYPE: true_false
Q: 1 > 2
ANSWER: sai
===
TYPE: đúng sai
Q: 1 < 2
ANSWER: A
===
Q: 3 là số chẵn.
A) Đúng
B) Sai*`);
    const p1 = ok(byWord).payload;
    assert.deepEqual(p1.answer, { type: 'single', value: 'B' });
    assert.deepEqual(p1.options.map((o) => o.content), [
      [{ type: 'text', value: 'Đúng' }],
      [{ type: 'text', value: 'Sai' }],
    ]);
    assert.deepEqual(ok(byLetter).payload.answer, { type: 'single', value: 'A' });
    assert.deepEqual(ok(byMarker).payload.answer, { type: 'single', value: 'B' });
  });

  it('several LaTeX answers with | inside and between them', () => {
    const [item] = parseBulkQuestionText(`TYPE: short_answer
Q: Viết $|a-b|$ theo cách khác
ANSWER: \\(|b-a|\\) | $|a-b|$ | |a-b|`);
    assert.deepEqual(ok(item).payload.answer, { type: 'text', value: ['|b-a|', '|a-b|', 'a-b'] });
  });

  it('rejects a matching block without pairs, accepts several marked options, rejects bad points', () => {
    const items = parseBulkQuestionText(`TYPE: matching
Q: x
===
Q: chọn
A) 1*
B) 2*
===
Q: 1+1
A) 2*
B) 3
POINTS: 0`);
    assert.equal(items[0]!.ok, false);
    assert.equal(ok(items[1]).payload.type, 'multiple_select');
    assert.deepEqual(ok(items[1]).payload.answer, { type: 'multiple', value: ['A', 'B'] });
    assert.equal(items[2]!.ok, false);
  });

  it('keeps italic and bold stars, and still accepts a trailing answer star', () => {
    const [marked, italic, bold] = parseBulkQuestionText(`Q: Một
A) *nghiêng*
B) 4*
===
Q: Hai
A) *nghiêng* *
B) thường
===
Q: Ba
A) **đậm**
B) thường*`);
    const markedAnswer = ok(marked).payload.answer;
    assert.equal(markedAnswer.type, 'single');
    if (markedAnswer.type === 'single') assert.equal(markedAnswer.value, 'B');
    const italicPayload = ok(italic).payload;
    assert.equal(italicPayload.answer.type, 'single');
    if (italicPayload.answer.type === 'single') assert.equal(italicPayload.answer.value, 'A');
    assert.deepEqual(italicPayload.options[0]!.content, [{ type: 'text', value: '*nghiêng*' }]);
    const boldPayload = ok(bold).payload;
    assert.equal(boldPayload.answer.type, 'single');
    if (boldPayload.answer.type === 'single') assert.equal(boldPayload.answer.value, 'B');
    assert.deepEqual(boldPayload.options[0]!.content, [{ type: 'text', value: '**đậm**' }]);
  });

  it('parses select-all, matching and ordering', () => {
    const [selectQ, matchQ, orderQ] = parseBulkQuestionText(`TYPE: multiple_select
Q: Chọn số chẵn
A) 1
B) 2
C) 4
ANSWER: B, C
===
TYPE: nối cặp
Q: Nối
apple | quả táo
book | quyển sách
~ xe đạp
===
TYPE: sắp xếp
Q: Các bước
1) Một
2) Hai
3) Ba`);
    const selected = ok(selectQ).payload;
    assert.equal(selected.type, 'multiple_select');
    assert.deepEqual(selected.answer, { type: 'multiple', value: ['B', 'C'] });

    const matched = ok(matchQ).payload;
    assert.equal(matched.type, 'matching');
    assert.deepEqual(matched.answer, { type: 'pairs', value: { L1: 'R1', L2: 'R2' } });
    assert.deepEqual(
      matched.options.map((opt) => opt.id),
      ['L1', 'R1', 'L2', 'R2', 'R3'],
    );

    const ordered = ok(orderQ).payload;
    assert.equal(ordered.type, 'ordering');
    assert.deepEqual(ordered.answer, { type: 'sequence', value: ['A', 'B', 'C'] });
    const firstContent = ordered.options[0]!.content;
    assert.ok(Array.isArray(firstContent));
    assert.deepEqual(firstContent[0], { type: 'text', value: 'Một' });
  });

  it('pairs explicit columns with ANSWER', () => {
    const [item] = parseBulkQuestionText(`TYPE: matching
Q: Nối phép tính
L1) 1+1
L2) 2+2
R1) 4
R2) 2
ANSWER: L1-R2 | L2-R1`);
    assert.deepEqual(ok(item).payload.answer, { type: 'pairs', value: { L1: 'R2', L2: 'R1' } });
  });

  it('fill_blank answer with absolute value LaTeX is not split on |', () => {
    const [item] = parseBulkQuestionText(`TYPE: fill_blank
Q: Giá trị tuyệt đối của $-3$ viết là ____
ANSWER: $|-3|$`);
    assert.deepEqual(ok(item).payload.answer, { type: 'text', value: ['|-3|'] });
  });
});
