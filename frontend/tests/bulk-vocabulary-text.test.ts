import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { VOCAB_PASTE_EXAMPLE, parseBulkVocabularyText } from '@/lib/bulk-vocabulary-text';

describe('parseBulkVocabularyText', () => {
  it('reads the built-in example, including a field block', () => {
    const items = parseBulkVocabularyText(VOCAB_PASTE_EXAMPLE);
    assert.equal(items.length, 4);
    assert.ok(items.every((item) => item.ok));
    const [apple, book, go, library] = items;
    assert.ok(apple?.ok && book?.ok && go?.ok && library?.ok);
    assert.deepEqual(apple.entry, {
      term: 'apple',
      reading: 'ˈæp.əl',
      definition: 'quả táo',
      example: 'I eat an apple',
    });
    assert.equal(book.entry.reading, null);
    assert.equal(book.entry.definition, 'quyển sách');
    assert.equal(go.entry.example, 'She goes to school');
    assert.equal(library.entry.term, '**library**');
    assert.equal(library.entry.reading, 'ˈlaɪ.brər.i');
    assert.equal(library.entry.example, 'The *library* is quiet.');
  });

  it('keeps bold, italic and underline marks in the columns', () => {
    const [item] = parseBulkVocabularyText('**apple** | quả *táo* | __ví dụ__');
    assert.ok(item?.ok);
    if (!item?.ok) return;
    assert.equal(item.entry.term, '**apple**');
    assert.equal(item.entry.definition, 'quả *táo*');
    assert.equal(item.entry.example, '__ví dụ__');
  });

  it('reports a line that has no meaning', () => {
    const items = parseBulkVocabularyText('apple');
    assert.equal(items[0]?.ok, false);
  });
});
