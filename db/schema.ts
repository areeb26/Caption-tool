// Drizzle schema — written against the sqlite driver for local/dev, but
// deliberately avoiding sqlite-only column shapes (e.g. we store timestamps
// as integers via `timestamp_ms` semantics and JSON as text) so this file
// can be ported to `drizzle-orm/pg-core` with a mostly mechanical swap of
// `sqliteTable` -> `pgTable`, `text` -> `text`/`varchar`, and
// `integer(...).mode('timestamp')` -> `timestamp`.
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ---- Auth.js tables (shape required by @auth/drizzle-adapter) ----
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  emailVerified: integer('emailVerified', { mode: 'timestamp_ms' }),
  image: text('image'),
  // Username/password accounts created from /admin (see lib/users.ts).
  // Google/email users leave these null.
  username: text('username'),
  passwordHash: text('passwordHash'),
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  disabled: integer('disabled').notNull().default(0),
});

export const accounts = sqliteTable('accounts', {
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('providerAccountId').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  expires_at: integer('expires_at'),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
});

export const sessions = sqliteTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

export const verificationTokens = sqliteTable('verificationTokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull(),
  expires: integer('expires', { mode: 'timestamp_ms' }).notNull(),
});

// ---- App tables ----

// Job status lifecycle:
// pending -> uploaded -> transcribing -> grouping -> ready -> exporting -> done
// or -> failed (with errorMessage) / expired (retention cron)
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().default('Untitled project'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('errorMessage'),

  // Storage keys/paths (not full URLs — signed URLs are generated on demand).
  sourceKey: text('sourceKey'),
  audioKey: text('audioKey'),
  outputKey: text('outputKey'),

  sourceMimeType: text('sourceMimeType'),
  sourceDurationMs: integer('sourceDurationMs'),
  sourceSizeBytes: integer('sourceSizeBytes'),

  // Caption JSON (see CaptionDoc shape in lib/phraseGrouper.ts) stored as text.
  captionJson: text('captionJson'),
  presetId: text('presetId').notNull().default('viral-yellow'),

  asrVendor: text('asrVendor'),

  // Caption language chosen at upload: 'auto' | 'en' | 'roman-urdu' (see lib/languages.ts).
  language: text('language').notNull().default('auto'),

  deletedAt: integer('deletedAt', { mode: 'timestamp_ms' }),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
});

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
