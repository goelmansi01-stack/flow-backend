import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { logger } from '../lib/logger';
import { globalRateLimiter } from './middleware/rateLimiter.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import authRoutes from './routes/auth.routes';
import workflowRoutes from './routes/workflow.routes';
import runRoutes from './routes/run.routes';
import healthRoutes from './routes/health.routes';
import shareRoutes from './routes/share.routes';

const app = express();

// Disable ETag generation: API responses must not return 304, which strips the
// body and breaks Axios retries after a 401→refresh→retry cycle (the retry has
// a different Authorization header but the same If-None-Match, so the server
// returns 304 with no body and the client receives undefined data).
app.set('etag', false);

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(globalRateLimiter);

// Serve the workflow runner UI
app.use(express.static('src/public'));

// All /api responses are user-scoped — never let shared/intermediate caches store them.
app.use('/api', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api', shareRoutes);   // public routes must be before runRoutes (which has router.use(authenticate))
app.use('/api', runRoutes);
app.use(healthRoutes);

app.use(errorMiddleware);

export default app;
