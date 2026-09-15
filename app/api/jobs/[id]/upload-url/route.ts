import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId } from '@/lib/auth-helpers';
import { getSignedUploadUrl } from '@/lib/storage';

const MAX_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_MIME = ['video/mp4', 'video/quicktime'];

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id));
  if (!job || job.userId !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const contentType: string = body?.contentType || 'video/mp4';
  const sizeBytes: number | undefined = body?.sizeBytes;

  if (!ALLOWED_MIME.includes(contentType)) {
    return NextResponse.json(
      { error: `unsupported format "${contentType}" — only MP4/MOV are supported` },
      { status: 400 }
    );
  }
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_BYTES) {
    return NextResponse.json(
      { error: 'file exceeds the 500MB limit' },
      { status: 400 }
    );
  }

  const ext = contentType === 'video/quicktime' ? 'mov' : 'mp4';
  const sourceKey = `uploads/${job.id}/source.${ext}`;

  const uploadUrl = await getSignedUploadUrl(sourceKey, contentType);

  await db
    .update(schema.jobs)
    .set({
      sourceKey,
      sourceMimeType: contentType,
      sourceSizeBytes: sizeBytes ?? null,
      updatedAt: new Date(),
    })
    .where(eq(schema.jobs.id, job.id));

  return NextResponse.json({ uploadUrl, sourceKey, method: 'PUT' });
}
