import bcrypt from 'bcryptjs';

// Password hashing seam (DEC-005). bcryptjs today; a native argon2id can replace
// the internals here without touching callers.

const ROUNDS = 10;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
