import { createHash, randomUUID } from 'node:crypto';
import { AppError } from '../domain/errors.js';
import { env } from '../config/env.js';
import { createMedia, findMediaById, deleteMedia } from '../repositories/media.repository.js';
import type { MediaRecord, PublicUser } from '../types/domain.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

function assertUploader(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Students cannot upload media', 'FORBIDDEN');
  }
}

async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string,
): Promise<{ url: string; publicId: string }> {
  const cloudName = env.CLOUDINARY_CLOUD_NAME;
  const apiKey = env.CLOUDINARY_API_KEY;
  const apiSecret = env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(503, 'Cloudinary is not configured', 'UPLOAD_NOT_CONFIGURED');
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'testarchive';
  const publicId = `ta_${randomUUID()}`;

  // Signed params must be sorted alphabetically; exclude file/api_key/resource_type/cloud_name.
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash('sha1').update(toSign).digest('hex');

  // data URI avoids Node FormData/Blob edge cases on some runtimes (e.g. Render).
  const form = new FormData();
  form.append('file', `data:${mimeType};base64,${buffer.toString('base64')}`);
  form.append('api_key', apiKey);
  form.append('timestamp', String(timestamp));
  form.append('signature', signature);
  form.append('folder', folder);
  form.append('public_id', publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[cloudinary]', res.status, text);
    throw new AppError(502, 'Cloudinary upload failed', 'UPLOAD_FAILED');
  }

  const json = (await res.json()) as { secure_url: string; public_id: string };
  if (!json.secure_url || !json.public_id) {
    console.error('[cloudinary] unexpected response', json);
    throw new AppError(502, 'Cloudinary upload failed', 'UPLOAD_FAILED');
  }
  return { url: json.secure_url, publicId: json.public_id };
}

async function uploadDevFallback(
  buffer: Buffer,
  mimeType: string,
): Promise<{ url: string; publicId: string }> {
  const publicId = `local_${randomUUID()}`;
  // Local/dev without Cloudinary: store a deterministic HTTPS placeholder; metadata still in DB.
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const url = `https://placehold.co/800x600/e2e8f0/0f172a/${ext}?text=TestArchive+${encodeURIComponent(publicId.slice(0, 8))}`;
  console.info(`[upload:dev-fallback] ${publicId} (${buffer.length} bytes, ${mimeType})`);
  return { url, publicId };
}

export async function uploadMediaForUser(
  actor: PublicUser,
  file: { buffer: Buffer; mimetype: string; size: number; originalname?: string },
): Promise<MediaRecord> {
  assertUploader(actor);

  if (!ALLOWED_MIME.has(file.mimetype)) {
    throw new AppError(422, 'Only JPEG, PNG, or WebP images are allowed', 'INVALID_MIME');
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    throw new AppError(422, 'File must be between 1 byte and 2 MB', 'FILE_TOO_LARGE');
  }

  let uploaded: { url: string; publicId: string };
  if (env.cloudinaryConfigured) {
    uploaded = await uploadToCloudinary(file.buffer, file.mimetype);
  } else if (env.isProd) {
    // Never silently fall back in production — that looked like a successful "local" upload.
    throw new AppError(
      503,
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET (or CLOUDINARY_URL) on the API service and redeploy.',
      'UPLOAD_NOT_CONFIGURED',
    );
  } else {
    uploaded = await uploadDevFallback(file.buffer, file.mimetype);
  }

  return createMedia({
    url: uploaded.url,
    publicId: uploaded.publicId,
    mimeType: file.mimetype,
    byteSize: file.size,
    uploadedBy: actor.id,
  });
}

export async function getMediaForUser(actor: PublicUser, id: string) {
  if (!actor) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
  const media = await findMediaById(id);
  if (!media) throw new AppError(404, 'Media not found', 'NOT_FOUND');
  return media;
}

export async function deleteMediaForUser(actor: PublicUser, id: string) {
  assertUploader(actor);
  const media = await findMediaById(id);
  if (!media) throw new AppError(404, 'Media not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && media.uploadedBy !== actor.id) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  await deleteMedia(id);
}
