import { randomUUID } from 'node:crypto';
import type {
  Attempt,
  AttemptAnswer,
  AttemptSnapshotPayload,
  Exam,
  ExamAssignment,
  ExamQuestion,
  ExpLedgerEntry,
  PublicUser,
  Question,
  QuestionAnswer,
  QuestionType,
  StudentAnswerValue,
  TagKey,
} from '../../src/types/domain.js';
import { mockModule, src } from './mock-module.js';

/** In-memory stand-in for the tables touched by attempts / grading / EXP. */
export const db = {
  exams: new Map<string, Exam>(),
  examQuestions: [] as ExamQuestion[],
  questions: new Map<string, Question>(),
  assignments: new Map<string, ExamAssignment>(),
  attempts: new Map<string, Attempt>(),
  snapshots: new Map<string, AttemptSnapshotPayload>(),
  answers: [] as AttemptAnswer[],
  expLedger: new Map<string, ExpLedgerEntry>(),
  subjectExp: new Map<string, number>(),
  gradingRecords: [] as { attemptId: string; gradedBy: string; notes: string | null }[],
  teacherStudents: new Set<string>(),
};

export function resetDb() {
  db.exams.clear();
  db.examQuestions = [];
  db.questions.clear();
  db.assignments.clear();
  db.attempts.clear();
  db.snapshots.clear();
  db.answers = [];
  db.expLedger.clear();
  db.subjectExp.clear();
  db.gradingRecords = [];
  db.teacherStudents.clear();
}

const clone = <T>(v: T): T => structuredClone(v);

