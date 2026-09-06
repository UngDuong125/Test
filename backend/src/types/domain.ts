export type UserRole = 'admin' | 'teacher' | 'student';
export type UserStatus = 'invited' | 'active' | 'locked' | 'disabled';
export type AuthTokenType = 'invite' | 'password_reset';
export type TagKey = 'math' | 'lang' | 'flang' | 'sci' | 'hist_geo' | 'civic';

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'fill_blank'
  | 'short_answer'
  | 'essay'
  | 'multiple_select'
  | 'matching'
  | 'ordering'
  | 'numeric';

export type QuestionStatus = 'draft' | 'review' | 'published' | 'archived';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ExamType = 'practice' | 'quiz' | 'homework' | 'worksheet' | 'midterm' | 'final';
export type ExamStatus = 'draft' | 'published' | 'archived';

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  temporaryPasswordExpiresAt: string | null;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
}

export interface SessionRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export type ContentBlock =
  | { type: 'text'; value: string }
  | { type: 'latex'; value: string }
  | { type: 'image'; mediaId: string };

export type QuestionAnswer =
  | { type: 'single'; value: string }
  | { type: 'multiple'; value: string[] }
  | { type: 'text'; value: string[] }
  | { type: 'numeric'; value: number; tolerance?: number }
  | { type: 'manual' };

export interface QuestionExplanation {
  text?: string;
  steps?: string[];
}

export interface QuestionOption {
  id: string;
  content: ContentBlock | ContentBlock[] | Record<string, unknown>;
  order: number;
}

export interface Question {
  id: string;
  type: QuestionType;
  subjectId: TagKey;
  grade: number;
  topicIds: string[];
  difficulty: Difficulty;
  content: ContentBlock[];
  options: QuestionOption[];
  answer: QuestionAnswer;
  explanation: QuestionExplanation;
  points: number;
  tags: string[];
  status: QuestionStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionBank {
  id: string;
  name: string;
  description: string;
  subjectId: TagKey;
  grade: number;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSettings {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResult: boolean;
  showExplanation: boolean;
}

export interface Exam {
  id: string;
  title: string;
  description: string;
  subjectId: TagKey;
  grade: number;
  type: ExamType;
  difficulty: Difficulty;
  duration: number;
  totalPoints: number;
  instructions: string;
  settings: ExamSettings;
  status: ExamStatus;
  version: number;
  createdBy: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExamSection {
  id: string;
  examId: string;
  title: string;
  description: string;
  order: number;
}

export interface ExamQuestion {
  examId: string;
  sectionId: string | null;
  questionId: string;
  order: number;
  points: number;
}

export interface Topic {
  id: string;
  subjectId: TagKey;
  name: string;
  grade: number | null;
  createdAt: string;
}

export interface Subject {
  id: TagKey;
  label: string;
}

export type AssignmentStatus =
  | 'assigned'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'cancelled';

export interface ClassRecord {
  id: string;
  name: string;
  grade: number;
  ownerId: string;
  memberCount?: number;
  createdAt: string;
  updatedAt?: string;
}

export interface ClassMember {
  classId: string;
  userId: string;
  joinedAt: string;
  email?: string;
  username?: string;
  displayName?: string | null;
}

export interface ExamAssignment {
  id: string;
  examId: string;
  targetType: 'user';
  targetId: string;
  sourceClassId: string | null;
  assignedBy: string;
  assignedAt: string;
  availableFrom: string;
  deadline: string;
  attemptLimit: number;
  status: AssignmentStatus;
  settings: Partial<ExamSettings>;
  createdAt: string;
  /** Enriched on read */
  examTitle?: string;
  targetEmail?: string;
  targetUsername?: string;
}

export interface MediaRecord {
  id: string;
  url: string;
  publicId: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
  createdAt: string;
}

export const USER_ROLES: UserRole[] = ['admin', 'teacher', 'student'];
export const USER_STATUSES: UserStatus[] = ['invited', 'active', 'locked', 'disabled'];

export const TAG_KEYS: TagKey[] = ['math', 'lang', 'flang', 'sci', 'hist_geo', 'civic'];

export const QUESTION_TYPES_MVP: QuestionType[] = [
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'essay',
];

export const QUESTION_TYPES_ALL: QuestionType[] = [
  ...QUESTION_TYPES_MVP,
  'multiple_select',
  'matching',
  'ordering',
  'numeric',
];

export const EXAM_TYPES: ExamType[] = [
  'practice',
  'quiz',
  'homework',
  'worksheet',
  'midterm',
  'final',
];

export const ASSIGNMENT_STATUSES: AssignmentStatus[] = [
  'assigned',
  'available',
  'in_progress',
  'completed',
  'expired',
  'cancelled',
];

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  shuffleQuestions: false,
  shuffleOptions: true,
  showResult: true,
  showExplanation: true,
};
