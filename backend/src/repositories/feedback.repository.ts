import { getDb } from './db.js';

export interface FeedbackTemplate {
  id: string;
  text: string;
  createdAt: string;
}

type Row = { id: string; text: string; created_at: string };
const map = (r: Row): FeedbackTemplate => ({ id: r.id, text: r.text, createdAt: r.created_at });

export async function listFeedbackTemplates(ownerId: string): Promise<FeedbackTemplate[]> {
  const { data, error } = await getDb()
    .from('feedback_templates')
    .select('id, text, created_at')
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(map);
}

export async function countFeedbackTemplates(ownerId: string): Promise<number> {
  const { count, error } = await getDb()
    .from('feedback_templates')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId);
  if (error) throw error;
  return count ?? 0;
}

/** Idempotent on (owner, text): adding the same snippet twice returns the existing row. */
export async function upsertFeedbackTemplate(ownerId: string, text: string): Promise<FeedbackTemplate> {
  const { data, error } = await getDb()
    .from('feedback_templates')
    .upsert({ owner_id: ownerId, text }, { onConflict: 'owner_id,text' })
    .select('id, text, created_at')
    .single();
  if (error) throw error;
  return map(data as Row);
}

export async function deleteFeedbackTemplate(ownerId: string, id: string): Promise<boolean> {
  const { data, error } = await getDb()
    .from('feedback_templates')
    .delete()
    .eq('owner_id', ownerId)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data ?? []).length > 0;
}
