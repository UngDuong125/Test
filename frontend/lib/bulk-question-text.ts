/**
 * Parse teacher-authored text blocks into create-question payloads
 * for multiple_choice, true_false, fill_blank, short_answer.
 *
 * Q / phương án hỗ trợ text lẫn LaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`,
 * hoặc cả field `latex: ...`). ANSWER điền/ngắn: có thể bọc `$...$` — lưu chuỗi
 * LaTeX đã chuẩn hóa để chấm tự động.
 */

import { normalizeLatexInput } from '@/lib/latex';
import type {
  ContentBlock,
  Difficulty,
  QuestionAnswer,
  QuestionOption,
} from '@/types/content';

export const BULK_SUPPORTED_TYPES = [
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
] as const;

export type BulkSupportedType = (typeof BULK_SUPPORTED_TYPES)[number];

export type BulkQuestionPayload = {
  type: BulkSupportedType;
  difficulty: Difficulty;
  content: ContentBlock[];
  options: QuestionOption[];
  answer: QuestionAnswer;
  explanation: { text?: string };
  points: number;
  tags: string[];
  topicIds: string[];
};

export type BulkParseOk = {
  ok: true;
  index: number;
  payload: BulkQuestionPayload;
  preview: string;
};

export type BulkParseErr = {
  ok: false;
  index: number;
  message: string;
  raw: string;
};

export type BulkParseItem = BulkParseOk | BulkParseErr;

const FIELD_RE =
  /^(TYPE|LOẠI|LOAI|Q|QUESTION|CÂU|CAU|ANSWER|ĐÁP\s*ÁN|DAP\s*AN|POINTS|ĐIỂM|DIEM|DIFFICULTY|ĐỘ\s*KHÓ|DO\s*KHO|EXPLAIN|EXPLANATION|GIẢI\s*THÍCH|GIAI\s*THICH)\s*:\s*(.*)$/i;

const OPTION_RE = /^([A-Ha-h])\s*[\)\.\:]\s*(.+)$/;

const TYPE_ALIASES: Record<string, BulkSupportedType> = {
  multiple_choice: 'multiple_choice',
  mc: 'multiple_choice',
  mcq: 'multiple_choice',
  tn: 'multiple_choice',
  tracnghiem: 'multiple_choice',
  'trắc nghiệm': 'multiple_choice',
  'trac nghiem': 'multiple_choice',
  true_false: 'true_false',
  tf: 'true_false',
  ds: 'true_false',
  dung_sai: 'true_false',
  'đúng sai': 'true_false',
  'dung sai': 'true_false',
  fill_blank: 'fill_blank',
  fill: 'fill_blank',
  blank: 'fill_blank',
  dien: 'fill_blank',
  'điền': 'fill_blank',
  'dien khuyet': 'fill_blank',
  'điền khuyết': 'fill_blank',
  short_answer: 'short_answer',
  sa: 'short_answer',
  short: 'short_answer',
  ngan: 'short_answer',
  'ngắn': 'short_answer',
  'tra loi ngan': 'short_answer',
  'trả lời ngắn': 'short_answer',
};

const DIFF_ALIASES: Record<string, Difficulty> = {
  easy: 'easy',
  de: 'easy',
  dễ: 'easy',
  medium: 'medium',
  tb: 'medium',
  'trung binh': 'medium',
  'trung bình': 'medium',
  hard: 'hard',
  kho: 'hard',
  khó: 'hard',
};

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  return normalized
    .split(/^\s*={3,}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
}

function stripCorrectMarker(text: string): { text: string; correct: boolean } {
  let t = text.trim();
  let correct = false;
  if (/\*$/.test(t) || /\(đúng\)\s*$/i.test(t) || /\(dung\)\s*$/i.test(t) || /\(correct\)\s*$/i.test(t)) {
    correct = true;
    t = t
      .replace(/\*$/, '')
      .replace(/\(đúng\)\s*$/i, '')
      .replace(/\(dung\)\s*$/i, '')
      .replace(/\(correct\)\s*$/i, '')
      .trim();
  }
  return { text: t, correct };
}

function assertBalancedBraces(value: string, context: string) {
  const open = (value.match(/\{/g) ?? []).length;
  const close = (value.match(/\}/g) ?? []).length;
  if (open !== close) {
    throw new Error(`${context}: số lượng { } trong LaTeX không cân bằng`);
  }
}

