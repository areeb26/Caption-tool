// Caption languages offered on the upload page and stored on jobs.language.
export const CAPTION_LANGUAGES = [
  { id: 'auto', label: 'Auto-detect' },
  { id: 'en', label: 'English' },
  { id: 'roman-urdu', label: 'Roman Urdu (Urdu in English letters)' },
] as const;

export type CaptionLanguage = (typeof CAPTION_LANGUAGES)[number]['id'];

export function parseCaptionLanguage(v: unknown): CaptionLanguage {
  return CAPTION_LANGUAGES.some((l) => l.id === v) ? (v as CaptionLanguage) : 'auto';
}
