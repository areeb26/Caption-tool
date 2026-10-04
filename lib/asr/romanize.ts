import type { TranscriptWord } from './types';

/**
 * Urdu (Arabic script) -> Roman Urdu ("Urdu written in English letters"),
 * the way people actually type it in chat/Reels captions: "aap kaise hain",
 * "main theek hoon". Whisper transcribes Urdu in Perso-Arabic script, so we
 * transliterate word-by-word, 1:1, which keeps every word's timestamps intact.
 *
 * Uses an OpenAI chat model because rule-based transliteration can't recover
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

async function romanizeBatch(texts: string[], apiKey: string, model: string): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
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
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`romanization API error ${res.status}: ${body}`);
    }
    const data = await res.json();
    try {
      const out = JSON.parse(data.choices?.[0]?.message?.content ?? '{}')?.words;
      if (Array.isArray(out) && out.length === texts.length) return out.map((w) => String(w));
    } catch {
      /* fall through to retry */
    }
  }
  throw new Error('romanization returned a mismatched word count');
}

export async function romanizeUrduWords(words: TranscriptWord[]): Promise<TranscriptWord[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for Roman Urdu captions');
  const model = process.env.ROMANIZE_MODEL || 'gpt-4o-mini';

  const result: TranscriptWord[] = [];
  for (let i = 0; i < words.length; i += BATCH_SIZE) {
    const batch = words.slice(i, i + BATCH_SIZE);
    const texts = batch.map((w) => w.text);
    // Skip the API call entirely for batches with nothing to convert.
    const roman = texts.some(isArabicScript) ? await romanizeBatch(texts, apiKey, model) : texts;
    batch.forEach((w, j) => result.push({ ...w, text: roman[j].trim() || w.text }));
  }
  return result;
}