function pushText(blocks: ContentBlock[], text: string) {
  if (!text) return;
  const last = blocks[blocks.length - 1];
  if (last?.type === 'text') {
    last.value += text;
  } else {
    blocks.push({ type: 'text', value: text });
  }
}

function pushLatex(blocks: ContentBlock[], raw: string, context: string) {
  const value = normalizeLatexInput(raw.trim());
  if (!value) throw new Error(`${context}: khối LaTeX trống`);
  assertBalancedBraces(value, context);
  blocks.push({ type: 'latex', value });
}

/**
 * Tách chuỗi thành các ContentBlock text / latex.
 * Delimiter: $$...$$, $...$, \[...\], \(...\), hoặc cả field `latex: ...`.
 */
export function parseContentBlocks(input: string, context = 'Nội dung'): ContentBlock[] {
  const source = input.replace(/\r\n/g, '\n');
  const trimmed = source.trim();
  if (!trimmed) return [];

  const latexField = trimmed.match(/^latex\s*:\s*([\s\S]+)$/i);
  if (latexField) {
    const blocks: ContentBlock[] = [];
    pushLatex(blocks, latexField[1]!, context);
    return blocks;
  }

  const blocks: ContentBlock[] = [];
  let i = 0;
  let textBuf = '';

  const flushText = () => {
    if (!textBuf) return;
    pushText(blocks, textBuf);
    textBuf = '';
  };

  while (i < source.length) {
    // $$ display math
    if (source.startsWith('$$', i)) {
      const end = source.indexOf('$$', i + 2);
      if (end === -1) {
        throw new Error(`${context}: thiếu cặp đóng $$`);
      }
      flushText();
      pushLatex(blocks, source.slice(i + 2, end), context);
      i = end + 2;
      continue;
    }

    // \[ ... \]
    if (source.startsWith('\\[', i)) {
      const end = source.indexOf('\\]', i + 2);
      if (end === -1) throw new Error(`${context}: thiếu cặp đóng \\]`);
      flushText();
      pushLatex(blocks, source.slice(i + 2, end), context);
      i = end + 2;
      continue;
    }

    // \( ... \)
    if (source.startsWith('\\(', i)) {
      const end = source.indexOf('\\)', i + 2);
      if (end === -1) throw new Error(`${context}: thiếu cặp đóng \\)`);
      flushText();
      pushLatex(blocks, source.slice(i + 2, end), context);
      i = end + 2;
      continue;
    }

    // escaped \$
    if (source.startsWith('\\$', i)) {
      textBuf += '$';
      i += 2;
      continue;
    }

    // $ inline math (single dollar)
    if (source[i] === '$') {
      const end = source.indexOf('$', i + 1);
      if (end === -1) {
        throw new Error(`${context}: thiếu cặp đóng $`);
      }
      flushText();
      pushLatex(blocks, source.slice(i + 1, end), context);
      i = end + 1;
      continue;
    }

    textBuf += source[i]!;
    i += 1;
  }

  flushText();

  // Trim leading/trailing whitespace-only text edges
  if (blocks[0]?.type === 'text') {
    blocks[0].value = blocks[0].value.replace(/^\s+/, '');
    if (!blocks[0].value) blocks.shift();
  }
  const last = blocks[blocks.length - 1];
  if (last?.type === 'text') {
    last.value = last.value.replace(/\s+$/, '');
    if (!last.value) blocks.pop();
  }

  if (!blocks.length) {
    throw new Error(`${context}: trống sau khi parse`);
  }
  return blocks;
}

