import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { csvField, toCsv } from '@/lib/csv';
import { examResultsCsvRows } from '@/lib/exam-results-export';
import { attemptPayload, batchQuestions, draftFromServer, mergeDrafts } from '@/lib/grading-batch';
import { averagePercentage, progressBySubject, trend } from '@/lib/history';
import { buildQuizOptions, isTypedAnswerCorrect, normalizeAnswer } from '@/lib/vocab-modes';
import type { StudentHistoryItem } from '@/lib/api-client';
import type { Attempt, AttemptDetail, DueVocabularyCard, ExamAssignment } from '@/types/content';

describe('csv', () => {
  it('quotes, escapes and blocks formulas', () => {
    assert.equal(csvField('a,b'), '"a,b"');
    assert.equal(csvField('say "hi"'), '"say ""hi"""');
    assert.equal(csvField('=SUM(A1)'), "'=SUM(A1)");
    assert.equal(csvField('-5'), '-5');
    assert.equal(csvField(null), '');
  });

  it('starts with a BOM and uses CRLF', () => {
    assert.equal(toCsv(['A'], [['Nguyễn']]), '﻿A\r\nNguyễn\r\n');
  });
});

describe('examResultsCsvRows', () => {
  const att = (p: Partial<Attempt>): Attempt =>
    ({
      id: 'x',
      assignmentId: 'a',
      userId: 'u1',
      examId: 'e',
      status: 'graded',
      startedAt: '2026-11-01T00:00:00Z',
      submittedAt: '2026-11-01T00:10:00Z',
      score: 5,
      maxScore: 10,
      percentage: 50,
      ...p,
    }) as Attempt;
  const asg = (targetId: string, sourceClassId: string | null): ExamAssignment =>
    ({ id: targetId, targetId, sourceClassId, status: 'available' }) as ExamAssignment;

  it('lists best and latest score, and students who never started', () => {
    const rows = examResultsCsvRows(
      [
        att({ id: '1', score: 8, percentage: 80 }),
        att({ id: '2', startedAt: '2026-11-02T00:00:00Z', score: 6, percentage: 60 }),
      ],
      [asg('u1', 'c1'), asg('u2', 'c1')],
      { nameOf: (id) => id, classNameOf: (id) => id ?? 'Giao lẻ' },
    );
    const u1 = rows.find((r) => r[0] === 'u1')!;
    assert.deepEqual(u1.slice(0, 6), ['u1', 'c1', '2', '8', '6/10', '60']);
    const u2 = rows.find((r) => r[0] === 'u2')!;
    assert.equal(u2[2], '0');
    assert.equal(u2[6], 'Chưa làm');
  });
});

describe('history', () => {
  const item = (p: Partial<StudentHistoryItem>): StudentHistoryItem => ({
    attemptId: 'a',
    examId: 'e',
    examTitle: 'T',
    subjectId: 'math',
    examType: 'quiz',
    status: 'graded',
    submittedAt: '2026-11-01T00:00:00Z',
    score: 5,
    maxScore: 10,
    percentage: 50,
    wrongCount: 0,
    showResult: true,
    ...p,
  });

  it('groups scored attempts by subject in time order and skips hidden scores', () => {
    const map = progressBySubject([
      item({ submittedAt: '2026-11-03T00:00:00Z', percentage: 90 }),
      item({ submittedAt: '2026-11-01T00:00:00Z', percentage: 50 }),
      item({ percentage: null }),
    ]);
    const math = map.get('math')!;
    assert.deepEqual(
      math.map((p) => p.percentage),
      [50, 90],
    );
    assert.equal(averagePercentage(math), 70);
    assert.equal(trend(math), 40);
  });
});

