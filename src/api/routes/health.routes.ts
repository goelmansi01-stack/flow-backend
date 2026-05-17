import { Router, Request, Response } from 'express';
import { prisma } from '../../lib/db';
import { createRunQueue } from '../../lib/queue';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  // DB check
  let dbError: string | undefined;
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    dbError = err instanceof Error ? err.message : String(err);
  }

  // Queue (Redis) check
  try {
    const queue = createRunQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'failed');
    await queue.close();
    checks.queue = 'ok';
    const healthy = Object.values(checks).every((v) => v === 'ok');
    return res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      checks,
      ...(dbError ? { dbError } : {}),
      queue: counts,
      uptime: process.uptime(),
    });
  } catch {
    checks.queue = 'error';
  }

  const healthy = Object.values(checks).every((v) => v === 'ok');
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    checks,
    ...(dbError ? { dbError } : {}),
    uptime: process.uptime(),
  });
});

export default router;
