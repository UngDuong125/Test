'use client';

export function StatsPanel({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string | number | null | undefined }>;
}) {
  return (
    <section className="rounded-xl border border-mist bg-white p-4 shadow-sm">
      <p className="text-sm font-semibold text-ink">{title}</p>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs uppercase tracking-wide text-slate-500">{item.label}</dt>
            <dd className="mt-0.5 text-lg font-semibold text-ink">
              {item.value == null || item.value === '' ? '—' : item.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
