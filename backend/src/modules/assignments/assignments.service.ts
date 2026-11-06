import { AppError } from '../../domain/errors.js';
import { isEnrollableStatus } from '../../domain/students.js';
import type {
  AssignmentStatus,
  ExamAssignment,
  ExamSettings,
  PublicUser,
} from '../../types/domain.js';
import {
  attachExamTitles,
  createAssignment,
  enrichAssignments,
  findActiveAssignment,
  findAssignmentById,
  listAssignments,
  updateAssignment,
} from '../../repositories/assignments.repository.js';
import {
  countAttemptsForLimit,
  isFinishedAttemptStatus,
  listAttemptSummariesForAssignments,
} from '../../repositories/attempts.repository.js';
import {
  findClassById,
  isStudentInTeacherClass,
  listMemberUserIds,
} from '../../repositories/classes.repository.js';
import { findExamById } from '../../repositories/exams.repository.js';
import { findUserById } from '../../repositories/users.repository.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

/** Derive status from window + cancelled; in_progress/completed set by attempts module. */
export function deriveAssignmentStatus(
  assignment: ExamAssignment,
  now = new Date(),
): AssignmentStatus {
  if (assignment.status === 'cancelled') return 'cancelled';
  if (assignment.status === 'completed') return 'completed';
  if (assignment.status === 'in_progress') return 'in_progress';

  const from = new Date(assignment.availableFrom);
  const deadline = new Date(assignment.deadline);

  if (now > deadline) return 'expired';
  if (now < from) return 'assigned';
  return 'available';
}

/**
 * Status after a teacher changes deadline or attempt limit. An assignment that was
 * `completed` because every attempt was used becomes open again when the limit grows;
 * an `expired` one becomes open again when the deadline moves into the future.
 */
export function deriveStatusAfterUpdate(
  assignment: ExamAssignment,
  usedAttempts: number,
  now = new Date(),
): AssignmentStatus {
  const reopened =
    assignment.status === 'completed' && usedAttempts < assignment.attemptLimit
      ? { ...assignment, status: 'available' as AssignmentStatus }
      : assignment;
  return deriveAssignmentStatus(reopened, now);
}

async function withDerivedStatus(assignment: ExamAssignment): Promise<ExamAssignment> {
  const derived = deriveAssignmentStatus(assignment);
  if (derived !== assignment.status && assignment.status !== 'cancelled') {
    // Persist soft transitions for assigned/available/expired
    if (
      (assignment.status === 'assigned' || assignment.status === 'available') &&
      (derived === 'assigned' || derived === 'available' || derived === 'expired')
    ) {
      try {
        return await updateAssignment(assignment.id, { status: derived });
      } catch {
        return { ...assignment, status: derived };
      }
    }
  }
  return { ...assignment, status: derived };
}

async function assertCanAssignExam(actor: PublicUser, examId: string) {
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (exam.status === 'archived') {
    throw new AppError(422, 'Cannot assign archived exam', 'EXAM_ARCHIVED');
  }
  if (exam.status !== 'published') {
    throw new AppError(422, 'Only published exams can be assigned', 'EXAM_NOT_PUBLISHED');
  }
  if (actor.role === 'teacher' && exam.ownerId !== actor.id) {
    throw new AppError(403, 'Not the exam owner', 'FORBIDDEN');
  }
  return exam;
}

async function assertCanTargetStudent(actor: PublicUser, studentId: string) {
  const user = await findUserById(studentId);
  if (!user) throw new AppError(404, 'Student not found', 'NOT_FOUND');
  if (user.role !== 'student') {
    throw new AppError(422, 'Target must be a student', 'NOT_STUDENT');
  }
  if (!isEnrollableStatus(user.status)) {
    throw new AppError(422, 'Student account is locked or disabled', 'STUDENT_NOT_ACTIVE');
  }
  if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) {
      throw new AppError(403, 'Student is not in your classes', 'FORBIDDEN');
    }
  }
  return user;
}

