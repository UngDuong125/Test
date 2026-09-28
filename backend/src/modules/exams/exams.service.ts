import { AppError } from '../../domain/errors.js';
import type {
  Difficulty,
  Exam,
  ExamQuestion,
  ExamSection,
  ExamSettings,
  ExamType,
  PublicUser,
  Question,
  TagKey,
} from '../../types/domain.js';
import { DEFAULT_EXAM_SETTINGS } from '../../types/domain.js';
import {
  addExamQuestion,
  addExamQuestionsBulk,
  createExam,
  createExamSection,
  deleteExam,
  deleteExamSection,
  findExamById,
  findExamSectionById,
  listExamQuestions,
  listExams,
  listExamSections,
  nextExamQuestionOrder,
  nextExamSectionOrder,
  removeExamQuestion,
  updateExamQuestion,
  updateExamRow,
  updateExamSection,
} from '../../repositories/exams.repository.js';
import {
  addQuestionsToBank,
  findQuestionBankById,
  findQuestionIdsInAnyBank,
} from '../../repositories/questionBanks.repository.js';
import {
  createQuestion,
  deleteQuestion,
  findQuestionsByIds,
  updateQuestionRow,
} from '../../repositories/questions.repository.js';
import { mediaExists, subjectExists } from '../../repositories/taxonomy.repository.js';
import { assertTopicsValidForQuestion } from '../taxonomy/topics.service.js';
import {
  assertQuestionPayloadValid,
  collectQuestionPayloadIssues,
} from '../questions/question.validation.js';
import { selectRandomQuestions } from '../question-banks/random.selection.js';

export type ExamValidationIssue = {
  code: string;
  message: string;
  questionId?: string;
};

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

function assertCanManageExam(actor: PublicUser, exam: Exam) {
  assertTeacherOrAdmin(actor);
  if (actor.role === 'admin') return;
  if (exam.ownerId !== actor.id) {
    throw new AppError(403, 'Not the exam owner', 'FORBIDDEN');
  }
}

function assertExamEditable(exam: Exam) {
  if (exam.status === 'archived') {
    throw new AppError(422, 'Archived exams cannot be edited', 'EXAM_ARCHIVED');
  }
  if (exam.status === 'published') {
    throw new AppError(
      422,
      'Published exams cannot change structure; archive or duplicate first',
      'EXAM_LOCKED',
    );
  }
}

export async function getExamDetail(examId: string): Promise<{
  exam: Exam;
  sections: ExamSection[];
  questions: ExamQuestion[];
  questionDetails: Question[];
}> {
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  const [sections, questions] = await Promise.all([
    listExamSections(examId),
    listExamQuestions(examId),
  ]);
  const questionDetails = await findQuestionsByIds(questions.map((eq) => eq.questionId));
  return { exam, sections, questions, questionDetails };
}

export async function getExamForUser(actor: PublicUser, id: string) {
  assertTeacherOrAdmin(actor);
  const detail = await getExamDetail(id);
  if (actor.role !== 'admin' && detail.exam.ownerId !== actor.id) {
    throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  }
  return detail;
}

