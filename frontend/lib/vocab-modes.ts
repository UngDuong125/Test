import type { DueVocabularyCard } from '@/types/content';

/** Strip the **bold** / *italic* / __underline__ markers teachers can use in terms. */
export function plainText(rich: string): string {
  return rich.replace(/\*\*|__|\*/g, '');
}

/** Case-, accent-spacing- and punctuation-tolerant form for comparing typed answers. */
export function normalizeAnswer(s: string): string {
  return plainText(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.,!?;:'"“”‘’()[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Typed answer matches the term. A term written as "colour / color" accepts either
 * variant. Vietnamese diacritics still matter (they change the word).
 */
export function isTypedAnswerCorrect(typed: string, term: string): boolean {
  const answer = normalizeAnswer(typed);
  if (!answer) return false;
  const variants = plainText(term)
    .split(/\s*[/|;]\s*/)
    .map(normalizeAnswer)
    .filter(Boolean);
  return variants.includes(answer) || normalizeAnswer(term) === answer;
}

export type QuizOption = { cardId: string; definition: string; correct: boolean };

/**
 * Up to 4 definitions: the right one plus distractors from other due cards whose
 * definition differs. Returns null when there is nothing to choose between.
 */
export function buildQuizOptions(
  current: DueVocabularyCard,
  pool: DueVocabularyCard[],
  random: () => number = Math.random,
  size = 4,
): QuizOption[] | null {
  const right = normalizeAnswer(current.entry.definition);
  const seen = new Set([right]);
  const distractors: QuizOption[] = [];
  const candidates = pool.filter((p) => p.card.id !== current.card.id);
  // Fisher–Yates on a copy so the same queue gives varied distractors.
  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const c of candidates) {
    if (distractors.length >= size - 1) break;
    const key = normalizeAnswer(c.entry.definition);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    distractors.push({ cardId: c.card.id, definition: c.entry.definition, correct: false });
  }
  if (distractors.length === 0) return null;
  const options = [
    { cardId: current.card.id, definition: current.entry.definition, correct: true },
    ...distractors,
  ];
  for (let i = options.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}
