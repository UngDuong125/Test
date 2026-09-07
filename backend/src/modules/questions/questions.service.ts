import { AppError } from '../../domain/errors.js';
import type {
  ContentBlock,
  PublicUser,
  Question,
  QuestionOption,
  TagKey,
} from '../../types/domain.js';
import {
  addQuestionsToBank,
  findQuestionBankById,
} from '../../repositories/questionBanks.repository.js';
import {
  createQuestion,
  deleteQuestion,
  findQuestionById,
  listQuestions,
  replaceQuestionOptions,
  replaceQuestionTopics,
  updateQuestionRow,
  type QuestionListFilters,
} from '../../repositories/questions.repository.js';
import {
  findTopicsByIds,
  mediaExists,
  subjectExists,
} from '../../repositories/taxonomy.repository.js';
import {
  assertQuestionPayloadValid,
  canEditQuestionContent,
} from './question.validation.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

function assertCanManageQuestion(actor: PublicUser, question: Question) {
  assertTeacherOrAdmin(actor);
  if (actor.role === 'admin') return;
  if (question.createdBy !== actor.id) {
    throw new AppError(403, 'Not the question owner', 'FORBIDDEN');
  }
}

async function assertMediaBlocksExist(content: ContentBlock[]) {
  for (const block of content) {
    if (block.type === 'image') {
      const ok = await mediaExists(block.mediaId);
      if (!ok) {
        throw new AppError(422, `Media ${block.mediaId} not found`, 'MEDIA_NOT_FOUND');
      }
    }
  }
}

function optionContentBlocks(options: QuestionOption[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const opt of options) {
    const c = opt.content;
    if (Array.isArray(c)) {
      for (const block of c) {
        if (block && typeof block === 'object' && 'type' in block) {
          blocks.push(block as ContentBlock);
        }
      }
    } else if (c && typeof c === 'object' && 'type' in c) {
      blocks.push(c as ContentBlock);
    }
  }
  return blocks;
}

async function assertQuestionMediaExist(content: ContentBlock[], options: QuestionOption[]) {
  await assertMediaBlocksExist(content);
  await assertMediaBlocksExist(optionContentBlocks(options));
}

async function assertTopicsValid(topicIds: string[], subjectId: TagKey) {
  if (!topicIds.length) return;
  const topics = await findTopicsByIds(topicIds);
  if (topics.length !== topicIds.length) {
    throw new AppError(422, 'One or more topics not found', 'TOPIC_NOT_FOUND');
  }
  for (const t of topics) {
    if (t.subjectId !== subjectId) {
      throw new AppError(422, `Topic ${t.id} does not belong to subject ${subjectId}`, 'TOPIC_SUBJECT_MISMATCH');
    }
  }
}

export async function createQuestionForUser(
  actor: PublicUser,
  input: {
    type: Question['type'];
    subjectId: TagKey;
    grade: number;
    topicIds: string[];
    difficulty: Question['difficulty'];
    content: ContentBlock[];
    options: QuestionOption[];
    answer: Question['answer'];
    explanation: Question['explanation'];
    points: number;
    tags: string[];
    bankId?: string;
  },
): Promise<Question> {
  assertTeacherOrAdmin(actor);

  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }

  assertQuestionPayloadValid(input);
  await assertQuestionMediaExist(input.content, input.options);
  await assertTopicsValid(input.topicIds, input.subjectId);

  if (input.bankId) {
    const bank = await findQuestionBankById(input.bankId);
    if (!bank) throw new AppError(404, 'Question bank not found', 'BANK_NOT_FOUND');
    if (actor.role !== 'admin' && bank.ownerId !== actor.id) {
      throw new AppError(403, 'Not the bank owner', 'FORBIDDEN');
    }
    if (bank.subjectId !== input.subjectId || bank.grade !== input.grade) {
      throw new AppError(422, 'Question subject/grade must match bank', 'BANK_MISMATCH');
    }
  }

  const question = await createQuestion({
    ...input,
    createdBy: actor.id,
  });

  if (input.bankId) {
    await addQuestionsToBank(input.bankId, [question.id]);
  }

  return question;
}

export async function getQuestionForUser(
  actor: PublicUser,
  id: string,
): Promise<Question> {
  assertTeacherOrAdmin(actor);
  const question = await findQuestionById(id);
  if (!question) throw new AppError(404, 'Question not found', 'NOT_FOUND');
  if (
    actor.role !== 'admin' &&
    question.createdBy !== actor.id &&
    question.status !== 'published'
  ) {
    throw new AppError(404, 'Question not found', 'NOT_FOUND');
  }
  return question;
}

