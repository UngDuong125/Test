import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  expireAttempt,
  installFakeExamDb,
  resetDb,
  seedAssignment,
  seedExam,
  seedQuestion,
  user,
} from './helpers/fake-exam-db.js';

await installFakeExamDb();
const attempts = await import('../src/modules/attempts/attempts.service.js');

const teacher = user('teacher', 'teacher-1');
const student = user('student', 'student-1');
const otherStudent = user('student', 'student-2');

function seedMixedExam(opts: { attemptLimit?: number; showExplanation?: boolean; type?: 'practice' | 'final' } = {}) {
  const mc = seedQuestion('multiple_choice', { type: 'single', value: 'B' }, ['A', 'B', 'C']);
  const fill = seedQuestion('fill_blank', { type: 'text', value: ['2x'] });
  const num = seedQuestion('numeric', { type: 'numeric', value: 10, tolerance: 0.5 });
  const exam = seedExam({
    ownerId: teacher.id,
    type: opts.type,
    showExplanation: opts.showExplanation,
    questions: [
      { question: mc, points: 2 },
      { question: fill, points: 3 },
      { question: num, points: 5 },
    ],
  });
  const assignment = seedAssignment({
    examId: exam.id,
    studentId: student.id,
    assignedBy: teacher.id,
    attemptLimit: opts.attemptLimit,
  });
  return { exam, assignment, mc, fill, num };
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('attempts: start', () => {
  beforeEach(resetDb);

  it('creates an attempt, hides answer keys and marks the assignment in progress', async () => {
    const { assignment } = seedMixedExam();
    const detail = await attempts.startAttemptForAssignment(student, assignment.id);

    assert.equal(detail.attempt.status, 'in_progress');
    assert.equal(detail.attempt.maxScore, 10);
    assert.equal(detail.snapshot.questions.length, 3);
    for (const q of detail.snapshot.questions) {
      assert.equal(q.answer, undefined, 'answer key leaked to student');
      assert.equal(q.explanation, undefined, 'explanation leaked to student');
    }
    assert.equal(db.assignments.get(assignment.id)!.status, 'in_progress');
  });

  it('timer is capped by the assignment deadline', async () => {
    const { exam } = seedMixedExam();
    const deadline = new Date(Date.now() + 5 * 60_000);
    const assignment = seedAssignment({ examId: exam.id, studentId: student.id, assignedBy: teacher.id, deadline });
    const detail = await attempts.startAttemptForAssignment(student, assignment.id);
    assert.equal(detail.attempt.expiresAt, deadline.toISOString());
  });

  it('resumes the in-progress attempt instead of creating a new one', async () => {
    const { assignment } = seedMixedExam({ attemptLimit: 3 });
    const first = await attempts.startAttemptForAssignment(student, assignment.id);
    const second = await attempts.startAttemptForAssignment(student, assignment.id);
    assert.equal(second.attempt.id, first.attempt.id);
    assert.equal(db.attempts.size, 1);
  });

  it('enforces attempt limit, ownership, role and availability window', async () => {
    const { exam, assignment } = seedMixedExam({ attemptLimit: 1 });
    const started = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.submitAttemptForUser(student, started.attempt.id);

    db.assignments.set(assignment.id, { ...db.assignments.get(assignment.id)!, status: 'available' });
    assert.equal(await codeOf(attempts.startAttemptForAssignment(student, assignment.id)), 'ATTEMPT_LIMIT');
    assert.equal(await codeOf(attempts.startAttemptForAssignment(otherStudent, assignment.id)), 'FORBIDDEN');
    assert.equal(await codeOf(attempts.startAttemptForAssignment(teacher, assignment.id)), 'FORBIDDEN');

    const future = seedAssignment({
      examId: exam.id,
      studentId: student.id,
      assignedBy: teacher.id,
      availableFrom: new Date(Date.now() + 3_600_000),
    });
    assert.equal(await codeOf(attempts.startAttemptForAssignment(student, future.id)), 'NOT_AVAILABLE');

    const past = seedAssignment({
      examId: exam.id,
      studentId: student.id,
      assignedBy: teacher.id,
      availableFrom: new Date(Date.now() - 7_200_000),
      deadline: new Date(Date.now() - 3_600_000),
    });
    assert.equal(await codeOf(attempts.startAttemptForAssignment(student, past.id)), 'ASSIGNMENT_EXPIRED');
  });
});

describe('attempts: save and submit', () => {
  beforeEach(resetDb);

  it('grades saved answers, awards EXP and completes the assignment', async () => {
    const { assignment, mc, fill, num } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);

    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'B' });
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: fill.id, value: ' 2X ' });
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: num.id, value: 7 });

    const result = await attempts.submitAttemptForUser(student, attempt.id);
    assert.equal(result.status, 'graded');
    assert.equal(result.score, 5);
    assert.equal(result.percentage, 50);
    assert.equal(result.expEarned, 5);
    assert.equal(db.subjectExp.get(`${student.id}:math`), 5);
    assert.equal(db.assignments.get(assignment.id)!.status, 'completed');
  });

  it('unanswered questions score zero', async () => {
    const { assignment } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    const result = await attempts.submitAttemptForUser(student, attempt.id);
    assert.equal(result.score, 0);
    assert.equal(db.answers.filter((a) => a.attemptId === attempt.id).length, 3);
  });

  it('rejects double submit and saving after submit', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.submitAttemptForUser(student, attempt.id);
    assert.equal(await codeOf(attempts.submitAttemptForUser(student, attempt.id)), 'ALREADY_SUBMITTED');
    assert.equal(
      await codeOf(attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'A' })),
      'ATTEMPT_LOCKED',
    );
    assert.equal(db.expLedger.size, 1);
  });

  it('other students cannot save, submit or view the attempt', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    assert.equal(
      await codeOf(attempts.saveAnswerForUser(otherStudent, attempt.id, { questionId: mc.id, value: 'B' })),
      'FORBIDDEN',
    );
    assert.equal(await codeOf(attempts.submitAttemptForUser(otherStudent, attempt.id)), 'FORBIDDEN');
    assert.equal(await codeOf(attempts.getAttemptForUser(otherStudent, attempt.id)), 'FORBIDDEN');
  });

  it('rejects answers for questions not in the attempt', async () => {
    const { assignment } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    assert.equal(
      await codeOf(attempts.saveAnswerForUser(student, attempt.id, { questionId: 'nope', value: 'A' })),
      'QUESTION_NOT_IN_ATTEMPT',
    );
  });

  it('essay questions send the attempt to manual grading without EXP', async () => {
    const mc = seedQuestion('multiple_choice', { type: 'single', value: 'A' }, ['A', 'B']);
    const essay = seedQuestion('essay', { type: 'manual' });
    const exam = seedExam({ ownerId: teacher.id, questions: [{ question: mc, points: 1 }, { question: essay, points: 4 }] });
    const assignment = seedAssignment({ examId: exam.id, studentId: student.id, assignedBy: teacher.id });

    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'A' });
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: essay.id, value: 'Bài làm' });

    const result = await attempts.submitAttemptForUser(student, attempt.id);
    assert.equal(result.status, 'needs_grading');
    assert.equal(result.score, 1);
    assert.equal(result.expEarned, null);
    assert.equal(db.expLedger.size, 0);
  });
});

