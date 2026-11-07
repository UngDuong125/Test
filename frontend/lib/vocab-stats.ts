import { getMyVocabularyStats } from '@/lib/api-client';

type VocabStats = Awaited<ReturnType<typeof getMyVocabularyStats>>;

/** One stats request per page load, shared by the header badge and the dashboard. */
let pending: Promise<VocabStats> | null = null;

export function loadVocabStatsOnce(): Promise<VocabStats> {
  if (!pending) {
    pending = getMyVocabularyStats().catch((err: unknown) => {
      pending = null;
      throw err;
    });
  }
  return pending;
}
