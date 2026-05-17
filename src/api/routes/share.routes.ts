import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { workflowIdSchema } from '../validators/workflow.validators';
import { shareTokenSchema, publicRunSchema } from '../validators/share.validators';
import {
  generateShareToken,
  revokeShareToken,
  getPublicWorkflow,
  publicRun,
  getPublicRunStatus,
} from '../controllers/share.controller';

const router = Router();

// Authenticated — manage share tokens
router.post('/workflows/:id/share', authenticate, validate(workflowIdSchema), generateShareToken);
router.delete('/workflows/:id/share', authenticate, validate(workflowIdSchema), revokeShareToken);

// Public — no auth, consumed by flow-frontend
router.get('/public/workflows/:shareToken', validate(shareTokenSchema), getPublicWorkflow);
router.post('/public/workflows/:shareToken/run', validate(publicRunSchema), publicRun);
router.get('/public/runs/:runId', getPublicRunStatus);

export default router;