function contentPreview(blocks: ContentBlock[]): string {
  const flat = blocks
    .map((b) => (b.type === 'latex' ? `$${b.value}$` : b.type === 'text' ? b.value : '[Ảnh]'))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

/** Chuỗi đáp án điền/ngắn: bỏ delimiter LaTeX nếu bọc ngoài, chuẩn hóa escape. */
export function normalizeAnswerToken(raw: string): string {
  const t = raw.trim();
  if (!t) return '';

  const latexField = t.match(/^latex\s*:\s*([\s\S]+)$/i);
  if (latexField) {
    const value = normalizeLatexInput(latexField[1]!.trim());
    assertBalancedBraces(value, 'ANSWER');
    return value;
  }

  if (t.startsWith('$$') && t.endsWith('$$') && t.length > 4) {
    const value = normalizeLatexInput(t.slice(2, -2).trim());
    assertBalancedBraces(value, 'ANSWER');
    return value;
  }
  if (t.startsWith('$') && t.endsWith('$') && t.length > 2 && !t.slice(1, -1).includes('$')) {
    const value = normalizeLatexInput(t.slice(1, -1).trim());
    assertBalancedBraces(value, 'ANSWER');
    return value;
  }
  if (t.startsWith('\\[') && t.endsWith('\\]') && t.length > 4) {
    const value = normalizeLatexInput(t.slice(2, -2).trim());
    assertBalancedBraces(value, 'ANSWER');
    return value;
  }
  if (t.startsWith('\\(') && t.endsWith('\\)') && t.length > 4) {
    const value = normalizeLatexInput(t.slice(2, -2).trim());
    assertBalancedBraces(value, 'ANSWER');
    return value;
  }

  return t;
}

function parseAnswerList(raw: string): string[] {
  return raw
    .split(/[|\n]/)
    .map((s) => normalizeAnswerToken(s))
    .filter(Boolean);
}

function resolveTrueFalseAnswer(raw: string): 'A' | 'B' | null {
  const n = normalizeKey(raw);
  if (['a', 'dung', 'true', 't', '1', 'yes', 'correct'].includes(n)) return 'A';
  if (['b', 'sai', 'false', 'f', '0', 'no', 'incorrect'].includes(n)) return 'B';
  return null;
}

function looksLikeTrueFalseOptions(opts: { id: string; text: string }[]): boolean {
  if (opts.length !== 2) return false;
  const texts = opts.map((o) => normalizeKey(o.text));
  const hasTrue = texts.some((t) => t === 'dung' || t === 'true');
  const hasFalse = texts.some((t) => t === 'sai' || t === 'false');
  return hasTrue && hasFalse;
}

type ParsedFields = {
  typeRaw?: string;
  questionLines: string[];
  options: { id: string; text: string; marked: boolean }[];
  answerRaw?: string;
  pointsRaw?: string;
  difficultyRaw?: string;
  explainLines: string[];
};

function parseFields(block: string): ParsedFields {
  const lines = block.split('\n');
  const result: ParsedFields = {
    questionLines: [],
    options: [],
    explainLines: [],
  };

  type Mode = 'none' | 'q' | 'explain' | 'answer';
  let mode: Mode = 'none';

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) {
      if (mode === 'q') result.questionLines.push('');
      if (mode === 'explain') result.explainLines.push('');
      continue;
    }

    const field = trimmed.match(FIELD_RE);
    if (field) {
      const key = normalizeKey(field[1]!);
      const value = (field[2] ?? '').trim();
      mode = 'none';

      if (key === 'type' || key === 'loai') {
        result.typeRaw = value;
      } else if (key === 'q' || key === 'question' || key === 'cau') {
        mode = 'q';
        if (value) result.questionLines.push(value);
      } else if (
        key === 'answer' ||
        key === 'dap an' ||
        key.startsWith('dap')
      ) {
        mode = 'answer';
        result.answerRaw = value || result.answerRaw || '';
        if (value) {
          // keep accumulating via mode
        }
      } else if (key === 'points' || key === 'diem') {
        result.pointsRaw = value;
      } else if (key === 'difficulty' || key === 'do kho') {
        result.difficultyRaw = value;
      } else if (
        key === 'explain' ||
        key === 'explanation' ||
        key === 'giai thich'
      ) {
        mode = 'explain';
        if (value) result.explainLines.push(value);
      }
      continue;
    }

    const opt = trimmed.match(OPTION_RE);
    if (opt) {
      mode = 'none';
      const id = opt[1]!.toUpperCase();
      const { text, correct } = stripCorrectMarker(opt[2]!);
      if (!text) continue;
      result.options.push({ id, text, marked: correct });
      continue;
    }

    if (mode === 'q') {
      result.questionLines.push(trimmed);
    } else if (mode === 'explain') {
      result.explainLines.push(trimmed);
    } else if (mode === 'answer') {
      result.answerRaw = result.answerRaw
        ? `${result.answerRaw}\n${trimmed}`
        : trimmed;
    } else if (!result.questionLines.length && !result.typeRaw) {
      // Bare first lines = question stem when Q: omitted
      mode = 'q';
      result.questionLines.push(trimmed);
    }
  }

  return result;
}