describe('vocab modes', () => {
  it('normalises typed answers', () => {
    assert.equal(normalizeAnswer('  **Apple**! '), 'apple');
    assert.equal(isTypedAnswerCorrect('Color', 'colour / color'), true);
    assert.equal(isTypedAnswerCorrect('colr', 'colour / color'), false);
    assert.equal(isTypedAnswerCorrect('', 'apple'), false);
  });

  const due = (id: string, definition: string) =>
    ({ card: { id }, entry: { term: id, definition } }) as unknown as DueVocabularyCard;

  it('builds options with one correct answer and distinct distractors', () => {
    const opts = buildQuizOptions(due('a', 'táo'), [
      due('a', 'táo'),
      due('b', 'chuối'),
      due('c', 'Táo'),
      due('d', 'cam'),
    ])!;
    assert.equal(opts.filter((o) => o.correct).length, 1);
    // "Táo" repeats the right meaning and is dropped.
    assert.equal(opts.length, 3);
  });

  it('returns null with nothing to choose from', () => {
    assert.equal(buildQuizOptions(due('a', 'táo'), [due('a', 'táo')]), null);
  });
});

describe('grading batch', () => {
  const q = (id: string, type: string, order: number, points = 2) => ({
    id,
    type,
    order,
    points,
    content: [],
  });
  const detail = (attemptId: string, qs: ReturnType<typeof q>[]) =>
    ({ attempt: { id: attemptId }, snapshot: { questions: qs }, answers: [] }) as unknown as AttemptDetail;
  const d1 = detail('t1', [q('e2', 'essay', 2), q('mc', 'multiple_choice', 1), q('e1', 'essay', 1)]);

  it('collects manual questions once across attempts', () => {
    const qs = batchQuestions([d1, detail('t2', [q('e1', 'essay', 2), q('e2', 'essay', 1)])]);
    assert.deepEqual(
      qs.map((x) => x.id),
      ['e1', 'e2'],
    );
  });

  it('is ready only when every manual question has a valid score', () => {
    const one = attemptPayload(d1, { t1: { e1: { points: '1', feedback: '' } } });
    assert.equal(one.ready, false);
    assert.equal(one.missing, 1);
    // The typed score can still be saved as a partial grade.
    assert.deepEqual(one.answers, [{ questionId: 'e1', pointsEarned: 1, feedback: null }]);

    const ready = attemptPayload(d1, {
      t1: { e1: { points: '1,5', feedback: ' Tốt ' }, e2: { points: '0', feedback: '' } },
    });
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.answers, [
      { questionId: 'e2', pointsEarned: 0, feedback: null },
      { questionId: 'e1', pointsEarned: 1.5, feedback: 'Tốt' },
    ]);

    const bad = attemptPayload(d1, {
      t1: { e1: { points: '9', feedback: '' }, e2: { points: '1', feedback: '' } },
    });
    assert.equal(bad.ready, false);
    assert.ok(bad.invalid);
  });

  it('counts questions graded earlier on the server as done', () => {
    const withServer = {
      ...d1,
      answers: [
        { questionId: 'e2', pointsEarned: 2, feedback: 'ok', manualGradedAt: '2026-11-06T00:00:00Z' },
      ],
    } as unknown as AttemptDetail;
    assert.equal(attemptPayload(withServer, { t1: { e1: { points: '1', feedback: '' } } }).ready, true);

    // Submit-time zeros (no manualGradedAt) are not treated as graded.
    const zeros = {
      ...d1,
      answers: [{ questionId: 'e2', pointsEarned: 0, feedback: null, manualGradedAt: null }],
    } as unknown as AttemptDetail;
    assert.equal(attemptPayload(zeros, { t1: { e1: { points: '1', feedback: '' } } }).ready, false);

    assert.deepEqual(draftFromServer([withServer]), { t1: { e2: { points: '2', feedback: 'ok' } } });
    assert.deepEqual(
      mergeDrafts(
        { t1: { e2: { points: '2', feedback: '' } } },
        { t1: { e2: { points: '1', feedback: 'x' } } },
      ),
      { t1: { e2: { points: '1', feedback: 'x' } } },
    );
  });
});
