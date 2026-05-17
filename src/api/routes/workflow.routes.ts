import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  workflowIdSchema,
  workflowRunsQuerySchema,
} from '../validators/workflow.validators';
import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  publishWorkflow,
  unpublishWorkflow,
  getWorkflowRuns,
} from '../controllers/workflow.controller';

const router = Router();

router.use(authenticate);

router.get('/', listWorkflows);
router.post('/', validate(createWorkflowSchema), createWorkflow);
router.get('/:id', validate(workflowIdSchema), getWorkflow);
router.patch('/:id', validate(updateWorkflowSchema), updateWorkflow);
router.delete('/:id', validate(workflowIdSchema), deleteWorkflow);
router.post('/:id/publish', validate(workflowIdSchema), publishWorkflow);
router.post('/:id/unpublish', validate(workflowIdSchema), unpublishWorkflow);
router.get('/:id/runs', validate(workflowRunsQuerySchema), getWorkflowRuns);

export default router;
