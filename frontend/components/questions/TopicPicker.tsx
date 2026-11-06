'use client';

import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { ApiError, createTopic } from '@/lib/api-client';
import { normalizeTopicName, topicLabel } from '@/lib/topics';
import type { TagKey } from '@/types/auth';
import type { Topic } from '@/types/content';

type Props = {
  subjectId: TagKey;
  grade: number;
  /** From `useTopics(subjectId, grade)` in the parent. */
  topics: Topic[];
  loaded: boolean;
  value: string[];
  onChange: (topicIds: string[]) => void;
  /** Omit to hide the "create topic" input. */
  onCreated?: (topic: Topic) => void;
  label?: string;
  hint?: string;
  /** Filter chips by name. */
  searchable?: boolean;
  /** Show this many unselected topics, then a "Xem thêm" control. */
  pageSize?: number;
};

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi');
}

export function TopicPicker({
  subjectId,
  grade,
  topics,
  loaded,
  value,
  onChange,
  onCreated,
  label = 'Chủ đề',
  hint,
  searchable = false,
  pageSize,
}: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [extraPages, setExtraPages] = useState(0);

  // Drop selections that are no longer valid for the current subject/grade.
  useEffect(() => {
    if (!loaded) return;
    const valid = new Set(topics.map((t) => t.id));
    const kept = value.filter((id) => valid.has(id));
    if (kept.length !== value.length) onChange(kept);
  }, [loaded, topics, value, onChange]);

  useEffect(() => {
    setQuery('');
    setExtraPages(0);
  }, [subjectId, grade]);

  useEffect(() => {
    setExtraPages(0);
  }, [query]);

  const needle = fold(query.trim());
  const { pinned, shown, hiddenCount } = useMemo(() => {
    const matches = (topic: Topic) => !needle || fold(topicLabel(topic)).includes(needle);
    const matched = topics.filter(matches);
    const selectedIds = new Set(value);
    const pinnedTopics = topics.filter((topic) => selectedIds.has(topic.id) && !matches(topic));
    const selectedMatched = matched.filter((topic) => selectedIds.has(topic.id));
    const rest = matched.filter((topic) => !selectedIds.has(topic.id));
    const limit = pageSize == null ? rest.length : pageSize * (1 + extraPages);
    return {
      pinned: [...pinnedTopics, ...selectedMatched],
      shown: rest.slice(0, limit),
      hiddenCount: Math.max(0, rest.length - limit),
    };
  }, [topics, value, needle, pageSize, extraPages]);

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  }

  async function onCreate() {
    const name = normalizeTopicName(newName);
    if (!name || !onCreated) return;
    setCreating(true);
    setError(null);
    try {
      const { topic } = await createTopic({ subjectId, name, grade });
      onCreated(topic);
      if (!value.includes(topic.id)) onChange([...value, topic.id]);
      setNewName('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tạo được chủ đề');
    } finally {
      setCreating(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void onCreate();
    }
  }

  function renderChip(topic: Topic) {
    const checked = value.includes(topic.id);
    return (
      <label
        key={topic.id}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
          checked
            ? 'border-accent bg-accent/10 text-accentDark'
            : 'border-mist text-slate-600 hover:border-accent'
        }`}
      >
        <input
          type="checkbox"
          className="accent-accent"
          checked={checked}
          onChange={() => toggle(topic.id)}
        />
        {topicLabel(topic)}
      </label>
    );
  }

  const visible = [...pinned, ...shown];
  const noMatch = loaded && topics.length > 0 && needle && !visible.length;

  return (
    <div className="text-sm">
      <p>{label}</p>
      {searchable && (
        <input
          className="mt-1 w-full rounded-md border border-mist px-3 py-1.5"
          placeholder="Tìm chủ đề"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-mist bg-white px-2 py-2">
        {visible.map(renderChip)}
        {loaded && !topics.length && (
          <span className="text-xs text-slate-500">Chưa có chủ đề cho môn/lớp này.</span>
        )}
        {noMatch && <span className="text-xs text-slate-500">Không có chủ đề khớp.</span>}
        {!loaded && <span className="text-xs text-slate-400">Đang tải chủ đề…</span>}
      </div>
      {pageSize != null && loaded && (hiddenCount > 0 || extraPages > 0) && (
        <div className="mt-1.5 flex gap-2">
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExtraPages((n) => n + 1)}
              className="rounded-md border border-mist px-2.5 py-1 text-xs text-accentDark hover:border-accent"
            >
              Xem thêm ({hiddenCount})
            </button>
          )}
          {extraPages > 0 && (
            <button
              type="button"
              onClick={() => setExtraPages(0)}
              className="rounded-md border border-mist px-2.5 py-1 text-xs text-slate-500 hover:border-accent"
            >
              Thu gọn
            </button>
          )}
        </div>
      )}
      {onCreated && (
        <div className="mt-2 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-mist px-3 py-1.5"
            placeholder={`Thêm chủ đề mới (lớp ${grade})`}
            value={newName}
            maxLength={100}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            disabled={creating || !normalizeTopicName(newName)}
            onClick={() => void onCreate()}
            className="rounded-md border border-mist px-3 py-1.5 hover:border-accent disabled:opacity-50"
          >
            {creating ? 'Đang thêm…' : 'Thêm'}
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