export async function listExamsForUser(
  actor: PublicUser,
  filters: {
    subjectId?: TagKey;
    grade?: number;
    type?: ExamType;
    status?: Exam['status'];
    ownerId?: string;
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  return listExams({
    ...filters,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function createExamForUser(
  actor: PublicUser,
  input: {
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
  },
): Promise<Exam> {
  assertTeacherOrAdmin(actor);
  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  return createExam({
    ...input,
    settings: input.settings ?? DEFAULT_EXAM_SETTINGS,
    createdBy: actor.id,
    ownerId: actor.id,
  });
}

export async function updateExamForUser(
  actor: PublicUser,
  id: string,
  patch: Partial<{
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
  }>,
): Promise<Exam> {
  const { exam } = await getExamForUser(actor, id);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);

  if (patch.subjectId && !(await subjectExists(patch.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }

  return updateExamRow(id, {
    title: patch.title,
    description: patch.description,
    subject_id: patch.subjectId,
    grade: patch.grade,
    type: patch.type,
    difficulty: patch.difficulty,
    duration: patch.duration,
    total_points: patch.totalPoints,
    instructions: patch.instructions,
    settings: patch.settings,
  });
}

export async function deleteExamForUser(actor: PublicUser, id: string): Promise<void> {
  const { exam } = await getExamForUser(actor, id);
  assertCanManageExam(actor, exam);
  if (exam.status === 'published') {
    throw new AppError(422, 'Archive published exams instead of deleting', 'EXAM_PUBLISHED');
  }
  await deleteExam(id);
}

export async function addSectionForUser(
  actor: PublicUser,
  examId: string,
  input: { title: string; description: string; order?: number },
): Promise<ExamSection> {
  const { exam } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);
  const order = input.order ?? (await nextExamSectionOrder(examId));
  return createExamSection({
    examId,
    title: input.title,
    description: input.description,
    order,
  });
}

export async function updateSectionForUser(
  actor: PublicUser,
  examId: string,
  sectionId: string,
  patch: Partial<{ title: string; description: string; order: number }>,
): Promise<ExamSection> {
  const { exam } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);
  const section = await findExamSectionById(examId, sectionId);
  if (!section) throw new AppError(404, 'Section not found', 'NOT_FOUND');
  return updateExamSection(sectionId, patch);
}

export async function deleteSectionForUser(
  actor: PublicUser,
  examId: string,
  sectionId: string,
): Promise<void> {
  const { exam } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);
  const section = await findExamSectionById(examId, sectionId);
  if (!section) throw new AppError(404, 'Section not found', 'NOT_FOUND');
  await deleteExamSection(sectionId);
}

export async function addQuestionsToExamForUser(
  actor: PublicUser,
  examId: string,
  input: {
    questionIds: string[];
    sectionId?: string | null;
    points?: number;
  },
): Promise<{ questions: ExamQuestion[]; questionDetails: Question[] }> {
  const { exam, questions: existing } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);

  if (input.sectionId) {
    const section = await findExamSectionById(examId, input.sectionId);
    if (!section) throw new AppError(404, 'Section not found', 'NOT_FOUND');
  }

  const qs = await findQuestionsByIds(input.questionIds);
  if (qs.length !== input.questionIds.length) {
    throw new AppError(422, 'One or more questions not found', 'QUESTION_NOT_FOUND');
  }

  const existingIds = new Set(existing.map((eq) => eq.questionId));
  let order = await nextExamQuestionOrder(examId);
  const added: ExamQuestion[] = [];

  for (const q of qs) {
    if (existingIds.has(q.id)) {
      throw new AppError(409, `Question ${q.id} already on exam`, 'QUESTION_ALREADY_ON_EXAM');
    }
    if (q.subjectId !== exam.subjectId) {
      throw new AppError(422, `Question ${q.id} subject mismatch`, 'SUBJECT_MISMATCH');
    }
    if (actor.role !== 'admin' && q.status !== 'published' && q.createdBy !== actor.id) {
      throw new AppError(403, `No access to question ${q.id}`, 'FORBIDDEN');
    }
    const eq = await addExamQuestion({
      examId,
      questionId: q.id,
      sectionId: input.sectionId ?? null,
      order,
      points: input.points ?? q.points,
    });
    added.push(eq);
    order += 1;
  }

  return { questions: added, questionDetails: qs };
}

/**
 * Composer: create Question draft (+ optional bank) and attach to exam.
 * Best-effort transaction: delete question if exam link fails.
 */
export async function createQuestionOnExamForUser(
  actor: PublicUser,
  examId: string,
  input: {
    type: Question['type'];
    subjectId?: TagKey;
    grade?: number;
    topicIds: string[];
    difficulty: Question['difficulty'];
    content: Question['content'];
    options: Question['options'];
    answer: Question['answer'];
    explanation: Question['explanation'];
    points: number;
    tags: string[];
    bankId?: string;
    sectionId?: string | null;
    examPoints?: number;
  },
): Promise<{ question: Question; examQuestion: ExamQuestion }> {
  const { exam } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);

  const subjectId = input.subjectId ?? exam.subjectId;
  const grade = input.grade ?? exam.grade;
  if (subjectId !== exam.subjectId) {
    throw new AppError(422, 'Question subject must match exam', 'SUBJECT_MISMATCH');
  }
  if (grade !== exam.grade) {
    throw new AppError(422, 'Question grade must match exam', 'GRADE_MISMATCH');
  }

  if (input.sectionId) {
    const section = await findExamSectionById(examId, input.sectionId);
    if (!section) throw new AppError(404, 'Section not found', 'NOT_FOUND');
  }

  assertQuestionPayloadValid({
    type: input.type,
    content: input.content,
    options: input.options,
    answer: input.answer,
    points: input.points,
  });

  for (const block of input.content) {
    if (block.type === 'image') {
      const ok = await mediaExists(block.mediaId);
      if (!ok) {
        throw new AppError(422, `Media ${block.mediaId} not found`, 'MEDIA_NOT_FOUND');
      }
    }
  }

  await assertTopicsValidForQuestion(input.topicIds, subjectId, grade);

  if (input.bankId) {
    const bank = await findQuestionBankById(input.bankId);
    if (!bank) throw new AppError(404, 'Question bank not found', 'BANK_NOT_FOUND');
    if (actor.role !== 'admin' && bank.ownerId !== actor.id) {
      throw new AppError(403, 'Not the bank owner', 'FORBIDDEN');
    }
    if (bank.subjectId !== subjectId || bank.grade !== grade) {
      throw new AppError(422, 'Question subject/grade must match bank', 'BANK_MISMATCH');
    }
  }

  const question = await createQuestion({
    type: input.type,
    subjectId,
    grade,
    difficulty: input.difficulty,
    content: input.content,
    answer: input.answer,
    explanation: input.explanation,
    points: input.points,
    tags: input.tags,
    createdBy: actor.id,
    options: input.options,
    topicIds: input.topicIds,
  });

  try {
    if (input.bankId) {
      await addQuestionsToBank(input.bankId, [question.id]);
    }

    const order = await nextExamQuestionOrder(examId);
    const examQuestion = await addExamQuestion({
      examId,
      questionId: question.id,
      sectionId: input.sectionId ?? null,
      order,
      points: input.examPoints ?? input.points,
    });

    return { question, examQuestion };
  } catch (err) {
    try {
      await deleteQuestion(question.id);
    } catch {
      // ignore cleanup failure
    }
    throw err;
  }
}

