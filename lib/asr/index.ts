import { transcribeWithDeepgram } from './deepgram';
import { transcribeWithAssemblyAI } from './assemblyai';
import { transcribeWithWhisper } from './whisper';
import { AsrError, type AsrVendor, type TranscriptResult } from './types';

export * from './types';

export async function transcribe(
  vendor: AsrVendor,
  audioUrl: string
): Promise<TranscriptResult> {
  switch (vendor) {
    case 'deepgram':
      return transcribeWithDeepgram(audioUrl);
    case 'assemblyai':
      return transcribeWithAssemblyAI(audioUrl);
    case 'whisper':
      return transcribeWithWhisper(audioUrl);
    default:
      throw new AsrError(vendor, `unknown ASR vendor`);
  }
}

/** Default vendor order per the PRD's ASR recommendation. */
export const DEFAULT_VENDOR_ORDER: AsrVendor[] = ['deepgram', 'assemblyai', 'whisper'];

/**
 * Try vendors in order, falling back to the next on failure (including a
 * missing API key). Throws only if every vendor in the list fails.
 */
export async function transcribeWithFallback(
  preferredOrder: AsrVendor[],
  audioUrl: string
): Promise<TranscriptResult> {
  const errors: string[] = [];
  for (const vendor of preferredOrder) {
    try {
      return await transcribe(vendor, audioUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      // eslint-disable-next-line no-console
      console.warn(`ASR vendor ${vendor} failed, trying next:`, message);
    }
  }
  throw new Error(`All ASR vendors failed: ${errors.join(' | ')}`);
}
