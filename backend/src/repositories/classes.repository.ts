import { getDb } from './db.js';
import { mapClass, type ClassMemberRow, type ClassRow } from './content.mapper.js';
import type { ClassMember, ClassRecord } from '../types/domain.js';

const CLASS_COLUMNS = 'id, name, grade, owner_id, created_at';

export async function findClassById(id: string): Promise<ClassRecord | null> {
  const { data, error } = await getDb()
    .from('classes')
    .select(CLASS_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const count = await countMembers(id);
  return mapClass(data as ClassRow, count);
}

export async function listClasses(filters: {
  ownerId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: ClassRecord[]; total: number }> {
  let query = getDb().from('classes').select(CLASS_COLUMNS, { count: 'exact' });
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const rows = (data ?? []) as ClassRow[];
  const items = await Promise.all(
    rows.map(async (row) => mapClass(row, await countMembers(row.id))),
  );
  return { items, total: count ?? 0 };
}

export async function listClassesForStudent(userId: string): Promise<ClassRecord[]> {
  const { data: memberships, error } = await getDb()
    .from('class_members')
    .select('class_id')
    .eq('user_id', userId);
  if (error) throw error;
  const ids = (memberships ?? []).map((m) => m.class_id as string);
  if (ids.length === 0) return [];

  const { data, error: classError } = await getDb()
    .from('classes')
    .select(CLASS_COLUMNS)
    .in('id', ids)
    .order('name', { ascending: true });
  if (classError) throw classError;
  return ((data ?? []) as ClassRow[]).map((row) => mapClass(row));
}

export async function createClass(input: {
  name: string;
  grade: number;
  ownerId: string;
}): Promise<ClassRecord> {
  const { data, error } = await getDb()
    .from('classes')
    .insert({
      name: input.name,
      grade: input.grade,
      owner_id: input.ownerId,
    })
    .select(CLASS_COLUMNS)
    .single();
  if (error) throw error;
  return mapClass(data as ClassRow, 0);
}

export async function updateClass(
  id: string,
  patch: { name?: string; grade?: number },
): Promise<ClassRecord> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.grade !== undefined) row.grade = patch.grade;

  const { data, error } = await getDb()
    .from('classes')
    .update(row)
    .eq('id', id)
    .select(CLASS_COLUMNS)
    .single();
  if (error) throw error;
  const count = await countMembers(id);
  return mapClass(data as ClassRow, count);
}

export async function deleteClass(id: string): Promise<void> {
  const { error } = await getDb().from('classes').delete().eq('id', id);
  if (error) throw error;
}

export async function countMembers(classId: string): Promise<number> {
  const { count, error } = await getDb()
    .from('class_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('class_id', classId);
  if (error) throw error;
  return count ?? 0;
}

export async function listMembers(classId: string): Promise<ClassMember[]> {
  const { data, error } = await getDb()
    .from('class_members')
    .select('class_id, user_id, joined_at')
    .eq('class_id', classId)
    .order('joined_at', { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as ClassMemberRow[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: users, error: userError } = await getDb()
    .from('users')
    .select('id, email, username, display_name')
    .in('id', userIds);
  if (userError) throw userError;

  const byId = new Map(
    ((users ?? []) as { id: string; email: string; username: string; display_name: string | null }[]).map(
      (u) => [u.id, u],
    ),
  );

  return rows.map((row) => {
    const u = byId.get(row.user_id);
    return {
      classId: row.class_id,
      userId: row.user_id,
      joinedAt: row.joined_at,
      email: u?.email,
      username: u?.username,
      displayName: u?.display_name ?? null,
    };
  });
}

export async function listMemberUserIds(classId: string): Promise<string[]> {
  const { data, error } = await getDb()
    .from('class_members')
    .select('user_id')
    .eq('class_id', classId);
  if (error) throw error;
  return (data ?? []).map((r) => r.user_id as string);
}

export async function isStudentInTeacherClass(
  studentId: string,
  teacherId: string,
): Promise<boolean> {
  const { data: owned, error } = await getDb()
    .from('classes')
    .select('id')
    .eq('owner_id', teacherId);
  if (error) throw error;
  const classIds = (owned ?? []).map((c) => c.id as string);
  if (classIds.length === 0) return false;

  const { data, error: memError } = await getDb()
    .from('class_members')
    .select('class_id')
    .eq('user_id', studentId)
    .in('class_id', classIds)
    .limit(1)
    .maybeSingle();
  if (memError) throw memError;
  return Boolean(data);
}

export async function addMembers(classId: string, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const rows = userIds.map((userId) => ({ class_id: classId, user_id: userId }));
  const { data, error } = await getDb()
    .from('class_members')
    .upsert(rows, { onConflict: 'class_id,user_id', ignoreDuplicates: true })
    .select('user_id');
  if (error) throw error;
  return data?.length ?? 0;
}

export async function removeMember(classId: string, userId: string): Promise<boolean> {
  const { data, error } = await getDb()
    .from('class_members')
    .delete()
    .eq('class_id', classId)
    .eq('user_id', userId)
    .select('user_id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
