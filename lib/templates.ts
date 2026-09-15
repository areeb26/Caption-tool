// All 10 caption style presets, keyed by presetId. `viral-yellow` is the
// locked source-of-truth default; every other preset is expressed as an
// override of that shared token shape. Both the browser preview (editor)
// and the server-side ASS generator (lib/export/ass.ts) read from this
// single typed record so switching templates never re-runs ASR — it only
// changes rendering tokens against the same caption JSON.

export type AnimationKind =
  | 'phrase-pop'
  | 'bounce-pop'
  | 'fade'
  | 'slide-up'
  | 'karaoke-word'
  | 'stagger-pop';

export interface CaptionTemplate {
  presetId: string;
  label: string;
  fontFamily: string;
  fontWeight: number;
  fontSizeVmin: number; // percentage of the shorter viewport dimension
  letterSpacingEm: number;
  lineHeight: number;
  textTransform: 'none' | 'lowercase' | 'uppercase';
  fill: string;
  strokeColor: string;
  strokeWidthEm: number;
  shadow: string | null;
  align: 'left' | 'center' | 'right';
  anchorXPct: number; // 0-100
  anchorYPct: number; // 0-100, from top
  maxWidthPct: number; // of frame width
  maxLines: number;
  paddingXEm: number;
  paddingYEm: number;
  background: {
    color: string; // e.g. '#000000'
    opacity: number; // 0-1
    radiusEm: number;
    fullWidth?: boolean;
  } | null;
  phraseWordsMin: number;
  phraseWordsMax: number;
  phraseMaxChars: number;
  animation: AnimationKind;
  animDurationMs: number;
  animEasing: string;
  exit: 'hard-cut' | 'fade';
  safeMarginBottomPct: number;
  safeMarginSidesPct: number;
  karaoke?: {
    inactiveColor: string;
    activeColor: string;
    activeScale: number;
  };
  emojiMap?: Record<string, string>;
  twoTone?: { line1Color: string; line2Color: string; staggerMs: number };
}

const VIRAL_YELLOW: CaptionTemplate = {
  presetId: 'viral-yellow',
  label: 'Viral Yellow',
  fontFamily: `"Montserrat", "Arial Black", system-ui, sans-serif`,
  fontWeight: 900,
  fontSizeVmin: 7.2,
  letterSpacingEm: -0.02,
  lineHeight: 1.05,
  textTransform: 'lowercase',
  fill: '#FFE600',
  strokeColor: '#000000',
  strokeWidthEm: 0.12,
  shadow: '0 0.04em 0 #000000',
  align: 'center',
  anchorXPct: 50,
  anchorYPct: 78,
  maxWidthPct: 86,
  maxLines: 2,
  paddingXEm: 0,
  paddingYEm: 0,
  background: null,
  phraseWordsMin: 2,
  phraseWordsMax: 5,
  phraseMaxChars: 42,
  animation: 'phrase-pop',
  animDurationMs: 120,
  animEasing: 'cubic-bezier(0.2,0.9,0.3,1)',
  exit: 'hard-cut',
  safeMarginBottomPct: 12,
  safeMarginSidesPct: 7,
};

function extend(overrides: Partial<CaptionTemplate> & { presetId: string; label: string }): CaptionTemplate {
  return { ...VIRAL_YELLOW, ...overrides };
}

export const TEMPLATES: Record<string, CaptionTemplate> = {
  'viral-yellow': VIRAL_YELLOW,

  'hormozi-white': extend({
    presetId: 'hormozi-white',
    label: 'Hormozi White',
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.14,
    animation: 'phrase-pop',
  }),

  'hormozi-box': extend({
    presetId: 'hormozi-box',
    label: 'Hormozi Box',
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.0,
    background: { color: '#000000', opacity: 0.9, radiusEm: 0.25 },
    paddingXEm: 0.45,
    paddingYEm: 0.25,
    animation: 'phrase-pop',
  }),

  'karaoke-highlight': extend({
    presetId: 'karaoke-highlight',
    label: 'Karaoke Highlight',
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.12,
    animation: 'karaoke-word',
    karaoke: { inactiveColor: '#FFFFFF', activeColor: '#FFE600', activeScale: 1.12 },
  }),

  'neon-pop': extend({
    presetId: 'neon-pop',
    label: 'Neon Pop',
    fill: '#FF2D95',
    strokeColor: '#1a001a',
    strokeWidthEm: 0.1,
    shadow: '0 0 0.25em #FF2D95',
    animation: 'bounce-pop',
  }),

  'outline-only': extend({
    presetId: 'outline-only',
    label: 'Outline Only',
    fill: 'transparent',
    strokeColor: '#FFFFFF',
    strokeWidthEm: 0.14,
    shadow: null,
    animation: 'phrase-pop',
  }),

  'stack-two-tone': extend({
    presetId: 'stack-two-tone',
    label: 'Stack Two-Tone',
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.12,
    maxLines: 2,
    animation: 'stagger-pop',
    twoTone: { line1Color: '#FFFFFF', line2Color: '#FFE600', staggerMs: 40 },
  }),

  'emoji-pop': extend({
    presetId: 'emoji-pop',
    label: 'Emoji Pop',
    animation: 'phrase-pop',
    emojiMap: {
      money: '💰',
      grow: '📈',
      love: '❤️',
      fire: '🔥',
      tip: '💡',
    },
  }),

  'minimal-caption': extend({
    presetId: 'minimal-caption',
    label: 'Minimal Caption',
    fontSizeVmin: 5,
    fill: '#F5F5F5',
    strokeColor: 'transparent',
    strokeWidthEm: 0,
    shadow: '0 0.06em 0.1em rgba(0,0,0,0.6)',
    animation: 'fade',
    animDurationMs: 180,
    exit: 'fade',
  }),

  'bar-lower-third': extend({
    presetId: 'bar-lower-third',
    label: 'Bar Lower Third',
    fill: '#FFFFFF',
    strokeColor: 'transparent',
    strokeWidthEm: 0,
    anchorYPct: 82,
    maxWidthPct: 100,
    background: { color: '#111111', opacity: 0.85, radiusEm: 0, fullWidth: true },
    paddingXEm: 0.6,
    paddingYEm: 0.35,
    animation: 'slide-up',
    animDurationMs: 150,
  }),
};

export const DEFAULT_PRESET_ID = 'viral-yellow';

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function getTemplate(presetId: string): CaptionTemplate {
  return TEMPLATES[presetId] ?? VIRAL_YELLOW;
}
