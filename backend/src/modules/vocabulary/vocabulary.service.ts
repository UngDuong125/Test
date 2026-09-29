import { env } from '../../config/env.js';
import { AppError } from '../../domain/errors.js';
import type {
  DueVocabularyCard,
  PublicUser,
  StudentVocabularyCard,
  TagKey,
  VocabularyAssignment,
  VocabularyBank,
  VocabularyEntry,
  VocabularyEntryStatus,
  VocabularyReviewResult,
} from '../../types/domain.js';
import {
  findClassById,
  isStudentInTeacherClass,
  listMemberUserIds,
} from '../../repositories/classes.repository.js';
import { findUserById } from '../../repositories/users.repository.js';
import { subjectExists } from '../../repositories/taxonomy.repository.js';
import {
  addEntriesToBank,
  countCardsForUser,
  createReviewEvent,
  createVocabularyAssignment,
  createVocabularyBank,
  createVocabularyCards,
  createVocabularyEntry,
  deleteVocabularyBank,
  deleteVocabularyEntry,
  enrichVocabularyAssignments,
  findActiveVocabularyAssignment,
  findVocabularyAssignmentById,
  findVocabularyBankById,
  findVocabularyCardById,
  findVocabularyEntriesByIds,
  findVocabularyEntryById,
  listDueCardsForUser,
  listPublishedBankEntryIds,
  listVocabularyAssignments,
  listVocabularyBanks,
  listVocabularyEntries,
  removeEntryFromBank,
  updateVocabularyAssignment,
  updateVocabularyBank,
  updateVocabularyCard,
  updateVocabularyEntry,
} from '../../repositories/vocabulary.repository.js';
import { initialCardSchedule, nextIntervalAfterReview } from './srs.logic.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

function assertCanManageBank(actor: PublicUser, bank: VocabularyBank) {
  assertTeacherOrAdmin(actor);
  if (actor.role === 'admin') return;
  if (bank.ownerId !== actor.id) {
    throw new AppError(403, 'Not the bank owner', 'FORBIDDEN');
  }
}

function assertCanManageEntry(actor: PublicUser, entry: VocabularyEntry) {
  assertTeacherOrAdmin(actor);
  if (actor.role === 'admin') return;
  if (entry.createdBy !== actor.id) {
    throw new AppError(403, 'Not the entry owner', 'FORBIDDEN');
  }
}

function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && String((err as { code: string }).code) === '23505',
  );
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function createEntryForUser(
  actor: PublicUser,
  input: {
    subjectId: TagKey;
    grade: number;
    term: string;
    reading?: string | null;
    definition: string;
    example?: string | null;
    mediaId?: string | null;
    tags?: string[];
    status?: VocabularyEntryStatus;
    bankId?: string;
  },
): Promise<VocabularyEntry> {
  assertTeacherOrAdmin(actor);
  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }

  if (input.bankId) {
    const bank = await findVocabularyBankById(input.bankId);
    if (!bank) throw new AppError(404, 'Vocabulary bank not found', 'NOT_FOUND');
    assertCanManageBank(actor, bank);
  }

  const entry = await createVocabularyEntry({
    subjectId: input.subjectId,
    grade: input.grade,
    term: input.term,
    reading: input.reading,
    definition: input.definition,
    example: input.example,
    mediaId: input.mediaId,
    tags: input.tags,
    status: input.status ?? 'draft',
    createdBy: actor.id,
  });

  if (input.bankId) {
    await addEntriesToBank(input.bankId, [entry.id]);
  }
  return entry;
}

export async function getEntryForUser(actor: PublicUser, id: string): Promise<VocabularyEntry> {
  assertTeacherOrAdmin(actor);
  const entry = await findVocabularyEntryById(id);
  if (!entry) throw new AppError(404, 'Vocabulary entry not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && entry.createdBy !== actor.id) {
    throw new AppError(404, 'Vocabulary entry not found', 'NOT_FOUND');
  }
  return entry;
}

