import { asc, eq, isNotNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { db, schema } from '@/db';
import { getCurrentAdmin } from '@/lib/auth-helpers';
import { hashPassword } from '@/lib/password';
import { findByUsername, normalizeUsername } from '@/lib/users';

// Every action re-checks admin rights: server actions are public endpoints.
async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error('forbidden');
  return admin;
}

async function createUser(formData: FormData) {
  'use server';
  await requireAdmin();
  const username = normalizeUsername(formData.get('username'));
  const password = String(formData.get('password') || '');
  const role = formData.get('role') === 'admin' ? 'admin' : 'user';
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) redirect('/admin?msg=bad-username');
  if (password.length < 8) redirect('/admin?msg=short-password');
  if (await findByUsername(username)) redirect('/admin?msg=exists');
  await db.insert(schema.users).values({
    id: randomUUID(),
    username,
    email: `${username}@local`,
    name: username,
    passwordHash: hashPassword(password),
    role,
  });
  revalidatePath('/admin');
  redirect('/admin?msg=created');
}

async function resetPassword(formData: FormData) {
  'use server';
  await requireAdmin();
  const password = String(formData.get('password') || '');
  if (password.length < 8) redirect('/admin?msg=short-password');
  await db
    .update(schema.users)
    .set({ passwordHash: hashPassword(password) })
    .where(eq(schema.users.id, String(formData.get('id'))));
  redirect('/admin?msg=reset');
}

async function toggleDisabled(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const id = String(formData.get('id'));
  if (id === admin.id) redirect('/admin?msg=self');
  await db
    .update(schema.users)
    .set({ disabled: formData.get('disable') === '1' ? 1 : 0 })
    .where(eq(schema.users.id, id));
  revalidatePath('/admin');
}

async function deleteUser(formData: FormData) {
  'use server';
  const admin = await requireAdmin();
  const id = String(formData.get('id'));
  if (id === admin.id) redirect('/admin?msg=self');
  // Cascades to the user's jobs; stored files are cleaned up by the retention cron.
  await db.delete(schema.users).where(eq(schema.users.id, id));
  revalidatePath('/admin');
}

const MESSAGES: Record<string, string> = {
  created: 'User created.',
  reset: 'Password updated.',
  exists: 'That username already exists.',
  'bad-username': 'Username must be 3–32 characters: letters, numbers, . _ -',
  'short-password': 'Password must be at least 8 characters.',
  self: "You can't disable or delete your own account.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string }>;
}) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect('/signin');
  const { msg } = await searchParams;

  const users = await db
    .select()
    .from(schema.users)
    .where(isNotNull(schema.users.username))
    .orderBy(asc(schema.users.username));

  return (
    <main className="container" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Users</h1>
        <Link href="/dashboard" className="btn btn-secondary">
          Back to projects
        </Link>
      </div>

      {msg && MESSAGES[msg] && (
        <div className={msg === 'created' || msg === 'reset' ? 'card' : 'error-box'}>
          {MESSAGES[msg]}
        </div>
      )}

      <form action={createUser} className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>Create user</h2>
        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" required autoComplete="off" />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password (min 8 characters)</label>
          <input id="password" name="password" type="text" required minLength={8} autoComplete="off" />
        </div>
        <div className="form-field">
          <label htmlFor="role">Role</label>
          <select id="role" name="role" defaultValue="user">
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary" type="submit">
          Create user
        </button>
      </form>

      {users.map((u) => (
          <div key={u.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <strong>
                {u.username} {u.role === 'admin' && '(admin)'} {u.disabled ? '(disabled)' : ''}
              </strong>
              {u.id !== admin.id && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <form action={toggleDisabled}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="disable" value={u.disabled ? '0' : '1'} />
                    <button className="btn btn-secondary" type="submit">
                      {u.disabled ? 'Enable' : 'Disable'}
                    </button>
                  </form>
                  <form action={deleteUser}>
                    <input type="hidden" name="id" value={u.id} />
                    <button className="btn btn-danger" type="submit">
                      Delete
                    </button>
                  </form>
                </div>
              )}
            </div>
            <form action={resetPassword} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <input type="hidden" name="id" value={u.id} />
              <input name="password" type="text" minLength={8} placeholder="New password" required />
              <button className="btn btn-secondary" type="submit">
                Set password
              </button>
            </form>
          </div>
      ))}
    </main>
  );
}
