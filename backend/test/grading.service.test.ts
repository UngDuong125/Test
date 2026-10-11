import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  db,
  installFakeExamDb,
  resetDb,
  seedAssignment,
  seedExam,
  seedQuestion,
  user,
} from './helpers/fake-exam-db.js';

await installFakeExamDb();
const attempts = await import('../src/modules/attempts/attempts.service.js');
const grading = await import('../src/modules/grading/grading.service.js');

const teacher = user('teacher', 'teacher-1');
const admin = user('admin', 'admin-1');
const student = user('student', 'student-1');

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

/** Submitted attempt: MC answered correctly (1 pt) + two essays (4 pts each) awaiting grading. */
async function submittedEssayAttempt(examType: 'practice' | 'final' = 'practice') {
  const mc = seedQuestion('multiple_choice', { type: 'single', value: 'A' }, ['A', 'B']);
  const essay1 = seedQuestion('essay', { type: 'manual' });
  const essay2 = seedQuestion('essay', { type: 'manual' });
  const exam = seedExam({
    ownerId: teacher.id,
    type: examType,
    questions: [
      { question: mc, points: 1 },
      { question: essay1, points: 4 },
      { question: essay2, points: 4 },
    ],
  });
  const assignment = seedAssignment({ examId: exam.id, studentId: student.id, assignedBy: teacher.id });
  const { attempt } = await attempts.startAttemptForAssignment(student, assignment.id);
  await attempts.saveAnswerForUser(student, attempt.id, { questionId: mc.id, value: 'A' });
  await attempts.saveAnswerForUser(student, attempt.id, { questionId: essay1.id, value: 'Bài 1' });
  await attempts.saveAnswerForUser(student, attempt.id, { questionId: essay2.id, value: 'Bài 2' });
  await attempts.submitAttemptForUser(student, attempt.id);
  return { attempt, mc, essay1, essay2 };
}

describe('manual grading', () => {
  beforeEach(resetDb);

  it('grading all essays finalizes the attempt and awards EXP', async () => {
    const { attempt, essay1, essay2 } = await submittedEssayAttempt();
    const result = await grading.gradeAttemptForUser(teacher, attempt.id, {
      answers: [
        { questionId: essay1.id, pointsEarned: 3, feedback: 'Tốt' },
        { questionId: essay2.id, pointsEarned: 2.5 },
      ],
    });
    assert.equal(result.status, 'graded');
    assert.equal(result.score, 6.5);
    assert.equal(result.expEarned, 6);
    assert.equal(db.subjectExp.get(`${student.id}:math`), 6);
    assert.equal(db.gradingRecords.length, 1);
  });

  it('partial grading keeps the attempt in the queue without EXP', async () => {
    const { attempt, essay1 } = await submittedEssayAttempt();
    const result = await grading.gradeAttemptForUser(teacher, attempt.id, {
      answers: [{ questionId: essay1.id, pointsEarned: 4 }],
    });
    assert.equal(result.status, 'needs_grading');
    assert.equal(result.expEarned, null);
    assert.equal(db.expLedger.size, 0);
  });

  it('regrade adjusts EXP by the difference only', async () => {
    const { attempt, essay1, essay2 } = await submittedEssayAttempt('final');
    await grading.gradeAttemptForUser(teacher, attempt.id, {
      answers: [
        { questionId: essay1.id, pointsEarned: 4 },
        { questionId: essay2.id, pointsEarned: 4 },
      ],
    });
    assert.equal(db.subjectExp.get(`${student.id}:math`), 18);

    const regraded = await grading.gradeAttemptForUser(
      teacher,
      attempt.id,
      { answers: [{ questionId: essay2.id, pointsEarned: 1 }] },
      { regrade: true },
    );
    assert.equal(regraded.score, 6);
    assert.equal(regraded.expEarned, 12);
    assert.equal(db.subjectExp.get(`${student.id}:math`), 12);
    assert.equal(db.expLedger.size, 1);
  });

  it('rejects out-of-range points, foreign questions and wrong status', async () => {
    const { attempt, essay1 } = await submittedEssayAttempt();
    assert.equal(
      await codeOf(grading.gradeAttemptForUser(teacher, attempt.id, { answers: [{ questionId: essay1.id, pointsEarned: 5 }] })),
      'POINTS_OUT_OF_RANGE',
    );
    assert.equal(
      await codeOf(grading.gradeAttemptForUser(teacher, attempt.id, { answers: [{ questionId: essay1.id, pointsEarned: -1 }] })),
      'POINTS_OUT_OF_RANGE',
    );
    assert.equal(
      await codeOf(grading.gradeAttemptForUser(teacher, attempt.id, { answers: [{ questionId: 'x', pointsEarned: 1 }] })),
      'QUESTION_NOT_IN_ATTEMPT',
    );

    const mc = seedQuestion('multiple_choice', { type: 'single', value: 'A' }, ['A', 'B']);
    const exam = seedExam({ ownerId: teacher.id, questions: [{ question: mc, points: 1 }] });
    const assignment = seedAssignment({ examId: exam.id, studentId: student.id, assignedBy: teacher.id });
    const auto = await attempts.startAttemptForAssignment(student, assignment.id);
    await attempts.submitAttemptForUser(student, auto.attempt.id);
    assert.equal(
      await codeOf(grading.gradeAttemptForUser(teacher, auto.attempt.id, { answers: [] })),
      'INVALID_STATUS',
    );
  });

  it('only related teachers and admins can grade', async () => {
    const { attempt, essay1, essay2 } = await submittedEssayAttempt();
    const body = {
      answers: [
        { questionId: essay1.id, pointsEarned: 1 },
        { questionId: essay2.id, pointsEarned: 1 },
      ],
    };
    assert.equal(await codeOf(grading.gradeAttemptForUser(student, attempt.id, body)), 'FORBIDDEN');
    assert.equal(await codeOf(grading.gradeAttemptForUser(user('teacher', 'teacher-x'), attempt.id, body)), 'FORBIDDEN');
    const result = await grading.gradeAttemptForUser(admin, attempt.id, body);
    assert.equal(result.status, 'graded');
  });
});
