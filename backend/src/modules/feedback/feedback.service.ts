import { AppError } from '../../domain/errors.js';
import {
  countFeedbackTemplates,
  deleteFeedbackTemplate,
  listFeedbackTemplates,
  upsertFeedbackTemplate,
} from '../../repositories/feedback.repository.js';
import type { PublicUser } from '../../types/domain.js';

export const MAX_FEEDBACK_TEMPLATES = 50;

function assertGrader(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

/** A teacher's own snippets; never shared with other teachers. */
export async function listMyTemplates(actor: PublicUser) {
  assertGrader(actor);
  return listFeedbackTemplates(actor.id);
}

export async function addMyTemplate(actor: PublicUser, text: string) {
  assertGrader(actor);
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) throw new AppError(422, 'Template is empty', 'EMPTY_TEMPLATE');
  if ((await countFeedbackTemplates(actor.id)) >= MAX_FEEDBACK_TEMPLATES) {
    throw new AppError(422, `At most ${MAX_FEEDBACK_TEMPLATES} templates`, 'TOO_MANY_TEMPLATES');
  }
  return upsertFeedbackTemplate(actor.id, clean);
}

export async function removeMyTemplate(actor: PublicUser, id: string) {
  assertGrader(actor);
  if (!(await deleteFeedbackTemplate(actor.id, id))) {
    throw new AppError(404, 'Template not found', 'NOT_FOUND');
  }
}
