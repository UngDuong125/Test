import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { uploadRateLimit } from '../middleware/rateLimit.js';
import * as uploadService from '../services/upload.service.js';
import { AppError } from '../domain/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
});

export const uploadRouter = Router();

uploadRouter.post(
  '/',
  requireAuth,
  requireRole('admin', 'teacher'),
  uploadRateLimit,
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        next(new AppError(422, err.message, 'UPLOAD_ERROR'));
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  },
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new AppError(422, 'Missing file field "file"', 'FILE_REQUIRED');
      }
      const media = await uploadService.uploadMediaForUser(req.auth!.user, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        size: req.file.size,
        originalname: req.file.originalname,
      });
      res.status(201).json({
        mediaId: media.id,
        url: media.url,
        mimeType: media.mimeType,
        byteSize: media.byteSize,
      });
    } catch (err) {
      next(err);
    }
  },
);

uploadRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const media = await uploadService.getMediaForUser(req.auth!.user, req.params.id);
    res.json({ media });
  } catch (err) {
    next(err);
  }
});

uploadRouter.delete('/:id', requireAuth, requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    await uploadService.deleteMediaForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
