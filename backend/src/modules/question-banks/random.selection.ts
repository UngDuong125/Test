import { AppError } from '../../domain/errors.js';
import type { Difficulty, Question } from '../../types/domain.js';
import { listPublishedCandidates } from '../../repositories/questions.repository.js';
import type { QuestionType, TagKey } from '../../types/domain.js';

export interface RandomSelectionInput {
  subjectId?: TagKey;
  grade?: number;
  topicIds?: string[];
  count: number;
  difficulty?: Partial<Record<Difficulty, number>>;
  types?: QuestionType[];
  bankId?: string;
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

function sample<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

/**
 * Random selection pipeline from question-bank.md:
 * filter → exclude unavailable → group by difficulty → sample → validate.
 */
export async function selectRandomQuestions(
  input: RandomSelectionInput,
): Promise<{ questions: Question[]; warnings: string[] }> {
  const pool = await listPublishedCandidates({
    subjectId: input.subjectId,
    grade: input.grade,
    topicIds: input.topicIds,
    types: input.types,
    bankId: input.bankId,
  });

  const warnings: string[] = [];

  if (pool.length < input.count) {
    throw new AppError(
      422,
      `Not enough published questions (have ${pool.length}, need ${input.count})`,
      'INSUFFICIENT_QUESTIONS',
    );
  }

  const mix = input.difficulty;
  if (!mix || (!mix.easy && !mix.medium && !mix.hard)) {
    return { questions: sample(pool, input.count), warnings };
  }

  const totalWeight = (mix.easy ?? 0) + (mix.medium ?? 0) + (mix.hard ?? 0);
  if (totalWeight <= 0) {
    return { questions: sample(pool, input.count), warnings };
  }

  const byDiff: Record<Difficulty, Question[]> = {
    easy: pool.filter((q) => q.difficulty === 'easy'),
    medium: pool.filter((q) => q.difficulty === 'medium'),
    hard: pool.filter((q) => q.difficulty === 'hard'),
  };

  const targets: Record<Difficulty, number> = {
    easy: Math.round(input.count * ((mix.easy ?? 0) / totalWeight)),
    medium: Math.round(input.count * ((mix.medium ?? 0) / totalWeight)),
    hard: 0,
  };
  targets.hard = input.count - targets.easy - targets.medium;

  const picked: Question[] = [];
  for (const diff of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const need = targets[diff];
    const available = byDiff[diff];
    if (available.length < need) {
      warnings.push(
        `Only ${available.length}/${need} ${diff} questions available; filling from other difficulties`,
      );
      picked.push(...sample(available, available.length));
    } else {
      picked.push(...sample(available, need));
    }
  }

  if (picked.length < input.count) {
    const pickedIds = new Set(picked.map((q) => q.id));
    const remaining = pool.filter((q) => !pickedIds.has(q.id));
    picked.push(...sample(remaining, input.count - picked.length));
  }

  if (picked.length < input.count) {
    throw new AppError(
      422,
      `Not enough published questions after difficulty mix (have ${picked.length}, need ${input.count})`,
      'INSUFFICIENT_QUESTIONS',
    );
  }

  return { questions: picked.slice(0, input.count), warnings };
}
