'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { ApiError, changePassword } from '@/lib/api-client';

function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      router.replace('/login?changed=1');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đổi được mật khẩu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Đổi mật khẩu</h1>
        <p className="mt-2 text-sm text-slate-600">
          Tài khoản đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới trước khi tiếp tục.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-mist bg-white p-6 shadow-sm">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium">Mật khẩu hiện tại</span>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border border-mist px-3 py-2"
          />
        </label>
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
          <span className="font-medium">Xác nhận mật khẩu mới</span>
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
          {submitting ? 'Đang lưu…' : 'Lưu mật khẩu mới'}
        </button>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <AuthGate allowMustChange>
      <ChangePasswordForm />
    </AuthGate>
  );
}
