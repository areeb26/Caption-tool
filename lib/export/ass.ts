import type { CaptionDoc, CaptionPhrase } from '../captionTypes';
import { getTemplate, type CaptionTemplate } from '../templates';

// Standard vertical render target for Reels/TikTok-style output.
const PLAY_RES_X = 1080;
const PLAY_RES_Y = 1920;

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

function buildStyleLine(template: CaptionTemplate): string {
  const size = fontSizePx(template);
  const primary = hexToAssColor(template.fill === 'transparent' ? '#FFFFFF' : template.fill);
  const outline = hexToAssColor(
    template.strokeColor === 'transparent' ? '#000000' : template.strokeColor
  );
  const outlineWidth = template.strokeWidthEm > 0 ? emToPx(template.strokeWidthEm, size) / 4 : 0;
  const shadowWidth = template.shadow ? Math.max(2, Math.round(size * 0.04)) : 0;
  const bold = template.fontWeight >= 700 ? -1 : 0;
  const spacing = Math.round(template.letterSpacingEm * size);

  // Style: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,
  // Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,
  // Alignment,MarginL,MarginR,MarginV,Encoding
  return [
    'Style: Default',
    template.fontFamily.split(',')[0].replace(/"/g, '').trim() || 'Arial',
    size,
    primary,
    primary,
    outline,
    '&H00000000&',
    bold,
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

function renderPhraseText(template: CaptionTemplate, phrase: CaptionPhrase): string {
  let text = phrase.text;
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

  if (template.twoTone && phrase.words.length > 1) {
    const mid = Math.ceil(phrase.words.length / 2);
    const line1 = phrase.words.slice(0, mid).map((w) => w.text).join(' ');
    const line2 = phrase.words.slice(mid).map((w) => w.text).join(' ');
    const c1 = hexToAssColor(template.twoTone.line1Color);
    const c2 = hexToAssColor(template.twoTone.line2Color);
    return `{\\1c${c1}}${escapeAssText(line1)}\\N{\\1c${c2}}${escapeAssText(line2)}`;
  }

  return escapeAssText(text);
}

function renderKaraokeText(template: CaptionTemplate, phrase: CaptionPhrase): string {
  const k = template.karaoke!;
  const inactive = hexToAssColor(k.inactiveColor);
  const active = hexToAssColor(k.activeColor);
  return phrase.words
    .map((w) => {
      const durCs = Math.max(1, Math.round((w.endMs - w.startMs) / 10));
      // \k tags drive libass's built-in karaoke color sweep; we also
      // override with an explicit color animation as a closer approximation
      // of the "scale up while active" spec via \t on a per-syllable basis.
      return `{\\kf${durCs}\\1c${inactive}\\t(0,${durCs * 10},\\1c${active}\\fscx112\\fscy112)}${escapeAssText(
        w.text + ' '
      )}`;
    })
    .join('');
}

/**
 * Generate a full .ass subtitle document for a caption doc rendered with
 * a given template (or the caption doc's own presetId if none given).
 */
export function generateAss(doc: CaptionDoc, presetIdOverride?: string): string {
  const template = getTemplate(presetIdOverride ?? doc.presetId);
  const styleLine = buildStyleLine(template);

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
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const events: string[] = [];

  for (const phrase of doc.phrases) {
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
    events.push(
      `Dialogue: 1,${start},${end},Default,,0,0,0,,{\\an5${pos}${transform}}${bodyText}`
    );
  }

  return `${header}\n${events.join('\n')}\n`;
}
