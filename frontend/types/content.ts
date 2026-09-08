import type { TagKey } from './auth';

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
  explanation: { text?: string; steps?: string[] };
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
  /** Minutes; 0 = unlimited (assignment deadline still applies). */
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
  examTitle?: string;
  targetEmail?: string;
  targetUsername?: string;
}

export type AttemptStatus =
  | 'in_progress'
  | 'submitted'
  | 'needs_grading'
  | 'graded'
  | 'expired'
  | 'cancelled';

export type StudentAnswerValue = string | string[] | number | null;

export interface Attempt {
  id: string;
  assignmentId: string;
  userId: string;
  examId: string;
  examVersion: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt: string | null;
  expiresAt: string | null;
  score: number | null;
  maxScore: number;
  percentage: number | null;
}

export interface AttemptAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  value: StudentAnswerValue;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  feedback: string | null;
  answeredAt: string;
}

export interface SnapshotQuestion {
  id: string;
  type: QuestionType;
  content: ContentBlock[];
  options: QuestionOption[];
  answer?: QuestionAnswer;
  explanation?: { text?: string; steps?: string[] };
  points: number;
  version: number;
  sectionId: string | null;
  order: number;
  requiresManualGrade?: boolean;
}

export interface AttemptSnapshot {
  exam: {
    id: string;
    title: string;
    description: string;
    subjectId: TagKey;
    grade: number;
    type: ExamType;
    duration: number;
    totalPoints: number;
    instructions: string;
    settings: ExamSettings;
    version: number;
  };
  sections: ExamSection[];
  questions: SnapshotQuestion[];
  effectiveSettings: ExamSettings;
}

export interface AttemptDetail {
  attempt: Attempt;
  snapshot: AttemptSnapshot;
  answers: AttemptAnswer[];
  remainingAttempts?: number;
  showExplanation?: boolean;
  answerKeysLocked?: boolean;
}
