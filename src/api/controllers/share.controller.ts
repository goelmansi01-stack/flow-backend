import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../lib/db';
import { createRunQueue } from '../../lib/queue';
import { AppError } from '../../lib/types';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/**
 * POST /api/workflows/:id/share
 * Generates (or regenerates) a public share token for a published workflow.
 * The token is given to flow-frontend so laymen can run the workflow without
 * needing a Flow account or knowing about webhooks.
 */
export async function generateShareToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    if (workflow.status !== 'published') {
      throw new AppError(409, 'Only published workflows can be shared', 'WORKFLOW_NOT_PUBLISHED');
    }

    const shareToken = crypto.randomBytes(32).toString('hex');
    await prisma.workflow.update({ where: { id: workflow.id }, data: { shareToken } });

    res.json({ shareToken, shareUrl: `/api/public/workflows/${shareToken}` });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/workflows/:id/share
 * Revokes the public share token.
 */
export async function revokeShareToken(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');

    await prisma.workflow.update({ where: { id: workflow.id }, data: { shareToken: null } });
    res.json({ message: 'Share link revoked' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/public/workflows/:shareToken
 * Returns public metadata for a shared workflow — no auth required.
 * The flow-frontend uses this to display the workflow name and input schema.
 */
export async function getPublicWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { shareToken: req.params.shareToken },
      select: {
        id: true,
        name: true,
        status: true,
        updatedAt: true,
        versions: {
          orderBy: { versionNumber: 'desc' },
          take: 1,
          select: {
            versionNumber: true,
            definition: true,
            publishedAt: true,
          },
        },
      },
    });

    if (!workflow || workflow.status !== 'published') {
      throw new AppError(404, 'Workflow not found or not published', 'NOT_FOUND');
    }

    // Surface a simplified view — hide internal node configs
    const latestVersion = workflow.versions[0];
    const definition = latestVersion?.definition as any;
    const nodeNames: string[] = definition?.nodes?.map((n: any) => n.name) ?? [];

    res.json({
      id: workflow.id,
      name: workflow.name,
      updatedAt: workflow.updatedAt,
      version: latestVersion?.versionNumber,
      publishedAt: latestVersion?.publishedAt,
      steps: nodeNames,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/public/workflows/:shareToken/run
 * Triggers a run via share token — no auth required.
 * This is the endpoint flow-frontend calls when a layman hits "Run".
 */
export async function publicRun(req: Request, res: Response, next: NextFunction) {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { shareToken: req.params.shareToken },
    });

    if (!workflow || workflow.status !== 'published') {
      throw new AppError(404, 'Workflow not found or not published', 'NOT_FOUND');
    }

    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { versionNumber: 'desc' },
    });
    if (!latestVersion) throw new AppError(404, 'No published version found', 'NOT_FOUND');

    const run = await prisma.run.create({
      data: {
        workflowVersionId: latestVersion.id,
        status: 'queued',
        triggerType: 'manual',
        triggerPayload: { ...req.body.payload, _source: 'public_share' },
      },
    });

    const queue = createRunQueue();
    await queue.add('run', {
      runId: run.id,
      workflowVersionId: latestVersion.id,
      triggerPayload: req.body.payload ?? null,
    });
    await queue.close();

    res.status(202).json({ runId: run.id, status: run.status });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/public/runs/:runId
 * Polls run status — no auth required, but run must have been created via public share.
 * flow-frontend polls this to show the user progress.
 */
export async function getPublicRunStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const run = await prisma.run.findFirst({
      where: {
        id: req.params.runId,
        triggerPayload: { path: ['_source'], equals: 'public_share' },
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        endedAt: true,
        errorMessage: true,
        nodeExecutions: {
          orderBy: { startedAt: 'asc' },
          select: { nodeId: true, status: true, durationMs: true, startedAt: true },
        },
      },
    });

    if (!run) throw new AppError(404, 'Run not found', 'NOT_FOUND');
    res.json({ run });
  } catch (err) {
    next(err);
  }
}
