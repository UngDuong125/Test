import type { ImportAccountRow } from '@/lib/api-client';

/**
 * Minimal RFC 4180 parser: quoted fields, doubled quotes, CRLF, BOM. The delimiter is
 * detected from the header line (`,` `;` or tab) since Vietnamese Excel exports `;`.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const counts = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length - 1] as const);
  const delimiter = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const HEADER_ALIASES: Record<keyof ImportAccountRow, string[]> = {
  username: ['username', 'tên đăng nhập', 'ten dang nhap', 'tai khoan', 'tài khoản'],
  displayName: ['displayname', 'display name', 'họ tên', 'ho ten', 'họ và tên', 'tên hiển thị', 'ten hien thi', 'name'],
  role: ['role', 'vai trò', 'vai tro'],
  email: ['email', 'e-mail'],
  className: ['classname', 'class', 'lớp', 'lop'],
};

function headerKey(raw: string): keyof ImportAccountRow | null {
  const h = raw.trim().toLowerCase();
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(h)) return key as keyof ImportAccountRow;
  }
  return null;
}

/** Rows keyed by column; unknown columns are ignored. Throws when no username column. */
export function csvToImportRows(text: string): { rows: ImportAccountRow[]; ignoredColumns: string[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], ignoredColumns: [] };
  const [header, ...body] = table;
  const keys = header.map(headerKey);
  if (!keys.includes('username')) {
    throw new Error('Thiếu cột "username" (hoặc "Tên đăng nhập") ở dòng tiêu đề');
  }
  const ignoredColumns = header.filter((_, i) => keys[i] == null).map((h) => h.trim());
  const rows = body.map((cells) => {
    const row: ImportAccountRow = { username: '' };
    keys.forEach((key, i) => {
      if (!key) return;
      const value = (cells[i] ?? '').trim();
      if (key === 'username') row.username = value;
      else row[key] = value || null;
    });
    return row;
  });
  return { rows, ignoredColumns };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
