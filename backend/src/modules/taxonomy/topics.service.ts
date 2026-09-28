import { AppError } from '../../domain/errors.js';
import type { PublicUser, TagKey, Topic } from '../../types/domain.js';
import {
  countTopicQuestions,
  deleteTopicRow,
  findTopicById,
  findTopicsByIds,
  insertTopic,
  listTopicQuestionGrades,
  listTopicsExactGrade,
  subjectExists,
  updateTopicRow,
} from '../../repositories/taxonomy.repository.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

function assertAdmin(actor: PublicUser) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'Only admin can modify topics', 'FORBIDDEN');
  }
}

function isPgUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === 'object' && 'code' in err && String((err as { code: string }).code) === '23505',
  );
}

export function normalizeTopicName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function sameName(a: string, b: string): boolean {
  return normalizeTopicName(a).toLocaleLowerCase('vi') === normalizeTopicName(b).toLocaleLowerCase('vi');
}

async function findDuplicate(
  subjectId: TagKey,
  name: string,
  grade: number | null,
  excludeId?: string,
): Promise<Topic | undefined> {
  const candidates = await listTopicsExactGrade(subjectId, grade);
  return candidates.find((t) => t.id !== excludeId && sameName(t.name, name));
}

/** Idempotent: returns the existing topic (`created: false`) when the name is already taken. */
export async function createTopicForUser(
  actor: PublicUser,
  input: { subjectId: TagKey; name: string; grade?: number | null },
): Promise<{ topic: Topic; created: boolean }> {
  assertTeacherOrAdmin(actor);
  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  const name = normalizeTopicName(input.name);
  if (!name) throw new AppError(422, 'Topic name is required', 'VALIDATION_ERROR');
  const grade = input.grade ?? null;

  const existing = await findDuplicate(input.subjectId, name, grade);
  if (existing) return { topic: existing, created: false };

  try {
    const topic = await insertTopic({ subjectId: input.subjectId, name, grade });
    return { topic, created: true };
  } catch (err) {
    if (!isPgUniqueViolation(err)) throw err;
    const raced = await findDuplicate(input.subjectId, name, grade);
    if (raced) return { topic: raced, created: false };
    throw err;
  }
}

export async function updateTopicForUser(
  actor: PublicUser,
  id: string,
  patch: { name?: string; grade?: number | null },
): Promise<Topic> {
  assertAdmin(actor);
  const topic = await findTopicById(id);
  if (!topic) throw new AppError(404, 'Topic not found', 'NOT_FOUND');

  const name = patch.name !== undefined ? normalizeTopicName(patch.name) : topic.name;
  if (!name) throw new AppError(422, 'Topic name is required', 'VALIDATION_ERROR');
  const grade = patch.grade !== undefined ? patch.grade : topic.grade;

  if (await findDuplicate(topic.subjectId, name, grade, id)) {
    throw new AppError(409, 'A topic with this name already exists', 'TOPIC_DUPLICATE');
  }

  if (grade !== null && grade !== topic.grade) {
    const grades = await listTopicQuestionGrades(id);
    if (grades.some((g) => g !== grade)) {
      throw new AppError(
        409,
        'Topic is linked to questions of another grade',
        'TOPIC_GRADE_CONFLICT',
      );
    }
  }

  try {
    return await updateTopicRow(id, { name, grade });
  } catch (err) {
    if (isPgUniqueViolation(err)) {
      throw new AppError(409, 'A topic with this name already exists', 'TOPIC_DUPLICATE');
    }
    throw err;
  }
}

export async function deleteTopicForUser(actor: PublicUser, id: string): Promise<void> {
  assertAdmin(actor);
  const topic = await findTopicById(id);
  if (!topic) throw new AppError(404, 'Topic not found', 'NOT_FOUND');
  const used = await countTopicQuestions(id);
  if (used > 0) {
    throw new AppError(409, `Topic is linked to ${used} question(s)`, 'TOPIC_IN_USE');
  }
  await deleteTopicRow(id);
}

/** Topic rule from _cross-cutting.md: same subject, and grade null or equal to the question grade. */
export async function assertTopicsValidForQuestion(
  topicIds: string[],
  subjectId: TagKey,
  grade: number,
): Promise<void> {
  if (!topicIds.length) return;
  const unique = [...new Set(topicIds)];
  const topics = await findTopicsByIds(unique);
  if (topics.length !== unique.length) {
    throw new AppError(422, 'One or more topics not found', 'TOPIC_NOT_FOUND');
  }
  for (const t of topics) {
    if (t.subjectId !== subjectId) {
      throw new AppError(
        422,
        `Topic ${t.id} does not belong to subject ${subjectId}`,
        'TOPIC_SUBJECT_MISMATCH',
      );
    }
    if (t.grade !== null && t.grade !== grade) {
      throw new AppError(
        422,
        `Topic ${t.id} is for grade ${t.grade}, not ${grade}`,
        'TOPIC_GRADE_MISMATCH',
      );
    }
  }
}
