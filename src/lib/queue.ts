import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from './logger';

export const QUEUE_NAME = 'workflow-runs';

const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function createRedisConnection() {
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  connection.on('error', (err) => {
    logger.error({ err }, 'Redis connection error');
  });

  return connection;
}

export function createRunQueue() {
  return new Queue(QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  });
}

export function createQueueEvents() {
  return new QueueEvents(QUEUE_NAME, {
    connection: createRedisConnection(),
  });
}

export type RunJobData = {
  runId: string;
  workflowVersionId: string;
  triggerPayload: Record<string, unknown> | null;
  resumeFromNodeId?: string;
};
