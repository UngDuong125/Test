'use client';

import { useCallback, useEffect, useState } from 'react';
import { listTopics } from '@/lib/api-client';
import type { TagKey } from '@/types/auth';
import type { Topic } from '@/types/content';

export function normalizeTopicName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function topicNameKey(name: string): string {
  return normalizeTopicName(name).toLocaleLowerCase('vi');
}

export function topicLabel(topic: Topic): string {
  return topic.grade == null ? `${topic.name} (mọi lớp)` : topic.name;
}

/**
 * Topics usable for a subject + grade (includes every-grade topics).
 * `subjectId` empty → no request, empty list.
 */
export function useTopics(subjectId: TagKey | '' | undefined, grade?: number) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const key = subjectId ? `${subjectId}:${grade ?? ''}` : null;

  const reload = useCallback(async () => {
    if (!subjectId) {
      setTopics([]);
      setLoadedKey(null);
      return;
    }
    setLoading(true);
    try {
      const res = await listTopics({ subjectId, grade });
      setTopics(res.topics);
    } catch {
      setTopics([]);
    } finally {
      setLoading(false);
      setLoadedKey(`${subjectId}:${grade ?? ''}`);
    }
  }, [subjectId, grade]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addTopic = useCallback((topic: Topic) => {
    setTopics((prev) =>
      prev.some((t) => t.id === topic.id)
        ? prev
        : [...prev, topic].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    );
  }, []);

  return { topics, loading, loaded: key !== null && loadedKey === key, reload, addTopic };
}

/**
 * id → Topic for every topic (small table) — used to show names on question lists.
 * Changing `refreshKey` refetches (e.g. after a question was edited).
 */
export function useTopicMap(refreshKey?: unknown) {
  const [map, setMap] = useState<Record<string, Topic>>({});
  useEffect(() => {
    let cancelled = false;
    void listTopics()
      .then((res) => {
        if (cancelled) return;
        const next: Record<string, Topic> = {};
        for (const t of res.topics) next[t.id] = t;
        setMap(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);
  return map;
}
