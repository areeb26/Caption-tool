import { signIn, configuredProviders } from '@/auth';
import { redirect } from 'next/navigation';

export default function SignInPage() {
  async function googleSignIn() {
    'use server';
    await signIn('google', { redirectTo: '/dashboard' });
  }

  async function emailSignIn(formData: FormData) {
    'use server';
    const email = String(formData.get('email') || '');
    await signIn('nodemailer', { email, redirectTo: '/dashboard' });
  }

  async function devSignIn() {
    'use server';
    redirect('/dashboard');
  }

  const noProvidersConfigured = !configuredProviders.google && !configuredProviders.email;

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
