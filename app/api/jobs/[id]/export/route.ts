import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { runExportPipeline } from '@/lib/pipeline/export';
import { getSignedDownloadUrl } from '@/lib/storage';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!job.captionJson) {
    return NextResponse.json({ error: 'job has no captions to export yet' }, { status: 400 });
  }

  // US-14: enforce one active render at a time per user.
  const [alreadyExporting] = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), eq(schema.jobs.status, 'exporting')));

  if (alreadyExporting && alreadyExporting.id !== job.id) {
    return NextResponse.json(
      {
        error:
          'You already have an export in progress. Wait for it to finish before starting another.',
      },
      { status: 429 }
    );
  }

  await db
    .update(schema.jobs)
    .set({ status: 'exporting', errorMessage: null, updatedAt: new Date() })
    .where(eq(schema.jobs.id, job.id));

  try {
    const outputKey = await runExportPipeline(job.id);
    const downloadUrl = await getSignedDownloadUrl(outputKey);
    return NextResponse.json({ ok: true, outputKey, downloadUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
