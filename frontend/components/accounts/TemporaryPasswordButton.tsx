'use client';

import { useState } from 'react';
import { ApiError, issueTemporaryPassword } from '@/lib/api-client';

/**
 * Issue a new temporary password for a student (admin, or the student's teacher) and
 * show it once. The account keeps its classes and work; the student must change it.
 */
export function TemporaryPasswordButton({
  userId,
  label,
}: {
  userId: string;
  /** Who it is for, shown in the confirmation. */
  label: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ password: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onClick() {
    if (
      !window.confirm(
        `Cấp mật khẩu tạm mới cho ${label}? Mật khẩu cũ hết hiệu lực và học sinh bị đăng xuất khỏi mọi thiết bị.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await issueTemporaryPassword(userId);
      setResult({ password: res.temporaryPassword, expiresAt: res.expiresAt });
      setCopied(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không cấp được mật khẩu');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => void onClick()}
        className="text-xs text-accentDark hover:underline disabled:opacity-50"
      >
        {busy ? 'Đang cấp…' : 'Cấp mật khẩu tạm'}
      </button>
      {error && <span className="ml-2 text-xs text-red-600">{error}</span>}
      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`tmp-pw-${userId}`}
        >
          <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
            <h2 id={`tmp-pw-${userId}`} className="font-display text-lg font-semibold text-ink">
              Mật khẩu tạm của {label}
            </h2>
            <p className="rounded-md bg-slate-100 px-4 py-3 text-center font-mono text-2xl tracking-wider text-ink">
              {result.password}
            </p>
            <p className="text-sm text-slate-600">
              Chỉ hiện <strong>một lần</strong>. Hết hạn {new Date(result.expiresAt).toLocaleDateString('vi-VN')}. Học sinh
              phải đổi mật khẩu ở lần đăng nhập tới.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(result.password)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false));
                }}
                className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
              >
                {copied ? 'Đã chép' : 'Chép'}
              </button>
              <button
                type="button"
                onClick={() => setResult(null)}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
              >
                Đã ghi lại, đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
