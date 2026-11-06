import type { ExamAssignment } from '@/types/content';

const HOUR = 3_600_000;
export const DEADLINE_SOON_MS = 48 * HOUR;
export const DEADLINE_URGENT_MS = 6 * HOUR;

export type DeadlineUrgency = { level: 'soon' | 'urgent'; label: string };

/** True while the student can still do something with this assignment. */
export function isActionable(a: ExamAssignment): boolean {
  if (a.inProgressAttemptId) return true;
  return (
    (a.remainingAttempts ?? 0) > 0 && (a.status === 'available' || a.status === 'in_progress')
  );
}

export function formatTimeLeft(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.ceil(ms / 60_000))} phút`;
  if (ms < 24 * HOUR) return `${Math.floor(ms / HOUR)} giờ`;
  return `${Math.floor(ms / (24 * HOUR))} ngày`;
}

/** "Còn X giờ/ngày" for actionable assignments whose deadline is within 48 hours. */
export function deadlineUrgency(a: ExamAssignment, now: number): DeadlineUrgency | null {
  if (!isActionable(a)) return null;
  const left = new Date(a.deadline).getTime() - now;
  if (!Number.isFinite(left) || left <= 0 || left > DEADLINE_SOON_MS) return null;
  return {
    level: left <= DEADLINE_URGENT_MS ? 'urgent' : 'soon',
    label: `Còn ${formatTimeLeft(left)}`,
  };
}

function rank(a: ExamAssignment, now: number): number {
  if (a.inProgressAttemptId) return 0;
  if (deadlineUrgency(a, now)) return 1;
  if (isActionable(a)) return 2;
  if (a.status === 'assigned') return 3;
  return 4;
}

/** In progress first, then due soon, then other open work, then upcoming, then done. */
export function sortAssignmentsForStudent(items: ExamAssignment[], now: number): ExamAssignment[] {
  return [...items].sort((x, y) => {
    const r = rank(x, now) - rank(y, now);
    if (r !== 0) return r;
    return new Date(x.deadline).getTime() - new Date(y.deadline).getTime();
  });
}

/** attemptId → last attempt status the student saw on the dashboard. */
export type SeenGrades = Record<string, string>;

export const SEEN_GRADES_KEY = 'testarchive:seen-grades';

/** A result is "new" when it was waiting for grading last time and is graded now. */
export function hasNewGrade(a: ExamAssignment, seen: SeenGrades): boolean {
  const latest = a.latestFinishedAttempt;
  if (!latest || latest.status !== 'graded') return false;
  const before = seen[latest.id];
  return before === 'needs_grading' || before === 'submitted';
}

/** Record what is on screen now, keeping un-opened "new" marks until the result is viewed. */
export function nextSeenGrades(items: ExamAssignment[], seen: SeenGrades): SeenGrades {
  const next: SeenGrades = {};
  for (const a of items) {
    const latest = a.latestFinishedAttempt;
    if (!latest) continue;
    next[latest.id] = hasNewGrade(a, seen) ? seen[latest.id] : latest.status;
  }
  return next;
}

export function readSeenGrades(): SeenGrades {
  try {
    const raw = window.localStorage.getItem(SEEN_GRADES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as SeenGrades) : {};
  } catch {
    return {};
  }
}

export function writeSeenGrades(seen: SeenGrades): void {
  try {
    window.localStorage.setItem(SEEN_GRADES_KEY, JSON.stringify(seen));
  } catch {
    // Storage blocked: the badge just will not persist.
  }
}