describe('attempts: time running out', () => {
  beforeEach(resetDb);

  it('grades saved answers when the student comes back after the timer ended', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'B' });
    expireAttempt(attempt.id);

    const detail = await attempts.getAttemptForUser(student, attempt.id);
    assert.equal(detail.attempt.status, 'graded');
    assert.equal(detail.attempt.score, 2);
    assert.equal(db.expLedger.get(attempt.id)?.expEarned, 2);
    assert.equal(db.assignments.get(assignment.id)!.status, 'completed');
  });

  it('a save after the timer ended is rejected but the attempt still gets graded', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'B' });
    expireAttempt(attempt.id);

    assert.equal(
      await codeOf(attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'A' })),
      'ATTEMPT_LOCKED',
    );
    assert.equal(db.attempts.get(attempt.id)!.status, 'graded');
    assert.equal(db.attempts.get(attempt.id)!.score, 2);
  });

  it('submitting after the timer ended returns the graded result', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'B' });
    expireAttempt(attempt.id);

    const result = await attempts.submitAttemptForUser(student, attempt.id);
    assert.equal(result.status, 'graded');
    assert.equal(result.score, 2);
  });

  it('finalizes attempts left ungraded in "expired"', async () => {
    const { assignment, mc } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'B' });
    db.attempts.set(attempt.id, { ...db.attempts.get(attempt.id)!, status: 'expired', submittedAt: '2026-01-01T00:00:00.000Z' });

    const result = await attempts.getAttemptResultForUser(student, attempt.id);
    assert.equal(result.attempt.status, 'graded');
    assert.equal(result.attempt.score, 2);
    assert.equal(result.attempt.submittedAt, '2026-01-01T00:00:00.000Z');
    assert.equal(result.expEarned, 2);
  });
});

