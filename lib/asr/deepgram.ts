import { AsrError, type TranscriptResult, type TranscriptWord } from './types';

/**
 * Deepgram prerecorded transcription. Expects `audioUrl` to be a URL
 * Deepgram's servers can fetch (e.g. a signed download URL from our
 * storage layer), per Deepgram's "remote file" prerecorded API.
 */
export async function transcribeWithDeepgram(audioUrl: string): Promise<TranscriptResult> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new AsrError('deepgram', 'DEEPGRAM_API_KEY is not set');
  }

  const endpoint =
    'https://api.deepgram.com/v1/listen?model=nova-2&punctuate=true&smart_format=true&words=true';

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: audioUrl }),
    });
  } catch (err) {
    throw new AsrError('deepgram', 'network request failed', err);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AsrError('deepgram', `API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const alt = data?.results?.channels?.[0]?.alternatives?.[0];
  const words: TranscriptWord[] = (alt?.words ?? []).map((w: any) => ({
    text: String(w.punctuated_word ?? w.word),
    startMs: Math.round(Number(w.start) * 1000),
    endMs: Math.round(Number(w.end) * 1000),
  }));

  return { words, vendor: 'deepgram', raw: data };
}
