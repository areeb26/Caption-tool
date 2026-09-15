import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import type { CaptionDoc } from '@/lib/captionTypes';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const updates: Partial<typeof schema.jobs.$inferInsert> = { updatedAt: new Date() };

  if (body.captionJson) {
    const doc = body.captionJson as CaptionDoc;
    if (!doc || !Array.isArray(doc.phrases)) {
      return NextResponse.json({ error: 'invalid captionJson' }, { status: 400 });
    }
    updates.captionJson = JSON.stringify(doc);
  }
  if (typeof body.presetId === 'string') {
    updates.presetId = body.presetId;
  }

  await db.update(schema.jobs).set(updates).where(eq(schema.jobs.id, job.id));

  return NextResponse.json({ ok: true });
}
