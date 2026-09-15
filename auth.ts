import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, schema } from '@/db';

// Only register providers whose env vars are actually configured, so the
// app still boots (and other providers still work) when e.g. Google OAuth
// credentials or SMTP settings are absent. Per the PRD, this must not
// crash the build/boot — sign-in for a missing provider just won't work
// until its env vars are set.
const providers: NonNullable<NextAuthConfig['providers']> = [];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    })
  );
}

if (process.env.EMAIL_SERVER && process.env.EMAIL_FROM) {
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  session: { strategy: 'database' },
  providers,
  // Falls back to an insecure fixed secret outside production so the app
  // boots without extra setup; NEXTAUTH_SECRET is required in production.
  secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV !== 'production' ? 'dev-insecure-secret' : undefined),
  pages: {
    signIn: '/signin',
  },
});

export const configuredProviders = {
  google: providers.some((p) => (typeof p === 'function' ? p() : p).id === 'google'),
  email: providers.some((p) => (typeof p === 'function' ? p() : p).id === 'nodemailer'),
};
