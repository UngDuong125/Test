import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Difficulty, Question } from '../src/types/domain.js';
import { mockModule, src } from './helpers/mock-module.js';

let pool: Question[] = [];

await mockModule(src('repositories/questions.repository.js'), {
  listPublishedCandidates: async () => pool,
});

const { selectRandomQuestions } = await import('../src/modules/question-banks/random.selection.js');

function makePool(counts: Record<Difficulty, number>): Question[] {
  const out: Question[] = [];
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    for (let i = 0; i < counts[diff]; i += 1) {
      out.push({ id: `${diff}-${i}`, difficulty: diff } as Question);
    }
  }
  return out;
}

function countBy(questions: Question[]) {
  const c = { easy: 0, medium: 0, hard: 0 };
  for (const q of questions) c[q.difficulty] += 1;
  return c;
}

describe('selectRandomQuestions', () => {
  beforeEach(() => {
    pool = makePool({ easy: 10, medium: 10, hard: 10 });
  });

  it('returns exactly `count` unique questions without a mix', async () => {
    const { questions } = await selectRandomQuestions({ count: 7 });
    assert.equal(questions.length, 7);
    assert.equal(new Set(questions.map((q) => q.id)).size, 7);
  });

  it('throws when the pool is too small', async () => {
    await assert.rejects(selectRandomQuestions({ count: 31 }), /Not enough published questions/);
  });

  it('respects the difficulty mix', async () => {
    const { questions, warnings } = await selectRandomQuestions({
      count: 10,
      difficulty: { easy: 0.5, medium: 0.3, hard: 0.2 },
    });
    assert.deepEqual(countBy(questions), { easy: 5, medium: 3, hard: 2 });
    assert.deepEqual(warnings, []);
  });

  it('fills from other difficulties when one bucket is short', async () => {
    pool = makePool({ easy: 2, medium: 10, hard: 10 });
    const { questions, warnings } = await selectRandomQuestions({
      count: 10,
      difficulty: { easy: 1 },
    });
    assert.equal(questions.length, 10);
    assert.equal(new Set(questions.map((q) => q.id)).size, 10);
    assert.equal(warnings.length, 1);
  });

  it('never picks a difficulty with weight 0 when rounding overshoots', async () => {
    // easy 0.5 / medium 0.5 of 3 → Math.round(1.5) + Math.round(1.5) = 4 > 3
    for (let run = 0; run < 20; run += 1) {
      const { questions } = await selectRandomQuestions({
        count: 3,
        difficulty: { easy: 0.5, medium: 0.5, hard: 0 },
      });
      assert.equal(questions.length, 3);
      assert.equal(countBy(questions).hard, 0);
    }
  });

  it('randomly samples topics when there are more topics than questions', async () => {
    const topicIds = ['a', 'b', 'c', 'd'];
    pool = topicIds.flatMap((topicId) =>
      [0, 1, 2].map(
        (i) => ({ id: `${topicId}-${i}`, difficulty: 'easy', topicIds: [topicId] }) as Question,
      ),
    );
    const seen = new Set<string>();
    for (let run = 0; run < 40; run += 1) {
      const { questions } = await selectRandomQuestions({ count: 2 });
      assert.equal(questions.length, 2);
      const used = questions.map((q) => q.topicIds[0]!);
      assert.equal(new Set(used).size, 2);
      for (const id of used) seen.add(id);
    }
    assert.deepEqual([...seen].sort(), topicIds);
  });

  it('samples only among the selected topics when those outnumber the questions', async () => {
    pool = ['a', 'b', 'c', 'd'].flatMap((topicId) =>
      [0, 1].map(
        (i) => ({ id: `${topicId}-${i}`, difficulty: 'medium', topicIds: [topicId] }) as Question,
      ),
    );
    const seen = new Set<string>();
    for (let run = 0; run < 30; run += 1) {
      const { questions } = await selectRandomQuestions({ count: 2, topicIds: ['a', 'b', 'c'] });
      assert.equal(questions.length, 2);
      const used = questions.map((q) => q.topicIds[0]!);
      assert.equal(new Set(used).size, 2);
      for (const id of used) {
        assert.notEqual(id, 'd');
        seen.add(id);
      }
    }
    assert.deepEqual([...seen].sort(), ['a', 'b', 'c']);
  });

  it('keeps sampling the whole pool when topics do not outnumber questions', async () => {
    pool = ['a', 'b'].flatMap((topicId) =>
      [0, 1, 2, 3].map(
        (i) => ({ id: `${topicId}-${i}`, difficulty: 'easy', topicIds: [topicId] }) as Question,
      ),
    );
    const { questions } = await selectRandomQuestions({ count: 4 });
    assert.equal(questions.length, 4);
    assert.equal(new Set(questions.map((q) => q.id)).size, 4);
  });

  it('does not always favour easy on a 50/50 mix', async () => {
    const seen = { easy: 0, medium: 0, hard: 0 };
    for (let run = 0; run < 50; run += 1) {
      const { questions } = await selectRandomQuestions({
        count: 1,
        difficulty: { easy: 0.5, medium: 0.5 },
      });
      seen[questions[0]!.difficulty] += 1;
    }
    assert.ok(seen.medium > 0, `medium never picked: ${JSON.stringify(seen)}`);
  });
});
