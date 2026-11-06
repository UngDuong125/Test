import { isValidUsername, normalizeUsername } from '../../services/username.service.js';
import type { UserRole } from '../../types/domain.js';

export interface ImportRowInput {
  username: string;
  displayName?: string | null;
  role?: string | null;
  email?: string | null;
  className?: string | null;
}

export interface ValidImportRow {
  line: number;
  username: string;
  displayName: string | null;
  role: Extract<UserRole, 'student' | 'teacher'>;
  email: string | null;
  classId: string | null;
  className: string | null;
}

export interface ImportRowError {
  line: number;
  username: string;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IMPORTABLE_ROLES = new Set(['student', 'teacher']);

/**
 * Check every row before anything is created. `line` is 1-based and counts the header,
 * so it matches what the admin sees in a spreadsheet. Duplicates inside the file and
 * against existing accounts are both errors.
 */
export function validateImportRows(
  rows: ImportRowInput[],
  existing: { usernames: Set<string>; emails: Set<string> },
  classesByName: Map<string, { id: string; name: string }[]>,
): { valid: ValidImportRow[]; errors: ImportRowError[] } {
  const valid: ValidImportRow[] = [];
  const errors: ImportRowError[] = [];
  const seenUsernames = new Set<string>();
  const seenEmails = new Set<string>();

  rows.forEach((row, i) => {
    const line = i + 2;
    const username = normalizeUsername(row.username ?? '');
    const fail = (message: string) => errors.push({ line, username, message });

    if (!username) return fail('Thiếu username');
    if (!isValidUsername(username)) {
      return fail('Username 3–32 ký tự, bắt đầu bằng chữ/số, chỉ gồm chữ, số, . _ -');
    }
    if (seenUsernames.has(username)) return fail('Username lặp lại trong file');
    if (existing.usernames.has(username)) return fail('Username đã tồn tại');

    const role = (row.role ?? '').trim().toLowerCase() || 'student';
    if (!IMPORTABLE_ROLES.has(role)) return fail('Role chỉ nhận student hoặc teacher');

    const email = (row.email ?? '').trim().toLowerCase() || null;
    if (email) {
      if (!EMAIL_RE.test(email)) return fail('Email không hợp lệ');
      if (seenEmails.has(email)) return fail('Email lặp lại trong file');
      if (existing.emails.has(email)) return fail('Email đã được dùng');
    }

    const className = (row.className ?? '').trim() || null;
    let classId: string | null = null;
    if (className) {
      const matches = classesByName.get(className.toLowerCase()) ?? [];
      if (matches.length === 0) return fail(`Không có lớp "${className}"`);
      if (matches.length > 1) return fail(`Có nhiều lớp tên "${className}"; đổi tên cho khác nhau`);
      if (role !== 'student') return fail('Chỉ học sinh mới được xếp lớp');
      classId = matches[0].id;
    }

    seenUsernames.add(username);
    if (email) seenEmails.add(email);
    valid.push({
      line,
      username,
      displayName: (row.displayName ?? '').trim() || null,
      role: role as ValidImportRow['role'],
      email,
      classId,
      className,
    });
  });

  return { valid, errors };
}
