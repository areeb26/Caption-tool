import type { TranscriptWord } from './asr/types';
import type { CaptionDoc, CaptionPhrase } from './captionTypes';

const MIN_WORDS = 2;
const MAX_WORDS = 5;
const MAX_CHARS = 42;
const PAUSE_BREAK_MS = 350;

/**
 * Group ASR words into phrases of 2-5 words (soft cap 42 chars), forcing a
 * break whenever the inter-word pause exceeds 350ms. Avoids orphan 1-word
 * phrases unless a pause forces one (e.g. a single word followed by a long
 * silence, or the very last word of the transcript).
 */
export function groupWordsIntoPhrases(
  words: TranscriptWord[],
  presetId = 'viral-yellow'
): CaptionDoc {
  const phrases: CaptionPhrase[] = [];
  let current: TranscriptWord[] = [];

  const phraseChars = (ws: TranscriptWord[]) => ws.map((w) => w.text).join(' ').length;

  const flush = () => {
    if (current.length === 0) return;
    phrases.push(makePhrase(current, phrases.length));
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prev = current[current.length - 1];
    const pauseBeforeThisWord = prev ? word.startMs - prev.endMs : 0;

    // Decide whether adding this word would overflow the current phrase.
    const wouldOverflowCount = current.length + 1 > MAX_WORDS;
    const wouldOverflowChars = phraseChars([...current, word]) > MAX_CHARS;
    const pauseForcesBreak = prev !== undefined && pauseBeforeThisWord > PAUSE_BREAK_MS;

    if (current.length > 0 && (wouldOverflowCount || wouldOverflowChars || pauseForcesBreak)) {
      // Avoid leaving an orphan 1-word phrase unless the break was pause-forced.
      if (current.length === 1 && !pauseForcesBreak && i < words.length) {
        // try to keep growing if we're under the char cap and no pause forced it
        if (!wouldOverflowChars && !wouldOverflowCount) {
          current.push(word);
          continue;
        }
      }
      flush();
    }
    current.push(word);
  }
  flush();

  return { presetId, phrases };
}

function makePhrase(words: TranscriptWord[], index: number): CaptionPhrase {
  return {
    id: `p${index + 1}`,
    text: words.map((w) => w.text).join(' '),
    startMs: words[0].startMs,
    endMs: words[words.length - 1].endMs,
    words: words.map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs })),
  };
}

export const PHRASE_GROUPING_LIMITS = {
  MIN_WORDS,
  MAX_WORDS,
  MAX_CHARS,
  PAUSE_BREAK_MS,
};
