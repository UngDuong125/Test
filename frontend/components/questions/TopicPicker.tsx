'use client';

import { useEffect, useState, type KeyboardEvent } from 'react';
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
};

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
}: Props) {
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drop selections that are no longer valid for the current subject/grade.
  useEffect(() => {
    if (!loaded) return;
    const valid = new Set(topics.map((t) => t.id));
    const kept = value.filter((id) => valid.has(id));
    if (kept.length !== value.length) onChange(kept);
  }, [loaded, topics, value, onChange]);

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

  return (
    <div className="text-sm">
      <p>{label}</p>
      <div className="mt-1 flex flex-wrap gap-1.5 rounded-md border border-mist bg-white px-2 py-2">
        {topics.map((t) => {
          const checked = value.includes(t.id);
          return (
            <label
              key={t.id}
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
                onChange={() => toggle(t.id)}
              />
              {topicLabel(t)}
            </label>
          );
        })}
        {loaded && !topics.length && (
          <span className="text-xs text-slate-500">Chưa có chủ đề cho môn/lớp này.</span>
        )}
        {!loaded && <span className="text-xs text-slate-400">Đang tải chủ đề…</span>}
      </div>
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
