import { AppError } from '../../domain/errors.js';
import type { PublicUser, TagKey } from '../../types/domain.js';
import {
  listAttemptStatsForExam,
  listAttemptsForAssignments,
  listAssignmentIdsForClass,
  listBankQuestionIds,
  listGradedAnswerStatsForQuestion,
  observeDifficulty,
  sumExpForAttemptIds,
  upsertQuestionStats,
} from '../../repositories/analytics.repository.js';
import { findQuestionById } from '../../repositories/questions.repository.js';
import { findQuestionBankById } from '../../repositories/questionBanks.repository.js';
import { findExamById } from '../../repositories/exams.repository.js';
import { findClassById, listMemberUserIds } from '../../repositories/classes.repository.js';
import { listAttemptsByUser, findExpByAttempt } from '../../repositories/attempts.repository.js';
import { listAssignments } from '../../repositories/assignments.repository.js';
import { TAG_KEYS } from '../../types/domain.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

export async function getQuestionStats(
  actor: PublicUser,
  questionId: string,
  opts: { from?: string; to?: string } = {},
) {
  assertTeacherOrAdmin(actor);
  const question = await findQuestionById(questionId);
  if (!question) throw new AppError(404, 'Question not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && question.createdBy !== actor.id) {
    throw new AppError(403, 'Not the question owner', 'FORBIDDEN');
  }

  const rows = await listGradedAnswerStatsForQuestion(questionId, opts);
  const usageCount = rows.length;
  let correct = 0;
  let answeredWithFlag = 0;
  let pointsSum = 0;
  let pointsCount = 0;
  let timeSum = 0;
  let timeCount = 0;

  for (const r of rows) {
    if (r.isCorrect === true) correct += 1;
    if (r.isCorrect != null) answeredWithFlag += 1;
    // Essay: treat pointsEarned / question.points >= 0.6 as "correct-ish" for rate if isCorrect null
    if (r.isCorrect == null && r.pointsEarned != null && question.points > 0) {
      answeredWithFlag += 1;
      if (r.pointsEarned / question.points >= 0.6) correct += 1;
    }
    if (r.pointsEarned != null) {
      pointsSum += r.pointsEarned;
      pointsCount += 1;
    }
    const secs =
      (new Date(r.answeredAt).getTime() - new Date(r.attemptStartedAt).getTime()) / 1000;
    if (secs >= 0 && secs < 86_400) {
      timeSum += secs;
      timeCount += 1;
    }
  }

  const correctRate = answeredWithFlag > 0 ? correct / answeredWithFlag : null;
  const averagePointsEarned = pointsCount > 0 ? pointsSum / pointsCount : null;
  const averageTimeSeconds = timeCount > 0 ? Math.round(timeSum / timeCount) : null;
  const difficultyObserved = observeDifficulty(correctRate);

  // Materialize cache (best-effort)
  try {
    await upsertQuestionStats({
      questionId,
      usageCount,
      correctRate,
      averagePointsEarned,
    });
  } catch {
    // ignore cache write failures
  }

  return {
    questionId,
    usageCount,
    attemptCount: usageCount,
    correctRate,
    averagePointsEarned,
    averageTimeSeconds,
    difficultyObserved,
  };
}

export async function getQuestionBankStats(
  actor: PublicUser,
  bankId: string,
  opts: { from?: string; to?: string } = {},
) {
  assertTeacherOrAdmin(actor);
  const bank = await findQuestionBankById(bankId);
  if (!bank) throw new AppError(404, 'Bank not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && bank.ownerId !== actor.id) {
    throw new AppError(403, 'Not the bank owner', 'FORBIDDEN');
  }

  const questionIds = await listBankQuestionIds(bankId);
  const items = [];
  for (const qid of questionIds) {
    try {
      items.push(await getQuestionStats(actor, qid, opts));
    } catch {
      // skip inaccessible
    }
  }

  const totalUsage = items.reduce((s, i) => s + i.usageCount, 0);
  const withRate = items.filter((i) => i.correctRate != null);
  const avgCorrect =
    withRate.length > 0
      ? withRate.reduce((s, i) => s + (i.correctRate ?? 0), 0) / withRate.length
      : null;

  return {
    bankId,
    questionCount: questionIds.length,
    totalUsage,
    averageCorrectRate: avgCorrect,
    questions: items,
  };
}