async function createOneAssignment(input: {
  actor: PublicUser;
  examId: string;
  targetId: string;
  sourceClassId?: string | null;
  availableFrom: string;
  deadline: string;
  attemptLimit: number;
  settings?: Partial<ExamSettings>;
}): Promise<{ assignment?: ExamAssignment; skipped?: string }> {
  const existing = await findActiveAssignment(input.examId, input.targetId);
  if (existing) {
    return { skipped: `Active assignment already exists for student ${input.targetId}` };
  }

  const status = deriveAssignmentStatus({
    id: '',
    examId: input.examId,
    targetType: 'user',
    targetId: input.targetId,
    sourceClassId: input.sourceClassId ?? null,
    assignedBy: input.actor.id,
    assignedAt: new Date().toISOString(),
    availableFrom: input.availableFrom,
    deadline: input.deadline,
    attemptLimit: input.attemptLimit,
    status: 'assigned',
    settings: input.settings ?? {},
    createdAt: new Date().toISOString(),
  });

  const assignment = await createAssignment({
    examId: input.examId,
    targetId: input.targetId,
    sourceClassId: input.sourceClassId,
    assignedBy: input.actor.id,
    availableFrom: input.availableFrom,
    deadline: input.deadline,
    attemptLimit: input.attemptLimit,
    status,
    settings: input.settings ?? {},
  });
  return { assignment };
}

export async function assignExamForUser(
  actor: PublicUser,
  examId: string,
  body: {
    targetType: 'user' | 'class';
    targetId: string;
    availableFrom: string;
    deadline: string;
    attemptLimit: number;
    settings?: Partial<ExamSettings>;
  },
): Promise<{ assignments: ExamAssignment[]; warnings: string[] }> {
  assertTeacherOrAdmin(actor);
  await assertCanAssignExam(actor, examId);

  const warnings: string[] = [];
  const created: ExamAssignment[] = [];

  if (body.targetType === 'user') {
    await assertCanTargetStudent(actor, body.targetId);
    const result = await createOneAssignment({
      actor,
      examId,
      targetId: body.targetId,
      availableFrom: body.availableFrom,
      deadline: body.deadline,
      attemptLimit: body.attemptLimit,
      settings: body.settings,
    });
    if (result.skipped) warnings.push(result.skipped);
    if (result.assignment) created.push(result.assignment);
  } else {
    const cls = await findClassById(body.targetId);
    if (!cls) throw new AppError(404, 'Class not found', 'NOT_FOUND');
    if (actor.role === 'teacher' && cls.ownerId !== actor.id) {
      throw new AppError(403, 'Not the class owner', 'FORBIDDEN');
    }

    const memberIds = await listMemberUserIds(cls.id);
    if (memberIds.length === 0) {
      throw new AppError(422, 'Class has no members', 'CLASS_EMPTY');
    }

    for (const studentId of memberIds) {
      const user = await findUserById(studentId);
      if (!user || user.role !== 'student' || !isEnrollableStatus(user.status)) {
        warnings.push(`Skipped invalid member ${studentId}`);
        continue;
      }
      const result = await createOneAssignment({
        actor,
        examId,
        targetId: studentId,
        sourceClassId: cls.id,
        availableFrom: body.availableFrom,
        deadline: body.deadline,
        attemptLimit: body.attemptLimit,
        settings: body.settings,
      });
      if (result.skipped) warnings.push(result.skipped);
      if (result.assignment) created.push(result.assignment);
    }
  }

  const enriched = await enrichAssignments(created);
  return { assignments: enriched, warnings };
}

export async function createAssignmentForUser(
  actor: PublicUser,
  body: {
    examId: string;
    targetType: 'user' | 'class';
    targetId: string;
    availableFrom: string;
    deadline: string;
    attemptLimit: number;
    settings?: Partial<ExamSettings>;
  },
) {
  return assignExamForUser(actor, body.examId, body);
}

export async function getAssignmentForUser(actor: PublicUser, id: string) {
  const assignment = await findAssignmentById(id);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');

  if (actor.role === 'student') {
    if (assignment.targetId !== actor.id) {
      throw new AppError(403, 'Forbidden', 'FORBIDDEN');
    }
  } else if (actor.role === 'teacher') {
    if (assignment.assignedBy !== actor.id) {
      const exam = await findExamById(assignment.examId);
      if (!exam || exam.ownerId !== actor.id) {
        throw new AppError(403, 'Forbidden', 'FORBIDDEN');
      }
    }
  }

  const derived = await withDerivedStatus(assignment);
  const [enriched] = await enrichAssignments([derived]);
  return enriched;
}

export async function listExamAssignmentsForUser(
  actor: PublicUser,
  examId: string,
  filters: { limit?: number; offset?: number; status?: AssignmentStatus },
) {
  assertTeacherOrAdmin(actor);
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && exam.ownerId !== actor.id) {
    throw new AppError(403, 'Not the exam owner', 'FORBIDDEN');
  }

  const result = await listAssignments({ examId, ...filters });
  const withStatus = await Promise.all(result.items.map((a) => withDerivedStatus(a)));
  return {
    items: await enrichAssignments(withStatus),
    total: result.total,
  };
}

