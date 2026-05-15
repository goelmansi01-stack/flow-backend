import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../lib/db';
import { createRunQueue } from '../../lib/queue';
import { AppError } from '../../lib/types';
import { logger } from '../../lib/logger';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

async function enqueueRun(
  workflowVersionId: string,
  triggerPayload: Record<string, unknown> | null,
  triggerType: 'webhook' | 'schedule' | 'manual',
) {
  const run = await prisma.run.create({
    data: {
      workflowVersionId,
      status: 'queued',
      triggerType,
      triggerPayload: (triggerPayload ?? {}) as object,
    },
  });

  const queue = createRunQueue();
  await queue.add('run', { runId: run.id, workflowVersionId, triggerPayload });
  await queue.close();

  return run;
}

export async function manualTrigger(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId },
    });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    if (workflow.status !== 'published') {
      throw new AppError(409, 'Only published workflows can be run', 'WORKFLOW_NOT_PUBLISHED');
    }

    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestVersion) throw new AppError(404, 'No published version found', 'NOT_FOUND');

    const run = await enqueueRun(latestVersion.id, req.body.payload ?? null, 'manual');
    res.status(202).json({ runId: run.id, status: run.status });
  } catch (err) {
    next(err);
  }
}

export async function webhookTrigger(req: Request, res: Response, next: NextFunction) {
  try {
    const { workflowId } = req.params;
    const requestId = req.headers['x-request-id'] as string | undefined;

    const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    if (workflow.status !== 'published') {
      throw new AppError(409, 'Workflow is not published', 'WORKFLOW_NOT_PUBLISHED');
    }

    // Validate webhook secret
    const providedSecret = req.headers['x-secret'] as string | undefined;
    if (!workflow.webhookSecret || !providedSecret) {
      throw new AppError(401, 'Missing X-Secret header', 'UNAUTHORIZED');
    }
    const valid = crypto.timingSafeEqual(
      Buffer.from(providedSecret),
      Buffer.from(workflow.webhookSecret),
    );
    if (!valid) throw new AppError(401, 'Invalid webhook secret', 'UNAUTHORIZED');

    // De-duplicate by request ID (5-min window via DB cleanup)
    if (requestId) {
      const existing = await prisma.webhookDelivery.findUnique({ where: { requestId } });
      if (existing) {
        return res.status(200).json({ message: 'Duplicate webhook — already processed' });
      }
      // Prune stale dedup records older than 5 minutes
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      await prisma.webhookDelivery.deleteMany({ where: { receivedAt: { lt: fiveMinutesAgo } } });
      await prisma.webhookDelivery.create({ data: { workflowId, requestId } });
    }

    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestVersion) throw new AppError(404, 'No published version found', 'NOT_FOUND');

    const run = await enqueueRun(latestVersion.id, req.body ?? null, 'webhook');
    logger.info({ workflowId, runId: run.id }, 'webhook trigger: run enqueued');

    res.status(202).json({ runId: run.id, status: run.status });
  } catch (err) {
    next(err);
  }
}

export async function listRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const runs = await prisma.run.findMany({
      where: { workflowVersion: { workflow: { userId } } },
      include: { workflowVersion: { select: { versionNumber: true, workflowId: true } } },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    res.json({ runs });
  } catch (err) {
    next(err);
  }
}

export async function getRun(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const run = await prisma.run.findFirst({
      where: {
        id: req.params.id,
        workflowVersion: { workflow: { userId } },
      },
      include: {
        nodeExecutions: { orderBy: { startedAt: 'asc' } },
        workflowVersion: {
          select: { versionNumber: true, workflowId: true },
        },
      },
    });
    if (!run) throw new AppError(404, 'Run not found', 'NOT_FOUND');
    res.json({ run });
  } catch (err) {
    next(err);
  }
}

export async function pauseRun(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const run = await findOwnedRun(req.params.id, userId);

    if (run.status !== 'running') {
      throw new AppError(409, `Cannot pause a run with status "${run.status}"`, 'INVALID_STATE');
    }
    await prisma.run.update({ where: { id: run.id }, data: { status: 'paused' } });
    res.json({ message: 'Run paused' });
  } catch (err) {
    next(err);
  }
}

export async function resumeRun(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const run = await findOwnedRun(req.params.id, userId);

    if (run.status !== 'paused') {
      throw new AppError(409, `Cannot resume a run with status "${run.status}"`, 'INVALID_STATE');
    }

    await prisma.run.update({ where: { id: run.id }, data: { status: 'running' } });

    const queue = createRunQueue();
    await queue.add('run', {
      runId: run.id,
      workflowVersionId: run.workflowVersionId,
      triggerPayload: run.triggerPayload as Record<string, unknown> | null,
      resumeFromNodeId: run.currentNodeId ?? undefined,
    });
    await queue.close();

    res.json({ message: 'Run resumed' });
  } catch (err) {
    next(err);
  }
}

export async function cancelRun(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const run = await findOwnedRun(req.params.id, userId);

    if (run.status === 'completed' || run.status === 'cancelled' || run.status === 'failed') {
      throw new AppError(409, `Run is already in terminal state "${run.status}"`, 'INVALID_STATE');
    }

    await prisma.run.update({
      where: { id: run.id },
      data: { status: 'cancelled', endedAt: new Date() },
    });
    res.json({ message: 'Run cancelled' });
  } catch (err) {
    next(err);
  }
}

async function findOwnedRun(runId: string, userId: string) {
  const run = await prisma.run.findFirst({
    where: { id: runId, workflowVersion: { workflow: { userId } } },
  });
  if (!run) throw new AppError(404, 'Run not found', 'NOT_FOUND');
  return run;
}
