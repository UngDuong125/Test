import { attemptStatusLabel } from '@/lib/attempt-labels';
import type { Attempt, ExamAssignment } from '@/types/content';

export const EXAM_RESULTS_CSV_HEADER = [
  'Học sinh',
  'Lớp',
  'Số lượt',
  'Điểm cao nhất',
  'Điểm lần cuối',
  '% lần cuối',
  'Trạng thái',
  'Nộp lúc',
];

/**
 * One row per assigned student: attempts used, best and latest score, latest status.
 * Students who were assigned but never started appear with status "Chưa làm".
 */
export function examResultsCsvRows(
  attempts: Attempt[],
  assignments: ExamAssignment[],
  opts: { nameOf: (userId: string) => string; classNameOf: (classId: string | null) => string },
): string[][] {
  const live = attempts.filter((a) => a.status !== 'cancelled');
  const byUser = new Map<string, Attempt[]>();
  for (const a of live) {
    const list = byUser.get(a.userId) ?? [];
    list.push(a);
    byUser.set(a.userId, list);
  }

  const classOf = new Map<string, string | null>();
  for (const asg of assignments) {
    if (asg.status === 'cancelled') continue;
    if (!classOf.has(asg.targetId)) classOf.set(asg.targetId, asg.sourceClassId);
  }
  const userIds = new Set([...classOf.keys(), ...byUser.keys()]);

  const rows = [...userIds].map((userId) => {
    const list = (byUser.get(userId) ?? []).sort((x, y) =>
      x.startedAt.localeCompare(y.startedAt),
    );
    const finished = list.filter((a) => a.status !== 'in_progress');
    const latest = list[list.length - 1];
    const best = finished.reduce<number | null>(
      (m, a) => (a.score != null && (m == null || a.score > m) ? a.score : m),
      null,
    );
    const latestFinished = finished[finished.length - 1];
    return [
      opts.nameOf(userId),
      opts.classNameOf(classOf.get(userId) ?? null),
      String(finished.length),
      best != null ? String(best) : '',
      latestFinished?.score != null ? `${latestFinished.score}/${latestFinished.maxScore}` : '',
      latestFinished?.percentage != null ? String(latestFinished.percentage) : '',
      latest ? attemptStatusLabel(latest.status) : 'Chưa làm',
      latestFinished?.submittedAt ? new Date(latestFinished.submittedAt).toLocaleString('vi-VN') : '',
    ];
  });

  return rows.sort((a, b) => a[1].localeCompare(b[1], 'vi') || a[0].localeCompare(b[0], 'vi'));
}
