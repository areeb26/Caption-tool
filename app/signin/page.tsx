import { signIn, configuredProviders } from '@/auth';
import { AuthError } from 'next-auth';
import { redirect } from 'next/navigation';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  async function googleSignIn() {
    'use server';
    await signIn('google', { redirectTo: '/dashboard' });
  }

  async function emailSignIn(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '');
    await signIn('nodemailer', { email, redirectTo: '/dashboard' });
  }

  async function passwordSignIn(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        username: String(formData.get('username') || ''),
        password: String(formData.get('password') || ''),
        redirectTo: '/dashboard',
      });
    } catch (err) {
      // signIn signals success via a redirect (thrown); only swallow auth failures.
      if (err instanceof AuthError) redirect('/signin?error=1');
      throw err;
    }
  }

  async function devSignIn() {
    'use server';
    redirect('/dashboard');
  }

  const noProvidersConfigured =
    !configuredProviders.google && !configuredProviders.email && !configuredProviders.credentials;

  return (
    <main className="container" style={{ maxWidth: 420, paddingTop: 80 }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Sign in</h1>
      <p style={{ color: 'var(--text-dim)', marginBottom: 32 }}>
        Sign in to start captioning your videos.
      </p>

      {noProvidersConfigured && (
        <div className="error-box" style={{ background: '#1a2c3a', borderColor: '#2a4a6a', color: '#8ac6e8' }}>
          No auth provider is configured yet (GOOGLE_CLIENT_ID/SECRET or EMAIL_SERVER/EMAIL_FROM).
          In development, the app falls back to a local &quot;dev user&quot; automatically — just
          continue below.
        </div>
      )}

      {error && <div className="error-box">Wrong username or password.</div>}

      {configuredProviders.credentials && (
      <form action={passwordSignIn}>
        <div className="form-field">
          <label htmlFor="username">Username</label>
          <input id="username" name="username" required autoComplete="username" />
        </div>
        <div className="form-field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
          Sign in
        </button>
      </form>
      )}

      {configuredProviders.credentials && (configuredProviders.google || configuredProviders.email) && (
        <div className="divider-or">or</div>
      )}

      {configuredProviders.google && (
        <form action={googleSignIn}>
          <button className="btn btn-secondary" style={{ width: '100%' }} type="submit">
            Continue with Google
          </button>
        </form>
      )}

      {configuredProviders.google && configuredProviders.email && (
        <div className="divider-or">or</div>
      )}

      {configuredProviders.email && (
        <form action={emailSignIn}>
          <div className="form-field">
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" required placeholder="you@example.com" />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
            Send magic link
          </button>
        </form>
      )}

      {noProvidersConfigured && (
        <form action={devSignIn} style={{ marginTop: 16 }}>
          <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
            Continue as dev user
          </button>
        </form>
      )}
    </main>
  );
}