function resolveType(
  fields: ParsedFields,
  fallback?: BulkSupportedType,
): BulkSupportedType | null {
  if (fields.typeRaw) {
    const alias = TYPE_ALIASES[normalizeKey(fields.typeRaw)];
    if (alias) return alias;
    return null;
  }
  if (fields.options.length >= 2) {
    if (looksLikeTrueFalseOptions(fields.options)) return 'true_false';
    return 'multiple_choice';
  }
  const q = fields.questionLines.join('\n');
  if (/_{2,}|\[\s*\]|\(\s*\)/.test(q)) return 'fill_blank';
  if (fields.answerRaw) return fallback ?? 'short_answer';
  return fallback ?? null;
}

function buildPayload(fields: ParsedFields, type: BulkSupportedType): BulkQuestionPayload {
  const qText = fields.questionLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!qText) throw new Error('Thiếu nội dung câu hỏi (Q:)');

  const content = parseContentBlocks(qText, 'Q');

  let points = 1;
  if (fields.pointsRaw) {
    const n = Number(fields.pointsRaw.replace(',', '.'));
    if (!(n > 0) || n > 100) throw new Error('POINTS phải là số > 0 và ≤ 100');
    points = n;
  }

  let difficulty: Difficulty = 'medium';
  if (fields.difficultyRaw) {
    const d = DIFF_ALIASES[normalizeKey(fields.difficultyRaw)];
    if (!d) throw new Error('DIFFICULTY phải là easy / medium / hard');
    difficulty = d;
  }

  const explainText = fields.explainLines.join('\n').trim();
  const explanation = explainText ? { text: explainText } : {};

  if (type === 'multiple_choice') {
    if (fields.options.length < 2) {
      throw new Error('Trắc nghiệm cần ít nhất 2 phương án (A) B) …)');
    }
    const marked = fields.options.filter((o) => o.marked);
    let answerId: string | undefined;
    if (marked.length === 1) {
      answerId = marked[0]!.id;
    } else if (marked.length > 1) {
      throw new Error('Chỉ đánh dấu một đáp án đúng bằng * (hoặc dùng ANSWER: B)');
    } else if (fields.answerRaw) {
      const letter = fields.answerRaw.trim().toUpperCase().replace(/[^A-H]/g, '');
      if (!letter || letter.length !== 1) {
        throw new Error('ANSWER phải là chữ cái phương án (vd. B)');
      }
      answerId = letter;
    } else {
      throw new Error('Thiếu đáp án — thêm * sau phương án đúng hoặc ANSWER: B');
    }
    if (!fields.options.some((o) => o.id === answerId)) {
      throw new Error(`Đáp án ${answerId} không khớp phương án nào`);
    }
    const options: QuestionOption[] = fields.options.map((o, i) => ({
      id: o.id,
      content: parseContentBlocks(o.text, `Phương án ${o.id}`),
      order: i + 1,
    }));
    return {
      type,
      difficulty,
      content,
      options,
      answer: { type: 'single', value: answerId },
      explanation,
      points,
      tags: [],
      topicIds: [],
    };
  }

  if (type === 'true_false') {
    let options: QuestionOption[];
    if (fields.options.length === 2) {
      options = fields.options.map((o, i) => ({
        id: o.id,
        content: parseContentBlocks(o.text, `Phương án ${o.id}`),
        order: i + 1,
      }));
    } else if (fields.options.length === 0) {
      options = [
        { id: 'A', content: [{ type: 'text', value: 'Đúng' }], order: 1 },
        { id: 'B', content: [{ type: 'text', value: 'Sai' }], order: 2 },
      ];
    } else {
      throw new Error('Đúng/Sai cần đúng 2 phương án hoặc để trống (mặc định Đúng/Sai)');
    }

    let answerId: string | undefined;
    const marked = fields.options.filter((o) => o.marked);
    if (marked.length === 1) {
      answerId = marked[0]!.id;
    } else if (fields.answerRaw) {
      const mapped = resolveTrueFalseAnswer(fields.answerRaw);
      if (!mapped) throw new Error('ANSWER đúng/sai phải là đúng|sai (hoặc A|B)');
      answerId = mapped;
    } else {
      throw new Error('Thiếu ANSWER: đúng|sai (hoặc đánh dấu *)');
    }

    if (!options.some((o) => o.id === answerId)) {
      throw new Error(`Đáp án ${answerId} không khớp phương án`);
    }

    return {
      type,
      difficulty,
      content,
      options,
      answer: { type: 'single', value: answerId },
      explanation,
      points,
      tags: [],
      topicIds: [],
    };
  }

  // fill_blank | short_answer
  if (!fields.answerRaw?.trim()) {
    throw new Error('Thiếu ANSWER: (có thể nhiều đáp án cách nhau bằng |)');
  }
  const answers = parseAnswerList(fields.answerRaw);
  if (!answers.length) throw new Error('ANSWER không được để trống');

  return {
    type,
    difficulty,
    content,
    options: [],
    answer: { type: 'text', value: answers },
    explanation,
    points,
    tags: [],
    topicIds: [],
  };
}

