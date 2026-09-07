'use client';

import Link from 'next/link';
import { displayNameOf, useSession } from '@/lib/auth';

export function AppHeader() {
  const { user, logout, loading } = useSession();

  return (
    <header className="border-b border-mist bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="font-display text-xl font-semibold text-ink tracking-tight">
          TestArchive
        </Link>
        <nav className="flex items-center gap-3 text-sm text-slate-600">
          {user && (
            <>
              <Link href="/dashboard" className="hover:text-accentDark">
                Dashboard
              </Link>
              <Link href="/leaderboard" className="hover:text-accentDark">
                XH
              </Link>
              {(user.role === 'admin' || user.role === 'teacher') && (
                <>
                  <Link href="/questions" className="hover:text-accentDark">
                    Câu hỏi
                  </Link>
                  <Link href="/question-banks" className="hidden sm:inline hover:text-accentDark">
                    Bank
                  </Link>
                  <Link href="/exams" className="hover:text-accentDark">
                    Đề
                  </Link>
                  <Link href="/classes" className="hover:text-accentDark">
                    Lớp
                  </Link>
                  <Link href="/assignments" className="hover:text-accentDark">
                    Giao
                  </Link>
                  <Link href="/grading" className="hover:text-accentDark">
                    Chấm
                  </Link>
                </>
              )}
              {user.role === 'admin' && (
                <Link href="/admin/users" className="hover:text-accentDark">
                  Users
                </Link>
              )}
              <span className="hidden sm:inline text-slate-400">
                {displayNameOf(user)} · {user.role}
              </span>
              <button
                type="button"
                onClick={() => void logout().then(() => {
                  window.location.href = '/login';
                })}
                className="rounded-md border border-mist px-3 py-1.5 hover:border-accent hover:text-accentDark"
              >
                Đăng xuất
              </button>
            </>
          )}
          {!loading && !user && (
            <Link
              href="/login"
              className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
            >
              Đăng nhập
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
