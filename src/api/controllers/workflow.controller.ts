import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../../lib/db';
import { AppError } from '../../lib/types';
import { validateDefinitionGraph } from '../validators/workflow.validators';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

export async function listWorkflows(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflows = await prisma.workflow.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        cronExpression: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { versions: true } },
      },
    });
    res.json({ workflows });
  } catch (err) {
    next(err);
  }
}

export async function getWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({
      where: { id: req.params.id, userId },
      include: { versions: { orderBy: { versionNumber: 'desc' }, take: 5 } },
    });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    res.json({ workflow });
  } catch (err) {
    next(err);
  }
}

export async function createWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const { name, definition, cronExpression } = req.body;

    const webhookSecret = crypto.randomBytes(24).toString('hex');
    const workflow = await prisma.workflow.create({
      data: {
        userId,
        name,
        draftDefinition: definition ?? {},
        webhookSecret,
        cronExpression: cronExpression ?? null,
      },
    });
    res.status(201).json({ workflow });
  } catch (err) {
    next(err);
  }
}

export async function updateWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    if (workflow.status === 'published') {
      throw new AppError(409, 'Cannot edit a published workflow — unpublish first', 'WORKFLOW_PUBLISHED');
    }

    const { name, definition, cronExpression } = req.body;
    const updated = await prisma.workflow.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(definition !== undefined && { draftDefinition: definition }),
        ...(cronExpression !== undefined && { cronExpression }),
      },
    });
    res.json({ workflow: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');
    await prisma.workflow.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function publishWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');

    const definition = workflow.draftDefinition as any;

    // Validate the graph before freezing
    const graphError = validateDefinitionGraph(definition);
    if (graphError) throw new AppError(422, graphError, 'INVALID_DEFINITION');

    if (!definition.nodes || definition.nodes.length === 0) {
      throw new AppError(422, 'Workflow has no nodes to publish', 'INVALID_DEFINITION');
    }

    // Determine next version number
    const latest = await prisma.workflowVersion.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { versionNumber: 'desc' },
    });
    const versionNumber = (latest?.versionNumber ?? 0) + 1;

    const [version] = await prisma.$transaction([
      prisma.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          versionNumber,
          definition,
        },
      }),
      prisma.workflow.update({
        where: { id: workflow.id },
        data: { status: 'published' },
      }),
    ]);

    res.json({ version });
  } catch (err) {
    next(err);
  }
}

export async function unpublishWorkflow(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');

    await prisma.workflow.update({
      where: { id: workflow.id },
      data: { status: 'draft' },
    });
    res.json({ message: 'Workflow unpublished — it is now editable again' });
  } catch (err) {
    next(err);
  }
}

export async function getWorkflowRuns(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req as AuthenticatedRequest;
    const workflow = await prisma.workflow.findFirst({ where: { id: req.params.id, userId } });
    if (!workflow) throw new AppError(404, 'Workflow not found', 'NOT_FOUND');

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const skip = (page - 1) * limit;

    const [runs, total] = await prisma.$transaction([
      prisma.run.findMany({
        where: { workflowVersion: { workflowId: workflow.id } },
        orderBy: { startedAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          triggerType: true,
          startedAt: true,
          endedAt: true,
          errorMessage: true,
          workflowVersion: { select: { versionNumber: true } },
        },
      }),
      prisma.run.count({ where: { workflowVersion: { workflowId: workflow.id } } }),
    ]);

    res.json({ runs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
}
