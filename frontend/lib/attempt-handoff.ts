import type { AttemptDetail } from '@/types/content';

type Handoff = {
  detail: AttemptDetail;
  receivedAt: number;
};

const pending = new Map<string, Handoff>();

/** Keep a start-attempt response so the attempt page does not fetch it again. */
export function rememberAttemptDetail(detail: AttemptDetail, receivedAt = Date.now()) {
  pending.set(detail.attempt.id, { detail, receivedAt });
}

export function takeAttemptDetail(attemptId: string): Handoff | null {
  const hit = pending.get(attemptId);
  if (!hit) return null;
  pending.delete(attemptId);
  return hit;
}
