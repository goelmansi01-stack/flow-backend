import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { AppError } from '../../lib/types';

/**
 * Factory that returns a middleware validating req against a Zod schema.
 * The schema should have `body`, `params`, and/or `query` keys.
 */
export function validate(schema: AnyZodObject) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query,
      });
      req.body = parsed.body ?? req.body;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const messages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
        next(new AppError(422, messages.join('; '), 'VALIDATION_ERROR'));
      } else {
        next(err);
      }
    }
  };
}
