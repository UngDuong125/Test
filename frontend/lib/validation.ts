/** Client-side form helpers. Server validation is authoritative. */

export const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isValidUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim());
}

export function suggestUsernameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  const cleaned = local.replace(/[^a-zA-Z0-9._-]/g, '').toLowerCase();
  const base = cleaned.slice(0, 32) || 'user';
  if (base.length >= 3 && USERNAME_PATTERN.test(base)) return base;
  return `${base}user`.slice(0, 32);
}

export function passwordHints(password: string): string[] {
  const hints: string[] = [];
  if (password.length < 8) hints.push('Ít nhất 8 ký tự');
  if (!/[A-Za-z]/.test(password)) hints.push('Có chữ cái');
  if (!/[0-9]/.test(password)) hints.push('Có chữ số');
  return hints;
}
