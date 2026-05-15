import rateLimit from 'express-rate-limit';
import { config } from '../../lib/config';

export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } },
});

export const executionRateLimiter = rateLimit({
  windowMs: 60_000,
  max: config.EXEC_RATE_LIMIT_MAX,
  keyGenerator: (req) => (req as any).userId ?? req.ip ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Execution rate limit exceeded', code: 'EXEC_RATE_LIMIT_EXCEEDED' } },
});