export async function listStudentAssignments(
  actor: PublicUser,
  studentId: string,
  filters: { limit?: number; offset?: number; status?: AssignmentStatus } = {},
) {
  if (actor.role === 'student') {
    if (actor.id !== studentId) {
      throw new AppError(403, 'Cannot view another student assignments', 'FORBIDDEN');
    }
  } else if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) {
      throw new AppError(403, 'Student is not in your classes', 'FORBIDDEN');
    }
  } else if (actor.role !== 'admin') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const result = await listAssignments({ targetId: studentId, ...filters });
  if (actor.role === 'student') {
    const derived = result.items.map((assignment) => ({
      ...assignment,
      status: deriveAssignmentStatus(assignment),
    }));
    const [titled, summaries] = await Promise.all([
      attachExamTitles(derived),
      listAttemptSummariesForAssignments(derived.map((assignment) => assignment.id)),
    ]);
    const byAssignment = new Map<string, typeof summaries>();
    for (const summary of summaries) {
      const list = byAssignment.get(summary.assignmentId);
      if (list) list.push(summary);
      else byAssignment.set(summary.assignmentId, [summary]);
    }
    return {
      items: titled.map((assignment) => {
        const rows = byAssignment.get(assignment.id) ?? [];
        const inProgress = rows.find((row) => row.status === 'in_progress');
        const finished = rows
          .filter((row) => isFinishedAttemptStatus(row.status))
          .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        const latest = finished[0];
        return {
          ...assignment,
          remainingAttempts: Math.max(0, assignment.attemptLimit - rows.length),
          inProgressAttemptId: inProgress?.id ?? null,
          latestFinishedAttempt: latest
            ? { id: latest.id, status: latest.status, percentage: latest.percentage }
            : null,
        };
      }),
      total: result.total,
    };
  }

  const withStatus = await Promise.all(result.items.map((a) => withDerivedStatus(a)));
  return {
    items: await enrichAssignments(withStatus),
    total: result.total,
  };
}

export async function listMyAssignments(
  actor: PublicUser,
  filters: { limit?: number; offset?: number; status?: AssignmentStatus } = {},
) {
  if (actor.role !== 'student') {
    throw new AppError(403, 'Only students use /students/me/assignments', 'FORBIDDEN');
  }
  return listStudentAssignments(actor, actor.id, filters);
}

