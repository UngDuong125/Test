/**
 * Paste vocabulary rows.
 *
 * One entry per line:
 *   term | definition
 *   term | /reading/ | definition
 *   term | /reading/ | definition | example
 *   term | definition | example
 *
 * Or a block split by ===:
 *   TERM: apple
 *   READING: /ˈæp.əl/
 *   DEF: quả táo
 *   EXAMPLE: I eat an apple.
 *
 * Term, definition and example keep **đậm**, *nghiêng*, __gạch chân__.
 */

export type BulkVocabularyEntry = {
  term: string;
  reading: string | null;
  definition: string;
  example: string | null;
};

export type BulkVocabularyOk = {
  ok: true;
  index: number;
  entry: BulkVocabularyEntry;
};

export type BulkVocabularyErr = {
  ok: false;
  index: number;
  message: string;
  raw: string;
};

export type BulkVocabularyItem = BulkVocabularyOk | BulkVocabularyErr;

const FIELD_RE =
  /^(TERM|TỪ|TU|WORD|READING|PHIÊN\s*ÂM|PHIEN\s*AM|DEF|DEFINITION|NGHĨA|NGHIA|MEANING|EXAMPLE|VÍ\s*DỤ|VI\s*DU)\s*:\s*(.*)$/i;

export const VOCAB_PASTE_EXAMPLE = `apple | /ˈæp.əl/ | quả táo | I eat an apple
book | quyển sách
go | đi | She goes to school
===
TERM: **library**
READING: /ˈlaɪ.brər.i/
DEF: thư viện
EXAMPLE: The *library* is quiet.`;

export const VOCAB_PASTE_HELP = `Mỗi từ một dòng, cách cột bằng |.

- từ | nghĩa
- từ | /phiên âm/ | nghĩa
- từ | /phiên âm/ | nghĩa | ví dụ
- từ | nghĩa | ví dụ

Hoặc khối cách nhau bằng === với TERM / TỪ, READING / PHIÊN ÂM, DEF / NGHĨA, EXAMPLE / VÍ DỤ.

Định dạng chữ: **đậm**, *nghiêng*, __gạch chân__. Ký tự thật: \\* và \\_.`;

function isReading(value: string): boolean {
  const text = value.trim();
  return text.startsWith('/') && text.endsWith('/') && text.length > 2;
}

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

function fromColumns(columns: string[]): BulkVocabularyEntry | null {
  const parts = columns.map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const term = parts[0]!;
  let reading: string | null = null;
  let definition = '';
  let example: string | null = null;

  if (parts.length === 2) {
    definition = parts[1]!;
  } else if (isReading(parts[1]!)) {
    reading = parts[1]!.slice(1, -1).trim();
    definition = parts[2]!;
    example = clean(parts[3]) || null;
  } else {
    definition = parts[1]!;
    example = clean(parts[2]) || null;
  }

  if (!term || !definition) return null;
  return { term, reading, definition, example };
}

function fromFields(block: string): BulkVocabularyEntry | null {
  let term = '';
  let reading: string | null = null;
  let definition = '';
  let example: string | null = null;
  let sawField = false;

  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const field = line.match(FIELD_RE);
    if (!field) continue;
    sawField = true;
    const key = field[1]!.toLowerCase();
    const value = (field[2] ?? '').trim();
    if (/^(term|từ|tu|word)$/i.test(key)) term = value;
    else if (/^(reading|phiên\s*âm|phien\s*am)$/i.test(key)) {
      reading = value.replace(/^\/+|\/+$/g, '').trim() || null;
    } else if (/^(def|definition|nghĩa|nghia|meaning)$/i.test(key)) definition = value;
    else if (/^(example|ví\s*dụ|vi\s*du)$/i.test(key)) example = value || null;
  }

  if (!sawField || !term || !definition) return null;
  return { term, reading, definition, example };
}

function parseBlock(block: string): BulkVocabularyEntry[] {
  const fields = fromFields(block);
  if (fields) return [assertLengths(fields)];
  const lines = block
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  return lines.map((line) => {
    const entry = fromColumns(line.split('|'));
    if (!entry) throw new Error(`Dòng "${line.slice(0, 48)}" cần từ và nghĩa, cách nhau bằng |`);
    return assertLengths(entry);
  });
}

function assertLengths(entry: BulkVocabularyEntry): BulkVocabularyEntry {
  if (entry.term.length > 500) throw new Error('Từ dài quá 500 ký tự');
  if (entry.definition.length > 2000) throw new Error('Nghĩa dài quá 2000 ký tự');
  if ((entry.reading?.length ?? 0) > 500) throw new Error('Phiên âm dài quá 500 ký tự');
  if ((entry.example?.length ?? 0) > 2000) throw new Error('Ví dụ dài quá 2000 ký tự');
  return entry;
}

export function parseBulkVocabularyText(text: string): BulkVocabularyItem[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.includes('===')
    ? normalized
        .split(/^\s*={3,}\s*$/m)
        .map((block) => block.trim())
        .filter(Boolean)
    : normalized
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

  const items: BulkVocabularyItem[] = [];
  for (const raw of blocks) {
    try {
      for (const entry of parseBlock(raw)) {
        items.push({ ok: true, index: items.length, entry });
      }
    } catch (err) {
      items.push({
        ok: false,
        index: items.length,
        message: err instanceof Error ? err.message : 'Không đọc được dòng',
        raw,
      });
    }
  }
  return items;
}
