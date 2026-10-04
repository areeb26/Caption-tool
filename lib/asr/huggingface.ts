import { AsrError, type TranscriptResult, type TranscriptWord } from './types';

/**
 * Whisper hosted on Hugging Face (Inference Providers / Inference Endpoints).
 * Audio is sent as base64 JSON with `return_timestamps: "word"`, and the
 * response carries `chunks: [{ text, timestamp: [start, end] }]`.
 *
 * Env: HF_TOKEN (required), HF_WHISPER_MODEL (default openai/whisper-large-v3),
 * HF_ASR_URL (override the full endpoint, e.g. a dedicated Inference Endpoint).
 */
export async function transcribeWithHuggingFace(
  audioUrl: string,
  language?: string
): Promise<TranscriptResult> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new AsrError('huggingface', 'HF_TOKEN is not set');

  const model = process.env.HF_WHISPER_MODEL || 'openai/whisper-large-v3';
  const endpoint =
    process.env.HF_ASR_URL || `https://router.huggingface.co/hf-inference/models/${model}`;

  // Local-storage mode hands back a same-origin relative path.
  const absoluteUrl = audioUrl.startsWith('/')
    ? `http://127.0.0.1:${process.env.PORT || 3000}${audioUrl}`
    : audioUrl;
  const audioRes = await fetch(absoluteUrl).catch((err) => {
    throw new AsrError('huggingface', 'failed to fetch audio for upload', err);
  });
  if (!audioRes.ok) {
    throw new AsrError('huggingface', `failed to fetch audio: ${audioRes.status}`);
  }
  const audioB64 = Buffer.from(await audioRes.arrayBuffer()).toString('base64');

  const parameters: Record<string, unknown> = { return_timestamps: 'word' };
  if (language) parameters.generate_kwargs = { language, task: 'transcribe' };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Wait for a cold model to load instead of failing with 503.
      'x-wait-for-model': 'true',
    },
    body: JSON.stringify({ inputs: audioB64, parameters }),
  }).catch((err) => {
    throw new AsrError('huggingface', 'request failed', err);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AsrError('huggingface', `API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const words: TranscriptWord[] = (data.chunks ?? [])
    .filter((c: any) => Array.isArray(c.timestamp) && c.timestamp[0] != null)
    .map((c: any) => {
      const start = Number(c.timestamp[0]);
      // The final chunk's end can be null; fall back to a short default.
      const end = c.timestamp[1] != null ? Number(c.timestamp[1]) : start + 0.4;
      return {
        text: String(c.text).trim(),
        startMs: Math.round(start * 1000),
        endMs: Math.round(end * 1000),
      };
    })
    .filter((w: TranscriptWord) => w.text);

  if (words.length === 0 && data.text) {
    throw new AsrError(
      'huggingface',
      'model returned no word-level timestamps (use a Whisper model/endpoint that supports return_timestamps="word")'
    );
  }

  return { words, vendor: 'huggingface', raw: data };
}
