import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { desc, eq, isNull, and } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { parseCaptionLanguage } from '@/lib/languages';

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rows = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), isNull(schema.jobs.deletedAt)))
    .orderBy(desc(schema.jobs.updatedAt));

  return NextResponse.json({ jobs: rows });
}

export async function POST(req: NextRequest) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'Untitled project';

  const id = randomUUID();
  await db.insert(schema.jobs).values({
    id,
    userId,
    name,
    status: 'pending',
    presetId: 'viral-yellow',
    language: parseCaptionLanguage(body?.language),
  });

  return NextResponse.json({ id });
}
