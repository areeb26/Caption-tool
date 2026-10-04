import { auth, configuredProviders } from '@/auth';
import { db, schema } from '@/db';
import { eq } from 'drizzle-orm';

const DEV_USER_ID = 'dev-local-user';
const DEV_USER_EMAIL = 'dev@localhost';

/**
 * Resolve the current user's id.
 *
 * In production (or once a real OAuth/email provider is configured) this
 * is just the NextAuth session user id. When NO auth provider has been
 * configured (no GOOGLE_CLIENT_ID/SECRET and no EMAIL_SERVER/EMAIL_FROM),
 * running in a non-production environment, we transparently fall back to
 * a single local "dev user" so the rest of the app (dashboard, upload,
 * editor, export) is exercisable out of the box without setting up OAuth.
 * This fallback never applies in production.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) {
    // JWT sessions outlive account changes, so confirm the user still
    // exists and hasn't been disabled by an admin.
    const user = await getUser(session.user.id);
    return user && !user.disabled ? user.id : null;
  }

  const noProvidersConfigured =
    !configuredProviders.google && !configuredProviders.email && !configuredProviders.credentials;
  if (noProvidersConfigured && process.env.NODE_ENV !== 'production') {
    await ensureDevUser();
    return DEV_USER_ID;
  }

  return null;
}

export async function getUser(id: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return user ?? null;
}

/** The signed-in user if they are an enabled admin, else null. */
export async function getCurrentAdmin() {
  const id = await getCurrentUserId();
  if (!id) return null;
  const user = await getUser(id);
  return user?.role === 'admin' ? user : null;
}

let devUserEnsured = false;
async function ensureDevUser() {
  if (devUserEnsured) return;
  const existing = await db.select().from(schema.users).where(eq(schema.users.id, DEV_USER_ID));
  if (existing.length === 0) {
    await db.insert(schema.users).values({
      id: DEV_USER_ID,
      email: DEV_USER_EMAIL,
      name: 'Dev User',
    });
  }
  devUserEnsured = true;
}
