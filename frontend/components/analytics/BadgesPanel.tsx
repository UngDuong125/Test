'use client';

import { badgesFor, nextBadges, type BadgeInput } from '@/lib/badges';

/** Earned milestones, with the next one in each kind. Text carries state, not color alone. */
export function BadgesPanel({ input }: { input: BadgeInput }) {
  const earned = badgesFor(input).filter((b) => b.earned);
  const next = nextBadges(input);
  return (
    <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
      <p className="font-semibold text-ink">Huy hiệu</p>
      {earned.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">Chưa có huy hiệu. Làm bài và ôn từ để mở huy hiệu đầu tiên.</p>
      ) : (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm">
          {earned.map((b) => (
            <li
              key={b.id}
              title={b.detail}
              className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-medium text-ink"
            >
              🏅 {b.label}
            </li>
          ))}
        </ul>
      )}
      {next.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Sắp đạt: {next.map((n) => `${n.label} (còn ${n.remaining})`).join(' · ')}
        </p>
      )}
    </section>
  );
}
