import '../lib/config'; // validates env on startup
import app from './app';
import { config } from '../lib/config';
import { logger } from '../lib/logger';
import { prisma } from '../lib/db';

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Flow API server started');
});

async function gracefulShutdown(signal: string) {
  logger.info({ signal }, 'received shutdown signal');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