export async function getExamAnalytics(
  actor: PublicUser,
  examId: string,
  opts: { from?: string; to?: string } = {},
) {
  assertTeacherOrAdmin(actor);
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && exam.ownerId !== actor.id) {
    throw new AppError(403, 'Not the exam owner', 'FORBIDDEN');
  }

  const attempts = await listAttemptStatsForExam(examId, opts);
  const nonProgress = attempts.filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled');
  const graded = attempts.filter((a) => a.status === 'graded');
  const needsGrading = attempts.filter((a) => a.status === 'needs_grading');

  const scoreSum = graded.reduce((s, a) => s + (a.score ?? 0), 0);
  const pctSum = graded.reduce((s, a) => s + (a.percentage ?? 0), 0);

  return {
    examId,
    attemptCount: nonProgress.length,
    gradedCount: graded.length,
    needsGradingCount: needsGrading.length,
    averageScore: graded.length > 0 ? Math.round((scoreSum / graded.length) * 100) / 100 : null,
    averagePercentage:
      graded.length > 0 ? Math.round((pctSum / graded.length) * 100) / 100 : null,
    completionRate:
      nonProgress.length > 0
        ? Math.round((graded.length / nonProgress.length) * 1000) / 1000
        : null,
  };
}

export async function getClassAnalytics(
  actor: PublicUser,
  classId: string,
  opts: { examId?: string; from?: string; to?: string } = {},
) {
  assertTeacherOrAdmin(actor);
  const cls = await findClassById(classId);
  if (!cls) throw new AppError(404, 'Class not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && cls.ownerId !== actor.id) {
    throw new AppError(403, 'Not the class owner', 'FORBIDDEN');
  }

  const assignmentIds = await listAssignmentIdsForClass(classId);
  const members = await listMemberUserIds(classId);
  const attempts = await listAttemptsForAssignments(assignmentIds, opts);

  const completed = attempts.filter((a) =>
    ['graded', 'needs_grading', 'submitted', 'expired'].includes(a.status),
  );
  const graded = attempts.filter((a) => a.status === 'graded');
  const pctSum = graded.reduce((s, a) => s + (a.percentage ?? 0), 0);
  const expTotal = await sumExpForAttemptIds(graded.map((a) => a.id));

  // assignedCount: unique students with assignment for this class (optionally exam)
  let assignedCount = members.length;
  if (opts.examId) {
    const asg = await listAssignments({ examId: opts.examId, limit: 500 });
    assignedCount = asg.items.filter((a) => a.sourceClassId === classId).length;
  }

  return {
    classId,
    examId: opts.examId ?? null,
    assignedCount,
    completedCount: new Set(completed.map((a) => a.userId)).size,
    attemptCount: attempts.length,
    gradedCount: graded.length,
    averagePercentage:
      graded.length > 0 ? Math.round((pctSum / graded.length) * 100) / 100 : null,
    expTotal,
  };
}

export async function getMyStats(actor: PublicUser) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Students only', 'FORBIDDEN');
  }
  const { items } = await listAttemptsByUser(actor.id, { limit: 200 });
  const graded = items.filter((a) => a.status === 'graded');
  const needs = items.filter((a) => a.status === 'needs_grading');
  const pctSum = graded.reduce((s, a) => s + (a.percentage ?? 0), 0);

  let expTotal = 0;
  const bySubject = Object.fromEntries(TAG_KEYS.map((k) => [k, 0])) as Record<TagKey, number>;
  for (const a of graded) {
    const exp = await findExpByAttempt(a.id);
    if (exp) {
      expTotal += exp.expEarned;
      bySubject[exp.subjectId] = (bySubject[exp.subjectId] ?? 0) + exp.expEarned;
    }
  }

  return {
    attemptCount: items.filter((a) => a.status !== 'cancelled').length,
    gradedCount: graded.length,
    needsGradingCount: needs.length,
    averagePercentage:
      graded.length > 0 ? Math.round((pctSum / graded.length) * 100) / 100 : null,
    expTotal,
    subjectExp: bySubject,
  };
}
