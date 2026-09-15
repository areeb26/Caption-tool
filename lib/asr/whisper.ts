import { AsrError, type TranscriptResult, type TranscriptWord } from './types';

/**
 * OpenAI Whisper/gpt-4o-transcribe. The OpenAI transcription endpoint
 * requires a multipart file upload rather than a URL, so we fetch the
 * audio bytes from our storage layer's signed URL first, then forward
 * them as multipart/form-data.
 */
export async function transcribeWithWhisper(audioUrl: string): Promise<TranscriptResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AsrError('whisper', 'OPENAI_API_KEY is not set');
  }

  const audioRes = await fetch(audioUrl).catch((err) => {
    throw new AsrError('whisper', 'failed to fetch audio for upload', err);
  });
  if (!audioRes.ok) {
    throw new AsrError('whisper', `failed to fetch audio: ${audioRes.status}`);
  }
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());

  const model = process.env.WHISPER_MODEL || 'whisper-1';
  const form = new FormData();
  form.append('file', new Blob([audioBuf], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  // timestamp_granularities is only honored by whisper-1 in verbose_json mode.
  form.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  }).catch((err) => {
    throw new AsrError('whisper', 'request failed', err);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AsrError('whisper', `API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const words: TranscriptWord[] = (data.words ?? []).map((w: any) => ({
    text: String(w.word),
    startMs: Math.round(Number(w.start) * 1000),
    endMs: Math.round(Number(w.end) * 1000),
  }));

  if (words.length === 0 && data.text) {
    throw new AsrError(
      'whisper',
      'model returned no word-level timestamps (verbose_json/word granularity unsupported by this model)'
    );
  }

  return { words, vendor: 'whisper', raw: data };
}
