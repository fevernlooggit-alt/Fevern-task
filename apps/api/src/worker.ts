import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { closeExpiredDone, cleanupStaleLocks } from './jobs/maintenance.js';

// Background worker (PRD §3). In Phase 1 it runs the two scheduled maintenance
// jobs on a timer. Phase 2 adds BullMQ queues (email IMAP polling, EVA async,
// webhook retries) against REDIS_URL — the seam is here.

const MAINTENANCE_INTERVAL_MS = 60_000;

async function tick(): Promise<void> {
  try {
    const closed = await closeExpiredDone();
    const unlocked = await cleanupStaleLocks();
    if (closed || unlocked) {
      // eslint-disable-next-line no-console
      console.log(`[worker] maintenance: closed=${closed} staleLocksReleased=${unlocked}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[worker] maintenance error', err);
  }
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] starting; redis=${env.redisUrl}; interval=${MAINTENANCE_INTERVAL_MS}ms`);
  await tick();
  const timer = setInterval(() => void tick(), MAINTENANCE_INTERVAL_MS);

  const shutdown = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[worker] fatal', err);
  process.exit(1);
});
