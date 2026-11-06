import type { AssignmentStatus, AttemptStatus } from '@/types/content';

const ASSIGNMENT_LABELS: Record<AssignmentStatus, string> = {
  assigned: 'Chưa mở',
  available: 'Còn lượt',
  in_progress: 'Đang làm',
  completed: 'Đã xong',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

export function assignmentStatusLabel(status: AssignmentStatus): string {
  return ASSIGNMENT_LABELS[status] ?? status;
}

const STATUS_LABELS: Record<AttemptStatus, string> = {
  in_progress: 'Đang làm',
  submitted: 'Đã nộp',
  needs_grading: 'Chờ chấm',
  graded: 'Đã chấm',
  expired: 'Hết hạn',
  cancelled: 'Đã hủy',
};

export function attemptStatusLabel(status: AttemptStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatAttemptScore(
  score: number | null,
  maxScore: number,
  percentage: number | null,
): string {
  if (score == null) return '—';
  const pct = percentage != null ? ` (${percentage}%)` : '';
  return `${score}/${maxScore}${pct}`;
}
