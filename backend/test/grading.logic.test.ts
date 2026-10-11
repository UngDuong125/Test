import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  autoGradeAnswer,
  computeExpEarned,
  isAnswerKeyRevealAllowed,
  questionRequiresManualGrade,
  stripSnapshotForStudent,
} from '../src/modules/grading/grading.logic.js';
import type { QuestionAnswer, QuestionType, SnapshotQuestion } from '../src/types/domain.js';

function q(type: QuestionType, answer: QuestionAnswer | undefined, points = 2): SnapshotQuestion {
  return {
    id: 'q1',
    type,
    content: [{ type: 'text', value: 'x' }],
    options: [],
    answer,
    points,
    version: 1,
    sectionId: null,
    order: 1,
  };
}

describe('autoGradeAnswer', () => {
  it('single choice: correct / wrong / empty', () => {
    const question = q('multiple_choice', { type: 'single', value: 'B' });
    assert.deepEqual(autoGradeAnswer(question, 'B'), {
      isCorrect: true,
      pointsEarned: 2,
      requiresManual: false,
    });
    assert.equal(autoGradeAnswer(question, 'A').pointsEarned, 0);
    assert.equal(autoGradeAnswer(question, null).isCorrect, false);
    assert.equal(autoGradeAnswer(question, '').isCorrect, false);
  });

  it('multiple select: order-insensitive, exact set required', () => {
    const question = q('multiple_select', { type: 'multiple', value: ['A', 'C'] });
    assert.equal(autoGradeAnswer(question, ['C', 'A']).isCorrect, true);
    assert.equal(autoGradeAnswer(question, ['A']).isCorrect, false);
    assert.equal(autoGradeAnswer(question, ['A', 'C', 'D']).isCorrect, false);
    assert.equal(autoGradeAnswer(question, ['A', 'A']).isCorrect, false);
  });

  it('text: case, whitespace and trailing period insensitive; any accepted value', () => {
    const question = q('fill_blank', { type: 'text', value: ['Hà Nội', 'Ha Noi'] });
    assert.equal(autoGradeAnswer(question, '  hà   nội. ').isCorrect, true);
    assert.equal(autoGradeAnswer(question, 'HA NOI').isCorrect, true);
    assert.equal(autoGradeAnswer(question, 'Huế').isCorrect, false);
  });

  it('numeric: tolerance and string input', () => {
    const question = q('numeric', { type: 'numeric', value: 3.14, tolerance: 0.01 });
    assert.equal(autoGradeAnswer(question, 3.141).isCorrect, true);
    assert.equal(autoGradeAnswer(question, '3.15').isCorrect, true);
    assert.equal(autoGradeAnswer(question, 3.2).isCorrect, false);
    assert.equal(autoGradeAnswer(question, 'abc').isCorrect, false);
  });

  it('essay / short_answer without key go to manual grading', () => {
    assert.equal(autoGradeAnswer(q('essay', { type: 'manual' }), 'bài làm').requiresManual, true);
    assert.equal(autoGradeAnswer(q('short_answer', undefined), 'x').requiresManual, true);
    assert.equal(questionRequiresManualGrade(q('short_answer', { type: 'text', value: [] })), true);
  });
});

describe('computeExpEarned', () => {
  it('applies exam-type multipliers', () => {
    assert.equal(computeExpEarned('practice', 8, 10), 8);
    assert.equal(computeExpEarned('homework', 10, 10), 8);
    assert.equal(computeExpEarned('quiz', 8, 10), 9);
    assert.equal(computeExpEarned('quiz', 7, 10), 7);
    assert.equal(computeExpEarned('midterm', 10, 10), 15);
    assert.equal(computeExpEarned('final', 10, 10), 20);
  });

  it('never negative and capped by ceiling', () => {
    assert.equal(computeExpEarned('final', -5, 10), 0);
    assert.equal(computeExpEarned('practice', 50, 10), 10);
    assert.equal(computeExpEarned('practice', 5, 0), 0);
  });
});

describe('isAnswerKeyRevealAllowed', () => {
  const base = { status: 'submitted', showExplanation: true, forTeacher: false, remainingAttempts: 0 };

  it('reveals only when submitted, explanation on and no attempts left', () => {
    assert.equal(isAnswerKeyRevealAllowed(base), true);
    assert.equal(isAnswerKeyRevealAllowed({ ...base, remainingAttempts: 1 }), false);
    assert.equal(isAnswerKeyRevealAllowed({ ...base, showExplanation: false }), false);
    assert.equal(isAnswerKeyRevealAllowed({ ...base, status: 'in_progress' }), false);
    assert.equal(isAnswerKeyRevealAllowed({ ...base, status: 'cancelled' }), false);
  });

  it('teachers always see keys', () => {
    assert.equal(
      isAnswerKeyRevealAllowed({ ...base, status: 'in_progress', showExplanation: false, forTeacher: true }),
      true,
    );
  });
});

describe('stripSnapshotForStudent', () => {
  it('removes answer and explanation unless revealed', () => {
    const question = { ...q('multiple_choice', { type: 'single', value: 'A' }), explanation: { text: 'vì...' } };
    const payload = { questions: [question] } as never;

    const hidden = stripSnapshotForStudent(payload, false).questions[0]!;
    assert.equal('answer' in hidden, false);
    assert.equal('explanation' in hidden, false);

    const shown = stripSnapshotForStudent(payload, true).questions[0]!;
    assert.deepEqual(shown.answer, { type: 'single', value: 'A' });
  });
});
