import type { CaptionDoc, CaptionPhrase, CaptionTitle } from '../captionTypes';
import { getTemplate, TITLE_CARD_STYLE, type CaptionTemplate } from '../templates';

// Standard vertical render target for Reels/TikTok-style output.
const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;

// Self-hosted font bundled at /fonts/Montserrat-Black.ttf (see lib/export/burnin.ts,
// which points ffmpeg's `ass` filter at that directory via `fontsdir=`). This is the
// one real weight we ship, so every template renders through it rather than whatever
// fallback sans the host happens to have — the font is what actually sells "viral".
const BUNDLED_FONT_NAME = 'Montserrat Black';

// Minimum visible duration for a caption event, and the floor we clamp
// overlapping/out-of-order phrase timings to. Guards against garbled
// double-exposed text when two phrases' time ranges collide (e.g. from a
// careless manual nudge in the editor) and against degenerate zero/negative
// duration events from bad input.
const MIN_EVENT_MS = 60;

function msToAssTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(
    2,
    '0'
  )}`;
}

function hexToAssColor(hex: string): string {
  // ASS colors are &HAABBGGRR&. We render fully opaque (AA=00) by default;
  // callers append their own alpha where needed.
  if (hex === 'transparent') return '&H00FFFFFF&';
  const clean = hex.replace('#', '');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H00${b}${g}${r}`.toUpperCase() + '&';
}

function alphaHex(opacity: number): string {
  // ASS alpha is inverted: 00 = opaque, FF = transparent.
  const a = Math.round((1 - opacity) * 255);
  return a.toString(16).padStart(2, '0').toUpperCase();
}

function emToPx(em: number, fontSizePx: number): number {
  return Math.round(em * fontSizePx);
}

/** Escape ASS/SSA special characters in dialogue text. */
function escapeAssText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');
}

function fontSizePx(template: CaptionTemplate): number {
  // vmin against a 1080x1920 canvas -> vmin basis = min(width,height)/100
  const vminBasis = Math.min(PLAY_RES_X, PLAY_RES_Y) / 100;
  return Math.round(template.fontSizeVmin * vminBasis);
}

/**
 * Greedy word-wrap a line of text to at most `maxLines` lines, each no
 * wider than `maxWidthPx` (approximated from an average glyph width for a
 * bold condensed sans at the given font size). A single word longer than a
 * full line is kept intact on its own line rather than being butchered —
 * real caption phrases are capped at 42 chars upstream, so this is a safety
 * net for pathological/manually-edited text, not the common case.
 */
function wrapLines(text: string, maxWidthPx: number, sizePx: number, maxLines: number): string[] {
  const avgCharWidth = sizePx * 0.58;
  const maxCharsPerLine = Math.max(1, Math.floor(maxWidthPx / avgCharWidth));
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    // Collapse any overflow lines into the last kept line rather than
    // silently dropping words.
    const kept = lines.slice(0, maxLines - 1);
    const rest = lines.slice(maxLines - 1).join(' ');
    kept.push(rest);
    return kept;
  }
  return lines;
}

function buildStyleLine(template: CaptionTemplate, styleName = 'Default'): string {
  const size = fontSizePx(template);
  const primary = hexToAssColor(template.fill === 'transparent' ? '#FFFFFF' : template.fill);
  const outline = hexToAssColor(
    template.strokeColor === 'transparent' ? '#000000' : template.strokeColor
  );
  const outlineWidth = template.strokeWidthEm > 0 ? emToPx(template.strokeWidthEm, size) / 4 : 0;
  const shadowWidth = template.shadow ? Math.max(2, Math.round(size * 0.04)) : 0;
  const spacing = Math.round(template.letterSpacingEm * size);

  // Style: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
  // Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,
  // Alignment,MarginL,MarginR,MarginV,Encoding
  return [
    `Style: ${styleName}`,
    BUNDLED_FONT_NAME,
    size,
    primary,
    primary,
    outline,
    '&H00000000&',
    // We ship the exact Black (900) weight as its own font file, so we never
    // ask libass to synthesize bold on top of it — that would over-thicken
    // strokes and blob out counters (the inside of "a", "o", etc).
    0,
    0,
    0,
    0,
    100,
    100,
    spacing,
    0,
    1,
    outlineWidth,
    shadowWidth,
    5, // alignment: middle-center (we position explicitly with \pos anyway)
    Math.round(template.safeMarginSidesPct * PLAY_RES_X / 100),
    Math.round(template.safeMarginSidesPct * PLAY_RES_X / 100),
    Math.round(template.safeMarginBottomPct * PLAY_RES_Y / 100),
    1,
  ].join(',');
}

