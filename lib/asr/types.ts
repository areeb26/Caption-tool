export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptResult {
  words: TranscriptWord[];
  vendor: string;
  raw?: unknown;
}

export type AsrVendor = 'deepgram' | 'assemblyai' | 'whisper' | 'huggingface';

export class AsrError extends Error {
  constructor(
    public vendor: AsrVendor,
    message: string,
    public cause?: unknown
  ) {
    super(`[${vendor}] ${message}`);
    this.name = 'AsrError';
  }
}
