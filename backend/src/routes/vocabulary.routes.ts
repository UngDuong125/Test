import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as vocabularyService from '../modules/vocabulary/vocabulary.service.js';
import {
  assignVocabularyBankSchema,
  bankAddEntriesSchema,
  createVocabularyAssignmentSchema,
  createVocabularyBankSchema,
  createVocabularyEntrySchema,
  listVocabularyAssignmentsQuerySchema,
  listVocabularyBanksQuerySchema,
  listVocabularyEntriesQuerySchema,
  reviewVocabularyCardSchema,
  updateVocabularyBankSchema,
  updateVocabularyEntrySchema,
} from '../validators/vocabulary.validators.js';

export const vocabularyBanksRouter = Router();
export const vocabularyEntriesRouter = Router();
export const vocabularyAssignmentsRouter = Router();
export const vocabularyCardsRouter = Router();

// ---------------------------------------------------------------------------
// Banks
// ---------------------------------------------------------------------------

vocabularyBanksRouter.use(requireAuth, requireRole('admin', 'teacher'));

vocabularyBanksRouter.get('/', async (req, res, next) => {
  try {
    const query = listVocabularyBanksQuerySchema.parse(req.query);
    const result = await vocabularyService.listBanksForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.post('/', async (req, res, next) => {
  try {
    const body = createVocabularyBankSchema.parse(req.body);
    const bank = await vocabularyService.createBankForUser(req.auth!.user, body);
    res.status(201).json({ bank });
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.get('/:id', async (req, res, next) => {
  try {
    const bank = await vocabularyService.getBankForUser(req.auth!.user, req.params.id);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateVocabularyBankSchema.parse(req.body);
    const bank = await vocabularyService.updateBankForUser(req.auth!.user, req.params.id, body);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.delete('/:id', async (req, res, next) => {
  try {
    await vocabularyService.deleteBankForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.get('/:id/entries', async (req, res, next) => {
  try {
    const query = listVocabularyEntriesQuerySchema
      .pick({ status: true, limit: true, offset: true })
      .parse(req.query);
    const result = await vocabularyService.listBankEntriesForUser(
      req.auth!.user,
      req.params.id,
      query,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.post('/:id/items', async (req, res, next) => {
  try {
    const body = bankAddEntriesSchema.parse(req.body);
    const result = await vocabularyService.addEntriesToBankForUser(
      req.auth!.user,
      req.params.id,
      body.entryIds,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.delete('/:id/items/:entryId', async (req, res, next) => {
  try {
    await vocabularyService.removeEntryFromBankForUser(
      req.auth!.user,
      req.params.id,
      req.params.entryId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

vocabularyBanksRouter.post('/:id/assign', async (req, res, next) => {
  try {
    const body = assignVocabularyBankSchema.parse(req.body);
    const result = await vocabularyService.assignBankForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

vocabularyEntriesRouter.use(requireAuth, requireRole('admin', 'teacher'));

vocabularyEntriesRouter.get('/', async (req, res, next) => {
  try {
    const query = listVocabularyEntriesQuerySchema.parse(req.query);
    const result = await vocabularyService.listEntriesForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

vocabularyEntriesRouter.post('/', async (req, res, next) => {
  try {
    const body = createVocabularyEntrySchema.parse(req.body);
    const entry = await vocabularyService.createEntryForUser(req.auth!.user, body);
    res.status(201).json({ entry });
  } catch (err) {
    next(err);
  }
});

vocabularyEntriesRouter.get('/:id', async (req, res, next) => {
  try {
    const entry = await vocabularyService.getEntryForUser(req.auth!.user, req.params.id);
    res.json({ entry });
  } catch (err) {
    next(err);
  }
});

vocabularyEntriesRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateVocabularyEntrySchema.parse(req.body);
    const entry = await vocabularyService.updateEntryForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.json({ entry });
  } catch (err) {
    next(err);
  }
});

vocabularyEntriesRouter.delete('/:id', async (req, res, next) => {
  try {
    await vocabularyService.deleteEntryForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

vocabularyAssignmentsRouter.use(requireAuth);

vocabularyAssignmentsRouter.get(
  '/',
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const query = listVocabularyAssignmentsQuerySchema.parse(req.query);
      const result = await vocabularyService.listAssignmentsForUser(req.auth!.user, query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

vocabularyAssignmentsRouter.post(
  '/',
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const body = createVocabularyAssignmentSchema.parse(req.body);
      const { bankId, ...rest } = body;
      const result = await vocabularyService.assignBankForUser(req.auth!.user, bankId, rest);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

vocabularyAssignmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const assignment = await vocabularyService.getAssignmentForUser(
      req.auth!.user,
      req.params.id,
    );
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

vocabularyAssignmentsRouter.post(
  '/:id/cancel',
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const assignment = await vocabularyService.cancelAssignmentForUser(
        req.auth!.user,
        req.params.id,
      );
      res.json({ assignment });
    } catch (err) {
      next(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Cards (student review)
// ---------------------------------------------------------------------------

vocabularyCardsRouter.use(requireAuth, requireRole('student'));

vocabularyCardsRouter.post('/:id/review', async (req, res, next) => {
  try {
    const body = reviewVocabularyCardSchema.parse(req.body);
    const result = await vocabularyService.reviewCardForStudent(
      req.auth!.user,
      req.params.id,
      body.result,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
