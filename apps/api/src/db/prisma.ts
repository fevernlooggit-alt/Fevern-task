import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';

// A single shared PrismaClient for the process. Tests import this same instance
// so they exercise the exact client the app uses.
export const prisma = new PrismaClient({
  datasources: { db: { url: env.databaseUrl } },
  log: env.isTest ? ['warn', 'error'] : ['warn', 'error'],
});

export type Db = typeof prisma;
