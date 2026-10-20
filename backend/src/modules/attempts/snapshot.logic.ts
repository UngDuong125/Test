import type { QuestionOption, QuestionType } from '../../types/domain.js';

export function isLeftMatchId(id: string): boolean {
  return /^L[1-9]\d*$/.test(id);
}

export function isRightMatchId(id: string): boolean {
  return /^R[1-9]\d*$/.test(id);
}

export function shuffleCopy<T>(arr: T[], random: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const current = a[i];
    a[i] = a[j]!;
    a[j] = current!;
  }
  return a;
}

function reindex(list: QuestionOption[]): QuestionOption[] {
  return list.map((opt, idx) => ({ ...opt, order: idx + 1 }));
}

/**
 * Option order stored on the question can leak the key:
 * - matching: always shuffle the right column; keep the left column in authored order
 * - ordering: always shuffle, because authored order is the answer
 * Other types follow the assignment shuffleOptions flag.
 */
export function arrangeSnapshotOptions(
  type: QuestionType,
  options: QuestionOption[],
  shuffleOptions: boolean,
  random: () => number = Math.random,
): QuestionOption[] {
  const sorted = [...options].sort((a, b) => a.order - b.order);

  if (type === 'matching') {
    const left = sorted.filter((opt) => isLeftMatchId(opt.id));
    const right = shuffleCopy(
      sorted.filter((opt) => isRightMatchId(opt.id)),
      random,
    );
    const other = sorted.filter((opt) => !isLeftMatchId(opt.id) && !isRightMatchId(opt.id));
    return reindex([...left, ...right, ...other]);
  }

  if (type === 'ordering') {
    return reindex(shuffleCopy(sorted, random));
  }

  if (shuffleOptions && sorted.length > 0) {
    return reindex(shuffleCopy(sorted, random));
  }

  return sorted;
}