export async function listQuestionsForUser(
  actor: PublicUser,
  filters: Omit<QuestionListFilters, 'viewerId' | 'viewerIsAdmin'>,
) {
  assertTeacherOrAdmin(actor);
  return listQuestions({
    ...filters,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function updateQuestionForUser(
  actor: PublicUser,
  id: string,
  patch: Partial<{
    type: Question['type'];
    subjectId: TagKey;
    grade: number;
    topicIds: string[];
    difficulty: Question['difficulty'];
    content: ContentBlock[];
    options: QuestionOption[];
    answer: Question['answer'];
    explanation: Question['explanation'];
    points: number;
    tags: string[];
  }>,
): Promise<Question> {
  const existing = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, existing);

  if (!canEditQuestionContent(existing.status) && existing.status === 'published') {
    throw new AppError(
      422,
      'Published questions cannot be edited; duplicate or archive first',
      'QUESTION_LOCKED',
    );
  }
  if (existing.status === 'archived') {
    throw new AppError(422, 'Archived questions cannot be edited', 'QUESTION_ARCHIVED');
  }

  const next = {
    type: patch.type ?? existing.type,
    subjectId: patch.subjectId ?? existing.subjectId,
    grade: patch.grade ?? existing.grade,
    topicIds: patch.topicIds ?? existing.topicIds,
    difficulty: patch.difficulty ?? existing.difficulty,
    content: patch.content ?? existing.content,
    options: patch.options ?? existing.options,
    answer: patch.answer ?? existing.answer,
    explanation: patch.explanation ?? existing.explanation,
    points: patch.points ?? existing.points,
    tags: patch.tags ?? existing.tags,
  };

  assertQuestionPayloadValid(next);
  await assertQuestionMediaExist(next.content, next.options);
  await assertTopicsValid(next.topicIds, next.subjectId);

  if (patch.options) {
    await replaceQuestionOptions(id, next.options);
  }
  if (patch.topicIds) {
    await replaceQuestionTopics(id, next.topicIds);
  }

  return updateQuestionRow(id, {
    type: next.type,
    subject_id: next.subjectId,
    grade: next.grade,
    difficulty: next.difficulty,
    content: next.content,
    answer: next.answer,
    explanation: next.explanation,
    points: next.points,
    tags: next.tags,
  });
}

export async function deleteQuestionForUser(actor: PublicUser, id: string): Promise<void> {
  const question = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, question);
  if (question.status === 'published') {
    throw new AppError(422, 'Archive published questions instead of deleting', 'QUESTION_PUBLISHED');
  }
  await deleteQuestion(id);
}

export async function submitQuestionReview(actor: PublicUser, id: string): Promise<Question> {
  const question = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, question);
  if (question.status !== 'draft') {
    throw new AppError(422, 'Only draft questions can be submitted for review', 'INVALID_STATUS');
  }
  assertQuestionPayloadValid(question);
  return updateQuestionRow(id, { status: 'review' });
}

export async function publishQuestion(actor: PublicUser, id: string): Promise<Question> {
  const question = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, question);
  // MVP: allow draft → published or review → published
  if (question.status !== 'draft' && question.status !== 'review') {
    throw new AppError(422, 'Only draft/review questions can be published', 'INVALID_STATUS');
  }
  assertQuestionPayloadValid(question);
  await assertQuestionMediaExist(question.content, question.options);
  return updateQuestionRow(id, {
    status: 'published',
    version: question.version + (question.status === 'review' || question.status === 'draft' ? 1 : 0),
  });
}

export async function archiveQuestion(actor: PublicUser, id: string): Promise<Question> {
  const question = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, question);
  if (question.status !== 'published') {
    throw new AppError(422, 'Only published questions can be archived', 'INVALID_STATUS');
  }
  return updateQuestionRow(id, { status: 'archived' });
}

/** Return review → draft (optional reject). */
export async function rejectQuestionReview(actor: PublicUser, id: string): Promise<Question> {
  const question = await getQuestionForUser(actor, id);
  assertCanManageQuestion(actor, question);
  if (question.status !== 'review') {
    throw new AppError(422, 'Only review questions can be returned to draft', 'INVALID_STATUS');
  }
  return updateQuestionRow(id, { status: 'draft' });
}

export async function duplicateQuestion(actor: PublicUser, id: string): Promise<Question> {
  const source = await getQuestionForUser(actor, id);
  assertTeacherOrAdmin(actor);
  return createQuestion({
    type: source.type,
    subjectId: source.subjectId,
    grade: source.grade,
    difficulty: source.difficulty,
    content: source.content,
    answer: source.answer,
    explanation: source.explanation,
    points: source.points,
    tags: source.tags,
    createdBy: actor.id,
    options: source.options,
    topicIds: source.topicIds,
  });
}
