import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { runProcessingPipeline } from '@/lib/pipeline/process';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  if (!job.sourceKey) {
    return NextResponse.json({ error: 'no upload registered for this job yet' }, { status: 400 });
  }

  await db
    .update(schema.jobs)
    .set({ status: 'uploaded', updatedAt: new Date() })
    .where(eq(schema.jobs.id, job.id));

  // MVP: run the pipeline synchronously inside the route handler (no
  // external queue yet — see lib/pipeline/process.ts). We don't await the
  // full completion here so the client can start polling /processing
  // immediately; failures are captured into job.status/errorMessage by
  // the pipeline itself.
  runProcessingPipeline(job.id).catch((err) => {
    // eslint-disable-next-line no-console
    console.error(`processing pipeline failed for job ${job.id}:`, err);
  });

  return NextResponse.json({ ok: true });
}
