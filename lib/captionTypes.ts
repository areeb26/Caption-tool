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

export interface CaptionDoc {
  presetId: string;
  phrases: CaptionPhrase[];
}
