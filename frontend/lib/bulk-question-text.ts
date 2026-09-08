/**
 * Parse teacher-authored text blocks into create-question payloads
 * for multiple_choice, true_false, fill_blank, short_answer.
 */

import type { Difficulty, QuestionAnswer, QuestionOption, QuestionType } from '@/types/content';

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
  content: { type: 'text'; value: string }[];
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

function parseAnswerList(raw: string): string[] {
  return raw
    .split(/[|\n]/)
    .map((s) => s.trim())
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
      content: [{ type: 'text' as const, value: o.text }],
      order: i + 1,
    }));
    return {
      type,
      difficulty,
      content: [{ type: 'text', value: qText }],
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
        content: [{ type: 'text' as const, value: o.text }],
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
      // Map semantic A/B onto actual option ids when custom labels used with A/B ids
      if (options.length === 2 && options[0]!.id === 'A' && options[1]!.id === 'B') {
        answerId = mapped;
      } else {
        answerId = mapped;
      }
    } else {
      throw new Error('Thiếu ANSWER: đúng|sai (hoặc đánh dấu *)');
    }

    if (!options.some((o) => o.id === answerId)) {
      // If options are A/B with Đúng/Sai, answerId is already A or B
      throw new Error(`Đáp án ${answerId} không khớp phương án`);
    }

    return {
      type,
      difficulty,
      content: [{ type: 'text', value: qText }],
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
    content: [{ type: 'text', value: qText }],
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
      const preview =
        payload.content[0]?.value.slice(0, 80) +
        (payload.content[0]!.value.length > 80 ? '…' : '');
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
Q: 2 + 2 = ?
A) 3
B) 4*
C) 5
D) 6
POINTS: 1
===
TYPE: true_false
Q: Trái Đất quay quanh Mặt Trời.
ANSWER: đúng
===
TYPE: fill_blank
Q: Thủ đô Việt Nam là ____.
ANSWER: Hà Nội | Ha Noi
===
TYPE: short_answer
Q: Công thức diện tích hình vuông cạnh a?
ANSWER: a^2 | a²
DIFFICULTY: medium
===`;

export const BULK_FORMAT_HELP = `Mỗi câu cách nhau bằng ===. Trường hỗ trợ: TYPE, Q, A) B)…, ANSWER, POINTS, DIFFICULTY, EXPLAIN.

- Trắc nghiệm: đánh dấu đáp án bằng * (vd. B) 4*) hoặc ANSWER: B
- Đúng/Sai: ANSWER: đúng|sai (hoặc A|B); có thể bỏ phương án (mặc định Đúng/Sai)
- Điền / trả lời ngắn: ANSWER: đáp1 | đáp2 (nhiều đáp án chấp nhận được)`;

export function templateForType(type: BulkSupportedType): string {
  switch (type) {
    case 'multiple_choice':
      return `TYPE: multiple_choice
Q: 
A) 
B) *
C) 
D) 
POINTS: 1`;
    case 'true_false':
      return `TYPE: true_false
Q: 
ANSWER: đúng
POINTS: 1`;
    case 'fill_blank':
      return `TYPE: fill_blank
Q: ____
ANSWER: 
POINTS: 1`;
    case 'short_answer':
      return `TYPE: short_answer
Q: 
ANSWER: 
POINTS: 1`;
  }
}
