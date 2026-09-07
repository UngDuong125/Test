import { AppError } from '../../domain/errors.js';
import { awardExpForGradedAttempt } from '../exp/exp.service.js';
import { questionRequiresManualGrade } from './grading.logic.js';
import { getAttemptForUser } from '../attempts/attempts.service.js';
import {
  createGradingRecord,
  findAttemptById,
  getAttemptSnapshot,
  listAttemptAnswers,
  listNeedsGradingAttempts,
  updateAnswerGrading,
  updateAttempt,
} from '../../repositories/attempts.repository.js';
import { findAssignmentById } from '../../repositories/assignments.repository.js';
import { findExamById } from '../../repositories/exams.repository.js';
import { isStudentInTeacherClass } from '../../repositories/classes.repository.js';
import type { PublicUser } from '../../types/domain.js';

async function assertCanGrade(actor: PublicUser, attemptId: string) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const attempt = await findAttemptById(attemptId);
  if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');

  if (actor.role === 'admin') return attempt;

  const exam = await findExamById(attempt.examId);
  if (exam && exam.ownerId === actor.id) return attempt;

  const assignment = await findAssignmentById(attempt.assignmentId);
  if (assignment && assignment.assignedBy === actor.id) return attempt;

  const inClass = await isStudentInTeacherClass(attempt.userId, actor.id);
  if (inClass) return attempt;

  throw new AppError(403, 'Forbidden', 'FORBIDDEN');
}

export async function listGradingQueue(
  actor: PublicUser,
  filters: {
    examId?: string;
    classId?: string;
    subjectId?: string;
    limit?: number;
    offset?: number;
  },
) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const result = await listNeedsGradingAttempts({
    examId: filters.examId,
    classId: filters.classId,
    limit: filters.limit ?? 20,
    offset: filters.offset ?? 0,
  });

  let items = result.items;

  if (actor.role === 'teacher') {
    const filtered = [];
    for (const attempt of items) {
      const exam = await findExamById(attempt.examId);
      if (exam && exam.ownerId === actor.id) {
        filtered.push(attempt);
        continue;
      }
      const assignment = await findAssignmentById(attempt.assignmentId);
      if (assignment && assignment.assignedBy === actor.id) {
        filtered.push(attempt);
        continue;
      }
      const inClass = await isStudentInTeacherClass(attempt.userId, actor.id);
      if (inClass) filtered.push(attempt);
    }
    items = filtered;
  }

  if (filters.subjectId) {
    const withSubject = [];
    for (const attempt of items) {
      const exam = await findExamById(attempt.examId);
      if (exam?.subjectId === filters.subjectId) withSubject.push(attempt);
    }
    items = withSubject;
  }

  const enriched = await Promise.all(
    items.map(async (attempt) => {
      const exam = await findExamById(attempt.examId);
      return {
        ...attempt,
        examTitle: exam?.title,
        subjectId: exam?.subjectId,
      };
    }),
  );

  return { items: enriched, total: enriched.length };
}

