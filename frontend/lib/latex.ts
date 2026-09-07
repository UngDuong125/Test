/**
 * Chuẩn hóa LaTeX người dùng nhập theo thói quen JS/JSON (`\\frac` → `\frac`).
 * Giữ nguyên `\\` dùng làm xuống dòng khi không đứng trước tên lệnh (ví dụ `a \\ b`).
 */
export function normalizeLatexInput(raw: string): string {
  return raw.replace(/\\\\([a-zA-Z]+)/g, '\\$1');
}
