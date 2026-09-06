import type {
  AssignmentStatus,
  ClassRecord,
  ContentBlock,
  Difficulty,
  Exam,
  ExamAssignment,
  ExamQuestion,
  ExamSection,
  ExamSettings,
  ExamStatus,
  ExamType,
  MediaRecord,
  Question,
  QuestionAnswer,
  QuestionBank,
  QuestionExplanation,
  QuestionOption,
  QuestionStatus,
  QuestionType,
  Subject,
  TagKey,
  Topic,
} from '../types/domain.js';
import { DEFAULT_EXAM_SETTINGS } from '../types/domain.js';

export interface QuestionRow {
  id: string;
  type: QuestionType;
  subject_id: TagKey;
  grade: number;
  difficulty: Difficulty;
  content: ContentBlock[];
  answer: QuestionAnswer;
  explanation: QuestionExplanation;
  points: number | string;
  tags: string[] | null;
  status: QuestionStatus;
  version: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionOptionRow {
  question_id: string;
  id: string;
  content: QuestionOption['content'];
  order: number;
}

export interface QuestionBankRow {
  id: string;
  name: string;
  description: string;
  subject_id: TagKey;
  grade: number;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ExamRow {
  id: string;
  title: string;
  description: string;
  subject_id: TagKey;
  grade: number;
  type: ExamType;
  difficulty: Difficulty;
  duration: number;
  total_points: number | string;
  instructions: string;
  settings: ExamSettings | null;
  status: ExamStatus;
  version: number;
  created_by: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface ExamSectionRow {
  id: string;
  exam_id: string;
  title: string;
  description: string;
  order: number;
}

export interface ExamQuestionRow {
  exam_id: string;
  section_id: string | null;
  question_id: string;
  order: number;
  points: number | string;
}

export interface TopicRow {
  id: string;
  subject_id: TagKey;
  name: string;
  grade: number | null;
  created_at: string;
}

export interface SubjectRow {
  id: TagKey;
  label: string;
}

export interface ClassRow {
  id: string;
  name: string;
  grade: number;
  owner_id: string;
  created_at: string;
}

export interface ClassMemberRow {
  class_id: string;
  user_id: string;
  joined_at: string;
}

export interface ExamAssignmentRow {
  id: string;
  exam_id: string;
  target_type: 'user';
  target_id: string;
  source_class_id: string | null;
  assigned_by: string;
  assigned_at: string;
  available_from: string;
  deadline: string;
  attempt_limit: number;
  status: AssignmentStatus;
  settings: Partial<ExamSettings> | null;
  created_at: string;
}

export interface MediaRow {
  id: string;
  url: string;
  public_id: string;
  mime_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
}

export function mapQuestion(
  row: QuestionRow,
  options: QuestionOption[] = [],
  topicIds: string[] = [],
): Question {
  return {
    id: row.id,
    type: row.type,
    subjectId: row.subject_id,
    grade: row.grade,
    topicIds,
    difficulty: row.difficulty,
    content: row.content ?? [],
    options,
    answer: row.answer ?? { type: 'manual' },
    explanation: row.explanation ?? {},
    points: Number(row.points),
    tags: row.tags ?? [],
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOption(row: QuestionOptionRow): QuestionOption {
  return {
    id: row.id,
    content: row.content,
    order: row.order,
  };
}

export function mapQuestionBank(row: QuestionBankRow): QuestionBank {
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

export function mapExam(row: ExamRow): Exam {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    subjectId: row.subject_id,
    grade: row.grade,
    type: row.type,
    difficulty: row.difficulty,
    duration: row.duration,
    totalPoints: Number(row.total_points),
    instructions: row.instructions,
    settings: row.settings ?? DEFAULT_EXAM_SETTINGS,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapExamSection(row: ExamSectionRow): ExamSection {
  return {
    id: row.id,
    examId: row.exam_id,
    title: row.title,
    description: row.description,
    order: row.order,
  };
}

export function mapExamQuestion(row: ExamQuestionRow): ExamQuestion {
  return {
    examId: row.exam_id,
    sectionId: row.section_id,
    questionId: row.question_id,
    order: row.order,
    points: Number(row.points),
  };
}

export function mapTopic(row: TopicRow): Topic {
  return {
    id: row.id,
    subjectId: row.subject_id,
    name: row.name,
    grade: row.grade,
    createdAt: row.created_at,
  };
}

export function mapSubject(row: SubjectRow): Subject {
  return { id: row.id, label: row.label };
}

export function mapClass(row: ClassRow, memberCount?: number): ClassRecord {
  return {
    id: row.id,
    name: row.name,
    grade: row.grade,
    ownerId: row.owner_id,
    memberCount,
    createdAt: row.created_at,
  };
}

export function mapExamAssignment(row: ExamAssignmentRow): ExamAssignment {
  return {
    id: row.id,
    examId: row.exam_id,
    targetType: row.target_type,
    targetId: row.target_id,
    sourceClassId: row.source_class_id,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at,
    availableFrom: row.available_from,
    deadline: row.deadline,
    attemptLimit: row.attempt_limit,
    status: row.status,
    settings: row.settings ?? {},
    createdAt: row.created_at,
  };
}

export function mapMedia(row: MediaRow): MediaRecord {
  return {
    id: row.id,
    url: row.url,
    publicId: row.public_id,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}
