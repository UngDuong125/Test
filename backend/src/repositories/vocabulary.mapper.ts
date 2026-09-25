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

export interface VocabularyEntryRow {
  id: string;
  subject_id: TagKey;
  grade: number;
  term: string;
  reading: string | null;
  definition: string;
  example: string | null;
  media_id: string | null;
  tags: string[] | null;
  status: VocabularyEntryStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface VocabularyBankRow {
  id: string;
  name: string;
  description: string;
  subject_id: TagKey;
  grade: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface VocabularyAssignmentRow {
  id: string;
  bank_id: string;
  target_type: 'user';
  target_id: string;
  source_class_id: string | null;
  assigned_by: string;
  assigned_at: string;
  available_from: string;
  deadline: string | null;
  status: VocabularyAssignmentStatus;
  created_at: string;
}

export interface StudentVocabularyCardRow {
  id: string;
  assignment_id: string;
  user_id: string;
  entry_id: string;
  interval_step: number;
  next_review_at: string;
  last_reviewed_at: string | null;
  review_count: number;
  pass_count: number;
  fail_count: number;
  status: VocabularyCardStatus;
  created_at: string;
  updated_at: string;
}

export interface VocabularyReviewEventRow {
  id: string;
  card_id: string;
  result: VocabularyReviewResult;
  interval_step_before: number;
  interval_step_after: number;
  reviewed_at: string;
}

export function mapVocabularyEntry(row: VocabularyEntryRow): VocabularyEntry {
  return {
    id: row.id,
    subjectId: row.subject_id,
    grade: row.grade,
    term: row.term,
    reading: row.reading,
    definition: row.definition,
    example: row.example,
    mediaId: row.media_id,
    tags: row.tags ?? [],
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVocabularyBank(row: VocabularyBankRow): VocabularyBank {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    subjectId: row.subject_id,
    grade: row.grade,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVocabularyAssignment(row: VocabularyAssignmentRow): VocabularyAssignment {
  return {
    id: row.id,
    bankId: row.bank_id,
    targetType: row.target_type,
    targetId: row.target_id,
    sourceClassId: row.source_class_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    availableFrom: row.available_from,
    deadline: row.deadline,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function mapStudentVocabularyCard(row: StudentVocabularyCardRow): StudentVocabularyCard {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    userId: row.user_id,
    entryId: row.entry_id,
    intervalStep: row.interval_step,
    nextReviewAt: row.next_review_at,
    lastReviewedAt: row.last_reviewed_at,
    reviewCount: row.review_count,
    passCount: row.pass_count,
    failCount: row.fail_count,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapVocabularyReviewEvent(row: VocabularyReviewEventRow): VocabularyReviewEvent {
  return {
    id: row.id,
    cardId: row.card_id,
    result: row.result,
    intervalStepBefore: row.interval_step_before,
    intervalStepAfter: row.interval_step_after,
    reviewedAt: row.reviewed_at,
  };
}
