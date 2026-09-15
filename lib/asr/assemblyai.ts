import { AsrError, type TranscriptResult, type TranscriptWord } from './types';

const BASE = 'https://api.assemblyai.com/v2';

/**
 * AssemblyAI transcription. `audioUrl` should be a URL AssemblyAI's
 * servers can fetch (a signed download URL from our storage layer works
 * for both S3/R2 and, if S3_PUBLIC_BASE_URL is set, local storage).
 * Submits the URL directly (AssemblyAI accepts any publicly-fetchable
 * audio_url, so a separate upload step is only needed for local files
 * that aren't reachable from the internet).
 */
export async function transcribeWithAssemblyAI(audioUrl: string): Promise<TranscriptResult> {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  if (!apiKey) {
    throw new AsrError('assemblyai', 'ASSEMBLYAI_API_KEY is not set');
  }

  const submitRes = await fetch(`${BASE}/transcript`, {
    method: 'POST',
    headers: {
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ audio_url: audioUrl }),
  }).catch((err) => {
    throw new AsrError('assemblyai', 'submit request failed', err);
  });

  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '');
    throw new AsrError('assemblyai', `submit error ${submitRes.status}: ${body}`);
  }
  const submitJson = await submitRes.json();
  const id = submitJson.id;
  if (!id) throw new AsrError('assemblyai', 'no transcript id returned');

  const pollIntervalMs = 3000;
  const maxAttempts = 200; // ~10 minutes
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const pollRes = await fetch(`${BASE}/transcript/${id}`, {
      headers: { authorization: apiKey },
    });
    if (!pollRes.ok) {
      const body = await pollRes.text().catch(() => '');
      throw new AsrError('assemblyai', `poll error ${pollRes.status}: ${body}`);
    }
    const pollJson = await pollRes.json();
    if (pollJson.status === 'completed') {
      const words: TranscriptWord[] = (pollJson.words ?? []).map((w: any) => ({
        text: String(w.text),
        startMs: Number(w.start),
        endMs: Number(w.end),
      }));
      return { words, vendor: 'assemblyai', raw: pollJson };
    }
    if (pollJson.status === 'error') {
      throw new AsrError('assemblyai', `transcription failed: ${pollJson.error}`);
    }
    // else: queued | processing — keep polling
  }
  throw new AsrError('assemblyai', 'timed out waiting for transcript');
}
