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

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));
app.use(globalRateLimiter);

// Serve the workflow runner UI
app.use(express.static('src/public'));

app.use('/api/auth', authRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api', runRoutes);
app.use('/api', shareRoutes);
app.use(healthRoutes);

app.use(errorMiddleware);

export default app;
