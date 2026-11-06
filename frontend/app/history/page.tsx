'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, getMyHistory, type StudentHistoryItem } from '@/lib/api-client';
import { attemptStatusLabel } from '@/lib/attempt-labels';
import { averagePercentage, progressBySubject, trend, type ProgressPoint } from '@/lib/history';
import type { AttemptStatus } from '@/types/content';

const PAGE_SIZE = 20;
const subjectLabel = (key: string | null) =>
  SUBJECT_TAGS.find((s) => s.key === key)?.label ?? key ?? '—';

/** One subject's percentage over time: 0–100 on one axis, 2px line, 8px markers. */
function ProgressChart({ points, label }: { points: ProgressPoint[]; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const pad = { l: 28, r: 8, t: 8, b: 18 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i: number) =>
    pad.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (pct: number) => pad.t + innerH - (Math.min(Math.max(pct, 0), 100) / 100) * innerH;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.percentage)}`).join(' ');
  const active = hover != null ? points[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`${label}: ${points.map((p) => `${p.percentage}%`).join(', ')}`}
        onMouseLeave={() => setHover(null)}
      >
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(g)}
              y2={y(g)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            <text x={pad.l - 4} y={y(g) + 3} textAnchor="end" fontSize={9} fill="#64748b">
              {g}
            </text>
          </g>
        ))}
        {points.length > 1 && (
          <path d={path} fill="none" stroke="#0d9488" strokeWidth={2} strokeLinejoin="round" />
        )}
        {points.map((p, i) => (
          <g key={`${p.at}-${i}`}>
            {/* Hit target larger than the mark */}
            <rect
              x={x(i) - 10}
              y={pad.t}
              width={20}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              aria-label={`${p.title}: ${p.percentage}%`}
            />
            <circle
              cx={x(i)}
              cy={y(p.percentage)}
              r={hover === i ? 5 : 4}
              fill="#0d9488"
              stroke="#ffffff"
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        ))}
      </svg>
      {active && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-mist bg-white px-2 py-1 text-xs text-ink shadow"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}
        >
          <p className="font-medium">{active.percentage}%</p>
          <p className="text-slate-500">
            {active.title} · {new Date(active.at).toLocaleDateString('vi-VN')}
          </p>
        </div>
      )}
    </div>
  );
}

function HistoryRow({ item }: { item: StudentHistoryItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div>
        <p className="font-medium text-ink">{item.examTitle ?? 'Đề'}</p>
        <p className="text-sm text-slate-500">
          {subjectLabel(item.subjectId)} ·{' '}
          {item.submittedAt ? new Date(item.submittedAt).toLocaleString('vi-VN') : '—'} ·{' '}
          {attemptStatusLabel(item.status as AttemptStatus)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {item.showResult ? (
          <span className="font-semibold text-ink">
            {item.score != null ? `${item.score}/${item.maxScore}` : '—'}
            {item.percentage != null && (
              <span className="ml-1 font-normal text-slate-500">({item.percentage}%)</span>
            )}
          </span>
        ) : (
          <span className="text-slate-500">Điểm chưa công bố</span>
        )}
        {item.wrongCount != null && item.wrongCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">
            Sai {item.wrongCount} câu
          </span>
        )}
        <Link
          href={`/results/${item.attemptId}`}
          className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
        >
          {item.wrongCount ? 'Xem lại câu sai' : 'Xem bài'}
        </Link>
      </div>
    </li>
  );
}

function HistoryBody() {
  const [items, setItems] = useState<StudentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [onlyWrong, setOnlyWrong] = useState(false);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getMyHistory()
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Không tải được lịch sử');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const progress = useMemo(() => progressBySubject(items), [items]);
  const filtered = useMemo(
    () =>
      items.filter(
        (i) =>
          (!subjectId || i.subjectId === subjectId) &&
          (!onlyWrong || (i.wrongCount ?? 0) > 0),
      ),
    [items, subjectId, onlyWrong],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const subjectsWithData = SUBJECT_TAGS.filter((s) => (progress.get(s.key)?.length ?? 0) > 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/dashboard" className="hover:text-accentDark">
            Dashboard
          </Link>
          {' / '}Lịch sử
        </p>
        <h1 className="font-display text-3xl font-bold text-ink">Lịch sử & tiến bộ</h1>
        <p className="mt-2 text-slate-600">
          Các bài đã nộp, điểm theo thời gian và những bài còn câu sai để ôn lại.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {!loading && subjectsWithData.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-ink">Tiến bộ theo môn (% điểm)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {subjectsWithData.map((s) => {
              const points = progress.get(s.key) ?? [];
              const avg = averagePercentage(points);
              const delta = trend(points);
              return (
                <div key={s.key} className="rounded-xl border border-mist bg-white p-4 shadow-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium text-ink">{s.label}</p>
                    <p className="text-xs text-slate-500">
                      TB {avg}% · {points.length} bài
                      {delta != null && (
                        <span className="ml-1 text-slate-700">
                          · {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} điểm %
                        </span>
                      )}
                    </p>
                  </div>
                  <ProgressChart points={points} label={s.label} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="mr-auto font-semibold text-ink">Bài đã làm</h2>
          <select
            className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setPage(0);
            }}
            aria-label="Lọc theo môn"
          >
            <option value="">Tất cả môn</option>
            {SUBJECT_TAGS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyWrong}
              onChange={(e) => {
                setOnlyWrong(e.target.checked);
                setPage(0);
              }}
            />
            Chỉ bài có câu sai
          </label>
        </div>

        {loading ? (
          <p className="mt-3 text-sm text-slate-500">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Chưa có bài nào phù hợp.</p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-mist">
              {pageItems.map((it) => (
                <HistoryRow key={it.attemptId} item={it} />
              ))}
            </ul>
            {pageCount > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded-md border border-mist px-3 py-1.5 disabled:opacity-40"
                >
                  ← Trước
                </button>
                <span className="text-slate-500">
                  Trang {page + 1}/{pageCount}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= pageCount}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-md border border-mist px-3 py-1.5 disabled:opacity-40"
                >
                  Sau →
                </button>
              </div>
            )}
          </>
        )}
        <p className="mt-4 text-xs text-slate-500">
          Đáp án đúng và lời giải chỉ hiện trong trang bài khi giáo viên cho phép và bạn đã dùng hết lượt làm.
        </p>
      </section>
    </div>
  );
}

export default function HistoryPage() {
  return (
    <AuthGate roles={['student']}>
      <HistoryBody />
    </AuthGate>
  );
}
