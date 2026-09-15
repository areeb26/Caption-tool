// Pipeline step: ready -> exporting -> done. Runs the ffmpeg+ASS burn-in
// synchronously inside the API route handler for this MVP pass. Structured
// the same way as lib/pipeline/process.ts for an easy future queue swap.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { downloadToTmp, uploadFromTmp } from '@/lib/storage';
import { burnInCaptions } from '@/lib/export/burnin';
import type { CaptionDoc } from '@/lib/captionTypes';

export async function runExportPipeline(jobId: string): Promise<string> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) throw new Error(`job ${jobId} not found`);
  if (!job.sourceKey) throw new Error(`job ${jobId} has no source video`);
  if (!job.captionJson) throw new Error(`job ${jobId} has no caption data yet`);

  const captionDoc: CaptionDoc = JSON.parse(job.captionJson);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `export-${jobId}-`));
  try {
    const sourcePath = path.join(workDir, 'source' + guessExt(job.sourceMimeType));
    await downloadToTmp(job.sourceKey, sourcePath);

    const outPath = path.join(workDir, 'output.mp4');
    await burnInCaptions(sourcePath, captionDoc, job.presetId, outPath);

    const outputKey = `outputs/${jobId}/output.mp4`;
    await uploadFromTmp(outputKey, outPath, 'video/mp4');

    await db
      .update(schema.jobs)
      .set({ outputKey, status: 'done', errorMessage: null, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));

    return outputKey;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(schema.jobs)
      .set({ status: 'failed', errorMessage: message, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));
    throw err;
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

function guessExt(mime: string | null): string {
  if (mime === 'video/quicktime') return '.mov';
  return '.mp4';
}
