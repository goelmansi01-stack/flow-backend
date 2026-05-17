import { Job } from 'bullmq';
import { prisma } from '../lib/db';
import { createRunQueue } from '../lib/queue';
import { logger } from '../lib/logger';
import { AppError } from '../lib/types';
import type { WorkflowDefinition, ExecutionContext, NodeType } from '../lib/types';
import type { RunJobData } from '../lib/queue';
import { httpHandler } from './handlers/http.handler';
import { conditionHandler } from './handlers/condition.handler';
import { delayHandler } from './handlers/delay.handler';
import { notifyHandler } from './handlers/notify.handler';

type HandlerFn = (ctx: ExecutionContext, config: any) => Promise<Record<string, unknown>> | Record<string, unknown>;

interface ChildLogger {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  debug(obj: object | string, msg?: string): void;
  child(bindings: object): ChildLogger;
}

const handlers: Record<NodeType, HandlerFn> = {
  http_request: httpHandler,
  condition: conditionHandler as HandlerFn,
  delay: delayHandler as HandlerFn,
  notify: notifyHandler,
};

export async function orchestrateRun(job: Job<RunJobData>): Promise<void> {
  const { runId, workflowVersionId, triggerPayload, resumeFromNodeId } = job.data;
  const runLogger = logger.child({ runId, jobId: job.id });

  runLogger.info('orchestrator: starting run');

  await prisma.run.update({
    where: { id: runId },
    data: { status: 'running', startedAt: new Date() },
  });

  try {
    const version = await prisma.workflowVersion.findUniqueOrThrow({
      where: { id: workflowVersionId },
    });

    const definition = version.definition as unknown as WorkflowDefinition;
    const nodeOutputs: Record<string, unknown> = {};

    // Restore prior node outputs when resuming after a pause/delay
    if (resumeFromNodeId) {
      const completed = await prisma.nodeExecution.findMany({
        where: { runId, status: 'success' },
      });
      for (const exec of completed) {
        nodeOutputs[exec.nodeId] = exec.output ?? {};
      }
    }

    const startNodeId = resumeFromNodeId ?? definition.triggerNodeId;
    await executeNode(runId, startNodeId, definition, nodeOutputs, triggerPayload, runLogger);

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'completed', endedAt: new Date(), currentNodeId: null },
    });

    runLogger.info('orchestrator: run completed');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    runLogger.error({ err }, 'orchestrator: run failed');

    await prisma.run.update({
      where: { id: runId },
      data: { status: 'failed', endedAt: new Date(), errorMessage: message },
    });

    throw err;
  }
}

async function executeNode(
  runId: string,
  nodeId: string,
  definition: WorkflowDefinition,
  nodeOutputs: Record<string, unknown>,
  triggerPayload: Record<string, unknown> | null,
  runLogger: ChildLogger,
): Promise<void> {
  const run = await prisma.run.findUniqueOrThrow({ where: { id: runId } });
  if (run.status === 'paused' || run.status === 'cancelled') {
    runLogger.info({ status: run.status }, 'orchestrator: run halted before node execution');
    return;
  }

  const node = definition.nodes.find((n) => n.id === nodeId);
  if (!node) throw new AppError(500, `Node "${nodeId}" not found in definition`, 'ORCHESTRATOR_ERROR');

  await prisma.run.update({ where: { id: runId }, data: { currentNodeId: nodeId } });

  const attempt = await getAttemptNumber(runId, nodeId);
  const nodeLogger = runLogger.child({ nodeId, nodeType: node.type, attempt });
  nodeLogger.info('orchestrator: executing node');

  const ctx: ExecutionContext = { runId, nodeId, attempt, triggerPayload, nodeOutputs };
  const startedAt = new Date();
  const startMs = Date.now();

  // Snapshot input — cast through unknown to satisfy Prisma's strict JsonValue
  const inputSnapshot = { triggerPayload, nodeOutputs } as unknown as object;

  let output: Record<string, unknown>;
  try {
    output = await handlers[node.type as NodeType](ctx, node.config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.nodeExecution.create({
      data: {
        runId,
        nodeId,
        attempt,
        status: 'failed',
        input: inputSnapshot,
        output: { error: message } as object,
        durationMs: Date.now() - startMs,
        startedAt,
      },
    });
    throw err;
  }

  const durationMs = Date.now() - startMs;
  await prisma.nodeExecution.create({
    data: {
      runId,
      nodeId,
      attempt,
      status: 'success',
      input: inputSnapshot,
      output: output as unknown as object,
      durationMs,
      startedAt,
    },
  });

  nodeOutputs[nodeId] = output;
  nodeLogger.info({ durationMs }, 'orchestrator: node completed');

  // Delay sentinel — re-enqueue with BullMQ delay so the worker thread is freed
  if (output.__flow_delay === true) {
    const delaySeconds = (output.delaySeconds as number) ?? 0;
    const nextNodeId = getNextNodeId(definition, nodeId, null);
    if (nextNodeId) {
      const queue = createRunQueue();
      await queue.add(
        'run',
        { runId, workflowVersionId: run.workflowVersionId, triggerPayload, resumeFromNodeId: nextNodeId },
        { delay: delaySeconds * 1000 },
      );
      await queue.close();
    }
    return;
  }

  const conditionResult = node.type === 'condition' ? (output.result as boolean) : null;
  const nextNodeId = getNextNodeId(definition, nodeId, conditionResult);
  if (!nextNodeId) {
    nodeLogger.info('orchestrator: no more nodes — execution path complete');
    return;
  }

  await executeNode(runId, nextNodeId, definition, nodeOutputs, triggerPayload, runLogger);
}

function getNextNodeId(
  definition: WorkflowDefinition,
  currentNodeId: string,
  conditionResult: boolean | null,
): string | null {
  const edges = definition.edges.filter((e) => e.from === currentNodeId);
  if (edges.length === 0) return null;

  if (conditionResult !== null) {
    return edges.find((e) => e.condition === (conditionResult ? 'true' : 'false'))?.to ?? null;
  }

  return edges[0].to;
}

async function getAttemptNumber(runId: string, nodeId: string): Promise<number> {
  const last = await prisma.nodeExecution.findFirst({
    where: { runId, nodeId },
    orderBy: { attempt: 'desc' },
  });
  return (last?.attempt ?? 0) + 1;
}
