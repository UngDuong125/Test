import { AppError } from '../../domain/errors.js';
import { autoGradeAnswer, questionRequiresManualGrade } from '../grading/grading.logic.js';
import {
  countAttemptsForLimit,
  findAttemptById,
  getAttemptSnapshot,
  listStudentHistoryRows,
  loadPracticeData,
} from '../../repositories/attempts.repository.js';
import { findAssignmentById } from '../../repositories/assignments.repository.js';
import type { PublicUser, StudentAnswerValue } from '../../types/domain.js';
import { pickPracticeQuestions, practiceAllowed, type PracticeSource } from './practice.logic.js';

/** Recent graded attempts scanned for wrong answers. */
const SOURCE_ATTEMPTS = 20;

function assertStudent(actor: PublicUser) {
  if (actor.role !== 'student') throw new AppError(403, 'Forbidden', 'FORBIDDEN');
}

/** Wrong questions the student may now practise (answer keys already unlocked). */
export async function listPracticeQuestions(actor: PublicUser) {
  assertStudent(actor);
  const graded = (await listStudentHistoryRows(actor.id, 100))
    .filter((r) => r.attempt.status === 'graded' && r.wrongCount > 0)
    .slice(0, SOURCE_ATTEMPTS);
  const data = await loadPracticeData(
    actor.id,
    graded.map((r) => r.attempt.id),
  );

  const sources: PracticeSource[] = [];
  for (const { attempt } of graded) {
    const snapshot = data.snapshots.get(attempt.id);
    const limit = data.assignments.get(attempt.assignmentId);
    if (!snapshot || limit == null) continue;
    sources.push({
      attempt,
      snapshot,
      remainingAttempts: Math.max(0, limit - (data.usedByAssignment.get(attempt.assignmentId) ?? 0)),
      wrongQuestionIds: data.wrong.get(attempt.id) ?? new Set(),
    });
  }
  const items = pickPracticeQuestions(sources);
  return { items, total: items.length };
}

/**
 * Grade one practice answer. Read-only: nothing is stored, no score or EXP changes.
 * Re-checks on the server that this attempt's keys may be shown before revealing them.
 */
export async function checkPracticeAnswer(
  actor: PublicUser,
  input: { attemptId: string; questionId: string; value: StudentAnswerValue },
) {
  assertStudent(actor);
  const attempt = await findAttemptById(input.attemptId);
  if (!attempt || attempt.userId !== actor.id) {
    throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  }
  const [snapshot, assignment, used] = await Promise.all([
    getAttemptSnapshot(attempt.id),
    findAssignmentById(attempt.assignmentId),
    countAttemptsForLimit(attempt.assignmentId),
  ]);
  if (!snapshot || !assignment) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  const remainingAttempts = Math.max(0, assignment.attemptLimit - used);
  if (!practiceAllowed({ attempt, snapshot, remainingAttempts })) {
    throw new AppError(403, 'Answer keys for this exam are still locked', 'PRACTICE_LOCKED');
  }
  const question = snapshot.questions.find((q) => q.id === input.questionId);
  if (!question || questionRequiresManualGrade(question)) {
    throw new AppError(422, 'Question cannot be practised', 'NOT_PRACTICABLE');
  }

  const graded = autoGradeAnswer(question, input.value);
  return {
    isCorrect: graded.isCorrect === true,
    pointsEarned: graded.pointsEarned,
    points: question.points,
    answer: question.answer ?? null,
    explanation: question.explanation ?? null,
  };
}
