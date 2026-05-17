import { execSync } from 'child_process';

export default async function globalSetup() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://flow_user:flow_pass@localhost:5432/flow_test';
  process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';
  process.env.JWT_SECRET = 'test-jwt-secret-at-least-16-chars';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-16-chars-min';
  process.env.NODE_ENV = 'test';

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    stdio: 'inherit',
  });
}
