import 'dotenv/config';

function str(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Env var ${name} must be a number, got: ${v}`);
  return n;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

const isTest = process.env.NODE_ENV === 'test';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isTest,
  isProd: process.env.NODE_ENV === 'production',

  apiPort: num('API_PORT', 3000),
  apiHost: str('API_HOST', '0.0.0.0'),

  databaseUrl: isTest
    ? str('TEST_DATABASE_URL', str('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/icrm_test?schema=public'))
    : str('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/icrm?schema=public'),

  redisUrl: str('REDIS_URL', 'redis://localhost:6379'),

  sessionSecret: str('SESSION_SECRET', 'dev-insecure-session-secret-change-me-please-1234567890'),
  encryptionKey: str('ENCRYPTION_KEY', '0'.repeat(64)),

  cookieSecure: bool('COOKIE_SECURE', false),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,

  // EVA / AI layer
  l2BaseUrl: process.env.L2_BASE_URL || undefined,
  l2ApiKey: process.env.L2_API_KEY || undefined,
  l2Model: str('L2_MODEL', 'local-model'),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  anthropicBaseUrl: str('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
  l3DefaultModel: str('L3_DEFAULT_MODEL', 'claude-sonnet-4-6'),
  costL1: num('COST_L1', 0),
  costL2: num('COST_L2', 0.0004),
  costL3: num('COST_L3', 0.012),
  l2TimeoutMs: num('L2_TIMEOUT_MS', 8000),
  l3TimeoutMs: num('L3_TIMEOUT_MS', 20000),

  // channels
  emailPollIntervalMs: num('EMAIL_POLL_INTERVAL_MS', 60000),
  attachmentMaxBytes: num('ATTACHMENT_MAX_BYTES', 10 * 1024 * 1024),
  storageDir: str('STORAGE_DIR', './storage'),

  // locking
  lockTtlMinutes: num('LOCK_TTL_MINUTES', 10),
};

export type Env = typeof env;
