import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as authService from '../modules/auth/auth.service.js';
import {
  listUsers,
  updateUserRole,
  updateUserStatus,
} from '../repositories/users.repository.js';
import { toPublicUser } from '../repositories/user.mapper.js';
import {
  inviteUserSchema,
  updateRoleSchema,
  updateStatusSchema,
} from '../validators/auth.validators.js';
import { AppError } from '../domain/errors.js';
import type { UserRole, UserStatus } from '../types/domain.js';
import { destroyAllUserSessions } from '../services/session.service.js';

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.get('/', async (_req, res, next) => {
  try {
    const users = await listUsers();
    res.json({ users: users.map(toPublicUser) });
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/invite', async (req, res, next) => {
  try {
    const body = inviteUserSchema.parse(req.body);
    const result = await authService.inviteUser({
      email: body.email,
      username: body.username,
      role: body.role as UserRole,
      displayName: body.displayName,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

usersRouter.post('/:id/resend-invite', async (req, res, next) => {
  try {
    const result = await authService.resendInvite(req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/status', async (req, res, next) => {
  try {
    const body = updateStatusSchema.parse(req.body);
    if (req.params.id === req.auth!.user.id && body.status !== 'active') {
      throw new AppError(422, 'Cannot disable or lock your own account', 'SELF_STATUS');
    }
    const user = await updateUserStatus(req.params.id, body.status as UserStatus);
    if (body.status === 'locked' || body.status === 'disabled') {
      await destroyAllUserSessions(user.id);
    }
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});

usersRouter.patch('/:id/role', async (req, res, next) => {
  try {
    const body = updateRoleSchema.parse(req.body);
    if (req.params.id === req.auth!.user.id) {
      throw new AppError(422, 'Cannot change your own role', 'SELF_ROLE');
    }
    const user = await updateUserRole(req.params.id, body.role as UserRole);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    next(err);
  }
});
