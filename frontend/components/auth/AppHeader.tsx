'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { displayNameOf, useSession } from '@/lib/auth';
import { loadVocabStatsOnce } from '@/lib/vocab-stats';

export function AppHeader() {
  const { user, logout, loading } = useSession();
  const pathname = usePathname();
  const [dueCount, setDueCount] = useState<number | null>(null);
  const isStudent = user?.role === 'student';

  // After the page has its content; failure just hides the badge.
  useEffect(() => {
    if (!isStudent) return;
    let cancelled = false;
    void loadVocabStatsOnce()
      .then((s) => {
        if (!cancelled) setDueCount(s.due);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isStudent]);

  // The review page changes the count on every card; a stale badge there would mislead.
  const showBadge =
    dueCount != null && dueCount > 0 && !pathname?.startsWith('/vocabulary/review');

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
                Trang chủ
              </Link>
              <Link href="/leaderboard" className="hover:text-accentDark">
                Xếp hạng
              </Link>
              {user.role === 'student' && (
                <>
                  <Link href="/vocabulary/review" className="hover:text-accentDark">
                    Ôn từ
                    {showBadge && (
                      <span
                        className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-white"
                        aria-label={`${dueCount} thẻ đến hạn`}
                      >
                        {dueCount}
                      </span>
                    )}
                  </Link>
                  <Link href="/history" className="hover:text-accentDark">
                    Lịch sử
                  </Link>
                </>
              )}
              {(user.role === 'admin' || user.role === 'teacher') && (
                <>
                  <Link href="/questions" className="hover:text-accentDark">
                    Câu hỏi
                  </Link>
                  <Link href="/topics" className="hidden sm:inline hover:text-accentDark">
                    Chủ đề
                  </Link>
                  <Link href="/vocabulary" className="hover:text-accentDark">
                    Từ vựng
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
                  <Link href="/results" className="hover:text-accentDark">
                    Kết quả
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
