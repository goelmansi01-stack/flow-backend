import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { manualRunSchema, runIdSchema, webhookSchema } from '../validators/run.validators';
import {
  listRuns,
  manualTrigger,
  webhookTrigger,
  getRun,
  pauseRun,
  resumeRun,
  cancelRun,
} from '../controllers/run.controller';

const router = Router();

// Webhook — no auth required (secret in header)
router.post('/hooks/:workflowId', validate(webhookSchema), webhookTrigger);

// Authenticated run management
router.use(authenticate);
router.get('/runs', listRuns);
router.post('/workflows/:id/run', validate(manualRunSchema), manualTrigger);
router.get('/runs/:id', validate(runIdSchema), getRun);
router.post('/runs/:id/pause', validate(runIdSchema), pauseRun);
router.post('/runs/:id/resume', validate(runIdSchema), resumeRun);
router.post('/runs/:id/cancel', validate(runIdSchema), cancelRun);

export default router;
