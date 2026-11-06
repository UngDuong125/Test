import type { StudentHistoryItem } from '@/lib/api-client';

export type ProgressPoint = { at: number; percentage: number; title: string };

/** Per subject, the scored attempts in time order (oldest first). Hidden scores are skipped. */
export function progressBySubject(items: StudentHistoryItem[]): Map<string, ProgressPoint[]> {
  const out = new Map<string, ProgressPoint[]>();
  for (const it of items) {
    if (it.percentage == null || !it.submittedAt || !it.subjectId) continue;
    const at = Date.parse(it.submittedAt);
    if (!Number.isFinite(at)) continue;
    const list = out.get(it.subjectId) ?? [];
    list.push({ at, percentage: it.percentage, title: it.examTitle ?? 'Đề' });
    out.set(it.subjectId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.at - b.at);
  return out;
}

export function averagePercentage(points: ProgressPoint[]): number | null {
  if (points.length === 0) return null;
  return Math.round(points.reduce((s, p) => s + p.percentage, 0) / points.length);
}

/** Change between the first and last scored attempt, rounded; null with fewer than two. */
export function trend(points: ProgressPoint[]): number | null {
  if (points.length < 2) return null;
  return Math.round(points[points.length - 1].percentage - points[0].percentage);
}
