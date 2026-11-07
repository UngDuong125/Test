import { AppError } from '../../domain/errors.js';
import type { PublicUser, TagKey } from '../../types/domain.js';
import {
  listAttemptStatsForExam,
  listAnswerTimesForAttempts,
  listAttemptsForAssignments,
  listAssignmentIdsForClass,
  listGradedAnswerStatsForQuestion,
  observeDifficulty,
  sumExpForAttemptIds,
  upsertQuestionStats,
} from '../../repositories/analytics.repository.js';
import { findQuestionById } from '../../repositories/questions.repository.js';
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

/** Gaps longer than this are treated as idle time, not work on the question. */
export const MAX_QUESTION_SECONDS = 30 * 60;

/**
 * Estimated seconds spent on `questionId` in each attempt: time since the previous
 * answer's last save (or since the attempt started). `answered_at` is overwritten on
 * every save, so this is an estimate; idle gaps and negative gaps are dropped.
 */
export function estimateQuestionSeconds(
  questionId: string,
  answers: { attemptId: string; questionId: string; answeredAt: string }[],
  startedAtByAttempt: Map<string, string>,
): number[] {
  const byAttempt = new Map<string, { questionId: string; at: number }[]>();
  for (const a of answers) {
    const list = byAttempt.get(a.attemptId) ?? [];
    list.push({ questionId: a.questionId, at: Date.parse(a.answeredAt) });
    byAttempt.set(a.attemptId, list);
  }
  const out: number[] = [];
  for (const [attemptId, list] of byAttempt) {
    list.sort((x, y) => x.at - y.at);
    const i = list.findIndex((x) => x.questionId === questionId);
    if (i < 0) continue;
    const prev = i === 0 ? Date.parse(startedAtByAttempt.get(attemptId) ?? '') : list[i - 1].at;
    const secs = (list[i].at - prev) / 1000;
    if (Number.isFinite(secs) && secs >= 0 && secs <= MAX_QUESTION_SECONDS) out.push(secs);
  }
  return out;
}

const CHOICE_TYPES = new Set(['multiple_choice', 'true_false', 'multiple_select']);

/**
 * Share of answered attempts that picked each option. For single-choice questions the
 * rates sum to 1; for multiple_select a student can pick several, so they may exceed 1.
 * Aggregate only — never which student picked what.
 */
export function computeOptionStats(
  optionIds: string[],
  values: unknown[],
): { optionId: string; selectedCount: number; selectedRate: number }[] {
  const counts = new Map(optionIds.map((id) => [id, 0]));
  let answered = 0;
  for (const v of values) {
    const picked = Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : typeof v === 'string' && v !== ''
        ? [v]
        : [];
    if (picked.length === 0) continue;
    answered += 1;
    for (const id of new Set(picked)) {
      if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return optionIds.map((optionId) => {
    const selectedCount = counts.get(optionId) ?? 0;
    return {
      optionId,
      selectedCount,
      selectedRate: answered > 0 ? Math.round((selectedCount / answered) * 1000) / 1000 : 0,
    };
  });
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
  }

  const correctRate = answeredWithFlag > 0 ? correct / answeredWithFlag : null;
  const averagePointsEarned = pointsCount > 0 ? pointsSum / pointsCount : null;
  const times = estimateQuestionSeconds(
    questionId,
    await listAnswerTimesForAttempts([...new Set(rows.map((r) => r.attemptId))]),
    new Map(rows.map((r) => [r.attemptId, r.attemptStartedAt])),
  );
  const averageTimeSeconds =
    times.length > 0 ? Math.round(times.reduce((s, t) => s + t, 0) / times.length) : null;
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

  const optionStats = CHOICE_TYPES.has(question.type)
    ? computeOptionStats(
        [...question.options].sort((a, b) => a.order - b.order).map((o) => o.id),
        rows.map((r) => r.value),
      )
    : null;

  return {
    questionId,
    usageCount,
    attemptCount: usageCount,
    optionStats,
    correctRate,
    averagePointsEarned,
    averageTimeSeconds,
    difficultyObserved,
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
