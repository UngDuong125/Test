import { AppError } from '../../domain/errors.js';
import type { ClassMember, ClassRecord, PublicUser } from '../../types/domain.js';
import {
  addMembers,
  createClass,
  deleteClass,
  findClassById,
  listClasses,
  listClassesForStudent,
  listMembers,
  removeMember,
  updateClass,
} from '../../repositories/classes.repository.js';
import {
  findUserByEmail,
  findUserById,
} from '../../repositories/users.repository.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

async function getManagedClass(actor: PublicUser, classId: string): Promise<ClassRecord> {
  const cls = await findClassById(classId);
  if (!cls) throw new AppError(404, 'Class not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && cls.ownerId !== actor.id) {
    throw new AppError(403, 'Not the class owner', 'FORBIDDEN');
  }
  return cls;
}

export async function listClassesForUser(
  actor: PublicUser,
  filters: { ownerId?: string; limit?: number; offset?: number },
) {
  assertTeacherOrAdmin(actor);
  const ownerId = actor.role === 'admin' ? filters.ownerId : actor.id;
  return listClasses({ ...filters, ownerId });
}

export async function getClassForUser(actor: PublicUser, id: string) {
  assertTeacherOrAdmin(actor);
  return getManagedClass(actor, id);
}

export async function createClassForUser(
  actor: PublicUser,
  input: { name: string; grade: number },
) {
  assertTeacherOrAdmin(actor);
  try {
    return await createClass({
      name: input.name,
      grade: input.grade,
      ownerId: actor.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('classes_owner_name_unique') || message.includes('duplicate')) {
      throw new AppError(409, 'Class name already exists for this owner', 'CLASS_NAME_EXISTS');
    }
    throw err;
  }
}

export async function updateClassForUser(
  actor: PublicUser,
  id: string,
  patch: { name?: string; grade?: number },
) {
  await getManagedClass(actor, id);
  try {
    return await updateClass(id, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('classes_owner_name_unique') || message.includes('duplicate')) {
      throw new AppError(409, 'Class name already exists for this owner', 'CLASS_NAME_EXISTS');
    }
    throw err;
  }
}

export async function deleteClassForUser(actor: PublicUser, id: string) {
  await getManagedClass(actor, id);
  await deleteClass(id);
}

export async function listMembersForUser(actor: PublicUser, classId: string) {
  await getManagedClass(actor, classId);
  return listMembers(classId);
}

export async function addMembersForUser(
  actor: PublicUser,
  classId: string,
  input: { userIds?: string[]; emails?: string[] },
): Promise<{
  added: ClassMember[];
  errors: { identifier: string; code: string; message: string }[];
}> {
  await getManagedClass(actor, classId);

  const errors: { identifier: string; code: string; message: string }[] = [];
  const resolvedIds = new Set<string>();

  for (const userId of input.userIds ?? []) {
    const user = await findUserById(userId);
    if (!user) {
      errors.push({ identifier: userId, code: 'USER_NOT_FOUND', message: 'User not found' });
      continue;
    }
    if (user.role !== 'student') {
      errors.push({
        identifier: userId,
        code: 'NOT_STUDENT',
        message: 'Only students can join a class',
      });
      continue;
    }
    if (user.status !== 'active') {
      errors.push({
        identifier: userId,
        code: 'STUDENT_NOT_ACTIVE',
        message: 'Student must be active',
      });
      continue;
    }
    resolvedIds.add(user.id);
  }

  for (const email of input.emails ?? []) {
    const user = await findUserByEmail(email.toLowerCase());
    if (!user) {
      errors.push({ identifier: email, code: 'USER_NOT_FOUND', message: 'Email not found' });
      continue;
    }
    if (user.role !== 'student') {
      errors.push({
        identifier: email,
        code: 'NOT_STUDENT',
        message: 'Only students can join a class',
      });
      continue;
    }
    if (user.status !== 'active') {
      errors.push({
        identifier: email,
        code: 'STUDENT_NOT_ACTIVE',
        message: 'Student must be active',
      });
      continue;
    }
    resolvedIds.add(user.id);
  }

  if (resolvedIds.size === 0) {
    throw new AppError(422, 'No valid students to add', 'NO_VALID_MEMBERS', { errors });
  }

  await addMembers(classId, [...resolvedIds]);
  const members = await listMembers(classId);
  const added = members.filter((m) => resolvedIds.has(m.userId));

  return { added, errors };
}

export async function removeMemberForUser(
  actor: PublicUser,
  classId: string,
  userId: string,
) {
  await getManagedClass(actor, classId);
  const ok = await removeMember(classId, userId);
  if (!ok) throw new AppError(404, 'Member not found', 'NOT_FOUND');
}

export async function listMyClasses(actor: PublicUser) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Only students can list their own classes here', 'FORBIDDEN');
  }
  return listClassesForStudent(actor.id);
}
