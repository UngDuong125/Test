'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError, resetPassword } from '@/lib/api-client';
import { Suspense } from 'react';

function ResetPasswordForm() {
  const search = useSearchParams();
  const router = useRouter();
  const token = useMemo(() => search.get('token') ?? '', [search]);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError('Thiếu token đặt lại mật khẩu');
      return;
    }
    if (newPassword !== confirm) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      router.replace('/login?reset=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đặt lại được mật khẩu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Đặt lại mật khẩu</h1>
        <p className="mt-2 text-sm text-slate-600">Nhập mật khẩu mới cho tài khoản của bạn.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-mist bg-white p-6 shadow-sm">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Mật khẩu mới</span>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border border-mist px-3 py-2"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Xác nhận</span>
          <input
            type="password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-md border border-mist px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accentDark disabled:opacity-60"
        >
          Lưu mật khẩu
        </button>
      </form>
      <p className="text-center text-sm">
        <Link href="/login" className="text-accentDark hover:underline">
          Quay lại đăng nhập
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-slate-500">Đang tải…</p>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
