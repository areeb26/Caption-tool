// Pipeline step: uploaded video -> extract audio -> ASR -> phrase grouping -> ready.
// Runs synchronously inside the API route handler for this MVP pass (no
// external queue). Structured as a single async function so swapping in a
// real queue (BullMQ/Inngest) later just means calling this from a worker
// instead of directly from the route handler.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db';
import { downloadToTmp, getSignedDownloadUrl, uploadFromTmp } from '@/lib/storage';
import { extractAudio, probeDurationMs } from '@/lib/export/burnin';
import { DEFAULT_VENDOR_ORDER, transcribeWithFallback, type AsrVendor } from '@/lib/asr';
import { romanizeUrduWords } from '@/lib/asr/romanize';
import { groupWordsIntoPhrases } from '@/lib/phraseGrouper';

export async function runProcessingPipeline(jobId: string): Promise<void> {
  const [job] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, jobId));
  if (!job) throw new Error(`job ${jobId} not found`);
  if (!job.sourceKey) throw new Error(`job ${jobId} has no uploaded source`);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `job-${jobId}-`));
  try {
    await setStatus(jobId, 'transcribing');

    const sourcePath = path.join(workDir, 'source' + guessExt(job.sourceMimeType));
    await downloadToTmp(job.sourceKey, sourcePath);

    const durationMs = await probeDurationMs(sourcePath).catch(() => null);
    if (durationMs !== null) {
      await db
        .update(schema.jobs)
        .set({ sourceDurationMs: durationMs, updatedAt: new Date() })
        .where(eq(schema.jobs.id, jobId));
    }

    const audioPath = path.join(workDir, 'audio.wav');
    await extractAudio(sourcePath, audioPath);

    const audioKey = `audio/${jobId}/audio.wav`;
    await uploadFromTmp(audioKey, audioPath, 'audio/wav');
    await db
      .update(schema.jobs)
      .set({ audioKey, updatedAt: new Date() })
      .where(eq(schema.jobs.id, jobId));

    const audioUrl = await getSignedDownloadUrl(audioKey);
    // Roman Urdu: the engine transcribes Urdu, then we romanize it. Whisper is
    // the only vendor used for this mode (it handles Urdu well and lets us
    // pin the language). WHISPER_PROVIDER=huggingface runs it on Hugging Face.
    const romanUrdu = job.language === 'roman-urdu';
    const preferredOrder = vendorOrder(romanUrdu);

    const transcript = await transcribeWithFallback(
      preferredOrder,
      audioUrl,
      romanUrdu ? 'ur' : job.language === 'en' ? 'en' : undefined
    );
    if (romanUrdu) transcript.words = await romanizeUrduWords(transcript.words);

    await setStatus(jobId, 'grouping');
    const captionDoc = groupWordsIntoPhrases(transcript.words, 'viral-yellow');

    await db
      .update(schema.jobs)
      .set({
        captionJson: JSON.stringify(captionDoc),
        asrVendor: transcript.vendor,
        status: 'ready',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.jobs.id, jobId));
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

// Which transcription engine(s) to try, in order.
// - WHISPER_PROVIDER ('whisper' | 'huggingface' | 'gemini') pins one engine for
//   every language. Gemini's word timing is approximate.
// - Roman Urdu without it uses Whisper (OpenAI or WHISPER_BASE_URL).
// - Otherwise ASR_VENDOR_ORDER or the default fallback chain.
const VENDORS: AsrVendor[] = ['deepgram', 'assemblyai', 'whisper', 'huggingface', 'gemini'];
function vendorOrder(romanUrdu: boolean): AsrVendor[] {
  const pinned = process.env.WHISPER_PROVIDER as AsrVendor | undefined;
  if (pinned && VENDORS.includes(pinned)) return [pinned];
  if (romanUrdu) return ['whisper'];
  return (
    (process.env.ASR_VENDOR_ORDER?.split(',').filter(Boolean) as AsrVendor[] | undefined) ??
    DEFAULT_VENDOR_ORDER
  );
}

async function setStatus(jobId: string, status: string) {
  await db
    .update(schema.jobs)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.jobs.id, jobId));
}

function guessExt(mime: string | null): string {
  if (mime === 'video/quicktime') return '.mov';
  return '.mp4';
}
