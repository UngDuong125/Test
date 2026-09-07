import { AppError } from '../../domain/errors.js';
import { awardExpForGradedAttempt } from '../exp/exp.service.js';
import {
  autoGradeAnswer,
  isAnswerKeyRevealAllowed,
  questionRequiresManualGrade,
  stripSnapshotForStudent,
} from '../grading/grading.logic.js';
import { deriveAssignmentStatus } from '../assignments/assignments.service.js';
import {
  countAttemptsForLimit,
  createAttempt,
  ensureAnswerRow,
  findAttemptById,
  findExpByAttempt,
  findInProgressAttempt,
  getAttemptSnapshot,
  listAttemptAnswers,
  listAttemptsByAssignment,
  listAttemptsByExam,
  listAttemptsByUser,
  saveAttemptSnapshot,
  updateAnswerGrading,
  updateAttempt,
  upsertAttemptAnswer,
} from '../../repositories/attempts.repository.js';
import {
  findAssignmentById,
  updateAssignment,
} from '../../repositories/assignments.repository.js';
import { findExamById, listExamQuestions, listExamSections } from '../../repositories/exams.repository.js';
import { findQuestionsByIds } from '../../repositories/questions.repository.js';
import { isStudentInTeacherClass } from '../../repositories/classes.repository.js';
import type {
  Attempt,
  AttemptAnswer,
  AttemptSnapshotPayload,
  ExamSettings,
  PublicUser,
  SnapshotQuestion,
  StudentAnswerValue,
} from '../../types/domain.js';
import { DEFAULT_EXAM_SETTINGS } from '../../types/domain.js';

function mergeSettings(
  exam: ExamSettings,
  assignment: Partial<ExamSettings>,
): ExamSettings {
  return {
    shuffleQuestions: assignment.shuffleQuestions ?? exam.shuffleQuestions,
    shuffleOptions: assignment.shuffleOptions ?? exam.shuffleOptions,
    showResult: assignment.showResult ?? exam.showResult,
    showExplanation: assignment.showExplanation ?? exam.showExplanation,
  };
}

function shuffleInPlace<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function buildSnapshot(
  examId: string,
  assignmentSettings: Partial<ExamSettings>,
): Promise<{ payload: AttemptSnapshotPayload; maxScore: number; examVersion: number }> {
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (exam.status !== 'published') {
    throw new AppError(422, 'Exam is not published', 'EXAM_NOT_PUBLISHED');
  }

  const [sections, examQuestions] = await Promise.all([
    listExamSections(examId),
    listExamQuestions(examId),
  ]);
  if (examQuestions.length === 0) {
    throw new AppError(422, 'Exam has no questions', 'EXAM_EMPTY');
  }

  const questions = await findQuestionsByIds(examQuestions.map((eq) => eq.questionId));
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const effectiveSettings = mergeSettings(exam.settings ?? DEFAULT_EXAM_SETTINGS, assignmentSettings);

  let ordered = [...examQuestions].sort((a, b) => a.order - b.order);
  if (effectiveSettings.shuffleQuestions) {
    ordered = shuffleInPlace(ordered);
  }

  const snapshotQuestions: SnapshotQuestion[] = [];
  let maxScore = 0;

  for (let i = 0; i < ordered.length; i += 1) {
    const eq = ordered[i];
    const q = qMap.get(eq.questionId);
    if (!q) {
      throw new AppError(422, `Question ${eq.questionId} missing`, 'QUESTION_MISSING');
    }
    let options = [...q.options].sort((a, b) => a.order - b.order);
    if (effectiveSettings.shuffleOptions && options.length > 0) {
      options = shuffleInPlace(options).map((opt, idx) => ({ ...opt, order: idx + 1 }));
    }

    const points = eq.points;
    maxScore += points;
    const snap: SnapshotQuestion = {
      id: q.id,
      type: q.type,
      content: q.content,
      options,
      answer: q.answer,
      explanation: q.explanation,
      points,
      version: q.version,
      sectionId: eq.sectionId,
      order: i + 1,
      requiresManualGrade: q.type === 'essay' || q.answer.type === 'manual',
    };
    snapshotQuestions.push(snap);
  }

  const payload: AttemptSnapshotPayload = {
    exam: {
      id: exam.id,
      title: exam.title,
      description: exam.description,
      subjectId: exam.subjectId,
      grade: exam.grade,
      type: exam.type,
      duration: exam.duration,
      totalPoints: exam.totalPoints,
      instructions: exam.instructions,
      settings: exam.settings,
      version: exam.version,
    },
    sections,
    questions: snapshotQuestions,
    effectiveSettings,
  };

  return { payload, maxScore, examVersion: exam.version };
}

async function assertCanAccessAttempt(actor: PublicUser, attempt: Attempt) {
  if (actor.role === 'admin') return;
  if (actor.role === 'student') {
    if (attempt.userId !== actor.id) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
    return;
  }
  if (actor.role === 'teacher') {
    const exam = await findExamById(attempt.examId);
    if (exam && exam.ownerId === actor.id) return;
    const assignment = await findAssignmentById(attempt.assignmentId);
    if (assignment && assignment.assignedBy === actor.id) return;
    const inClass = await isStudentInTeacherClass(attempt.userId, actor.id);
    if (inClass) return;
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  throw new AppError(403, 'Forbidden', 'FORBIDDEN');
}

async function expireIfNeeded(attempt: Attempt, assignmentDeadline?: string): Promise<Attempt> {
  if (attempt.status !== 'in_progress') return attempt;
  const now = Date.now();
  const expiredByTimer =
    attempt.expiresAt != null && new Date(attempt.expiresAt).getTime() <= now;
  const expiredByDeadline =
    assignmentDeadline != null && new Date(assignmentDeadline).getTime() <= now;

  if (!expiredByTimer && !expiredByDeadline) return attempt;

  return updateAttempt(attempt.id, {
    status: 'expired',
    submittedAt: new Date().toISOString(),
  });
}

async function syncAssignmentAfterAttempt(assignmentId: string) {
  const assignment = await findAssignmentById(assignmentId);
  if (!assignment) return;
  if (assignment.status === 'cancelled') return;

  const attempts = await listAttemptsByAssignment(assignmentId);
  const activeCount = attempts.filter((a) => a.status !== 'cancelled').length;
  const hasInProgress = attempts.some((a) => a.status === 'in_progress');
  const limitReached = activeCount >= assignment.attemptLimit;

  let nextStatus = deriveAssignmentStatus(assignment);
  if (hasInProgress) {
    nextStatus = 'in_progress';
  } else if (limitReached) {
    nextStatus = 'completed';
  } else if (
    attempts.some((a) =>
      ['graded', 'needs_grading', 'submitted', 'expired'].includes(a.status),
    )
  ) {
    // Keep available for retry if window allows
    nextStatus = deriveAssignmentStatus({ ...assignment, status: 'available' });
    if (nextStatus === 'available' || nextStatus === 'assigned') {
      // leave as available/assigned for another attempt
    }
  }

  if (nextStatus !== assignment.status) {
    await updateAssignment(assignmentId, { status: nextStatus });
  }
}

function publicAnswersForViewer(
  answers: AttemptAnswer[],
  opts: { showResult: boolean; status: string; forTeacher: boolean },
): AttemptAnswer[] {
  if (opts.forTeacher) return answers;
  if (opts.status === 'in_progress') {
    return answers.map((a) => ({
      ...a,
      isCorrect: null,
      pointsEarned: null,
      feedback: null,
    }));
  }
  if (!opts.showResult) {
    return answers.map((a) => ({
      ...a,
      isCorrect: null,
      pointsEarned: null,
      feedback: null,
    }));
  }
  return answers;
}

export async function startAttemptForAssignment(actor: PublicUser, assignmentId: string) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Only students can start attempts', 'FORBIDDEN');
  }

  const assignment = await findAssignmentById(assignmentId);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');
  if (assignment.targetId !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const status = deriveAssignmentStatus(assignment);
  if (status === 'cancelled') {
    throw new AppError(422, 'Assignment cancelled', 'ASSIGNMENT_CANCELLED');
  }
  if (status === 'assigned') {
    throw new AppError(422, 'Assignment not yet available', 'NOT_AVAILABLE');
  }
  if (status === 'expired') {
    throw new AppError(422, 'Assignment expired', 'ASSIGNMENT_EXPIRED');
  }

  const existing = await findInProgressAttempt(assignmentId, actor.id);
  if (existing) {
    const refreshed = await expireIfNeeded(existing, assignment.deadline);
    if (refreshed.status === 'in_progress') {
      return getAttemptForUser(actor, refreshed.id);
    }
  }

  const used = await countAttemptsForLimit(assignmentId);
  if (used >= assignment.attemptLimit) {
    throw new AppError(422, 'Attempt limit reached', 'ATTEMPT_LIMIT');
  }

  const { payload, maxScore, examVersion } = await buildSnapshot(
    assignment.examId,
    assignment.settings,
  );

  const durationMs = payload.exam.duration > 0 ? payload.exam.duration * 60 * 1000 : null;
  const deadlineMs = new Date(assignment.deadline).getTime();
  let expiresAt: string | null = null;
  if (durationMs != null) {
    const byDuration = Date.now() + durationMs;
    expiresAt = new Date(Math.min(byDuration, deadlineMs)).toISOString();
  } else {
    expiresAt = assignment.deadline;
  }

  const attempt = await createAttempt({
    assignmentId: assignment.id,
    userId: actor.id,
    examId: assignment.examId,
    examVersion,
    maxScore,
    expiresAt,
  });
  await saveAttemptSnapshot(attempt.id, payload);
  await updateAssignment(assignment.id, { status: 'in_progress' });

  return getAttemptForUser(actor, attempt.id);
}

export async function getAttemptForUser(actor: PublicUser, attemptId: string) {
  let attempt = await findAttemptById(attemptId);
  if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  await assertCanAccessAttempt(actor, attempt);

  const assignment = await findAssignmentById(attempt.assignmentId);
  attempt = await expireIfNeeded(attempt, assignment?.deadline);
  if (attempt.status === 'expired') {
    await syncAssignmentAfterAttempt(attempt.assignmentId);
  }

  const [snapshot, answers] = await Promise.all([
    getAttemptSnapshot(attemptId),
    listAttemptAnswers(attemptId),
  ]);
  if (!snapshot) throw new AppError(500, 'Snapshot missing', 'SNAPSHOT_MISSING');

  const forTeacher = actor.role === 'admin' || actor.role === 'teacher';
  const settings = snapshot.effectiveSettings;
  const revealKeys = isAnswerKeyRevealAllowed({
    status: attempt.status,
    showExplanation: settings.showExplanation,
    forTeacher,
  });

  return {
    attempt,
    snapshot: stripSnapshotForStudent(snapshot, revealKeys),
    answers: publicAnswersForViewer(answers, {
      showResult: settings.showResult,
      status: attempt.status,
      forTeacher,
    }),
  };
}

export async function saveAnswerForUser(
  actor: PublicUser,
  attemptId: string,
  body: { questionId: string; value: StudentAnswerValue },
) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Only students can save answers', 'FORBIDDEN');
  }

  let attempt = await findAttemptById(attemptId);
  if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  if (attempt.userId !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const assignment = await findAssignmentById(attempt.assignmentId);
  attempt = await expireIfNeeded(attempt, assignment?.deadline);
  if (attempt.status !== 'in_progress') {
    throw new AppError(422, 'Attempt is not in progress', 'ATTEMPT_LOCKED');
  }

  const snapshot = await getAttemptSnapshot(attemptId);
  if (!snapshot) throw new AppError(500, 'Snapshot missing', 'SNAPSHOT_MISSING');
  const q = snapshot.questions.find((x) => x.id === body.questionId);
  if (!q) {
    throw new AppError(422, 'Question not in this attempt', 'QUESTION_NOT_IN_ATTEMPT');
  }

  const answer = await upsertAttemptAnswer({
    attemptId,
    questionId: body.questionId,
    value: body.value,
  });

  return { answer };
}

