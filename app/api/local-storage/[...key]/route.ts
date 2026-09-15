// Local-filesystem stand-in for a presigned S3 URL, used only when
// S3_* env vars are absent (see lib/storage.ts). Accepts a PUT of the raw
// file body at the same path a real presigned URL would use, and serves
// it back with GET — same-origin, so the client upload code path in
// /upload is identical between cloud and local-storage modes.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import { localFsPath } from '@/lib/storage';

function resolveKey(keyParts: string[]): string {
  return keyParts.map(decodeURIComponent).join('/');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = resolveKey(keyParts);
  const targetPath = localFsPath(key);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  const arrayBuffer = await req.arrayBuffer();
  await fs.writeFile(targetPath, Buffer.from(arrayBuffer));

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: keyParts } = await params;
  const key = resolveKey(keyParts);
  const targetPath = localFsPath(key);

  if (!fssync.existsSync(targetPath)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const stat = await fs.stat(targetPath);
  const stream = fssync.createReadStream(targetPath);
  const contentType = guessContentType(targetPath);

  // @ts-expect-error - Node ReadStream is a valid BodyInit in the Next.js runtime
  return new NextResponse(stream, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
    },
  });
}

function guessContentType(p: string): string {
  if (p.endsWith('.mp4')) return 'video/mp4';
  if (p.endsWith('.mov')) return 'video/quicktime';
  if (p.endsWith('.wav')) return 'audio/wav';
  return 'application/octet-stream';
}
