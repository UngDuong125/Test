import { AppError } from '../../domain/errors.js';
import { isEnrollableStatus } from '../../domain/students.js';
import type { ClassMember, ClassRecord, PublicUser } from '../../types/domain.js';
import {
  addMembers,
  createClass,
  deleteClass,
  findClassById,
  listClasses,
  listClassesForStudent,
  listMemberUserIds,
  listMembers,
  removeMember,
  updateClass,
} from '../../repositories/classes.repository.js';
import { syncOpenClassAssignments } from '../assignments/assignments.service.js';
import {
  findUserByEmail,
  findUserByUsername,
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
  input: { userIds?: string[]; emails?: string[]; usernames?: string[]; syncAssignments?: boolean },
): Promise<{
  added: ClassMember[];
  errors: { identifier: string; code: string; message: string }[];
  syncedAssignments: number;
  syncWarnings: string[];
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
    if (!isEnrollableStatus(user.status)) {
      errors.push({
        identifier: userId,
        code: 'STUDENT_NOT_ACTIVE',
        message: 'Student account is locked or disabled',
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
    if (!isEnrollableStatus(user.status)) {
      errors.push({
        identifier: email,
        code: 'STUDENT_NOT_ACTIVE',
        message: 'Student account is locked or disabled',
      });
      continue;
    }
    resolvedIds.add(user.id);
  }

  for (const username of input.usernames ?? []) {
    const user = await findUserByUsername(username.trim());
    if (!user) {
      errors.push({ identifier: username, code: 'USER_NOT_FOUND', message: 'Username not found' });
      continue;
    }
    if (user.role !== 'student') {
      errors.push({ identifier: username, code: 'NOT_STUDENT', message: 'Only students can join a class' });
      continue;
    }
    if (!isEnrollableStatus(user.status)) {
      errors.push({
        identifier: username,
        code: 'STUDENT_NOT_ACTIVE',
        message: 'Student account is locked or disabled',
      });
      continue;
    }
    resolvedIds.add(user.id);
  }

  if (resolvedIds.size === 0) {
    throw new AppError(422, 'No valid students to add', 'NO_VALID_MEMBERS', { errors });
  }

  const before = new Set(await listMemberUserIds(classId));
  await addMembers(classId, [...resolvedIds]);
  const members = await listMembers(classId);
  const added = members.filter((m) => resolvedIds.has(m.userId));

  // Only students who were not in the class yet get the class's open exams.
  const newcomers = [...resolvedIds].filter((id) => !before.has(id));
  const sync =
    input.syncAssignments && newcomers.length > 0
      ? await syncOpenClassAssignments(actor, classId, newcomers)
      : { created: 0, warnings: [] };

  return { added, errors, syncedAssignments: sync.created, syncWarnings: sync.warnings };
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