export async function listAssignmentsForTeacher(
  actor: PublicUser,
  filters: {
    examId?: string;
    targetId?: string;
    status?: AssignmentStatus;
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  const result = await listAssignments({
    ...filters,
    assignedBy: actor.role === 'admin' ? undefined : actor.id,
  });
  const withStatus = await Promise.all(result.items.map((a) => withDerivedStatus(a)));
  return {
    items: await enrichAssignments(withStatus),
    total: result.total,
  };
}

export async function updateAssignmentForUser(
  actor: PublicUser,
  id: string,
  patch: {
    availableFrom?: string;
    deadline?: string;
    attemptLimit?: number;
    settings?: Partial<ExamSettings>;
  },
) {
  assertTeacherOrAdmin(actor);
  const assignment = await findAssignmentById(id);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');
  if (assignment.status === 'cancelled') {
    throw new AppError(422, 'Cannot update cancelled assignment', 'ASSIGNMENT_CANCELLED');
  }
  if (actor.role === 'teacher' && assignment.assignedBy !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const availableFrom = patch.availableFrom ?? assignment.availableFrom;
  const deadline = patch.deadline ?? assignment.deadline;
  const attemptLimit = patch.attemptLimit ?? assignment.attemptLimit;
  if (new Date(availableFrom) >= new Date(deadline)) {
    throw new AppError(422, 'availableFrom must be before deadline', 'INVALID_WINDOW');
  }
  if (patch.deadline && new Date(patch.deadline) <= new Date()) {
    throw new AppError(422, 'New deadline must be in the future', 'DEADLINE_IN_PAST');
  }

  const used = await countAttemptsForLimit(id);
  if (attemptLimit < used) {
    throw new AppError(
      422,
      `attemptLimit cannot be below attempts already used (${used})`,
      'ATTEMPT_LIMIT_BELOW_USED',
    );
  }

  const updated = await updateAssignment(id, {
    ...patch,
    status: deriveStatusAfterUpdate(
      { ...assignment, availableFrom, deadline, attemptLimit },
      used,
    ),
  });
  const [enriched] = await enrichAssignments([updated]);
  return enriched;
}

/**
 * Move the deadline of every live assignment of an exam (optionally one class group).
 * Each row goes through the same checks as a single PATCH; failures are reported, not thrown.
 */
export async function extendExamAssignments(
  actor: PublicUser,
  examId: string,
  input: { deadline: string; sourceClassId?: string | null },
) {
  assertTeacherOrAdmin(actor);
  const exam = await findExamById(examId);
  if (!exam) throw new AppError(404, 'Exam not found', 'NOT_FOUND');
  if (new Date(input.deadline) <= new Date()) {
    throw new AppError(422, 'New deadline must be in the future', 'DEADLINE_IN_PAST');
  }

  const { items } = await listAssignments({
    examId,
    assignedBy: actor.role === 'teacher' ? actor.id : undefined,
    limit: 1000,
  });
  const targets = items.filter(
    (a) =>
      a.status !== 'cancelled' &&
      (input.sourceClassId === undefined || a.sourceClassId === input.sourceClassId),
  );

  const updated: ExamAssignment[] = [];
  const skipped: { assignmentId: string; targetId: string; reason: string }[] = [];
  for (const a of targets) {
    try {
      updated.push(await updateAssignmentForUser(actor, a.id, { deadline: input.deadline }));
    } catch (err) {
      skipped.push({
        assignmentId: a.id,
        targetId: a.targetId,
        reason: err instanceof AppError ? err.message : 'Update failed',
      });
    }
  }
  return { updated, skipped };
}

export async function cancelAssignmentForUser(actor: PublicUser, id: string) {
  assertTeacherOrAdmin(actor);
  const assignment = await findAssignmentById(id);
  if (!assignment) throw new AppError(404, 'Assignment not found', 'NOT_FOUND');
  if (actor.role === 'teacher' && assignment.assignedBy !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (assignment.status === 'cancelled') {
    const [enriched] = await enrichAssignments([assignment]);
    return enriched;
  }
  const updated = await updateAssignment(id, { status: 'cancelled' });
  const [enriched] = await enrichAssignments([updated]);
  return enriched;
}

export async function deleteAssignmentForUser(actor: PublicUser, id: string) {
  // Soft-delete via cancel — keep history per doc
  return cancelAssignmentForUser(actor, id);
}

/**
 * One template per exam among a class's assignments that a newly added student could
 * still use: not cancelled, deadline in the future, latest assignment wins.
 */
export function pickOpenClassTemplates(
  assignments: ExamAssignment[],
  now = new Date(),
): ExamAssignment[] {
  const byExam = new Map<string, ExamAssignment>();
  for (const a of assignments) {
    if (a.status === 'cancelled') continue;
    if (new Date(a.deadline) <= now) continue;
    const cur = byExam.get(a.examId);
    if (!cur || a.assignedAt > cur.assignedAt) byExam.set(a.examId, a);
  }
  return [...byExam.values()];
}

/**
 * Give students who just joined a class the exams that are still open for that class,
 * with the same window, attempt limit and settings. Existing assignments are skipped.
 */
export async function syncOpenClassAssignments(
  actor: PublicUser,
  classId: string,
  studentIds: string[],
): Promise<{ created: number; warnings: string[] }> {
  assertTeacherOrAdmin(actor);
  if (studentIds.length === 0) return { created: 0, warnings: [] };

  const { items } = await listAssignments({ sourceClassId: classId, limit: 1000 });
  const templates = pickOpenClassTemplates(items);
  let created = 0;
  const warnings: string[] = [];

  for (const t of templates) {
    try {
      await assertCanAssignExam(actor, t.examId);
    } catch (err) {
      warnings.push(
        `Bỏ qua đề ${t.examTitle ?? t.examId}: ${err instanceof AppError ? err.message : 'không giao được'}`,
      );
      continue;
    }
    for (const studentId of studentIds) {
      const result = await createOneAssignment({
        actor,
        examId: t.examId,
        targetId: studentId,
        sourceClassId: classId,
        availableFrom: t.availableFrom,
        deadline: t.deadline,
        attemptLimit: t.attemptLimit,
        settings: t.settings,
      });
      if (result.assignment) created += 1;
    }
  }
  return { created, warnings };
}
