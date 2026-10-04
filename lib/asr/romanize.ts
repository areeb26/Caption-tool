import type { TranscriptWord } from './types';

/**
 * Urdu (Arabic script) -> Roman Urdu ("Urdu written in English letters"),
 * the way people actually type it in chat/Reels captions: "aap kaise hain",
 * "main theek hoon". Whisper transcribes Urdu in Perso-Arabic script, so we
 * transliterate word-by-word, 1:1, which keeps every word's timestamps intact.
 *
 * Uses an LLM (Gemini or OpenAI) because rule-based transliteration can't recover
 * Urdu's unwritten short vowels (کتاب -> "kitaab", not "ktab").
 */

const BATCH_SIZE = 120;

const SYSTEM_PROMPT = `You convert Urdu words written in Urdu/Arabic script into Roman Urdu (Urdu written with English letters) as used in Instagram/Reels captions.
Rules:
- Input is a JSON array of words. Output ONLY a JSON object {"words": [...]} with EXACTLY the same number of items, in the same order. One output item per input item; never merge, split, drop or reorder.
- Use casual, readable Roman Urdu spelling: lowercase, simple vowels (aap, kaise, hain, mein, nahi, theek, kya, hai, tum, acha, bohat, zindagi).
- Words already in English/Latin letters (code-switching) must be returned unchanged.
- Keep punctuation attached exactly as in the input (convert Urdu punctuation like ، ؟ ۔ to , ? .).
- Numbers stay as digits.`;

function isArabicScript(s: string): boolean {
  return /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s);
}

type Provider = { name: 'gemini' | 'openai'; ask: (texts: string[]) => Promise<string> };

function openaiProvider(apiKey: string): Provider {
  const model = process.env.ROMANIZE_MODEL || 'gpt-4o-mini';
  return {
    name: 'openai',
    async ask(texts) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(texts) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI romanization error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? '{}';
    },
  };
}

function geminiProvider(apiKey: string): Provider {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return {
    name: 'gemini',
    async ask(texts) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents: [{ role: 'user', parts: [{ text: JSON.stringify(texts) }] }],
            generationConfig: { temperature: 0, responseMimeType: 'application/json' },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini romanization error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    },
  };
}

/**
 * Gemini is used when GEMINI_API_KEY is set (or ROMANIZE_PROVIDER=gemini);
 * otherwise OpenAI. Whisper transcription itself still needs OPENAI_API_KEY.
 */
function pickProvider(): Provider {
  const gemini = process.env.GEMINI_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const preferred = process.env.ROMANIZE_PROVIDER;
  if (preferred === 'openai' && openai) return openaiProvider(openai);
  if (gemini && preferred !== 'openai') return geminiProvider(gemini);
  if (openai) return openaiProvider(openai);
  throw new Error('GEMINI_API_KEY or OPENAI_API_KEY is required for Roman Urdu captions');
}

async function romanizeBatch(texts: string[], provider: Provider): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const content = await provider.ask(texts);
    try {
      const out = JSON.parse(content)?.words;
      if (Array.isArray(out) && out.length === texts.length) return out.map((w) => String(w));
    } catch {
      /* fall through to retry */
    }
  }
  throw new Error(`${provider.name} romanization returned a mismatched word count`);
}

export async function romanizeUrduWords(words: TranscriptWord[]): Promise<TranscriptWord[]> {
  const provider = pickProvider();

  const result: TranscriptWord[] = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const texts = batch.map((w) => w.text);
    // Skip the API call entirely for batches with nothing to convert.
    const roman = texts.some(isArabicScript) ? await romanizeBatch(texts, provider) : texts;
    batch.forEach((w, j) => result.push({ ...w, text: roman[j].trim() || w.text }));
  }
  return result;
}
