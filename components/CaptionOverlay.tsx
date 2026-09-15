'use client';

import type { CaptionPhrase } from '@/lib/captionTypes';
import type { CaptionTemplate } from '@/lib/templates';

/**
 * Client-side CSS approximation of a caption template, used for the live
 * editor preview. The server-side source of truth for the actual burned-in
 * render is lib/export/ass.ts — this component just needs to look close
 * enough for editing decisions (text/timing), not pixel-identical.
 */
export function CaptionOverlay({
  phrase,
  template,
  currentMs,
}: {
  phrase: CaptionPhrase | null;
  template: CaptionTemplate;
  currentMs: number;
}) {
  if (!phrase) return null;

  const progress = Math.min(1, (currentMs - phrase.startMs) / Math.max(1, template.animDurationMs));
  const eased = Math.min(1, Math.max(0, progress));

  let transform = 'none';
  let opacity = 1;
  if (template.animation === 'phrase-pop' || template.animation === 'stagger-pop') {
    const scale = 0.86 + 0.14 * eased;
    transform = `translate(-50%, -50%) scale(${scale})`;
    opacity = eased;
  } else if (template.animation === 'bounce-pop') {
    const scale = eased < 1 ? 0.8 + 0.32 * eased : 1;
    transform = `translate(-50%, -50%) scale(${scale})`;
    opacity = eased;
  } else if (template.animation === 'fade') {
    opacity = eased;
    transform = 'translate(-50%, -50%)';
  } else if (template.animation === 'slide-up') {
    const translateY = (1 - eased) * 16;
    transform = `translate(-50%, calc(-50% + ${translateY}px))`;
    opacity = eased;
  } else {
    transform = 'translate(-50%, -50%)';
  }

  const containerStyle: React.CSSProperties = {
    position: 'absolute',
    left: `${template.anchorXPct}%`,
    top: `${template.anchorYPct}%`,
    transform,
    opacity,
    maxWidth: `${template.maxWidthPct}%`,
    textAlign: template.align,
    fontFamily: template.fontFamily,
    fontWeight: template.fontWeight,
    fontSize: `${template.fontSizeVmin}vmin`,
    letterSpacing: `${template.letterSpacingEm}em`,
    lineHeight: template.lineHeight,
    textTransform: template.textTransform,
    color: template.fill,
    WebkitTextStroke:
      template.strokeWidthEm > 0 ? `${template.strokeWidthEm}em ${template.strokeColor}` : undefined,
    textShadow: template.shadow ?? undefined,
    padding: `${template.paddingYEm}em ${template.paddingXEm}em`,
    borderRadius: template.background ? `${template.background.radiusEm}em` : undefined,
    background: template.background
      ? hexWithOpacity(template.background.color, template.background.opacity)
      : undefined,
    width: template.background?.fullWidth ? '100%' : undefined,
  };

  if (template.background?.fullWidth) {
    containerStyle.left = '50%';
    containerStyle.width = '100%';
    containerStyle.maxWidth = '100%';
  }

  if (template.animation === 'karaoke-word' && template.karaoke) {
    const k = template.karaoke;
    return (
      <div className="caption-overlay">
        <div style={containerStyle}>
          {phrase.words.map((w, i) => {
            const active = currentMs >= w.startMs && currentMs < w.endMs;
            return (
              <span
                key={i}
                style={{
                  color: active ? k.activeColor : k.inactiveColor,
                  display: 'inline-block',
                  transform: active ? `scale(${k.activeScale})` : 'scale(1)',
                  transition: 'transform 80ms ease, color 80ms ease',
                  marginRight: '0.25em',
                }}
              >
                {w.text}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  if (template.twoTone) {
    const mid = Math.ceil(phrase.words.length / 2);
    const line1 = phrase.words.slice(0, mid).map((w) => w.text).join(' ');
    const line2 = phrase.words.slice(mid).map((w) => w.text).join(' ');
    return (
      <div className="caption-overlay">
        <div style={containerStyle}>
          <div style={{ color: template.twoTone.line1Color }}>{line1}</div>
          <div style={{ color: template.twoTone.line2Color }}>{line2}</div>
        </div>
      </div>
    );
  }

  let text = phrase.text;
  if (template.textTransform === 'lowercase') text = text.toLowerCase();
  if (template.textTransform === 'uppercase') text = text.toUpperCase();
  if (template.emojiMap) {
    text = text
      .split(/\s+/)
      .map((w) => {
        const key = w.toLowerCase().replace(/[^a-z]/g, '');
        const emoji = template.emojiMap?.[key];
        return emoji ? `${w} ${emoji}` : w;
      })
      .join(' ');
  }

  return (
    <div className="caption-overlay">
      <div style={containerStyle}>{text}</div>
    </div>
  );
}

function hexWithOpacity(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
