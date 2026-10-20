/**
 * Parse teacher-authored text blocks into create-question payloads
 * for multiple_choice, multiple_select, true_false, fill_blank, short_answer,
 * matching and ordering.
 *
 * Q / phương án hỗ trợ text lẫn LaTeX (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`,
 * hoặc cả field `latex: ...`). ANSWER điền/ngắn: có thể bọc `$...$` — lưu chuỗi
 * LaTeX đã chuẩn hóa để chấm tự động.
 */

import { normalizeLatexInput } from '@/lib/latex';
import { normalizeTopicName, topicNameKey } from '@/lib/topics';
import type {
  ContentBlock,
  Difficulty,
  QuestionAnswer,
  QuestionOption,
} from '@/types/content';

export const BULK_SUPPORTED_TYPES = [
  'multiple_choice',
  'multiple_select',
  'true_false',
  'fill_blank',
  'short_answer',
  'matching',
  'ordering',
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
  /** Topic names from `TOPIC:`; resolved to ids (creating missing topics) before create. */
  topicNames: string[];
};

export type BulkQuestionCreatePayload = Omit<BulkQuestionPayload, 'topicNames'> & {
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
  /^(TYPE|LOẠI|LOAI|Q|QUESTION|CÂU|CAU|ANSWER|ĐÁP\s*ÁN|DAP\s*AN|PAIR|CẶP|CAP|POINTS|ĐIỂM|DIEM|DIFFICULTY|ĐỘ\s*KHÓ|DO\s*KHO|EXPLAIN|EXPLANATION|GIẢI\s*THÍCH|GIAI\s*THICH|TOPICS?|CHỦ\s*ĐỀ|CHU\s*DE)\s*:\s*(.*)$/i;

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
  multiple_select: 'multiple_select',
  ms: 'multiple_select',
  'nhieu dap an': 'multiple_select',
  'chon the': 'multiple_select',
  'chon nhieu': 'multiple_select',
  matching: 'matching',
  match: 'matching',
  noi: 'matching',
  'noi cap': 'matching',
  ordering: 'ordering',
  order: 'ordering',
  'sap xep': 'ordering',
  xep: 'ordering',
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

/** Stars that are not part of **bold** and not escaped. Odd count means a trailing marker star. */
function markerStarCount(value: string): number {
  return value.replace(/\\\*/g, '').replace(/\*\*/g, '').split('*').length - 1;
}

function stripCorrectMarker(text: string): { text: string; correct: boolean } {
  let t = text.trim();
  if (/\(đúng\)\s*$/i.test(t) || /\(dung\)\s*$/i.test(t) || /\(correct\)\s*$/i.test(t)) {
    return {
      text: t
        .replace(/\(đúng\)\s*$/i, '')
        .replace(/\(dung\)\s*$/i, '')
        .replace(/\(correct\)\s*$/i, '')
        .trim(),
      correct: true,
    };
  }
  // Prefer " *" so *nghiêng* and **đậm** stay intact.
  if (/\s\*\s*$/.test(t)) {
    return { text: t.replace(/\s\*\s*$/, '').trim(), correct: true };
  }
  if (t.endsWith('*') && markerStarCount(t) % 2 === 1) {
    return { text: t.slice(0, -1).trim(), correct: true };
  }
  return { text: t, correct: false };
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

/** Split on `|` / newline, but not inside `$...$`, `$$...$$`, `\(...\)`, `\[...\]` (e.g. `$|x|$`). */
function splitAnswerAlternatives(raw: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let close: string | null = null;
  let i = 0;
  while (i < raw.length) {
    if (close) {
      if (raw.startsWith(close, i)) {
        buf += close;
        i += close.length;
        close = null;
      } else {
        buf += raw[i]!;
        i += 1;
      }
      continue;
    }
    if (raw.startsWith('\\$', i)) {
      buf += '\\$';
      i += 2;
      continue;
    }
    const open = raw.startsWith('$$', i)
      ? '$$'
      : raw[i] === '$'
        ? '$'
        : raw.startsWith('\\(', i)
          ? '\\('
          : raw.startsWith('\\[', i)
            ? '\\['
            : null;
    if (open) {
      close = open === '\\(' ? '\\)' : open === '\\[' ? '\\]' : open;
      buf += open;
      i += open.length;
      continue;
    }
    if (raw[i] === '|' || raw[i] === '\n') {
      parts.push(buf);
      buf = '';
      i += 1;
      continue;
    }
    buf += raw[i]!;
    i += 1;
  }
  parts.push(buf);
  return parts;
}

function parseAnswerList(raw: string): string[] {
  return splitAnswerAlternatives(raw)
    .map((s) => normalizeAnswerToken(s))
    .filter(Boolean);
}

const TRUE_WORDS = ['dung', 'true', 't', '1', 'yes', 'correct'];
const FALSE_WORDS = ['sai', 'false', 'f', '0', 'no', 'incorrect'];

/**
 * `A`/`B` pick the option directly; đúng/sai pick the option whose text says so
 * (options may be written as `A) Sai`, `B) Đúng`), defaulting to A = Đúng, B = Sai.
 */
function resolveTrueFalseAnswer(raw: string, options: { id: string; text: string }[]): string | null {
  const n = normalizeKey(raw);
  if (n === 'a' || n === 'b') return n.toUpperCase();
  const want = TRUE_WORDS.includes(n) ? TRUE_WORDS : FALSE_WORDS.includes(n) ? FALSE_WORDS : null;
  if (!want) return null;
  const matched = options.find((o) => want.includes(normalizeKey(o.text)));
  if (matched) return matched.id;
  return want === TRUE_WORDS ? 'A' : 'B';
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
  pairRaw?: string;
  pointsRaw?: string;
  difficultyRaw?: string;
  explainLines: string[];
  topicRaws: string[];
  lefts: { id: string; text: string }[];
  rights: { id: string; text: string }[];
  shorthandPairs: { left: string; right: string }[];
  distractors: string[];
  orderLines: string[];
};

function knownType(raw?: string): BulkSupportedType | undefined {
  if (!raw) return undefined;
  return TYPE_ALIASES[normalizeKey(raw)];
}

function splitPairLine(line: string): { left: string; right: string } | null {
  const arrow = line.match(/^(.+?)\s*(?:→|->|=>)\s*(.+)$/);
  if (arrow?.[1]?.trim() && arrow[2]?.trim()) {
    return { left: arrow[1].trim(), right: arrow[2].trim() };
  }
  if (!line.includes('|')) return null;
  const parts = splitAnswerAlternatives(line).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  return { left: parts[0]!, right: parts[1]! };
}

function parseTopicNames(raws: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const raw of raws) {
    for (const part of raw.split('|')) {
      const name = normalizeTopicName(part);
      if (!name) continue;
      if (name.length > 100) throw new Error(`TOPIC "${name.slice(0, 20)}…" dài quá 100 ký tự`);
      const key = topicNameKey(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return names;
}

function parseFields(block: string): ParsedFields {
  const lines = block.split('\n');
  const result: ParsedFields = {
    questionLines: [],
    options: [],
    explainLines: [],
    topicRaws: [],
    lefts: [],
    rights: [],
    shorthandPairs: [],
    distractors: [],
    orderLines: [],
  };

  type Mode = 'none' | 'q' | 'explain' | 'answer' | 'pair' | 'order';
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
      } else if (key === 'pair' || key === 'cap') {
        mode = 'pair';
        if (value) result.pairRaw = value;
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
      } else if (key === 'topic' || key === 'topics' || key === 'chu de') {
        if (value) result.topicRaws.push(value);
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

    const typeNow = knownType(result.typeRaw);
    const leftMatch = trimmed.match(/^L(\d+)\s*[).:]\s*(.+)$/i);
    const rightMatch = trimmed.match(/^R(\d+)\s*[).:]\s*(.+)$/i);
    if (leftMatch && (typeNow === 'matching' || typeNow === undefined)) {
      mode = 'none';
      result.lefts.push({ id: `L${leftMatch[1]}`, text: leftMatch[2]!.trim() });
      continue;
    }
    if (rightMatch && (typeNow === 'matching' || typeNow === undefined)) {
      mode = 'none';
      result.rights.push({ id: `R${rightMatch[1]}`, text: rightMatch[2]!.trim() });
      continue;
    }

    const opt = trimmed.match(OPTION_RE);
    if (opt && typeNow !== 'ordering') {
      mode = 'none';
      const id = opt[1]!.toUpperCase();
      const { text, correct } = stripCorrectMarker(opt[2]!);
      if (!text) continue;
      result.options.push({ id, text, marked: correct });
      continue;
    }
    if (opt && typeNow === 'ordering') {
      mode = 'order';
      const { text } = stripCorrectMarker(opt[2]!);
      if (text) result.orderLines.push(text);
      continue;
    }

    if (typeNow === 'ordering') {
      const numbered = trimmed.match(/^\d+\s*[).]\s*(.+)$/);
      if (numbered) {
        mode = 'order';
        result.orderLines.push(numbered[1]!.trim());
        continue;
      }
    }

    if (typeNow === 'matching') {
      if (/^[~|]\s*\S/.test(trimmed)) {
        mode = 'none';
        const text = trimmed.replace(/^[~|]\s*/, '').trim();
        if (text) result.distractors.push(text);
        continue;
      }
      const pair = splitPairLine(trimmed);
      if (pair) {
        mode = 'none';
        result.shorthandPairs.push(pair);
        continue;
      }
    }

    if (mode === 'q') {
      if (typeNow === 'ordering' && result.questionLines.some((line) => line.trim())) {
        mode = 'order';
        result.orderLines.push(trimmed);
        continue;
      }
      result.questionLines.push(trimmed);
    } else if (mode === 'order') {
      result.orderLines.push(trimmed);
    } else if (mode === 'explain') {
      result.explainLines.push(trimmed);
    } else if (mode === 'pair') {
      result.pairRaw = result.pairRaw ? `${result.pairRaw}\n${trimmed}` : trimmed;
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
    if (fields.options.filter((opt) => opt.marked).length > 1) return 'multiple_select';
    return 'multiple_choice';
  }
  if (fields.shorthandPairs.length >= 2 || (fields.lefts.length >= 2 && fields.rights.length >= 2)) {
    return 'matching';
  }
  if (fields.orderLines.length >= 2) return 'ordering';
  const q = fields.questionLines.join('\n');
  if (/_{2,}|\[\s*\]|\(\s*\)/.test(q)) return 'fill_blank';
  if (fields.answerRaw) return fallback ?? 'short_answer';
  return fallback ?? null;
}

function toOptions(items: { id: string; text: string }[], label: string): QuestionOption[] {
  return items.map((item, index) => ({
    id: item.id,
    content: parseContentBlocks(item.text, `${label} ${item.id}`),
    order: index + 1,
  }));
}

function parsePairSpec(raw: string): Record<string, string> {
  const pairs: Record<string, string> = {};
  for (const part of raw.split(/[|,\n]+/)) {
    const token = part.trim();
    if (!token) continue;
    const match = token.match(/^(L\d+)\s*(?:→|->|=>|=|-)\s*(R\d+)$/i);
    if (!match) throw new Error(`Cặp không hợp lệ "${token}" (dùng L1-R2)`);
    const left = match[1]!.toUpperCase();
    const right = match[2]!.toUpperCase();
    if (pairs[left]) throw new Error(`Vế ${left} bị nối hai lần`);
    if (Object.values(pairs).includes(right)) throw new Error(`Vế ${right} bị nối hai lần`);
    pairs[left] = right;
  }
  if (!Object.keys(pairs).length) throw new Error('Thiếu cặp L1-R2');
  return pairs;
}

function assertUniqueIds(ids: string[], label: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`${label} bị trùng id`);
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
  const topicNames = parseTopicNames(fields.topicRaws);

  if (type === 'multiple_select') {
    if (fields.options.length < 2) {
      throw new Error('Chọn thẻ cần ít nhất 2 phương án (A) B) …)');
    }
    const marked = fields.options.filter((opt) => opt.marked).map((opt) => opt.id);
    let answerIds = marked;
    if (!answerIds.length && fields.answerRaw) {
      answerIds = [
        ...new Set(
          fields.answerRaw
            .toUpperCase()
            .split(/[^A-H]+/)
            .filter((letter) => letter.length === 1),
        ),
      ];
    }
    if (!answerIds.length) {
      throw new Error('Đánh dấu mỗi thẻ đúng bằng * hoặc ghi ANSWER: A, C');
    }
    if (answerIds.some((id) => !fields.options.some((opt) => opt.id === id))) {
      throw new Error('ANSWER có chữ cái không khớp phương án');
    }
    return {
      type,
      difficulty,
      content,
      options: toOptions(fields.options, 'Phương án'),
      answer: { type: 'multiple', value: answerIds },
      explanation,
      points,
      tags: [],
      topicNames,
    };
  }

  if (type === 'matching') {
    if (fields.shorthandPairs.length || fields.distractors.length) {
      if (fields.lefts.length || fields.rights.length) {
        throw new Error('Nối cặp: dùng "trái | phải" hoặc L1)/R1), không trộn hai kiểu');
      }
      if (fields.shorthandPairs.length < 2) {
        throw new Error('Nối cặp cần ít nhất 2 dòng "trái | phải"');
      }
      const sides: { id: string; text: string }[] = [];
      const pairs: Record<string, string> = {};
      fields.shorthandPairs.forEach((pair, index) => {
        const leftId = `L${index + 1}`;
        const rightId = `R${index + 1}`;
        sides.push({ id: leftId, text: pair.left }, { id: rightId, text: pair.right });
        pairs[leftId] = rightId;
      });
      fields.distractors.forEach((text, index) => {
        sides.push({ id: `R${fields.shorthandPairs.length + index + 1}`, text });
      });
      return {
        type,
        difficulty,
        content,
        options: toOptions(sides, 'Vế'),
        answer: { type: 'pairs', value: pairs },
        explanation,
        points,
        tags: [],
        topicNames,
      };
    }

    if (fields.lefts.length < 2 || fields.rights.length < 2) {
      throw new Error('Nối cặp cần ít nhất 2 vế trái và 2 vế phải, hoặc các dòng "trái | phải"');
    }
    assertUniqueIds(fields.lefts.map((item) => item.id), 'Vế trái');
    assertUniqueIds(fields.rights.map((item) => item.id), 'Vế phải');
    const spec =
      fields.pairRaw?.trim() ||
      (fields.answerRaw && /L\d+/i.test(fields.answerRaw) ? fields.answerRaw : '');
    const pairs: Record<string, string> = spec ? parsePairSpec(spec) : {};
    if (!spec) {
      fields.lefts.forEach((left, index) => {
        const rightId = fields.rights[index]?.id;
        if (rightId) pairs[left.id] = rightId;
      });
    }
    if (fields.lefts.some((left) => !pairs[left.id])) {
      throw new Error('Mỗi vế trái cần một vế phải (ANSWER: L1-R2 | L2-R1)');
    }
    for (const [leftId, rightId] of Object.entries(pairs)) {
      if (!fields.lefts.some((item) => item.id === leftId) || !fields.rights.some((item) => item.id === rightId)) {
        throw new Error(`Cặp ${leftId}-${rightId} không khớp vế đã khai`);
      }
    }
    if (Object.keys(pairs).length !== fields.lefts.length) {
      throw new Error('Mỗi vế trái chỉ được nối một lần');
    }
    return {
      type,
      difficulty,
      content,
      options: toOptions([...fields.lefts, ...fields.rights], 'Vế'),
      answer: { type: 'pairs', value: pairs },
      explanation,
      points,
      tags: [],
      topicNames,
    };
  }

  if (type === 'ordering') {
    const alphabet = 'ABCDEFGHIJKL';
    let items = fields.orderLines.map((text, index) => ({
      id: alphabet[index] ?? '',
      text,
    }));
    if (!items.length && fields.options.length) {
      items = fields.options.map((opt) => ({ id: opt.id, text: opt.text }));
    }
    if (items.length < 2) throw new Error('Sắp xếp cần ít nhất 2 mục theo thứ tự đúng');
    if (items.length > alphabet.length) throw new Error('Sắp xếp tối đa 12 mục');
    if (items.some((item) => !item.id)) throw new Error('Sắp xếp tối đa 12 mục');
    return {
      type,
      difficulty,
      content,
      options: toOptions(items, 'Mục'),
      answer: { type: 'sequence', value: items.map((item) => item.id) },
      explanation,
      points,
      tags: [],
      topicNames,
    };
  }

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
      topicNames,
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
      const mapped = resolveTrueFalseAnswer(fields.answerRaw, fields.options);
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
      topicNames,
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
    topicNames,
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
          message: `TYPE không hỗ trợ: ${fields.typeRaw}`,
          raw,
        };
      }
      const type = resolveType(fields, options?.defaultType);
      if (!type) {
        return {
          ok: false as const,
          index,
          message:
            'Không nhận diện được loại câu — thêm TYPE: multiple_choice|multiple_select|true_false|fill_blank|short_answer|matching|ordering',
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
TOPIC: Phân số
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

export const BULK_FORMAT_HELP = `Mỗi câu cách nhau bằng ===. Trường: TYPE, Q, A) B)…, ANSWER, POINTS, DIFFICULTY, EXPLAIN, TOPIC.

Định dạng chữ (câu, phương án, vế nối, mục sắp xếp): **đậm**, *nghiêng*, __gạch chân__. Muốn hiện ký tự thật thì gõ \\* hoặc \\_. Đáp án đúng của trắc nghiệm là dấu * đứng riêng (cuối phương án, hoặc có dấu cách phía trước) — không nuốt dấu đóng của *nghiêng* / **đậm**.

TOPIC (hoặc CHỦ ĐỀ): tên chủ đề, nhiều tên cách nhau bằng | — chủ đề chưa có sẽ được tạo khi bấm tạo câu.

LaTeX trong Q / phương án / vế:
- Inline: $...$ hoặc \\(...\\)
- Display: $$...$$ hoặc \\[...\\]
- Cả field: latex: \\frac{1}{2}
- Dấu $ thường: ghi \\$

- Trắc nghiệm: * sau một phương án đúng, hoặc ANSWER: B
- Chọn thẻ: TYPE: multiple_select, đánh dấu mỗi thẻ đúng bằng *, hoặc ANSWER: A, C
- Đúng/Sai: ANSWER: đúng|sai
- Điền / ngắn: ANSWER: đáp1 | đáp2 (text hoặc $...$ / latex:)
- Nối cặp: TYPE: matching, mỗi dòng "trái | phải" hoặc "trái -> phải". Nhiễu: ~ nghĩa sai. Hoặc L1) … R1) … và ANSWER: L1-R1 | L2-R2
- Sắp xếp: TYPE: ordering, các dòng 1) 2)… hoặc A) B)… theo thứ tự đúng`;

export function templateForType(type: BulkSupportedType): string {
  switch (type) {
    case 'multiple_choice':
      return `TYPE: multiple_choice
Q: Tính $\\frac{1}{2}+\\frac{1}{3}$
A) $\\frac{1}{5}$
B) $\\frac{5}{6}$*
C) 1
D) $\\frac{2}{3}$
POINTS: 1
TOPIC: Phân số`;
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
    case 'multiple_select':
      return `TYPE: multiple_select
Q: Chọn các **số nguyên tố**.
A) 2*
B) 4
C) 3*
D) 9
POINTS: 1`;
    case 'matching':
      return `TYPE: matching
Q: Nối từ với nghĩa
apple | quả táo
book | quyển sách
~ xe đạp
POINTS: 1`;
    case 'ordering':
      return `TYPE: ordering
Q: Sắp xếp các bước giải phương trình
1) Chuyển vế
2) Rút gọn
3) Kết luận
POINTS: 1`;
  }
}
