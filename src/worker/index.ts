import '../lib/config'; // validates env on startup
import { Worker } from 'bullmq';
import { QUEUE_NAME, createRedisConnection } from '../lib/queue';
import { orchestrateRun } from './orchestrator';
import { logger } from '../lib/logger';
import type { RunJobData } from '../lib/queue';

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 5);

const worker = new Worker<RunJobData>(
  QUEUE_NAME,
  async (job) => {
    logger.info({ jobId: job.id, runId: job.data.runId }, 'worker: picked up job');
    await orchestrateRun(job);
  },
  {
    connection: createRedisConnection(),
    concurrency,
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, runId: job.data.runId }, 'worker: job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, runId: job?.data?.runId, err }, 'worker: job failed');
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'worker: job stalled — will be retried');
});

logger.info({ concurrency }, 'Flow worker started');

process.on('SIGTERM', async () => {
  logger.info('worker: SIGTERM received — draining');
  await worker.close();
  process.exit(0);
});
