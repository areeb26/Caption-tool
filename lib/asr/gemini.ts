import { AsrError, type TranscriptResult, type TranscriptWord } from './types';

/**
 * Gemini as the speech-to-text step. Unlike Whisper, Gemini does not return
 * word-level timestamps, so we ask for short timed segments and spread each
 * segment's words across its time range by character length. Timing is
 * therefore approximate (typically within a fraction of a second).
 *
 * For Roman Urdu (language 'ur') Gemini writes the Roman text directly, so
 * the separate romanization step is a no-op for these words.
 *
 * Env: GEMINI_API_KEY (required), GEMINI_ASR_MODEL (default gemini-2.5-flash).
 */
export async function transcribeWithGemini(
  audioUrl: string,
  language?: string
): Promise<TranscriptResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new AsrError('gemini', 'GEMINI_API_KEY is not set');
  const model = process.env.GEMINI_ASR_MODEL || 'gemini-2.5-flash';

  const absoluteUrl = audioUrl.startsWith('/')
    ? `http://127.0.0.1:${process.env.PORT || 3000}${audioUrl}`
    : audioUrl;
  const audioRes = await fetch(absoluteUrl).catch((err) => {
    throw new AsrError('gemini', 'failed to fetch audio', err);
  });
  if (!audioRes.ok) throw new AsrError('gemini', `failed to fetch audio: ${audioRes.status}`);
  const audioB64 = Buffer.from(await audioRes.arrayBuffer()).toString('base64');

  const scriptRule =
    language === 'ur'
      ? 'The speech is Urdu (possibly mixed with English). Write it in Roman Urdu: Urdu in English letters, casual lowercase spelling as used in Reels captions (aap kaise hain, main theek hoon). Keep English words as normal English.'
      : language
        ? `The speech is in the language with ISO code "${language}". Write it in that language's normal script.`
        : 'Detect the spoken language and write it in its normal script.';

  const prompt = `Transcribe this audio verbatim. ${scriptRule}
Return a JSON array of short segments of at most 6 words each, in order. Each item: "start" and "end" in seconds from the start of the audio (decimals allowed, as accurate as you can), and "text". Do not add commentary or translate. If there is no speech, return [].`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ inlineData: { mimeType: 'audio/wav', data: audioB64 } }, { text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                start: { type: 'NUMBER' },
                end: { type: 'NUMBER' },
                text: { type: 'STRING' },
              },
              required: ['start', 'end', 'text'],
            },
          },
        },
      }),
    }
  ).catch((err) => {
    throw new AsrError('gemini', 'request failed', err);
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new AsrError('gemini', `API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  let segments: { start: number; end: number; text: string }[];
  try {
    segments = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]');
  } catch (err) {
    throw new AsrError('gemini', 'could not parse transcript JSON', err);
  }

  const words: TranscriptWord[] = [];
  let prevEnd = 0;
  for (const seg of segments) {
    const toks = String(seg.text ?? '').trim().split(/\s+/).filter(Boolean);
    if (toks.length === 0) continue;
    // Keep segments monotonic and non-empty even if the model's times are sloppy.
    const start = Math.max(Number(seg.start) || 0, prevEnd);
    const end = Math.max(Number(seg.end) || 0, start + 0.15 * toks.length);
    const totalChars = toks.reduce((n, t) => n + t.length + 1, 0);
    let cursor = start;
    for (const t of toks) {
      const dur = ((t.length + 1) / totalChars) * (end - start);
      words.push({
        text: t,
        startMs: Math.round(cursor * 1000),
        endMs: Math.round((cursor + dur) * 1000),
      });
      cursor += dur;
    }
    prevEnd = end;
  }

  return { words, vendor: 'gemini', raw: data };
}
