import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeSnapshotOptions } from '../src/modules/attempts/snapshot.logic.js';
import type { QuestionOption } from '../src/types/domain.js';

function opt(id: string, order: number): QuestionOption {
  return { id, content: [{ type: 'text', value: id }], order };
}

describe('arrangeSnapshotOptions', () => {
  it('keeps matching prompts in order and only permutes the right column', () => {
    const options = [opt('L1', 1), opt('L2', 2), opt('R1', 3), opt('R2', 4), opt('R3', 5)];
    const arranged = arrangeSnapshotOptions('matching', options, false, () => 0);
    const ids = arranged.map((item) => item.id);
    assert.deepEqual(
      ids.filter((id) => id.startsWith('L')),
      ['L1', 'L2'],
    );
    assert.deepEqual(
      ids.filter((id) => id.startsWith('R')).sort(),
      ['R1', 'R2', 'R3'],
    );
    assert.notDeepEqual(
      ids.filter((id) => id.startsWith('R')),
      ['R1', 'R2', 'R3'],
    );
  });

  it('shuffles ordering items even when shuffleOptions is off', () => {
    const options = [opt('A', 1), opt('B', 2), opt('C', 3)];
    const arranged = arrangeSnapshotOptions('ordering', options, false, () => 0);
    assert.deepEqual(arranged.map((item) => item.id).sort(), ['A', 'B', 'C']);
    assert.notDeepEqual(
      arranged.map((item) => item.id),
      ['A', 'B', 'C'],
    );
  });

  it('leaves choice options in place when shuffle is off', () => {
    const options = [opt('A', 1), opt('B', 2)];
    const arranged = arrangeSnapshotOptions('multiple_choice', options, false, () => 0);
    assert.deepEqual(
      arranged.map((item) => item.id),
      ['A', 'B'],
    );
  });
});