export async function submitAttemptForUser(actor: PublicUser, attemptId: string) {
  if (actor.role !== 'student' && actor.role !== 'admin') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  let attempt = await findAttemptById(attemptId);
  if (!attempt) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  if (actor.role === 'student' && attempt.userId !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const assignment = await findAssignmentById(attempt.assignmentId);
  attempt = await expireIfNeeded(attempt, assignment?.deadline);

  if (attempt.status === 'expired') {
    // Auto-submit expired: grade what we have
  } else if (attempt.status !== 'in_progress') {
    throw new AppError(422, 'Attempt already submitted', 'ALREADY_SUBMITTED');
  }

  const snapshot = await getAttemptSnapshot(attemptId);
  if (!snapshot) throw new AppError(500, 'Snapshot missing', 'SNAPSHOT_MISSING');

  const existingAnswers = await listAttemptAnswers(attemptId);
  const answerMap = new Map(existingAnswers.map((a) => [a.questionId, a]));

  let score = 0;
  let needsManual = false;

  for (const q of snapshot.questions) {
    let answer = answerMap.get(q.id);
    if (!answer) {
      answer = await ensureAnswerRow({ attemptId, questionId: q.id, value: null });
    }

    const graded = autoGradeAnswer(q, answer.value);
    if (graded.requiresManual || questionRequiresManualGrade(q)) {
      needsManual = true;
      await updateAnswerGrading(attemptId, q.id, {
        isCorrect: null,
        pointsEarned: 0,
        feedback: null,
      });
    } else {
      score += graded.pointsEarned;
      await updateAnswerGrading(attemptId, q.id, {
        isCorrect: graded.isCorrect,
        pointsEarned: graded.pointsEarned,
      });
    }
  }

  const percentage =
    attempt.maxScore > 0 ? Math.round((score / attempt.maxScore) * 10000) / 100 : 0;
  const submittedAt = new Date().toISOString();

  let status: Attempt['status'] = needsManual ? 'needs_grading' : 'graded';
  // If was expired, keep expired but still store score for history? Spec: expired. Prefer expired over graded.
  if (attempt.status === 'expired') {
    status = needsManual ? 'needs_grading' : 'graded';
  }

  attempt = await updateAttempt(attemptId, {
    status,
    submittedAt,
    score,
    percentage,
  });

  let expEarned: number | null = null;
  let expSubject: string | null = null;

  if (status === 'graded') {
    const exp = await awardExpForGradedAttempt({
      attemptId: attempt.id,
      userId: attempt.userId,
      subjectId: snapshot.exam.subjectId,
      examType: snapshot.exam.type,
      score,
      maxScore: attempt.maxScore,
    });
    expEarned = exp.expEarned;
    expSubject = exp.expSubject;
  }

  await syncAssignmentAfterAttempt(attempt.assignmentId);

  return {
    attempt,
    score: attempt.score,
    maxScore: attempt.maxScore,
    percentage: attempt.percentage,
    status: attempt.status,
    expEarned,
    expSubject,
  };
}

export async function getAttemptResultForUser(actor: PublicUser, attemptId: string) {
  const detail = await getAttemptForUser(actor, attemptId);
  const { attempt, snapshot, answers } = detail;

  if (attempt.status === 'in_progress') {
    throw new AppError(422, 'Attempt not submitted yet', 'NOT_SUBMITTED');
  }

  const forTeacher = actor.role === 'admin' || actor.role === 'teacher';
  const showResult = forTeacher || snapshot.effectiveSettings.showResult;

  const exp = await findExpByAttempt(attemptId);

  return {
    attempt: showResult
      ? attempt
      : {
          ...attempt,
          score: null,
          percentage: null,
        },
    snapshot,
    answers: showResult
      ? answers
      : answers.map((a) => ({
          ...a,
          isCorrect: null,
          pointsEarned: null,
          feedback: null,
        })),
    expEarned: showResult && attempt.status === 'graded' ? (exp?.expEarned ?? null) : null,
    expSubject: showResult && attempt.status === 'graded' ? (exp?.subjectId ?? null) : null,
    showResult,
  };
}

export async function listStudentResults(actor: PublicUser, studentId: string) {
  if (actor.role === 'student' && actor.id !== studentId) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  } else if (actor.role !== 'admin' && actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const result = await listAttemptsByUser(studentId, { limit: 100 });
  return {
    items: result.items.filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled'),
    total: result.total,
  };
}

export async function listExamResults(actor: PublicUser, examId: string) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && exam.ownerId !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  return listAttemptsByExam(examId, { limit: 200 });
}

export async function listAssignmentAttemptsSummary(
  actor: PublicUser,
  assignmentId: string,
): Promise<{ attempts: Attempt[]; remaining: number }> {
  const assignment = await findAssignmentById(assignmentId);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');

  if (actor.role === 'student') {
    if (assignment.targetId !== actor.id) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
  } else if (actor.role === 'teacher') {
    if (assignment.assignedBy !== actor.id) {
      const exam = await findExamById(assignment.examId);
      if (!exam || exam.ownerId !== actor.id) {
        throw new AppError(403, 'Forbidden', 'FORBIDDEN');
      }
    }
  } else if (actor.role !== 'admin') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const attempts = await listAttemptsByAssignment(assignmentId);
  const used = attempts.filter((a) => a.status !== 'cancelled').length;
  return {
    attempts,
    remaining: Math.max(0, assignment.attemptLimit - used),
  };
}
