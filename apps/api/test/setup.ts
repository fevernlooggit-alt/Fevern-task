import { beforeEach, afterAll } from 'vitest';
import { prisma } from '../src/db/prisma.js';
import { resetDb, closeApp } from './helpers.js';

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeApp();
  await prisma.$disconnect();
});
