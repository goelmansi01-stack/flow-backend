import '../lib/config';
import cron, { ScheduledTask } from 'node-cron';
import { prisma } from '../lib/db';
import { createRunQueue } from '../lib/queue';
import { logger } from '../lib/logger';

// Maps workflowId → active ScheduledTask so we can start/stop dynamically
const activeTasks = new Map<string, ScheduledTask>();

async function syncScheduledWorkflows() {
  logger.debug('scheduler: syncing scheduled workflows');

  const publishedWithCron = await prisma.workflow.findMany({
    where: { status: 'published', cronExpression: { not: null } },
    select: { id: true, cronExpression: true },
  });

  const activeWorkflowIds = new Set(publishedWithCron.map((w: { id: string }) => w.id));

  // Remove tasks for workflows that are no longer active
  for (const [workflowId, task] of activeTasks.entries()) {
    if (!activeWorkflowIds.has(workflowId)) {
      task.stop();
      activeTasks.delete(workflowId);
      logger.info({ workflowId }, 'scheduler: removed task');
    }
  }

  // Add tasks for newly scheduled workflows
  for (const workflow of publishedWithCron) {
    if (activeTasks.has(workflow.id)) continue;
    if (!cron.validate(workflow.cronExpression!)) {
      logger.warn({ workflowId: workflow.id, expression: workflow.cronExpression }, 'scheduler: invalid cron expression — skipping');
      continue;
    }

    const task = cron.schedule(workflow.cronExpression!, async () => {
      await triggerScheduledRun(workflow.id);
    });

    activeTasks.set(workflow.id, task);
    logger.info({ workflowId: workflow.id, expression: workflow.cronExpression }, 'scheduler: task registered');
  }
}

async function triggerScheduledRun(workflowId: string) {
  try {
    const latestVersion = await prisma.workflowVersion.findFirst({
      where: { workflowId },
      orderBy: { versionNumber: 'desc' },
    });

    if (!latestVersion) {
      logger.warn({ workflowId }, 'scheduler: no version found — skipping');
      return;
    }

    const run = await prisma.run.create({
      data: {
        workflowVersionId: latestVersion.id,
        status: 'queued',
        triggerType: 'schedule',
        triggerPayload: { scheduledAt: new Date().toISOString() },
      },
    });

    const queue = createRunQueue();
    await queue.add('run', {
      runId: run.id,
      workflowVersionId: latestVersion.id,
      triggerPayload: { scheduledAt: new Date().toISOString() },
    });
    await queue.close();

    logger.info({ workflowId, runId: run.id }, 'scheduler: enqueued scheduled run');
  } catch (err) {
    logger.error({ err, workflowId }, 'scheduler: failed to trigger run');
  }
}

// Sync once on startup, then re-sync every minute to pick up newly published workflows
syncScheduledWorkflows().catch((err) => logger.error({ err }, 'scheduler: initial sync failed'));

cron.schedule('* * * * *', () => {
  syncScheduledWorkflows().catch((err) => logger.error({ err }, 'scheduler: sync failed'));
});

logger.info('Flow scheduler started');

process.on('SIGTERM', () => {
  logger.info('scheduler: SIGTERM received — stopping all tasks');
  for (const task of activeTasks.values()) task.stop();
  process.exit(0);
});