export function parseBulkQuestionText(
  text: string,
  options?: { defaultType?: BulkSupportedType },
): BulkParseItem[] {
  const blocks = splitBlocks(text);
  if (!blocks.length) return [];

  return blocks.map((raw, index) => {
    try {
      const fields = parseFields(raw);
      if (fields.typeRaw && !TYPE_ALIASES[normalizeKey(fields.typeRaw)]) {
        return {
          ok: false as const,
          index,
          message: `TYPE không hỗ trợ: ${fields.typeRaw} (chỉ TN / Đ-S / điền / ngắn)`,
          raw,
        };
      }
      const type = resolveType(fields, options?.defaultType);
      if (!type) {
        return {
          ok: false as const,
          index,
          message:
            'Không nhận diện được loại câu — thêm TYPE: multiple_choice|true_false|fill_blank|short_answer',
          raw,
        };
      }
      const payload = buildPayload(fields, type);
      const preview = contentPreview(payload.content);
      return { ok: true as const, index, payload, preview };
    } catch (err) {
      return {
        ok: false as const,
        index,
        message: err instanceof Error ? err.message : 'Parse thất bại',
        raw,
      };
    }
  });
}

export const BULK_EXAMPLE_TEXT = `===
TYPE: multiple_choice
Q: Giá trị của $\\frac{1}{2} + \\frac{1}{3}$ là?
A) $\\frac{1}{5}$
B) $\\frac{5}{6}$*
C) $\\frac{2}{5}$
D) 1
POINTS: 1
===
TYPE: true_false
Q: Biểu thức $$a^2 - b^2 = (a-b)(a+b)$$ đúng với mọi số thực $a,b$.
ANSWER: đúng
===
TYPE: fill_blank
Q: Đạo hàm của $x^2$ là ____.
ANSWER: $2x$ | 2x
===
TYPE: short_answer
Q: Viết công thức nghiệm phương trình bậc hai.
ANSWER: latex: \\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}
DIFFICULTY: medium
===`;

export const BULK_FORMAT_HELP = `Mỗi câu cách nhau bằng ===. Trường: TYPE, Q, A) B)…, ANSWER, POINTS, DIFFICULTY, EXPLAIN.

LaTeX trong Q / phương án:
- Inline: $...$ hoặc \\(...\\)
- Display: $$...$$ hoặc \\[...\\]
- Cả field: latex: \\frac{1}{2}
- Dấu $ thường: ghi \\$

ANSWER điền/ngắn: text thường, hoặc bọc $...$ / latex: ... (lưu chuỗi LaTeX để chấm).

- Trắc nghiệm: * sau phương án đúng hoặc ANSWER: B
- Đúng/Sai: ANSWER: đúng|sai
- Điền / ngắn: ANSWER: đáp1 | đáp2`;

export function templateForType(type: BulkSupportedType): string {
  switch (type) {
    case 'multiple_choice':
      return `TYPE: multiple_choice
Q: Tính $\\frac{1}{2}+\\frac{1}{3}$
A) $\\frac{1}{5}$
B) $\\frac{5}{6}$*
C) 1
D) $\\frac{2}{3}$
POINTS: 1`;
    case 'true_false':
      return `TYPE: true_false
Q: $a^2+b^2=(a+b)^2$ với mọi $a,b$.
ANSWER: sai
POINTS: 1`;
    case 'fill_blank':
      return `TYPE: fill_blank
Q: $\\sin^2 x + \\cos^2 x =$ ____
ANSWER: $1$ | 1
POINTS: 1`;
    case 'short_answer':
      return `TYPE: short_answer
Q: Công thức diện tích hình tròn bán kính $r$?
ANSWER: $\\pi r^2$ | pi r^2
POINTS: 1`;
  }
}
