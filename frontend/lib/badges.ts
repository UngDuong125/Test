export type BadgeInput = { expTotal: number; bestStreak: number; mastered: number };

export type Badge = { id: string; label: string; detail: string; earned: boolean };

const TIERS: { kind: keyof BadgeInput; label: string; unit: string; steps: number[] }[] = [
  { kind: 'expTotal', label: 'EXP', unit: 'EXP', steps: [10, 50, 100, 250, 500] },
  { kind: 'bestStreak', label: 'Chuỗi ôn', unit: 'ngày liên tiếp', steps: [3, 7, 14, 30] },
  { kind: 'mastered', label: 'Từ đã thuộc', unit: 'từ', steps: [10, 50, 100] },
];

/**
 * Every milestone, earned or not, from numbers the dashboard already has.
 * Earned badges never disappear: streak badges use the best streak, not the current one.
 */
export function badgesFor(input: BadgeInput): Badge[] {
  return TIERS.flatMap((t) =>
    t.steps.map((step) => ({
      id: `${t.kind}-${step}`,
      label: `${t.label} ${step}`,
      detail: `${step} ${t.unit}`,
      earned: input[t.kind] >= step,
    })),
  );
}

/** The next unearned milestone per kind, for a "sắp đạt" hint. */
export function nextBadges(input: BadgeInput): { label: string; remaining: number }[] {
  return TIERS.flatMap((t) => {
    const step = t.steps.find((s) => input[t.kind] < s);
    return step == null ? [] : [{ label: `${t.label} ${step}`, remaining: step - input[t.kind] }];
  });
}
