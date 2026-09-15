import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getSignedDownloadUrl } from '@/lib/storage';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const sourceUrl = job.sourceKey ? await getSignedDownloadUrl(job.sourceKey) : null;
  const outputUrl = job.outputKey ? await getSignedDownloadUrl(job.outputKey) : null;

  return NextResponse.json({
    job: {
      ...job,
      captionJson: job.captionJson ? JSON.parse(job.captionJson) : null,
    },
    sourceUrl,
    outputUrl,
  });
}
