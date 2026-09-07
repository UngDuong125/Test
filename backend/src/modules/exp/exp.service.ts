import {
  findExpByAttempt,
  insertExpLedger,
  updateExpLedger,
} from '../../repositories/attempts.repository.js';
import { adjustSubjectExp } from '../../repositories/users.repository.js';
import type { ExamType, TagKey } from '../../types/domain.js';
import { computeExpEarned } from '../grading/grading.logic.js';

export async function awardExpForGradedAttempt(input: {
  attemptId: string;
  userId: string;
  subjectId: TagKey;
  examType: ExamType;
  score: number;
  maxScore: number;
}): Promise<{ expEarned: number; expSubject: TagKey; adjusted: boolean }> {
  const expEarned = computeExpEarned(input.examType, input.score, input.maxScore);
  const existing = await findExpByAttempt(input.attemptId);

  if (!existing) {
    await insertExpLedger({
      attemptId: input.attemptId,
      userId: input.userId,
      subjectId: input.subjectId,
      expEarned,
      examType: input.examType,
      idempotencyKey: `${input.attemptId}:graded`,
    });
    await adjustSubjectExp(input.userId, input.subjectId, expEarned);
    return { expEarned, expSubject: input.subjectId, adjusted: false };
  }

  const delta = expEarned - existing.expEarned;
  if (delta !== 0) {
    await updateExpLedger(input.attemptId, expEarned);
    await adjustSubjectExp(input.userId, input.subjectId, delta);
  }
  return { expEarned, expSubject: input.subjectId, adjusted: true };
}
