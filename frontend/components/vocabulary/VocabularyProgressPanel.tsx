'use client';

import { useEffect, useState } from 'react';
import {
  ApiError,
  getVocabularyBankProgress,
  type VocabularyBankProgress,
} from '@/lib/api-client';
import type { ClassRecord } from '@/types/content';

function studentName(s: VocabularyBankProgress['students'][number]) {
  return s.displayName?.trim() || s.username || s.userId.slice(0, 8);
}

/** Teacher view: who is reviewing, who has gone quiet, which words students keep failing. */
export function VocabularyProgressPanel({
  bankId,
  classes,
}: {
  bankId: string;
  classes: ClassRecord[];
}) {
  const [classId, setClassId] = useState('');
  const [data, setData] = useState<VocabularyBankProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyInactive, setOnlyInactive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getVocabularyBankProgress(bankId, classId || undefined)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Không tải được tiến độ');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bankId, classId]);

  const inactiveCount = data?.students.filter((s) => s.inactive).length ?? 0;
  const rows = data ? (onlyInactive ? data.students.filter((s) => s.inactive) : data.students) : [];

  return (
    <section className="space-y-4 rounded-xl border border-mist bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto font-medium text-ink">Tiến độ ôn của học sinh</p>
        {classes.length > 0 && (
          <select
            className="rounded-md border border-mist px-3 py-1.5 text-sm"
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            aria-label="Lọc theo lớp"
          >
            <option value="">Mọi học sinh được giao</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                Lớp {c.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : !data || data.studentCount === 0 ? (
        <p className="text-sm text-slate-500">Chưa có học sinh nào được giao bộ từ này.</p>
      ) : (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-slate-500">Đã ôn trong 7 ngày</p>
              <p className="text-lg font-semibold text-ink">
                {data.activeLast7Days}/{data.studentCount} HS
              </p>
            </div>
            <div className="rounded-md bg-amber-50 px-3 py-2">
              <p className="text-amber-800">Chưa ôn quá 3 ngày</p>
              <p className="text-lg font-semibold text-amber-900">{inactiveCount} HS</p>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-slate-500">Từ khó nhất</p>
              <p className="truncate text-lg font-semibold text-ink">
                {data.hardWords[0]?.term ?? '—'}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyInactive}
                onChange={(e) => setOnlyInactive(e.target.checked)}
              />
              Chỉ hiện học sinh lâu chưa ôn
            </label>
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-mist text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Học sinh</th>
                  <th className="py-2 pr-3">Đang học</th>
                  <th className="py-2 pr-3">Đã thuộc</th>
                  <th className="py-2 pr-3">Đến hạn</th>
                  <th className="py-2 pr-3">Thuộc / Quên</th>
                  <th className="py-2">Lần ôn cuối</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {rows.map((s) => (
                  <tr key={s.userId}>
                    <td className="py-2 pr-3 font-medium text-ink">
                      {studentName(s)}
                      {s.inactive && (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">
                          ⚠ lâu chưa ôn
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{s.learning}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {s.mastered}/{s.total}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{s.due}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {s.passCount} / {s.failCount}
                    </td>
                    <td className="py-2 text-slate-600">
                      {s.lastReviewedAt
                        ? `${new Date(s.lastReviewedAt).toLocaleDateString('vi-VN')} (${s.daysSinceReview} ngày trước)`
                        : 'Chưa ôn lần nào'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.hardWords.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink">Từ học sinh hay quên</p>
              <ul className="mt-2 divide-y divide-mist text-sm">
                {data.hardWords.map((w) => (
                  <li key={w.entryId} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      <strong>{w.term ?? '—'}</strong>
                      {w.definition && <span className="text-slate-500"> — {w.definition}</span>}
                    </span>
                    <span className="tabular-nums text-slate-600">
                      quên {Math.round(w.failRate * 100)}% ({w.failCount}/{w.reviews} lượt)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
