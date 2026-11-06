'use client';

import { useEffect, useMemo, useState } from 'react';
import { topicLabel, topicNameKey } from '@/lib/topics';
import type { Topic } from '@/types/content';

const PAGE_SIZE = 8;

type Props = {
  topics: Topic[];
  value: string;
  onChange: (topicId: string) => void;
};

/** Searchable topic filter that shows a limited number of topics with "Xem thêm". */
export function TopicFilter({ topics, value, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);

  const filtered = useMemo(() => {
    const q = topicNameKey(query);
    if (!q) return topics;
    return topics.filter((t) => topicNameKey(t.name).includes(q));
  }, [topics, query]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, topics]);

  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;
  const selected = topics.find((t) => t.id === value);

  const chip = (active: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs ${
      active
        ? 'border-accent bg-teal-50 font-medium text-accentDark'
        : 'border-mist text-slate-600 hover:border-accent'
    }`;

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Tìm chủ đề…"
        className="w-full rounded-md border border-mist px-2 py-1.5 text-sm"
      />
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => onChange('')} className={chip(value === '')}>
          Mọi chủ đề
        </button>
        {selected && !shown.some((t) => t.id === selected.id) && (
          <button type="button" onClick={() => onChange(selected.id)} className={chip(true)}>
            {topicLabel(selected)}
          </button>
        )}
        {shown.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={chip(t.id === value)}
          >
            {topicLabel(t)}
          </button>
        ))}
      </div>
      {!filtered.length && (
        <p className="text-xs text-slate-500">Không tìm thấy chủ đề phù hợp.</p>
      )}
      {(remaining > 0 || visible > PAGE_SIZE) && (
        <div className="flex gap-3 text-xs">
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
              className="font-medium text-accentDark hover:underline"
            >
              Xem thêm ({remaining})
            </button>
          )}
          {visible > PAGE_SIZE && (
            <button
              type="button"
              onClick={() => setVisible(PAGE_SIZE)}
              className="text-slate-500 hover:underline"
            >
              Thu gọn
            </button>
          )}
        </div>
      )}
    </div>
  );
}
