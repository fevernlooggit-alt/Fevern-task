import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

// AES-256-GCM encryption for channel credentials at rest (PRD §3, DEC-008).
// Stored shape is a JSON object so it lives naturally in a jsonb column.

export interface EncryptedBlob {
  v: 1;
  iv: string; // base64
  tag: string; // base64
  data: string; // base64 ciphertext
}

function key(): Buffer {
  const raw = env.encryptionKey;
  // Accept hex (64 chars) or base64.
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex');
  else buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (256-bit) as hex or base64');
  }
  return buf;
}

export function encryptJson(value: unknown): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: data.toString('base64') };
}

export function decryptJson<T = unknown>(blob: EncryptedBlob): T {
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(blob.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
  const out = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
  return JSON.parse(out.toString('utf8')) as T;
}

export function isEncryptedBlob(x: unknown): x is EncryptedBlob {
  return (
    typeof x === 'object' &&
    x !== null &&
    (x as EncryptedBlob).v === 1 &&
    typeof (x as EncryptedBlob).iv === 'string' &&
    typeof (x as EncryptedBlob).tag === 'string' &&
    typeof (x as EncryptedBlob).data === 'string'
  );
}
