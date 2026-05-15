import { Request, Response, NextFunction } from 'express';
import { AppError } from '../../lib/types';
import { logger } from '../../lib/logger';

export function errorMiddleware(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, code: err.code }, 'application error');
    } else {
      logger.warn({ message: err.message, code: err.code }, 'client error');
    }
    return res.status(err.statusCode).json({
      error: { message: err.message, code: err.code ?? 'ERROR' },
    });
  }

  // Unexpected errors
  logger.error({ err }, 'unhandled error');
  res.status(500).json({
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR' },
  });
}
