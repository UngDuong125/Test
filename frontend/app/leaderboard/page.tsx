'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, getLeaderboard, listLeaderboardPeriods } from '@/lib/api-client';

type PeriodTab = 'all' | 'week' | 'month' | 'term';

function displayName(entry: {
  displayName: string | null;
  username: string;
  email: string;
}): string {
  return entry.displayName || entry.username || entry.email.split('@')[0];
}

function LeaderboardBody() {
  const [period, setPeriod] = useState<PeriodTab>('all');
  const [periodId, setPeriodId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [periods, setPeriods] = useState<
    Array<{ id: string; label: string; startsAt: string; endsAt: string }>
  >([]);
  const [entries, setEntries] = useState<
    Array<{
      rank: number;
      userId: string;
      displayName: string | null;
      username: string;
      email: string;
      totalExp: number;
      subjectExp: Record<string, number>;
    }>
  >([]);
  const [meta, setMeta] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listLeaderboardPeriods()
      .then((res) => {
        setPeriods(res.periods);
        if (res.periods[0]) setPeriodId(res.periods[0].id);
      })
      .catch(() => {
        /* optional */
      });
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string | number | undefined> = {
          period,
          limit: 20,
          subjectId: subjectId || undefined,
        };
        if (period === 'term') params.periodId = periodId || undefined;
        const data = await getLeaderboard(params);
        setEntries(data.entries);
        setMeta({ from: data.from, to: data.to });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải bảng xếp hạng');
        setEntries([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [period, periodId, subjectId]);

  const tabs: { id: PeriodTab; label: string }[] = [
    { id: 'all', label: 'Tất cả' },
    { id: 'week', label: 'Tuần' },
    { id: 'month', label: 'Tháng' },
    { id: 'term', label: 'Học kỳ' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Bảng xếp hạng</h1>
        <p className="mt-2 text-slate-600">Xếp hạng theo EXP từ các bài đã chấm.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-mist bg-white p-1 text-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPeriod(t.id)}
              className={`rounded-md px-3 py-1.5 ${
                period === t.id ? 'bg-accent text-white' : 'text-slate-600 hover:bg-mist/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {period === 'term' && (
          <select
            className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm"
            value={periodId}
            onChange={(e) => setPeriodId(e.target.value)}
          >
            {periods.length === 0 && <option value="">Chưa có học kỳ</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}

        <select
          className="rounded-md border border-mist bg-white px-3 py-1.5 text-sm"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">Tất cả môn</option>
          {SUBJECT_TAGS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      {meta.from && meta.to && (
        <p className="text-xs text-slate-500">
          Cửa sổ: {new Date(meta.from).toLocaleString()} → {new Date(meta.to).toLocaleString()}
        </p>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-mist bg-white shadow-sm">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Đang tải…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Chưa có dữ liệu xếp hạng.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-mist bg-paper/50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Hạng</th>
                <th className="px-4 py-3">Học sinh</th>
                <th className="px-4 py-3">EXP</th>
                <th className="hidden px-4 py-3 md:table-cell">Theo môn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {entries.map((e) => (
                <tr key={e.userId}>
                  <td className="px-4 py-3 font-semibold text-ink">{e.rank}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{displayName(e)}</p>
                    <p className="text-xs text-slate-500">{e.email}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold text-accentDark">{e.totalExp}</td>
                  <td className="hidden px-4 py-3 text-xs text-slate-600 md:table-cell">
                    {SUBJECT_TAGS.filter((s) => (e.subjectExp[s.key] ?? 0) > 0)
                      .map((s) => `${s.label}: ${e.subjectExp[s.key]}`)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <AuthGate>
      <LeaderboardBody />
    </AuthGate>
  );
}
