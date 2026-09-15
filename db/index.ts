import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_PATH || './data/app.db';

// Ensure the data directory exists before sqlite tries to open the file.
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };
