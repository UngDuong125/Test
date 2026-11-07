import { getDb } from './db.js';
import {
  mapStudentVocabularyCard,
  mapVocabularyAssignment,
  mapVocabularyBank,
  mapVocabularyEntry,
  mapVocabularyReviewEvent,
  type StudentVocabularyCardRow,
  type VocabularyAssignmentRow,
  type VocabularyBankRow,
  type VocabularyEntryRow,
  type VocabularyReviewEventRow,
} from './vocabulary.mapper.js';
import type {
  StudentVocabularyCard,
  TagKey,
  VocabularyAssignment,
  VocabularyAssignmentStatus,
  VocabularyBank,
  VocabularyCardStatus,
  VocabularyEntry,
  VocabularyEntryStatus,
  VocabularyReviewEvent,
  VocabularyReviewResult,
} from '../types/domain.js';

const ENTRY_COLUMNS =
  'id, subject_id, grade, term, reading, definition, example, media_id, tags, status, created_by, created_at, updated_at';

const BANK_COLUMNS =
  'id, name, description, subject_id, grade, owner_id, created_at, updated_at';

const ASSIGNMENT_COLUMNS =
  'id, bank_id, target_type, target_id, source_class_id, assigned_by, assigned_at, available_from, deadline, status, created_at';

const CARD_COLUMNS =
  'id, assignment_id, user_id, entry_id, interval_step, next_review_at, last_reviewed_at, review_count, pass_count, fail_count, status, created_at, updated_at';

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function findVocabularyEntryById(id: string): Promise<VocabularyEntry | null> {
  const { data, error } = await getDb()
    .from('vocabulary_entries')
    .select(ENTRY_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapVocabularyEntry(data as VocabularyEntryRow);
}

export async function findVocabularyEntriesByIds(ids: string[]): Promise<VocabularyEntry[]> {
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('vocabulary_entries')
    .select(ENTRY_COLUMNS)
    .in('id', ids);
  if (error) throw error;
  return ((data ?? []) as VocabularyEntryRow[]).map(mapVocabularyEntry);
}

export async function listVocabularyEntries(filters: {
  subjectId?: TagKey;
  grade?: number;
  status?: VocabularyEntryStatus;
  createdBy?: string;
  viewerId?: string;
  viewerIsAdmin?: boolean;
  q?: string;
  bankId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: VocabularyEntry[]; total: number }> {
  let entryIdsFilter: string[] | undefined;
  if (filters.bankId) {
    entryIdsFilter = await listBankEntryIds(filters.bankId);
    if (!entryIdsFilter.length) return { items: [], total: 0 };
  }

  let query = getDb().from('vocabulary_entries').select(ENTRY_COLUMNS, { count: 'exact' });
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.createdBy) query = query.eq('created_by', filters.createdBy);
  if (filters.viewerId && !filters.viewerIsAdmin) {
    query = query.eq('created_by', filters.viewerId);
  }
  if (entryIdsFilter) query = query.in('id', entryIdsFilter);
  if (filters.q) {
    const safe = filters.q.replace(/[%_,]/g, ' ').trim();
    if (safe) query = query.ilike('term', `%${safe}%`);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as VocabularyEntryRow[]).map(mapVocabularyEntry),
    total: count ?? 0,
  };
}

export async function createVocabularyEntry(input: {
  subjectId: TagKey;
  grade: number;
  term: string;
  reading?: string | null;
  definition: string;
  example?: string | null;
  mediaId?: string | null;
  tags?: string[];
  status?: VocabularyEntryStatus;
  createdBy: string;
}): Promise<VocabularyEntry> {
  const { data, error } = await getDb()
    .from('vocabulary_entries')
    .insert({
      subject_id: input.subjectId,
      grade: input.grade,
      term: input.term,
      reading: input.reading ?? null,
      definition: input.definition,
      example: input.example ?? null,
      media_id: input.mediaId ?? null,
      tags: input.tags ?? [],
      status: input.status ?? 'draft',
      created_by: input.createdBy,
    })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw error;
  return mapVocabularyEntry(data as VocabularyEntryRow);
}

export async function updateVocabularyEntry(
  id: string,
  patch: Partial<{
    subject_id: TagKey;
    grade: number;
    term: string;
    reading: string | null;
    definition: string;
    example: string | null;
    media_id: string | null;
    tags: string[];
    status: VocabularyEntryStatus;
  }>,
): Promise<VocabularyEntry> {
  const { error } = await getDb().from('vocabulary_entries').update(patch).eq('id', id);
  if (error) throw error;
  const entry = await findVocabularyEntryById(id);
  if (!entry) throw new Error('Entry missing after update');
  return entry;
}