export async function gradeAttemptForUser(
  actor: PublicUser,
  attemptId: string,
  body: {
    answers: Array<{
      questionId: string;
      pointsEarned: number;
      isCorrect?: boolean | null;
      feedback?: string | null;
    }>;
    notes?: string;
  },
  opts: { regrade?: boolean } = {},
) {
  const attempt = await assertCanGrade(actor, attemptId);

  if (opts.regrade) {
    if (attempt.status !== 'graded' && attempt.status !== 'needs_grading') {
      throw new AppError(422, 'Cannot regrade this attempt', 'INVALID_STATUS');
    }
  } else if (attempt.status !== 'needs_grading') {
    throw new AppError(422, 'Attempt is not awaiting grading', 'INVALID_STATUS');
  }

  const snapshot = await getAttemptSnapshot(attemptId);
  if (!snapshot) throw new AppError(500, 'Snapshot missing', 'SNAPSHOT_MISSING');

  const qMap = new Map(snapshot.questions.map((q) => [q.id, q]));
  const existing = await listAttemptAnswers(attemptId);
  const existingMap = new Map(existing.map((a) => [a.questionId, a]));

  for (const item of body.answers) {
    const q = qMap.get(item.questionId);
    if (!q) {
      throw new AppError(422, `Question ${item.questionId} not in attempt`, 'QUESTION_NOT_IN_ATTEMPT');
    }
    if (item.pointsEarned < 0 || item.pointsEarned > q.points) {
      throw new AppError(
        422,
        `pointsEarned must be between 0 and ${q.points}`,
        'POINTS_OUT_OF_RANGE',
      );
    }
    if (!existingMap.has(item.questionId)) {
      throw new AppError(422, `No answer row for ${item.questionId}`, 'ANSWER_MISSING');
    }

    await updateAnswerGrading(attemptId, item.questionId, {
      pointsEarned: item.pointsEarned,
      isCorrect: item.isCorrect ?? null,
      feedback: item.feedback ?? null,
    });
  }

  // Recompute total from all answers
  const allAnswers = await listAttemptAnswers(attemptId);
  const answerMap = new Map(allAnswers.map((a) => [a.questionId, a]));

  let score = 0;
  let stillPending = false;

  for (const q of snapshot.questions) {
    const ans = answerMap.get(q.id);
    if (questionRequiresManualGrade(q)) {
      if (ans?.pointsEarned == null && !opts.regrade) {
        // If teacher didn't include this question in the payload, keep pending
        const gradedNow = body.answers.some((a) => a.questionId === q.id);
        if (!gradedNow) {
          stillPending = true;
          continue;
        }
      }
      // After regrade or if graded in this request, use stored points
      score += ans?.pointsEarned ?? 0;
    } else {
      score += ans?.pointsEarned ?? 0;
    }
  }

  // If all manual questions were in the request, clear pending
  if (!stillPending) {
    for (const q of snapshot.questions) {
      if (!questionRequiresManualGrade(q)) continue;
      const included = body.answers.some((a) => a.questionId === q.id);
      const ans = answerMap.get(q.id);
      if (!included && ans?.pointsEarned == null) {
        stillPending = true;
        break;
      }
    }
  }

  // Simpler rule: if every manual question appears in body.answers, finalize
  const manualQuestions = snapshot.questions.filter(questionRequiresManualGrade);
  const allManualGraded = manualQuestions.every((q) =>
    body.answers.some((a) => a.questionId === q.id),
  );

  if (!allManualGraded && !opts.regrade) {
    // Partial grade — keep needs_grading but update partial score
    const percentage =
      attempt.maxScore > 0 ? Math.round((score / attempt.maxScore) * 10000) / 100 : 0;
    const updated = await updateAttempt(attemptId, { score, percentage });
    await createGradingRecord({
      attemptId,
      gradedBy: actor.id,
      notes: body.notes ?? 'Partial grade',
    });
    return {
      attemptId,
      status: updated.status,
      score: updated.score,
      maxScore: updated.maxScore,
      percentage: updated.percentage,
      expEarned: null,
      expSubject: null,
    };
  }

  // Recalculate score with updated answers after write
  const freshAnswers = await listAttemptAnswers(attemptId);
  score = freshAnswers.reduce((sum, a) => sum + (a.pointsEarned ?? 0), 0);
  const percentage =
    attempt.maxScore > 0 ? Math.round((score / attempt.maxScore) * 10000) / 100 : 0;

  const updated = await updateAttempt(attemptId, {
    status: 'graded',
    score,
    percentage,
  });

  await createGradingRecord({
    attemptId,
    gradedBy: actor.id,
    notes: body.notes ?? null,
  });

  const exp = await awardExpForGradedAttempt({
    attemptId: updated.id,
    userId: updated.userId,
    subjectId: snapshot.exam.subjectId,
    examType: snapshot.exam.type,
    score,
    maxScore: updated.maxScore,
  });

  return {
    attemptId: updated.id,
    status: updated.status,
    score: updated.score,
    maxScore: updated.maxScore,
    percentage: updated.percentage,
    expEarned: exp.expEarned,
    expSubject: exp.expSubject,
  };
}

export async function getGradingDetail(actor: PublicUser, attemptId: string) {
  await assertCanGrade(actor, attemptId);
  return getAttemptForUser(actor, attemptId);
}