export async function updateExamQuestionForUser(
  actor: PublicUser,
  examId: string,
  questionId: string,
  patch: Partial<{ sectionId: string | null; order: number; points: number }>,
): Promise<ExamQuestion> {
  const { exam, questions } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);

  if (!questions.some((q) => q.questionId === questionId)) {
    throw new AppError(404, 'Exam question not found', 'NOT_FOUND');
  }
  if (patch.sectionId) {
    const section = await findExamSectionById(examId, patch.sectionId);
    if (!section) throw new AppError(404, 'Section not found', 'NOT_FOUND');
  }

  return updateExamQuestion(examId, questionId, {
    section_id: patch.sectionId,
    order: patch.order,
    points: patch.points,
  });
}

export async function removeExamQuestionForUser(
  actor: PublicUser,
  examId: string,
  questionId: string,
): Promise<void> {
  const { exam, questions } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  assertExamEditable(exam);
  if (!questions.some((q) => q.questionId === questionId)) {
    throw new AppError(404, 'Exam question not found', 'NOT_FOUND');
  }
  await removeExamQuestion(examId, questionId);
}

export async function validateExamForPublish(
  actor: PublicUser,
  examId: string,
): Promise<{
  ok: boolean;
  errors: ExamValidationIssue[];
  warnings: ExamValidationIssue[];
  sumPoints: number;
  totalPoints: number;
  draftQuestionIds: string[];
}> {
  const detail = await getExamForUser(actor, examId);
  assertCanManageExam(actor, detail.exam);

  const errors: ExamValidationIssue[] = [];
  const warnings: ExamValidationIssue[] = [];

  if (detail.exam.status !== 'draft') {
    errors.push({
      code: 'INVALID_STATUS',
      message: 'Only draft exams can be published',
    });
  }
  if (!detail.questions.length) {
    errors.push({ code: 'EMPTY_EXAM', message: 'Exam must contain at least one question' });
  }

  const byId = new Map(detail.questionDetails.map((q) => [q.id, q]));
  const draftQuestionIds: string[] = [];

  for (const eq of detail.questions) {
    const q = byId.get(eq.questionId);
    if (!q) {
      errors.push({
        code: 'QUESTION_NOT_FOUND',
        message: `Missing question ${eq.questionId}`,
        questionId: eq.questionId,
      });
      continue;
    }

    const payloadIssues = collectQuestionPayloadIssues(q);
    for (const issue of payloadIssues) {
      errors.push({ ...issue, questionId: q.id });
    }

    if (q.status === 'draft' || q.status === 'review') {
      draftQuestionIds.push(q.id);
    } else if (q.status !== 'published') {
      errors.push({
        code: 'QUESTION_NOT_PUBLISHED',
        message: `Question ${q.id} is not published (status=${q.status})`,
        questionId: q.id,
      });
    }
  }

  const sumPoints = detail.questions.reduce((acc, eq) => acc + eq.points, 0);
  const total = detail.exam.totalPoints;
  if (total > 0 && Math.abs(sumPoints - total) > 0.001) {
    errors.push({
      code: 'POINTS_MISMATCH',
      message: `Sum of question points (${sumPoints}) must equal exam.totalPoints (${total})`,
    });
  }

  if (draftQuestionIds.length) {
    const inBank = await findQuestionIdsInAnyBank(draftQuestionIds);
    for (const id of draftQuestionIds) {
      if (!inBank.has(id)) {
        warnings.push({
          code: 'NOT_IN_BANK',
          message: `Draft question ${id} is not in any question bank`,
          questionId: id,
        });
      }
    }
    warnings.push({
      code: 'DRAFT_QUESTIONS',
      message: `${draftQuestionIds.length} draft/review question(s) need publishDraftQuestions=true`,
    });
  }

  return {
    /** No hard errors — may still need publishDraftQuestions if drafts exist. */
    ok: errors.length === 0,
    errors,
    warnings,
    sumPoints,
    totalPoints: total,
    draftQuestionIds,
  };
}