function phraseTransformTag(template: CaptionTemplate): string {
  // Approximate CSS keyframe animations (scale/opacity pop, fade, slide,
  // bounce) using ASS's \t()/\fscx/\fscy/\alpha/\pos animated tags.
  const dur = template.animDurationMs;
  switch (template.animation) {
    case 'phrase-pop':
    case 'stagger-pop':
      return `\\fscx86\\fscy86\\alpha&HFF&\\t(0,${dur},\\fscx100\\fscy100\\alpha&H00&)`;
    case 'bounce-pop':
      return `\\fscx80\\fscy80\\alpha&HFF&\\t(0,${Math.round(
        dur * 0.6
      )},\\fscx112\\fscy112\\alpha&H00&)\\t(${Math.round(dur * 0.6)},${dur},\\fscx100\\fscy100)`;
    case 'fade':
      return `\\alpha&HFF&\\t(0,${dur},\\alpha&H00&)`;
    case 'slide-up':
      return `\\alpha&HFF&\\t(0,${dur},\\alpha&H00&)`;
    default:
      return '';
  }
}

function positionTag(template: CaptionTemplate): string {
  const x = Math.round((template.anchorXPct / 100) * PLAY_RES_X);
  const y = Math.round((template.anchorYPct / 100) * PLAY_RES_Y);
  return `\\pos(${x},${y})`;
}

/**
 * For `outline-only`-style presets (`fill: 'transparent'`), make the glyph
 * interior actually see-through instead of solid white, so the background
 * shows through and only the stroke reads — the "hollow letters" look the
 * preset is named for.
 */
function hollowFillTag(template: CaptionTemplate): string {
  return template.fill === 'transparent' ? '\\1a&HFF&' : '';
}

