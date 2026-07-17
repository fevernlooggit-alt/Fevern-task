import { execSync } from 'node:child_process';
import 'dotenv/config';

// Runs once before the whole suite: apply migrations to the TEST database.
export default function globalSetup(): void {
  const url =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@127.0.0.1:5432/icrm_test?schema=public';
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