export async function deleteVocabularyEntry(id: string): Promise<void> {
  const { error } = await getDb().from('vocabulary_entries').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Banks
// ---------------------------------------------------------------------------

export async function findVocabularyBankById(id: string): Promise<VocabularyBank | null> {
  const { data, error } = await getDb()
    .from('vocabulary_banks')
    .select(BANK_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapVocabularyBank(data as VocabularyBankRow);
}

export async function findVocabularyBanksByIds(ids: string[]): Promise<VocabularyBank[]> {
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('vocabulary_banks')
    .select(BANK_COLUMNS)
    .in('id', ids);
  if (error) throw error;
  return ((data ?? []) as VocabularyBankRow[]).map(mapVocabularyBank);
}

export async function listVocabularyBanks(filters: {
  subjectId?: TagKey;
  grade?: number;
  ownerId?: string;
  viewerId?: string;
  viewerIsAdmin?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: VocabularyBank[]; total: number }> {
  let query = getDb().from('vocabulary_banks').select(BANK_COLUMNS, { count: 'exact' });
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
  if (filters.viewerId && !filters.viewerIsAdmin) {
    query = query.eq('owner_id', filters.viewerId);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as VocabularyBankRow[]).map(mapVocabularyBank),
    total: count ?? 0,
  };
}

export async function createVocabularyBank(input: {
  name: string;
  description: string;
  subjectId: TagKey;
  grade: number;
  ownerId: string;
}): Promise<VocabularyBank> {
  const { data, error } = await getDb()
    .from('vocabulary_banks')
    .insert({
      name: input.name,
      description: input.description,
      subject_id: input.subjectId,
      grade: input.grade,
      owner_id: input.ownerId,
    })
    .select(BANK_COLUMNS)
    .single();
  if (error) throw error;
  return mapVocabularyBank(data as VocabularyBankRow);
}

export async function updateVocabularyBank(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    subject_id: TagKey;
    grade: number;
  }>,
): Promise<VocabularyBank> {
  const { error } = await getDb().from('vocabulary_banks').update(patch).eq('id', id);
  if (error) throw error;
  const bank = await findVocabularyBankById(id);
  if (!bank) throw new Error('Bank missing after update');
  return bank;
}

export async function deleteVocabularyBank(id: string): Promise<void> {
  const { error } = await getDb().from('vocabulary_banks').delete().eq('id', id);
  if (error) throw error;
}

export async function addEntriesToBank(bankId: string, entryIds: string[]): Promise<void> {
  if (!entryIds.length) return;
  const rows = entryIds.map((entryId) => ({ bank_id: bankId, entry_id: entryId }));
  const { error } = await getDb()
    .from('vocabulary_bank_items')
    .upsert(rows, { onConflict: 'bank_id,entry_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeEntryFromBank(bankId: string, entryId: string): Promise<void> {
  const { error } = await getDb()
    .from('vocabulary_bank_items')
    .delete()
    .eq('bank_id', bankId)
    .eq('entry_id', entryId);
  if (error) throw error;
}

export async function listBankEntryIds(bankId: string): Promise<string[]> {
  const { data, error } = await getDb()
    .from('vocabulary_bank_items')
    .select('entry_id')
    .eq('bank_id', bankId);
  if (error) throw error;
  return (data ?? []).map((r: { entry_id: string }) => r.entry_id);
}

export async function listPublishedBankEntryIds(bankId: string): Promise<string[]> {
  const ids = await listBankEntryIds(bankId);
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('vocabulary_entries')
    .select('id')
    .in('id', ids)
    .eq('status', 'published');
  if (error) throw error;
  return (data ?? []).map((r: { id: string }) => r.id);
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

export async function findVocabularyAssignmentById(
  id: string,
): Promise<VocabularyAssignment | null> {
  const { data, error } = await getDb()
    .from('vocabulary_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapVocabularyAssignment(data as VocabularyAssignmentRow);
}

export async function findVocabularyCardForReview(id: string): Promise<{
  card: StudentVocabularyCard;
  assignment: VocabularyAssignment | null;
} | null> {
  const { data, error } = await getDb()
    .from('student_vocabulary_cards')
    .select(`${CARD_COLUMNS}, vocabulary_assignments (${ASSIGNMENT_COLUMNS})`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as StudentVocabularyCardRow & {
    vocabulary_assignments: VocabularyAssignmentRow | VocabularyAssignmentRow[] | null;
  };
  const assignmentRow = Array.isArray(row.vocabulary_assignments)
    ? (row.vocabulary_assignments[0] ?? null)
    : row.vocabulary_assignments;
  return {
    card: mapStudentVocabularyCard(row),
    assignment: assignmentRow ? mapVocabularyAssignment(assignmentRow) : null,
  };
}

export async function findActiveVocabularyAssignment(
  bankId: string,
  targetId: string,
): Promise<VocabularyAssignment | null> {
  const { data, error } = await getDb()
    .from('vocabulary_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('bank_id', bankId)
    .eq('target_id', targetId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapVocabularyAssignment(data as VocabularyAssignmentRow);
}

export async function listVocabularyAssignments(filters: {
  bankId?: string;
  targetId?: string;
  assignedBy?: string;
  status?: VocabularyAssignmentStatus;
  limit?: number;
  offset?: number;
}): Promise<{ items: VocabularyAssignment[]; total: number }> {
  let query = getDb()
    .from('vocabulary_assignments')
    .select(ASSIGNMENT_COLUMNS, { count: 'exact' });
  if (filters.bankId) query = query.eq('bank_id', filters.bankId);
  if (filters.targetId) query = query.eq('target_id', filters.targetId);
  if (filters.assignedBy) query = query.eq('assigned_by', filters.assignedBy);
  if (filters.status) query = query.eq('status', filters.status);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('assigned_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as VocabularyAssignmentRow[]).map(mapVocabularyAssignment),
    total: count ?? 0,
  };
}

export async function createVocabularyAssignment(input: {
  bankId: string;
  targetId: string;
  sourceClassId?: string | null;
  assignedBy: string;
  availableFrom: string;
  deadline?: string | null;
  status?: VocabularyAssignmentStatus;
}): Promise<VocabularyAssignment> {
  const { data, error } = await getDb()
    .from('vocabulary_assignments')
    .insert({
      bank_id: input.bankId,
      target_type: 'user',
      target_id: input.targetId,
      source_class_id: input.sourceClassId ?? null,
      assigned_by: input.assignedBy,
      available_from: input.availableFrom,
      deadline: input.deadline ?? null,
      status: input.status ?? 'active',
    })
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapVocabularyAssignment(data as VocabularyAssignmentRow);
}

export async function updateVocabularyAssignment(
  id: string,
  patch: Partial<{
    available_from: string;
    deadline: string | null;
    status: VocabularyAssignmentStatus;
  }>,
): Promise<VocabularyAssignment> {
  const { error } = await getDb().from('vocabulary_assignments').update(patch).eq('id', id);
  if (error) throw error;
  const row = await findVocabularyAssignmentById(id);
  if (!row) throw new Error('Assignment missing after update');
  return row;
}

export async function enrichVocabularyAssignments(
  items: VocabularyAssignment[],
): Promise<VocabularyAssignment[]> {
  if (!items.length) return items;
  const bankIds = [...new Set(items.map((a) => a.bankId))];
  const targetIds = [...new Set(items.map((a) => a.targetId))];

  const [{ data: banks }, { data: users }] = await Promise.all([
    getDb().from('vocabulary_banks').select('id, name').in('id', bankIds),
    getDb().from('users').select('id, email, username').in('id', targetIds),
  ]);

  const bankMap = new Map(
    ((banks ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]),
  );
  const userMap = new Map(
    ((users ?? []) as { id: string; email: string; username: string }[]).map((u) => [
      u.id,
      u,
    ]),
  );

  return items.map((a) => {
    const user = userMap.get(a.targetId);
    return {
      ...a,
      bankName: bankMap.get(a.bankId),
      targetEmail: user?.email,
      targetUsername: user?.username,
    };
  });
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export async function findVocabularyCardById(id: string): Promise<StudentVocabularyCard | null> {
  const { data, error } = await getDb()
    .from('student_vocabulary_cards')
    .select(CARD_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapStudentVocabularyCard(data as StudentVocabularyCardRow);
}

export async function createVocabularyCards(
  rows: Array<{
    assignmentId: string;
    userId: string;
    entryId: string;
    nextReviewAt: string;
  }>,
): Promise<void> {
  if (!rows.length) return;
  const payload = rows.map((r) => ({
    assignment_id: r.assignmentId,
    user_id: r.userId,
    entry_id: r.entryId,
    interval_step: 0,
    next_review_at: r.nextReviewAt,
    status: 'learning' as VocabularyCardStatus,
  }));
  const { error } = await getDb()
    .from('student_vocabulary_cards')
    .upsert(payload, {
      onConflict: 'user_id,entry_id,assignment_id',
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

export async function updateVocabularyCard(
  id: string,
  patch: Partial<{
    interval_step: number;
    next_review_at: string;
    last_reviewed_at: string | null;
    review_count: number;
    pass_count: number;
    fail_count: number;
    status: VocabularyCardStatus;
  }>,
): Promise<StudentVocabularyCard> {
  const { data, error } = await getDb()
    .from('student_vocabulary_cards')
    .update(patch)
    .eq('id', id)
    .select(CARD_COLUMNS)
    .single();
  if (error) throw error;
  return mapStudentVocabularyCard(data as StudentVocabularyCardRow);
}

async function listOpenAssignmentsForUser(
  userId: string,
  nowIso: string,
): Promise<VocabularyAssignment[]> {
  const { data, error } = await getDb()
    .from('vocabulary_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('target_id', userId)
    .eq('status', 'active');
  if (error) throw error;
  return ((data ?? []) as VocabularyAssignmentRow[])
    .filter((a) => {
      if (a.available_from > nowIso) return false;
      if (a.deadline != null && a.deadline < nowIso) return false;
      return true;
    })
    .map(mapVocabularyAssignment);
}

const DUE_PAGE_MAX = 30;

export async function listDueCardsWithAssignments(
  userId: string,
  nowIso: string,
  page: { limit?: number; after?: string; afterId?: string } = {},
): Promise<{
  cards: { card: StudentVocabularyCard; entry: VocabularyEntry }[];
  assignments: VocabularyAssignment[];
  bankNames: Map<string, string>;
  dueCount: number;
}> {
  const assignments = await listOpenAssignmentsForUser(userId, nowIso);
  if (!assignments.length) {
    return { cards: [], assignments: [], bankNames: new Map(), dueCount: 0 };
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const bankIds = [...new Set(assignments.map((assignment) => assignment.bankId))];
  const limit = Math.min(page.limit ?? DUE_PAGE_MAX, DUE_PAGE_MAX);

  let cardsQuery = getDb()
    .from('student_vocabulary_cards')
    .select(`${CARD_COLUMNS}, vocabulary_entries (${ENTRY_COLUMNS})`)
    .eq('user_id', userId)
    .eq('status', 'learning')
    .in('assignment_id', assignmentIds)
    .lte('next_review_at', nowIso)
    .order('next_review_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (page.after && page.afterId) {
    cardsQuery = cardsQuery.or(
      `next_review_at.gt."${page.after}",and(next_review_at.eq."${page.after}",id.gt.${page.afterId})`,
    );
  }

  const countQuery = getDb()
    .from('student_vocabulary_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'learning')
    .in('assignment_id', assignmentIds)
    .lte('next_review_at', nowIso);

  const [cardsRes, countRes, banks] = await Promise.all([
    cardsQuery,
    countQuery,
    findVocabularyBanksByIds(bankIds),
  ]);
  if (cardsRes.error) throw cardsRes.error;
  if (countRes.error) throw countRes.error;

  const cards = ((cardsRes.data ?? []) as (StudentVocabularyCardRow & {
    vocabulary_entries: VocabularyEntryRow | VocabularyEntryRow[] | null;
  })[]).flatMap((row) => {
    const entryRow = Array.isArray(row.vocabulary_entries)
      ? (row.vocabulary_entries[0] ?? null)
      : row.vocabulary_entries;
    if (!entryRow) return [];
    return [{ card: mapStudentVocabularyCard(row), entry: mapVocabularyEntry(entryRow) }];
  });

  return {
    cards,
    assignments,
    bankNames: new Map(banks.map((bank) => [bank.id, bank.name])),
    dueCount: countRes.count ?? cards.length,
  };
}

export async function countDueCardsForUser(userId: string, nowIso: string): Promise<number> {
  const { dueCount } = await listDueCardsWithAssignments(userId, nowIso, { limit: 1 });
  return dueCount;
}

export async function countCardsForUser(userId: string): Promise<{
  total: number;
  learning: number;
  mastered: number;
  due: number;
}> {
  const nowIso = new Date().toISOString();
  const cardCount = (status?: VocabularyCardStatus) => {
    let query = getDb()
      .from('student_vocabulary_cards')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    if (status) query = query.eq('status', status);
    return query;
  };

  const [totalRes, learningRes, masteredRes, due] = await Promise.all([
    cardCount(),
    cardCount('learning'),
    cardCount('mastered'),
    countDueCardsForUser(userId, nowIso),
  ]);
  if (totalRes.error) throw totalRes.error;
  if (learningRes.error) throw learningRes.error;
  if (masteredRes.error) throw masteredRes.error;

  return {
    total: totalRes.count ?? 0,
    learning: learningRes.count ?? 0,
    mastered: masteredRes.count ?? 0,
    due,
  };
}

export async function createReviewEvent(input: {
  cardId: string;
  result: VocabularyReviewResult;
  intervalStepBefore: number;
  intervalStepAfter: number;
}): Promise<VocabularyReviewEvent> {
  const { data, error } = await getDb()
    .from('vocabulary_review_events')
    .insert({
      card_id: input.cardId,
      result: input.result,
      interval_step_before: input.intervalStepBefore,
      interval_step_after: input.intervalStepAfter,
    })
    .select(
      'id, card_id, result, interval_step_before, interval_step_after, reviewed_at',
    )
    .single();
  if (error) throw error;
  return mapVocabularyReviewEvent(data as VocabularyReviewEventRow);
}

/** Every non-cancelled assignment of a bank (optionally one class group). */
export async function listLiveVocabularyAssignmentsForBank(
  bankId: string,
  sourceClassId?: string,
): Promise<VocabularyAssignment[]> {
  const out: VocabularyAssignment[] = [];
  for (let from = 0; ; from += 1000) {
    let query = getDb()
      .from('vocabulary_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('bank_id', bankId)
      .neq('status', 'cancelled');
    if (sourceClassId) query = query.eq('source_class_id', sourceClassId);
    const { data, error } = await query.order('id').range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as VocabularyAssignmentRow[];
    out.push(...rows.map(mapVocabularyAssignment));
    if (rows.length < 1000) return out;
  }
}

/** All cards of the given assignments, paged past PostgREST's 1000-row cap. */
export async function listCardsForAssignments(
  assignmentIds: string[],
): Promise<StudentVocabularyCard[]> {
  const out: StudentVocabularyCard[] = [];
  for (let i = 0; i < assignmentIds.length; i += 200) {
    const chunk = assignmentIds.slice(i, i + 200);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await getDb()
        .from('student_vocabulary_cards')
        .select(CARD_COLUMNS)
        .in('assignment_id', chunk)
        .order('id')
        .range(from, from + 999);
      if (error) throw error;
      const rows = (data ?? []) as StudentVocabularyCardRow[];
      out.push(...rows.map(mapStudentVocabularyCard));
      if (rows.length < 1000) break;
    }
  }
  return out;
}

/** Count one review on the student's local day (read-then-upsert; a lost race only undercounts). */
export async function recordReviewDay(userId: string, day: string): Promise<void> {
  const { data, error } = await getDb()
    .from('student_review_days')
    .select('reviews')
    .eq('user_id', userId)
    .eq('day', day)
    .maybeSingle();
  if (error) throw error;
  const reviews = ((data as { reviews: number } | null)?.reviews ?? 0) + 1;
  const { error: upsertError } = await getDb()
    .from('student_review_days')
    .upsert({ user_id: userId, day, reviews }, { onConflict: 'user_id,day' });
  if (upsertError) throw upsertError;
}

/** The student's most recent review days (newest first), enough for a streak. */
export async function listRecentReviewDays(
  userId: string,
  limit = 400,
): Promise<{ day: string; reviews: number }[]> {
  const { data, error } = await getDb()
    .from('student_review_days')
    .select('day, reviews')
    .eq('user_id', userId)
    .order('day', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as { day: string; reviews: number }[];
}

/** Active vocabulary assignments created for a class (newcomers may get the same bank). */
export async function listActiveVocabularyAssignmentsForClass(
  classId: string,
): Promise<VocabularyAssignment[]> {
  const { data, error } = await getDb()
    .from('vocabulary_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('source_class_id', classId)
    .eq('status', 'active')
    .limit(1000);
  if (error) throw error;
  return ((data ?? []) as VocabularyAssignmentRow[]).map(mapVocabularyAssignment);
}