export async function publishExam(
  actor: PublicUser,
  examId: string,
  options: { publishDraftQuestions?: boolean } = {},
): Promise<{
  exam: Exam;
  sections: ExamSection[];
  questions: ExamQuestion[];
  questionDetails: Question[];
}> {
  const detail = await getExamForUser(actor, examId);
  assertCanManageExam(actor, detail.exam);

  if (detail.exam.status !== 'draft') {
    throw new AppError(422, 'Only draft exams can be published', 'INVALID_STATUS');
  }
  if (!detail.questions.length) {
    throw new AppError(422, 'Exam must contain at least one question', 'EMPTY_EXAM');
  }

  const byId = new Map(detail.questionDetails.map((q) => [q.id, q]));

  for (const eq of detail.questions) {
    const q = byId.get(eq.questionId);
    if (!q) {
      throw new AppError(422, `Missing question ${eq.questionId}`, 'QUESTION_NOT_FOUND');
    }

    if (q.status === 'draft' || q.status === 'review') {
      if (!options.publishDraftQuestions) {
        throw new AppError(
          422,
          `Question ${q.id} is not published (status=${q.status}). Confirm publishDraftQuestions.`,
          'QUESTION_NOT_PUBLISHED',
        );
      }
      assertQuestionPayloadValid(q);
      await updateQuestionRow(q.id, {
        status: 'published',
        version: q.version + 1,
      });
    } else if (q.status !== 'published') {
      throw new AppError(
        422,
        `Question ${q.id} is not published (status=${q.status})`,
        'QUESTION_NOT_PUBLISHED',
      );
    } else {
      const issues = collectQuestionPayloadIssues(q);
      if (issues.length) {
        throw new AppError(422, issues[0]!.message, issues[0]!.code);
      }
    }
  }

  const sumPoints = detail.questions.reduce((acc, eq) => acc + eq.points, 0);
  const total = detail.exam.totalPoints;
  if (total === 0) {
    await updateExamRow(examId, {
      total_points: sumPoints,
      status: 'published',
      version: detail.exam.version + 1,
    });
  } else if (Math.abs(sumPoints - total) > 0.001) {
    throw new AppError(
      422,
      `Sum of question points (${sumPoints}) must equal exam.totalPoints (${total})`,
      'POINTS_MISMATCH',
    );
  } else {
    await updateExamRow(examId, {
      status: 'published',
      version: detail.exam.version + 1,
    });
  }

  return getExamForUser(actor, examId);
}

