'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, login } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(loginId, password);
      if (result.user.mustChangePassword) {
        router.replace('/change-password');
      } else {
        router.replace('/dashboard');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Đăng nhập</h1>
        <p className="mt-2 text-sm text-slate-600">
          Dùng <span className="font-medium text-slate-800">email</span> hoặc{' '}
          <span className="font-medium text-slate-800">tên đăng nhập</span> cùng mật khẩu được cấp.
        </p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-mist bg-white p-6 shadow-sm">
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">Email hoặc tên đăng nhập</span>
          <input
            type="text"
            autoComplete="username"
            required
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            placeholder="admin hoặc admin@testarchive.local"
            className="w-full rounded-md border border-mist px-3 py-2 focus:border-accent"
          />
        </label>
        <label className="block space-y-1.5 text-sm">
          <span className="font-medium text-slate-700">Mật khẩu</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-mist px-3 py-2 focus:border-accent"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accentDark disabled:opacity-60"
        >
          {submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
      </form>
      <p className="text-center text-sm text-slate-600">
        <Link href="/forgot-password" className="text-accentDark hover:underline">
          Quên mật khẩu?
        </Link>
      </p>
    </div>
  );
}