export async function listEntriesForUser(
  actor: PublicUser,
  filters: {
    subjectId?: TagKey;
    grade?: number;
    status?: VocabularyEntryStatus;
    q?: string;
    bankId?: string;
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  if (filters.bankId) {
    await getBankForUser(actor, filters.bankId);
  }
  return listVocabularyEntries({
    ...filters,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function updateEntryForUser(
  actor: PublicUser,
  id: string,
  patch: Partial<{
    subjectId: TagKey;
    grade: number;
    term: string;
    reading: string | null;
    definition: string;
    example: string | null;
    mediaId: string | null;
    tags: string[];
    status: VocabularyEntryStatus;
  }>,
): Promise<VocabularyEntry> {
  const entry = await getEntryForUser(actor, id);
  assertCanManageEntry(actor, entry);
  if (patch.subjectId && !(await subjectExists(patch.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  return updateVocabularyEntry(id, {
    subject_id: patch.subjectId,
    grade: patch.grade,
    term: patch.term,
    reading: patch.reading,
    definition: patch.definition,
    example: patch.example,
    media_id: patch.mediaId,
    tags: patch.tags,
    status: patch.status,
  });
}

export async function deleteEntryForUser(actor: PublicUser, id: string): Promise<void> {
  const entry = await getEntryForUser(actor, id);
  assertCanManageEntry(actor, entry);
  try {
    await deleteVocabularyEntry(id);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && String((err as { code: string }).code) === '23503') {
      throw new AppError(
        422,
        'Entry is used by student cards; archive it instead',
        'ENTRY_IN_USE',
      );
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Banks
// ---------------------------------------------------------------------------

export async function createBankForUser(
  actor: PublicUser,
  input: {
    name: string;
    description: string;
    subjectId: TagKey;
    grade: number;
  },
): Promise<VocabularyBank> {
  assertTeacherOrAdmin(actor);
  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  try {
    return await createVocabularyBank({
      ...input,
      ownerId: actor.id,
    });
  } catch (err: unknown) {
    if (isPgUniqueViolation(err)) {
      throw new AppError(409, 'A bank with this name already exists', 'BANK_NAME_EXISTS');
    }
    throw err;
  }
}

export async function getBankForUser(actor: PublicUser, id: string): Promise<VocabularyBank> {
  assertTeacherOrAdmin(actor);
  const bank = await findVocabularyBankById(id);
  if (!bank) throw new AppError(404, 'Vocabulary bank not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && bank.ownerId !== actor.id) {
    throw new AppError(404, 'Vocabulary bank not found', 'NOT_FOUND');
  }
  return bank;
}

export async function listBanksForUser(
  actor: PublicUser,
  filters: {
    subjectId?: TagKey;
    grade?: number;
    ownerId?: string;
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  return listVocabularyBanks({
    ...filters,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function updateBankForUser(
  actor: PublicUser,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    subjectId: TagKey;
    grade: number;
  }>,
): Promise<VocabularyBank> {
  const bank = await getBankForUser(actor, id);
  assertCanManageBank(actor, bank);
  if (patch.subjectId && !(await subjectExists(patch.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  return updateVocabularyBank(id, {
    name: patch.name,
    description: patch.description,
    subject_id: patch.subjectId,
    grade: patch.grade,
  });
}

export async function deleteBankForUser(actor: PublicUser, id: string): Promise<void> {
  const bank = await getBankForUser(actor, id);
  assertCanManageBank(actor, bank);
  try {
    await deleteVocabularyBank(id);
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && String((err as { code: string }).code) === '23503') {
      throw new AppError(
        422,
        'Bank has assignments; cancel them before deleting',
        'BANK_HAS_ASSIGNMENTS',
      );
    }
    throw err;
  }
}

export async function listBankEntriesForUser(
  actor: PublicUser,
  bankId: string,
  filters: {
    status?: VocabularyEntryStatus;
    limit?: number;
    offset?: number;
  },
) {
  await getBankForUser(actor, bankId);
  return listVocabularyEntries({
    bankId,
    status: filters.status,
    limit: filters.limit,
    offset: filters.offset,
    viewerIsAdmin: true,
  });
}

export async function addEntriesToBankForUser(
  actor: PublicUser,
  bankId: string,
  entryIds: string[],
): Promise<{ added: number }> {
  const bank = await getBankForUser(actor, bankId);
  assertCanManageBank(actor, bank);

  const entries = await findVocabularyEntriesByIds(entryIds);
  if (entries.length !== entryIds.length) {
    throw new AppError(422, 'One or more entries not found', 'ENTRY_NOT_FOUND');
  }
  if (actor.role === 'teacher') {
    for (const e of entries) {
      if (e.createdBy !== actor.id) {
        throw new AppError(403, 'Can only add your own entries', 'FORBIDDEN');
      }
    }
  }
  await addEntriesToBank(bankId, entryIds);
  return { added: entryIds.length };
}

export async function removeEntryFromBankForUser(
  actor: PublicUser,
  bankId: string,
  entryId: string,
): Promise<void> {
  const bank = await getBankForUser(actor, bankId);
  assertCanManageBank(actor, bank);
  await removeEntryFromBank(bankId, entryId);
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

async function assertCanTargetStudent(actor: PublicUser, studentId: string) {
  const user = await findUserById(studentId);
  if (!user) throw new AppError(404, 'Student not found', 'NOT_FOUND');
  if (user.role !== 'student') {
    throw new AppError(422, 'Target must be a student', 'NOT_STUDENT');
  }
  if (user.status !== 'active') {
    throw new AppError(422, 'Student must be active', 'STUDENT_NOT_ACTIVE');
  }
  if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) {
      throw new AppError(403, 'Student is not in your classes', 'FORBIDDEN');
    }
  }
  return user;
}

async function createOneAssignment(input: {
  actor: PublicUser;
  bankId: string;
  targetId: string;
  sourceClassId?: string | null;
  availableFrom: string;
  deadline?: string | null;
}): Promise<{ assignment?: VocabularyAssignment; skipped?: string }> {
  const existing = await findActiveVocabularyAssignment(input.bankId, input.targetId);
  if (existing) {
    return { skipped: `Active assignment already exists for student ${input.targetId}` };
  }

  const publishedIds = await listPublishedBankEntryIds(input.bankId);
  if (!publishedIds.length) {
    throw new AppError(
      422,
      'Bank has no published entries to assign',
      'BANK_NO_PUBLISHED_ENTRIES',
    );
  }

  const assignment = await createVocabularyAssignment({
    bankId: input.bankId,
    targetId: input.targetId,
    sourceClassId: input.sourceClassId,
    assignedBy: input.actor.id,
    availableFrom: input.availableFrom,
    deadline: input.deadline ?? null,
    status: 'active',
  });

  const nextReviewAt = initialCardSchedule(
    new Date(input.availableFrom),
    new Date(),
  ).toISOString();

  await createVocabularyCards(
    publishedIds.map((entryId) => ({
      assignmentId: assignment.id,
      userId: input.targetId,
      entryId,
      nextReviewAt,
    })),
  );

  return { assignment };
}

export async function assignBankForUser(
  actor: PublicUser,
  bankId: string,
  body: {
    targetType: 'user' | 'class';
    targetId: string;
    availableFrom: string;
    deadline?: string | null;
  },
): Promise<{ assignments: VocabularyAssignment[]; warnings: string[] }> {
  assertTeacherOrAdmin(actor);
  const bank = await getBankForUser(actor, bankId);
  assertCanManageBank(actor, bank);

  const warnings: string[] = [];
  const created: VocabularyAssignment[] = [];

  if (body.targetType === 'user') {
    await assertCanTargetStudent(actor, body.targetId);
    const result = await createOneAssignment({
      actor,
      bankId,
      targetId: body.targetId,
      availableFrom: body.availableFrom,
      deadline: body.deadline,
    });
    if (result.skipped) warnings.push(result.skipped);
    if (result.assignment) created.push(result.assignment);
  } else {
    const cls = await findClassById(body.targetId);
    if (!cls) throw new AppError(404, 'Class not found', 'NOT_FOUND');
    if (actor.role === 'teacher' && cls.ownerId !== actor.id) {
      throw new AppError(403, 'Not the class owner', 'FORBIDDEN');
    }

    const memberIds = await listMemberUserIds(cls.id);
    if (memberIds.length === 0) {
      throw new AppError(422, 'Class has no members', 'CLASS_EMPTY');
    }

    // Validate published entries once before loop
    const publishedIds = await listPublishedBankEntryIds(bankId);
    if (!publishedIds.length) {
      throw new AppError(
        422,
        'Bank has no published entries to assign',
        'BANK_NO_PUBLISHED_ENTRIES',
      );
    }

    for (const studentId of memberIds) {
      const user = await findUserById(studentId);
      if (!user || user.role !== 'student' || user.status !== 'active') {
        warnings.push(`Skipped invalid member ${studentId}`);
        continue;
      }
      const result = await createOneAssignment({
        actor,
        bankId,
        targetId: studentId,
        sourceClassId: cls.id,
        availableFrom: body.availableFrom,
        deadline: body.deadline,
      });
      if (result.skipped) warnings.push(result.skipped);
      if (result.assignment) created.push(result.assignment);
    }
  }

  const enriched = await enrichVocabularyAssignments(created);
  return { assignments: enriched, warnings };
}

export async function getAssignmentForUser(
  actor: PublicUser,
  id: string,
): Promise<VocabularyAssignment> {
  const assignment = await findVocabularyAssignmentById(id);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');

  if (actor.role === 'student') {
    if (assignment.targetId !== actor.id) {
      throw new AppError(404, 'Assignment not found', 'NOT_FOUND');
    }
  } else if (actor.role === 'teacher') {
    const bank = await findVocabularyBankById(assignment.bankId);
    if (!bank || bank.ownerId !== actor.id) {
      if (assignment.assignedBy !== actor.id) {
        throw new AppError(404, 'Assignment not found', 'NOT_FOUND');
      }
    }
  }

  const [enriched] = await enrichVocabularyAssignments([assignment]);
  return enriched;
}

export async function listAssignmentsForUser(
  actor: PublicUser,
  filters: {
    bankId?: string;
    targetId?: string;
    status?: 'active' | 'completed' | 'cancelled';
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  const result = await listVocabularyAssignments({
    ...filters,
    assignedBy: actor.role === 'teacher' ? actor.id : undefined,
  });
  return {
    items: await enrichVocabularyAssignments(result.items),
    total: result.total,
  };
}

export async function cancelAssignmentForUser(
  actor: PublicUser,
  id: string,
): Promise<VocabularyAssignment> {
  assertTeacherOrAdmin(actor);
  const assignment = await getAssignmentForUser(actor, id);
  if (assignment.status === 'cancelled') return assignment;
  const updated = await updateVocabularyAssignment(id, { status: 'cancelled' });
  const [enriched] = await enrichVocabularyAssignments([updated]);
  return enriched;
}

export async function listMyVocabularyAssignments(
  actor: PublicUser,
  filters: {
    status?: 'active' | 'completed' | 'cancelled';
    limit?: number;
    offset?: number;
  } = {},
) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const result = await listVocabularyAssignments({
    targetId: actor.id,
    status: filters.status,
    limit: filters.limit,
    offset: filters.offset,
  });
  return {
    items: await enrichVocabularyAssignments(result.items),
    total: result.total,
  };
}

export async function listStudentVocabularyAssignments(
  actor: PublicUser,
  studentId: string,
  filters: {
    status?: 'active' | 'completed' | 'cancelled';
    limit?: number;
    offset?: number;
  } = {},
) {
  if (actor.role === 'student' && actor.id !== studentId) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const result = await listVocabularyAssignments({
    targetId: studentId,
    status: filters.status,
    limit: filters.limit,
    offset: filters.offset,
  });
  return {
    items: await enrichVocabularyAssignments(result.items),
    total: result.total,
  };
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export async function listDueForStudent(actor: PublicUser): Promise<{
  items: DueVocabularyCard[];
  dueCount: number;
}> {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  const nowIso = new Date().toISOString();
  const cards = await listDueCardsForUser(actor.id, nowIso);
  if (!cards.length) return { items: [], dueCount: 0 };

  const entryIds = [...new Set(cards.map((c) => c.entryId))];
  const assignmentIds = [...new Set(cards.map((c) => c.assignmentId))];
  const entries = await findVocabularyEntriesByIds(entryIds);
  const entryMap = new Map(entries.map((e) => [e.id, e]));

  const assignments = await Promise.all(
    assignmentIds.map((id) => findVocabularyAssignmentById(id)),
  );
  const bankIds = [
    ...new Set(assignments.filter(Boolean).map((a) => a!.bankId)),
  ];
  const banks = await Promise.all(bankIds.map((id) => findVocabularyBankById(id)));
  const bankNameById = new Map(banks.filter(Boolean).map((b) => [b!.id, b!.name]));
  const assignmentBank = new Map(
    assignments.filter(Boolean).map((a) => [a!.id, bankNameById.get(a!.bankId)]),
  );

  const items: DueVocabularyCard[] = [];
  for (const card of cards) {
    const entry = entryMap.get(card.entryId);
    if (!entry) continue;
    items.push({
      card,
      entry,
      assignmentId: card.assignmentId,
      bankName: assignmentBank.get(card.assignmentId),
    });
  }
  return { items, dueCount: items.length };
}

export async function getMyVocabularyStats(actor: PublicUser) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  return countCardsForUser(actor.id);
}

export async function reviewCardForStudent(
  actor: PublicUser,
  cardId: string,
  result: VocabularyReviewResult,
): Promise<{ card: StudentVocabularyCard }> {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const card = await findVocabularyCardById(cardId);
  if (!card || card.userId !== actor.id) {
    throw new AppError(404, 'Card not found', 'NOT_FOUND');
  }
  if (card.status !== 'learning') {
    throw new AppError(422, 'Card is not in learning status', 'CARD_NOT_LEARNING');
  }

  const assignment = await findVocabularyAssignmentById(card.assignmentId);
  if (!assignment || assignment.status !== 'active') {
    throw new AppError(422, 'Assignment is not active', 'ASSIGNMENT_INACTIVE');
  }

  const now = new Date();
  const nowIso = now.toISOString();
  if (assignment.availableFrom > nowIso) {
    throw new AppError(422, 'Assignment is not available yet', 'ASSIGNMENT_NOT_AVAILABLE');
  }
  if (assignment.deadline != null && assignment.deadline < nowIso) {
    throw new AppError(422, 'Assignment deadline has passed', 'ASSIGNMENT_EXPIRED');
  }

  // Allow reviewing cards that were due when the session started; still require due-or-past
  if (card.nextReviewAt > nowIso) {
    throw new AppError(422, 'Card is not due yet', 'CARD_NOT_DUE');
  }

  const schedule = nextIntervalAfterReview(
    card.intervalStep,
    result,
    now,
    env.VOCABULARY_TIME_ZONE,
  );
  const updated = await updateVocabularyCard(cardId, {
    interval_step: schedule.intervalStep,
    next_review_at: schedule.nextReviewAt.toISOString(),
    status: schedule.status,
    last_reviewed_at: nowIso,
    review_count: card.reviewCount + 1,
    pass_count: card.passCount + (result === 'pass' ? 1 : 0),
    fail_count: card.failCount + (result === 'fail' ? 1 : 0),
  });

  await createReviewEvent({
    cardId,
    result,
    intervalStepBefore: card.intervalStep,
    intervalStepAfter: schedule.intervalStep,
  });

  return { card: updated };
}
