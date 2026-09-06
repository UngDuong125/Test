/** Username: 3–32 chars, start with alphanumeric, then [A-Za-z0-9._-] */
export const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_PATTERN.test(raw.trim());
}

export function suggestUsernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  const base = cleaned.slice(0, 32) || 'user';
  if (base.length >= 3 && USERNAME_PATTERN.test(base)) return base;
  return `${base}user`.slice(0, 32);
}
