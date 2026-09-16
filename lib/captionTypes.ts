// Shared Caption JSON shape, used by the phrase grouper, the editor API,
// and the ASS export generator. Matches the PRD's caption JSON spec exactly.
export interface CaptionWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionPhrase {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  words: CaptionWord[];
}

/**
 * A big, on-screen title/hook card (e.g. "01. Everyone grows differently"),
 * distinct from the continuous word-timed spoken captions in `phrases`.
 * These are user-authored (not ASR output) and rendered mid-frame in a
 * larger style — the "chapter heading" look creators overlay on top of
 * talking-head footage, separate from the bottom caption track.
 */
export interface CaptionTitle {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
}

export interface CaptionDoc {
  presetId: string;
  phrases: CaptionPhrase[];
  titles?: CaptionTitle[];
}
