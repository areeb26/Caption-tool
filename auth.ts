import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import Nodemailer from 'next-auth/providers/nodemailer';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db, schema } from '@/db';
import { authenticate } from '@/lib/users';

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

// Username/password accounts, created by an admin at /admin. Always
// registered; the first admin comes from ADMIN_USERNAME/ADMIN_PASSWORD.
providers.push(
  Credentials({
    credentials: { username: {}, password: {} },
    async authorize(creds) {
      const user = await authenticate(creds?.username, creds?.password);
      return user ? { id: user.id, name: user.name, email: user.email } : null;
    },
  })
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // Credentials sign-in requires JWT sessions in Auth.js.
  session: { strategy: 'jwt' },
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
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
  credentials: !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD),
  email: providers.some((p) => (typeof p === 'function' ? p() : p).id === 'nodemailer'),
};