export async function installFakeExamDb() {
  await mockModule(src('repositories/exams.repository.js'), {
    findExamById: async (id: string) => clone(db.exams.get(id) ?? null),
    listExamSections: async () => [],
    listExamQuestions: async (examId: string) => clone(db.examQuestions.filter((q) => q.examId === examId)),
  });

  await mockModule(src('repositories/questions.repository.js'), {
    findQuestionsByIds: async (ids: string[]) =>
      ids.map((id) => db.questions.get(id)).filter(Boolean).map((q) => clone(q!)),
  });

  await mockModule(src('repositories/classes.repository.js'), {
    isStudentInTeacherClass: async (studentId: string, teacherId: string) =>
      db.teacherStudents.has(`${teacherId}:${studentId}`),
  });

  await mockModule(src('repositories/assignments.repository.js'), {
    findAssignmentById: async (id: string) => clone(db.assignments.get(id) ?? null),
    updateAssignment: async (id: string, patch: Partial<ExamAssignment>) => {
      const next = { ...db.assignments.get(id)!, ...patch };
      db.assignments.set(id, next);
      return clone(next);
    },
  });

  await mockModule(src('repositories/users.repository.js'), {
    adjustSubjectExp: async (userId: string, subjectId: TagKey, delta: number) => {
      const key = `${userId}:${subjectId}`;
      db.subjectExp.set(key, (db.subjectExp.get(key) ?? 0) + delta);
    },
  });

  const answersOf = (attemptId: string) => db.answers.filter((a) => a.attemptId === attemptId);
  const upsertAnswer = (input: { attemptId: string; questionId: string; value: StudentAnswerValue }) => {
    const existing = db.answers.find(
      (a) => a.attemptId === input.attemptId && a.questionId === input.questionId,
    );
    const row: AttemptAnswer = {
      id: existing?.id ?? randomUUID(),
      attemptId: input.attemptId,
      questionId: input.questionId,
      value: input.value,
      isCorrect: null,
      pointsEarned: null,
      feedback: null,
      answeredAt: new Date().toISOString(),
    };
    db.answers = [...db.answers.filter((a) => a !== existing), row];
    return clone(row);
  };

  await mockModule(src('repositories/attempts.repository.js'), {
    findAttemptById: async (id: string) => clone(db.attempts.get(id) ?? null),
    findInProgressAttempt: async (assignmentId: string, userId: string) =>
      clone(
        [...db.attempts.values()].find(
          (a) => a.assignmentId === assignmentId && a.userId === userId && a.status === 'in_progress',
        ) ?? null,
      ),
    listAttemptsByAssignment: async (assignmentId: string) =>
      clone([...db.attempts.values()].filter((a) => a.assignmentId === assignmentId)),
    countAttemptsForLimit: async (assignmentId: string) =>
      [...db.attempts.values()].filter((a) => a.assignmentId === assignmentId && a.status !== 'cancelled')
        .length,
    createAttempt: async (input: {
      assignmentId: string;
      userId: string;
      examId: string;
      examVersion: number;
      maxScore: number;
      expiresAt: string | null;
    }) => {
      const attempt: Attempt = {
        id: randomUUID(),
        ...input,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        submittedAt: null,
        score: null,
        percentage: null,
      };
      db.attempts.set(attempt.id, attempt);
      return clone(attempt);
    },
    updateAttempt: async (id: string, patch: Partial<Attempt>) => {
      const next = { ...db.attempts.get(id)!, ...patch };
      db.attempts.set(id, next);
      return clone(next);
    },
    saveAttemptSnapshot: async (attemptId: string, payload: AttemptSnapshotPayload) => {
      db.snapshots.set(attemptId, clone(payload));
    },
    getAttemptSnapshot: async (attemptId: string) => clone(db.snapshots.get(attemptId) ?? null),
    listAttemptAnswers: async (attemptId: string) => clone(answersOf(attemptId)),
    upsertAttemptAnswer: async (input: { attemptId: string; questionId: string; value: StudentAnswerValue }) =>
      upsertAnswer(input),
    ensureAnswerRow: async (input: { attemptId: string; questionId: string; value?: StudentAnswerValue }) => {
      const found = answersOf(input.attemptId).find((a) => a.questionId === input.questionId);
      return found ? clone(found) : upsertAnswer({ ...input, value: input.value ?? null });
    },
    updateAnswerGrading: async (
      attemptId: string,
      questionId: string,
      patch: { isCorrect?: boolean | null; pointsEarned?: number | null; feedback?: string | null },
    ) => {
      const row = db.answers.find((a) => a.attemptId === attemptId && a.questionId === questionId)!;
      if (patch.isCorrect !== undefined) row.isCorrect = patch.isCorrect;
      if (patch.pointsEarned !== undefined) row.pointsEarned = patch.pointsEarned;
      if (patch.feedback !== undefined) row.feedback = patch.feedback;
      return clone(row);
    },
    createGradingRecord: async (input: { attemptId: string; gradedBy: string; notes?: string | null }) => {
      db.gradingRecords.push({ attemptId: input.attemptId, gradedBy: input.gradedBy, notes: input.notes ?? null });
      return { id: randomUUID(), gradedAt: new Date().toISOString(), ...input, notes: input.notes ?? null };
    },
    findExpByAttempt: async (attemptId: string) => clone(db.expLedger.get(attemptId) ?? null),
    insertExpLedger: async (input: {
      attemptId: string;
      userId: string;
      subjectId: TagKey;
      expEarned: number;
      examType: Exam['type'];
      idempotencyKey: string;
    }) => {
      const now = new Date().toISOString();
      const row = { id: randomUUID(), ...input, createdAt: now, updatedAt: now } as ExpLedgerEntry;
      db.expLedger.set(input.attemptId, row);
      return clone(row);
    },
    updateExpLedger: async (attemptId: string, expEarned: number) => {
      const row = { ...db.expLedger.get(attemptId)!, expEarned };
      db.expLedger.set(attemptId, row);
      return clone(row);
    },
  });
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export function user(role: PublicUser['role'], id = `${role}-${randomUUID().slice(0, 8)}`): PublicUser {
  return {
    id,
    email: `${id}@test.local`,
    username: id,
    displayName: null,
    role,
    status: 'active',
    mustChangePassword: false,
  };
}

export function seedQuestion(type: QuestionType, answer: QuestionAnswer, optionIds: string[] = []): Question {
  const now = new Date().toISOString();
  const q: Question = {
    id: randomUUID(),
    type,
    subjectId: 'math' as TagKey,
    grade: 7,
    topicIds: [],
    difficulty: 'medium',
    content: [{ type: 'text', value: `Câu ${type}` }],
    options: optionIds.map((id, i) => ({ id, content: [{ type: 'text', value: id }], order: i + 1 })),
    answer,
    explanation: { text: 'Giải thích' },
    points: 1,
    tags: [],
    status: 'published',
    version: 1,
    createdBy: 'teacher',
    createdAt: now,
    updatedAt: now,
  };
  db.questions.set(q.id, q);
  return q;
}

export function seedExam(opts: {
  ownerId: string;
  questions: { question: Question; points: number }[];
  type?: Exam['type'];
  duration?: number;
  showResult?: boolean;
  showExplanation?: boolean;
}): Exam {
  const now = new Date().toISOString();
  const exam: Exam = {
    id: randomUUID(),
    title: 'Kiểm tra 15 phút',
    description: '',
    subjectId: 'math' as TagKey,
    grade: 7,
    type: opts.type ?? 'practice',
    difficulty: 'medium',
    duration: opts.duration ?? 15,
    totalPoints: opts.questions.reduce((s, q) => s + q.points, 0),
    instructions: '',
    settings: {
      shuffleQuestions: false,
      shuffleOptions: false,
      showResult: opts.showResult ?? true,
      showExplanation: opts.showExplanation ?? true,
    },
    status: 'published',
    version: 1,
    createdBy: opts.ownerId,
    ownerId: opts.ownerId,
    createdAt: now,
    updatedAt: now,
  };
  db.exams.set(exam.id, exam);
  opts.questions.forEach(({ question, points }, i) => {
    db.examQuestions.push({ examId: exam.id, sectionId: null, questionId: question.id, order: i + 1, points });
  });
  return exam;
}

export function seedAssignment(opts: {
  examId: string;
  studentId: string;
  assignedBy: string;
  attemptLimit?: number;
  availableFrom?: Date;
  deadline?: Date;
}): ExamAssignment {
  const now = Date.now();
  const assignment: ExamAssignment = {
    id: randomUUID(),
    examId: opts.examId,
    targetType: 'user',
    targetId: opts.studentId,
    sourceClassId: null,
    assignedBy: opts.assignedBy,
    assignedAt: new Date(now).toISOString(),
    availableFrom: (opts.availableFrom ?? new Date(now - 60_000)).toISOString(),
    deadline: (opts.deadline ?? new Date(now + 7 * 86_400_000)).toISOString(),
    attemptLimit: opts.attemptLimit ?? 1,
    status: 'available',
    settings: {},
    createdAt: new Date(now).toISOString(),
  };
  db.assignments.set(assignment.id, assignment);
  return assignment;
}

/** Push an attempt's timer into the past, as if the student closed the tab. */
export function expireAttempt(attemptId: string) {
  const a = db.attempts.get(attemptId)!;
  db.attempts.set(attemptId, { ...a, expiresAt: new Date(Date.now() - 1000).toISOString() });
}
