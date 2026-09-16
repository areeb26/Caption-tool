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
  /** Soft blurred halo painted behind the main text (`neon-pop`). */
  glow?: { color: string; blur: number; opacity: number };
}

// Re-derived from the actual reference reel (a talking-head Hinglish
// creator video), not just the written token table: real "viral" bottom
// captions there are small, clean, and shadow-only — no thick black
// stroke, no forced lowercasing, sitting right near the bottom edge. The
// original bigger/stroked/lowercase take on this preset was a misreading
// of the spec and didn't match the actual footage it was supposed to
// mirror. The other 9 presets (genuinely modeled on the bold
// Hormozi/outline/etc. looks) keep their previous sizing/case/position by
// overriding these fields explicitly below, so this change only affects
// `viral-yellow` itself.
const VIRAL_YELLOW: CaptionTemplate = {
  presetId: 'viral-yellow',
  label: 'Viral Yellow',
  fontFamily: `"Montserrat", "Arial Black", system-ui, sans-serif`,
  fontWeight: 800,
  fontSizeVmin: 4.3,
  letterSpacingEm: 0,
  lineHeight: 1.15,
  textTransform: 'none',
  fill: '#FFE600',
  strokeColor: 'transparent',
  strokeWidthEm: 0,
  shadow: '0 0.08em 0.14em rgba(0,0,0,0.6)',
  align: 'center',
  anchorXPct: 50,
  anchorYPct: 91,
  maxWidthPct: 90,
  maxLines: 2,
  paddingXEm: 0,
  paddingYEm: 0,
  background: null,
  phraseWordsMin: 2,
  phraseWordsMax: 5,
  phraseMaxChars: 42,
  animation: 'phrase-pop',
  animDurationMs: 100,
  animEasing: 'cubic-bezier(0.2,0.9,0.3,1)',
  exit: 'hard-cut',
  safeMarginBottomPct: 5,
  safeMarginSidesPct: 7,
};

function extend(overrides: Partial<CaptionTemplate> & { presetId: string; label: string }): CaptionTemplate {
  return { ...VIRAL_YELLOW, ...overrides };
}

export const TEMPLATES: Record<string, CaptionTemplate> = {
  'viral-yellow': VIRAL_YELLOW,

  // Everything below explicitly restates the big/bold/lowercase/stroked
  // sizing (fontSizeVmin 7.2, letterSpacingEm -0.02, textTransform
  // lowercase, anchorYPct 78, safeMarginBottomPct 12) that used to come
  // for free from VIRAL_YELLOW, since that base was resized down to match
  // the actual small-caption reference footage. These 9 are genuinely
  // meant to be big/bold (that's the Hormozi/outline/neon look), so they
  // keep the old numbers rather than silently shrinking.

  'hormozi-white': extend({
    presetId: 'hormozi-white',
    label: 'Hormozi White',
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.14,
    animation: 'phrase-pop',
  }),

  'hormozi-box': extend({
    presetId: 'hormozi-box',
    label: 'Hormozi Box',
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
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
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
    fill: '#FFFFFF',
    strokeColor: '#000000',
    strokeWidthEm: 0.12,
    animation: 'karaoke-word',
    karaoke: { inactiveColor: '#FFFFFF', activeColor: '#FFE600', activeScale: 1.12 },
  }),

  'neon-pop': extend({
    presetId: 'neon-pop',
    label: 'Neon Pop',
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
    fill: '#FF2D95',
    strokeColor: '#1a001a',
    strokeWidthEm: 0.1,
    shadow: '0 0 0.25em #FF2D95',
    animation: 'bounce-pop',
    glow: { color: '#FF2D95', blur: 8, opacity: 0.55 },
  }),

  'outline-only': extend({
    presetId: 'outline-only',
    label: 'Outline Only',
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
    fill: 'transparent',
    strokeColor: '#FFFFFF',
    strokeWidthEm: 0.14,
    shadow: null,
    animation: 'phrase-pop',
  }),

  'stack-two-tone': extend({
    presetId: 'stack-two-tone',
    label: 'Stack Two-Tone',
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
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
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
    strokeColor: '#000000',
    strokeWidthEm: 0.12,
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
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    anchorYPct: 78,
    safeMarginBottomPct: 12,
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
    fontSizeVmin: 7.2,
    letterSpacingEm: -0.02,
    textTransform: 'lowercase',
    safeMarginBottomPct: 12,
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

/**
 * Fixed look for `CaptionDoc.titles` — the big yellow "chapter heading" text
 * seen mid-frame in hook/listicle edits ("01. Everyone grows differently"),
 * separate from the bottom spoken-caption track. Not user-selectable like
 * the 10 presets; every template uses the same title-card look since it's
 * an independent overlay, not a caption style.
 */
export const TITLE_CARD_STYLE: CaptionTemplate = {
  presetId: 'title-card',
  label: 'Title Card',
  fontFamily: `"Montserrat", "Arial Black", system-ui, sans-serif`,
  fontWeight: 800,
  fontSizeVmin: 6.4,
  letterSpacingEm: -0.01,
  lineHeight: 1.2,
  textTransform: 'none',
  fill: '#FFE600',
  strokeColor: 'transparent',
  strokeWidthEm: 0,
  shadow: '0 0.05em 0.1em rgba(0,0,0,0.65)',
  align: 'center',
  anchorXPct: 50,
  anchorYPct: 46,
  maxWidthPct: 82,
  maxLines: 3,
  paddingXEm: 0,
  paddingYEm: 0,
  background: null,
  phraseWordsMin: 1,
  phraseWordsMax: 99,
  phraseMaxChars: 999,
  animation: 'phrase-pop',
  animDurationMs: 180,
  animEasing: 'cubic-bezier(0.2,0.9,0.3,1)',
  exit: 'fade',
  safeMarginBottomPct: 5,
  safeMarginSidesPct: 9,
};

export const DEFAULT_PRESET_ID = 'viral-yellow';

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export function getTemplate(presetId: string): CaptionTemplate {
  return TEMPLATES[presetId] ?? VIRAL_YELLOW;
}