function backgroundBoxLine(
  template: CaptionTemplate,
  start: string,
  end: string,
  text: string
): string | null {
  if (!template.background) return null;
  const size = fontSizePx(template);
  const padX = emToPx(template.paddingXEm, size);
  const padY = emToPx(template.paddingYEm, size);
  const approxWidth = template.background.fullWidth
    ? PLAY_RES_X
    : Math.min(
        PLAY_RES_X * (template.maxWidthPct / 100),
        text.length * size * 0.55 + padX * 2
      );
  const approxHeight = size * template.lineHeight + padY * 2;
  const x = Math.round((template.anchorXPct / 100) * PLAY_RES_X);
  const y = Math.round((template.anchorYPct / 100) * PLAY_RES_Y);
  const left = Math.round(x - approxWidth / 2);
  const top = Math.round(y - approxHeight / 2);
  const color = hexToAssColor(template.background.color);
  const alpha = alphaHex(template.background.opacity);
  const r = Math.round(template.background.radiusEm * size);

  // Rounded-rect approximation via a drawing path (libass supports \p<n> vector drawing).
  const drawing = roundedRectPath(approxWidth, approxHeight, r);
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an7\\pos(${left},${top})\\1c${color}\\1a&H${alpha}&\\bord0\\shad0\\p1}${drawing}{\\p0}`;
}

function roundedRectPath(w: number, h: number, r: number): string {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  // Simple rounded-rect drawing path in libass drawing mini-language.
  return `m ${radius} 0 l ${w - radius} 0 b ${w} 0 ${w} 0 ${w} ${radius} l ${w} ${
    h - radius
  } b ${w} ${h} ${w} ${h} ${w - radius} ${h} l ${radius} ${h} b 0 ${h} 0 ${h} 0 ${
    h - radius
  } l 0 ${radius} b 0 0 0 0 ${radius} 0`;
}

function transformedText(template: CaptionTemplate, rawText: string): string {
  let text = rawText;
  if (template.textTransform === 'lowercase') text = text.toLowerCase();
  if (template.textTransform === 'uppercase') text = text.toUpperCase();
  if (template.emojiMap) {
    const words = text.split(/\s+/);
    text = words
      .map((w) => {
        const key = w.toLowerCase().replace(/[^a-z]/g, '');
        const emoji = template.emojiMap?.[key];
        return emoji ? `${w} ${emoji}` : w;
      })
      .join(' ');
  }
  return text;
}

function renderPhraseText(template: CaptionTemplate, phrase: CaptionPhrase): string {
  const size = fontSizePx(template);
  const maxWidthPx = (template.maxWidthPct / 100) * PLAY_RES_X;
  const hollow = hollowFillTag(template);

  if (template.twoTone && phrase.words.length > 1) {
    const mid = Math.ceil(phrase.words.length / 2);
    const line1 = transformedText(template, phrase.words.slice(0, mid).map((w) => w.text).join(' '));
    const line2 = transformedText(template, phrase.words.slice(mid).map((w) => w.text).join(' '));
    const c1 = hexToAssColor(template.twoTone.line1Color);
    const c2 = hexToAssColor(template.twoTone.line2Color);
    return `{\\1c${c1}${hollow}}${escapeAssText(line1)}\\N{\\1c${c2}${hollow}}${escapeAssText(
      line2
    )}`;
  }

  const text = transformedText(template, phrase.text);
  const lines = wrapLines(text, maxWidthPx, size, template.maxLines);
  const hollowTag = hollow ? `{${hollow}}` : '';
  return `${hollowTag}${escapeAssText(lines.join('\n')).replace(/\n/g, '\\N')}`;
}

function renderTitleText(template: CaptionTemplate, title: CaptionTitle): string {
  const size = fontSizePx(template);
  const maxWidthPx = (template.maxWidthPct / 100) * PLAY_RES_X;
  const text = transformedText(template, title.text);
  const lines = wrapLines(text, maxWidthPx, size, template.maxLines);
  return escapeAssText(lines.join('\n')).replace(/\n/g, '\\N');
}

function renderKaraokeText(template: CaptionTemplate, phrase: CaptionPhrase): string {
  const k = template.karaoke!;
  const inactive = hexToAssColor(k.inactiveColor);
  const active = hexToAssColor(k.activeColor);
  const activeScale = Math.round(k.activeScale * 100);
  const phraseStart = phrase.startMs;

  return phrase.words
    .map((w) => {
      // Offsets are relative to the *dialogue event's* start time (phrase
      // start), which is how ASS \t() timing works — every word's ramp must
      // be keyed to its own absolute position in the phrase, not to 0,
      // otherwise every word's transform fires simultaneously at t=0 and
      // the whole phrase ends up highlighted at once instead of sweeping
      // word-by-word.
      const wStart = Math.max(0, w.startMs - phraseStart);
      const wEnd = Math.max(wStart + 1, w.endMs - phraseStart);
      const revertBy = wEnd + 80;
      return (
        `{\\1c${inactive}\\fscx100\\fscy100` +
        `\\t(${wStart},${wEnd},\\1c${active}\\fscx${activeScale}\\fscy${activeScale})` +
        `\\t(${wEnd},${revertBy},\\1c${inactive}\\fscx100\\fscy100)}` +
        `${escapeAssText(w.text + ' ')}`
      );
    })
    .join('');
}

/** Optional soft glow used by `neon-pop`: a blurred, low-alpha duplicate of
 * the text painted on a layer behind the crisp main text. */
function glowLine(
  template: CaptionTemplate,
  start: string,
  end: string,
  bodyText: string,
  pos: string
): string | null {
  if (!template.glow) return null;
  const color = hexToAssColor(template.glow.color);
  return `Dialogue: 0,${start},${end},Default,,0,0,0,,{\\an5${pos}\\1c${color}\\bord0\\shad0\\blur${template.glow.blur}\\alpha&H${alphaHex(
    template.glow.opacity
  )}&}${bodyText}`;
}

/**
 * Generate a full .ass subtitle document for a caption doc rendered with
 * a given template (or the caption doc's own presetId if none given).
 */
export function generateAss(doc: CaptionDoc, presetIdOverride?: string): string {
  const template = getTemplate(presetIdOverride ?? doc.presetId);
  const styleLine = buildStyleLine(template);
  const titleStyleLine = buildStyleLine(TITLE_CARD_STYLE, 'TitleCard');

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 2',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${PLAY_RES_X}`,
    `PlayResY: ${PLAY_RES_Y}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    styleLine,
    titleStyleLine,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events: string[] = [];

  // Drop blank/whitespace-only phrases and clamp overlapping/out-of-order
  // timings so two phrases never occupy the same on-screen moment at the
  // same position (which otherwise renders as illegible double-exposed
  // text). Phrases are expected to already be sequential from the phrase
  // grouper, but the editor lets a user nudge start/end independently, so
  // this is a defensive floor, not the primary guarantee.
  const clean = doc.phrases
    .filter((p) => p.text.trim().length > 0)
    .map((p) => ({ ...p, startMs: p.startMs, endMs: Math.max(p.endMs, p.startMs + MIN_EVENT_MS) }))
    .sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < clean.length - 1; i++) {
    if (clean[i].endMs > clean[i + 1].startMs) {
      clean[i].endMs = Math.max(clean[i].startMs + MIN_EVENT_MS, clean[i + 1].startMs);
    }
  }

  for (const phrase of clean) {
    const start = msToAssTime(phrase.startMs);
    const end = msToAssTime(phrase.endMs);

    const bg = backgroundBoxLine(template, start, end, phrase.text);
    if (bg) events.push(bg);

    const bodyText =
      template.animation === 'karaoke-word'
        ? renderKaraokeText(template, phrase)
        : renderPhraseText(template, phrase);

    const transform = phraseTransformTag(template);
    const pos = positionTag(template);

    const glow = glowLine(template, start, end, bodyText, pos);
    if (glow) events.push(glow);

    events.push(
      `Dialogue: 1,${start},${end},Default,,0,0,0,,{\\an5${pos}${transform}}${bodyText}`
    );
  }

  const cleanTitles = (doc.titles ?? [])
    .filter((t) => t.text.trim().length > 0)
    .map((t) => ({ ...t, endMs: Math.max(t.endMs, t.startMs + MIN_EVENT_MS) }))
    .sort((a, b) => a.startMs - b.startMs);
  for (let i = 0; i < cleanTitles.length - 1; i++) {
    if (cleanTitles[i].endMs > cleanTitles[i + 1].startMs) {
      cleanTitles[i].endMs = Math.max(
        cleanTitles[i].startMs + MIN_EVENT_MS,
        cleanTitles[i + 1].startMs
      );
    }
  }

  const titlePos = positionTag(TITLE_CARD_STYLE);
  const titleTransform = phraseTransformTag(TITLE_CARD_STYLE);
  for (const title of cleanTitles) {
    const start = msToAssTime(title.startMs);
    const end = msToAssTime(title.endMs);
    const bodyText = renderTitleText(TITLE_CARD_STYLE, title);
    events.push(
      `Dialogue: 2,${start},${end},TitleCard,,0,0,0,,{\\an5${titlePos}${titleTransform}}${bodyText}`
    );
  }

  return `${header}\n${events.join('\n')}\n`;
}