export async function archiveExam(actor: PublicUser, examId: string) {
  const { exam } = await getExamForUser(actor, examId);
  assertCanManageExam(actor, exam);
  if (exam.status !== 'published') {
    throw new AppError(422, 'Only published exams can be archived', 'INVALID_STATUS');
  }
  return updateExamRow(examId, { status: 'archived' });
}

export async function duplicateExam(actor: PublicUser, examId: string) {
  const detail = await getExamForUser(actor, examId);
  assertTeacherOrAdmin(actor);

  const copy = await createExam({
    title: `${detail.exam.title} (copy)`,
    description: detail.exam.description,
    subjectId: detail.exam.subjectId,
    grade: detail.exam.grade,
    type: detail.exam.type,
    difficulty: detail.exam.difficulty,
    duration: detail.exam.duration,
    totalPoints: detail.exam.totalPoints,
    instructions: detail.exam.instructions,
    settings: detail.exam.settings,
    createdBy: actor.id,
    ownerId: actor.id,
  });

  const sectionIdMap = new Map<string, string>();
  for (const section of detail.sections) {
    const created = await createExamSection({
      examId: copy.id,
      title: section.title,
      description: section.description,
      order: section.order,
    });
    sectionIdMap.set(section.id, created.id);
  }

  if (detail.questions.length) {
    await addExamQuestionsBulk(
      detail.questions.map((eq) => ({
        examId: copy.id,
        questionId: eq.questionId,
        sectionId: eq.sectionId ? (sectionIdMap.get(eq.sectionId) ?? null) : null,
        order: eq.order,
        points: eq.points,
      })),
    );
  }

  return getExamForUser(actor, copy.id);
}

export async function generateExamForUser(
  actor: PublicUser,
  input: {
    title: string;
    description: string;
    subjectId: TagKey;
    grade: number;
    type: ExamType;
    difficulty: Difficulty;
    duration: number;
    bankId?: string;
    selection: {
      count: number;
      topicIds?: string[];
      difficulty?: Partial<Record<Difficulty, number>>;
      types?: Question['type'][];
    };
    sectionTitle: string;
    defaultPoints?: number;
    instructions: string;
    settings: ExamSettings;
  },
) {
  assertTeacherOrAdmin(actor);

  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }

  if (input.bankId) {
    const bank = await findQuestionBankById(input.bankId);
    if (!bank) throw new AppError(404, 'Question bank not found', 'BANK_NOT_FOUND');
    if (actor.role !== 'admin' && bank.ownerId !== actor.id) {
      throw new AppError(403, 'No access to bank', 'FORBIDDEN');
    }
    if (bank.subjectId !== input.subjectId || bank.grade !== input.grade) {
      throw new AppError(422, 'Bank subject/grade mismatch', 'BANK_MISMATCH');
    }
  }

  const { questions, warnings } = await selectRandomQuestions({
    subjectId: input.subjectId,
    grade: input.grade,
    bankId: input.bankId,
    count: input.selection.count,
    topicIds: input.selection.topicIds,
    difficulty: input.selection.difficulty,
    types: input.selection.types,
  });

  const exam = await createExam({
    title: input.title,
    description: input.description,
    subjectId: input.subjectId,
    grade: input.grade,
    type: input.type,
    difficulty: input.difficulty,
    duration: input.duration,
    totalPoints: 0,
    instructions: input.instructions,
    settings: input.settings ?? DEFAULT_EXAM_SETTINGS,
    createdBy: actor.id,
    ownerId: actor.id,
  });

  const section = await createExamSection({
    examId: exam.id,
    title: input.sectionTitle,
    description: '',
    order: 1,
  });

  const rows = questions.map((q, index) => ({
    examId: exam.id,
    questionId: q.id,
    sectionId: section.id,
    order: index + 1,
    points: input.defaultPoints ?? q.points,
  }));
  await addExamQuestionsBulk(rows);

  const totalPoints = rows.reduce((acc, r) => acc + r.points, 0);
  const updated = await updateExamRow(exam.id, { total_points: totalPoints });

  return {
    exam: {
      id: updated.id,
      status: updated.status,
      totalPoints: updated.totalPoints,
      questionCount: questions.length,
    },
    warnings,
  };
}
