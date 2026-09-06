import { getDb } from './db.js';
import { mapMedia, type MediaRow } from './content.mapper.js';
import type { MediaRecord } from '../types/domain.js';

const MEDIA_COLUMNS = 'id, url, public_id, mime_type, byte_size, uploaded_by, created_at';

export async function findMediaById(id: string): Promise<MediaRecord | null> {
  const { data, error } = await getDb()
    .from('media')
    .select(MEDIA_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapMedia(data as MediaRow);
}

export async function createMedia(input: {
  url: string;
  publicId: string;
  mimeType: string;
  byteSize: number;
  uploadedBy: string;
}): Promise<MediaRecord> {
  const { data, error } = await getDb()
    .from('media')
    .insert({
      url: input.url,
      public_id: input.publicId,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      uploaded_by: input.uploadedBy,
    })
    .select(MEDIA_COLUMNS)
    .single();
  if (error) throw error;
  return mapMedia(data as MediaRow);
}

export async function deleteMedia(id: string): Promise<boolean> {
  const { data, error } = await getDb()
    .from('media')
    .delete()
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}
