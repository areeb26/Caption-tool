import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { hashPassword, verifyPassword } from '@/lib/password';

export function normalizeUsername(raw: unknown): string {
  return String(raw ?? '').trim().toLowerCase();
}

export async function findByUsername(username: string) {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  return u ?? null;
}

/**
 * Bootstrap the first admin from ADMIN_USERNAME / ADMIN_PASSWORD. The env
 * password is (re)applied on each login attempt for that username, so it
 * doubles as a recovery path if the admin forgets their password.
 */
async function ensureEnvAdmin() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) return;
  const existing = await findByUsername(username);
  if (!existing) {
    await db.insert(schema.users).values({
      id: randomUUID(),
      username,
      email: `${username}@local`,
      name: username,
      passwordHash: hashPassword(password),
      role: 'admin',
    });
  } else if (!existing.passwordHash || !verifyPassword(password, existing.passwordHash)) {
    await db
      .update(schema.users)
      .set({ passwordHash: hashPassword(password), role: 'admin', disabled: 0 })
      .where(eq(schema.users.id, existing.id));
  }
}

export async function authenticate(rawUsername: unknown, password: unknown) {
  const username = normalizeUsername(rawUsername);
  if (!username || typeof password !== 'string' || !password) return null;
  await ensureEnvAdmin();
  const user = await findByUsername(username);
  if (!user || user.disabled || !user.passwordHash) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  return user;
}
