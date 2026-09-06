'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { ApiError, forgotPassword } from '@/lib/api-client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không gửi được yêu cầu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Quên mật khẩu</h1>
        <p className="mt-2 text-sm text-slate-600">
          Nhập email — nếu tài khoản tồn tại, hệ thống sẽ gửi link đặt lại mật khẩu.
        </p>
      </div>
      {done ? (
        <div className="rounded-xl border border-mist bg-white p-6 text-sm text-slate-700">
          Nếu email hợp lệ, hướng dẫn đặt lại đã được gửi (hoặc in ra console backend khi chưa cấu hình
          SMTP).
          <div className="mt-4">
            <Link href="/login" className="text-accentDark hover:underline">
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-mist bg-white p-6 shadow-sm">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-mist px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accentDark disabled:opacity-60"
          >
            Gửi link đặt lại
          </button>
        </form>
      )}
    </div>
  );
}