describe('attempts: result visibility', () => {
  beforeEach(resetDb);

  it('keys stay hidden while attempts remain, revealed after the last one', async () => {
    const { assignment } = seedMixedExam({ attemptLimit: 2 });

    const first = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.submitAttemptForUser(student, first.attempt.id);
    const r1 = await attempts.getAttemptResultForUser(student, first.attempt.id);
    assert.equal(r1.remainingAttempts, 1);
    assert.equal(r1.answerKeysLocked, true);
    assert.ok(r1.snapshot.questions.every((q) => q.answer === undefined));

    const second = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.submitAttemptForUser(student, second.attempt.id);
    const r2 = await attempts.getAttemptResultForUser(student, second.attempt.id);
    assert.equal(r2.remainingAttempts, 0);
    assert.equal(r2.answerKeysLocked, false);
    assert.ok(r2.snapshot.questions.every((q) => q.answer !== undefined));
  });

  it('hides scores when the exam does not show results', async () => {
    const mc = seedQuestion('multiple_choice', { type: 'single', value: 'A' }, ['A', 'B']);
    const exam = seedExam({ ownerId: teacher.id, showResult: false, questions: [{ question: mc, points: 1 }] });
    const assignment = seedAssignment({ examId: exam.id, studentId: student.id, assignedBy: teacher.id });
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'A' });
    await attempts.submitAttemptForUser(student, attempt.id);

    const forStudent = await attempts.getAttemptResultForUser(student, attempt.id);
    assert.equal(forStudent.attempt.score, null);
    assert.ok(forStudent.answers.every((a) => a.isCorrect === null));

    const forTeacher = await attempts.getAttemptResultForUser(teacher, attempt.id);
    assert.equal(forTeacher.attempt.score, 1);
  });

  it('lesson check grades one answer and refuses the same call on a practice exam', async () => {
    const matching = seedQuestion(
      'matching',
      { type: 'pairs', value: { L1: 'R2', L2: 'R1' } },
      ['L1', 'L2', 'R1', 'R2'],
    );
    const exam = seedExam({
      ownerId: teacher.id,
      type: 'lesson',
      questions: [{ question: matching, points: 2 }],
    });
    const assignment = seedAssignment({
      examId: exam.id,
      studentId: student.id,
      assignedBy: teacher.id,
    });
    const started = await attempts.startAttemptForAssignment(student, assignment.id);
    assert.equal(started.snapshot.questions[0]?.answer, undefined);

    const checked = await attempts.checkAnswerForUser(student, started.attempt.id, {
      questionId: matching.id,
      value: { L1: 'R2', L2: 'R2' },
    });
    assert.equal(checked.isCorrect, false);
    assert.equal(checked.pointsEarned, 1);
    assert.deepEqual(checked.pairs, [
      { leftId: 'L1', correct: true },
      { leftId: 'L2', correct: false },
    ]);
    assert.equal('answer' in checked, false);

    const submitted = await attempts.submitAttemptForUser(student, started.attempt.id);
    assert.equal(submitted.score, 1);

    const { assignment: practice } = seedMixedExam();
    const practiceAttempt = await attempts.startAttemptForAssignment(student, practice.id);
    assert.equal(
      await codeOf(
        attempts.checkAnswerForUser(student, practiceAttempt.attempt.id, {
          questionId: practiceAttempt.snapshot.questions[0]!.id,
          value: 'A',
        }),
      ),
      'CHECK_NOT_ALLOWED',
    );
  });

  it('teachers outside the exam / assignment / class are forbidden', async () => {
    const { assignment } = seedMixedExam();
    const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
    const stranger = user('teacher', 'teacher-x');
    assert.equal(await codeOf(attempts.getAttemptForUser(stranger, attempt.id)), 'FORBIDDEN');

    db.teacherStudents.add(`${stranger.id}:${student.id}`);
    const detail = await attempts.getAttemptForUser(stranger, attempt.id);
    assert.equal(detail.attempt.id, attempt.id);
  });
});
