'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CaptionOverlay } from '@/components/CaptionOverlay';
import { TEMPLATE_LIST, TITLE_CARD_STYLE, getTemplate } from '@/lib/templates';
import type { CaptionDoc, CaptionPhrase, CaptionTitle } from '@/lib/captionTypes';

function TitleCardOverlay({ title }: { title: CaptionTitle | null }) {
  if (!title) return null;
  const t = TITLE_CARD_STYLE;
  return (
    <div className="caption-overlay">
      <div
        style={{
          position: 'absolute',
          left: `${t.anchorXPct}%`,
          top: `${t.anchorYPct}%`,
          transform: 'translate(-50%, -50%)',
          maxWidth: `${t.maxWidthPct}%`,
          textAlign: t.align,
          fontFamily: t.fontFamily,
          fontWeight: t.fontWeight,
          fontSize: `${t.fontSizeVmin}vmin`,
          letterSpacing: `${t.letterSpacingEm}em`,
          lineHeight: t.lineHeight,
          color: t.fill,
          textShadow: t.shadow ?? undefined,
        }}
      >
        {title.text}
      </div>
    </div>
  );
}

export default function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [doc, setDoc] = useState<CaptionDoc | null>(null);
  const [presetId, setPresetId] = useState('viral-yellow');
  const [currentMs, setCurrentMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setSourceUrl(data.sourceUrl);
      setDoc(data.job.captionJson);
      setPresetId(data.job.presetId);
    })();
  }, [id]);

  const template = useMemo(() => getTemplate(presetId), [presetId]);

  const activePhrase: CaptionPhrase | null = useMemo(() => {
    if (!doc) return null;
    return doc.phrases.find((p) => currentMs >= p.startMs && currentMs < p.endMs) ?? null;
  }, [doc, currentMs]);

  const activeTitle: CaptionTitle | null = useMemo(() => {
    if (!doc?.titles) return null;
    return doc.titles.find((t) => currentMs >= t.startMs && currentMs < t.endMs) ?? null;
  }, [doc, currentMs]);

  const persist = useCallback(
    async (nextDoc: CaptionDoc, nextPresetId: string) => {
      setSaving(true);
      try {
        await fetch(`/api/jobs/${id}/captions`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captionJson: nextDoc, presetId: nextPresetId }),
        });
      } finally {
        setSaving(false);
      }
    },
    [id]
  );

  const selectTemplate = (id: string) => {
    setPresetId(id);
    if (doc) persist(doc, id);
  };

  const updatePhraseText = (id: string, text: string) => {
    if (!doc) return;
    const next = { ...doc, phrases: doc.phrases.map((p) => (p.id === id ? { ...p, text } : p)) };
    setDoc(next);
  };

  const commitPhrases = (next: CaptionDoc) => {
    setDoc(next);
    persist(next, presetId);
  };

  const nudge = (id: string, field: 'startMs' | 'endMs', deltaMs: number) => {
    if (!doc) return;
    const next: CaptionDoc = {
      ...doc,
      phrases: doc.phrases.map((p) => {
        if (p.id !== id) return p;
        const value = Math.max(0, p[field] + deltaMs);
        return field === 'startMs' ? { ...p, startMs: value } : { ...p, endMs: value };
      }),
    };
    commitPhrases(next);
  };

  const mergeWithNext = (index: number) => {
    if (!doc) return;
    const phrases = [...doc.phrases];
    if (index >= phrases.length - 1) return;
    const a = phrases[index];
    const b = phrases[index + 1];
    const merged: CaptionPhrase = {
      id: a.id,
      text: `${a.text} ${b.text}`,
      startMs: a.startMs,
      endMs: b.endMs,
      words: [...a.words, ...b.words],
    };
    phrases.splice(index, 2, merged);
    commitPhrases({ ...doc, phrases });
  };

  const splitPhrase = (index: number) => {
    if (!doc) return;
    const phrases = [...doc.phrases];
    const p = phrases[index];
    if (p.words.length < 2) return;
    const mid = Math.ceil(p.words.length / 2);
    const words1 = p.words.slice(0, mid);
    const words2 = p.words.slice(mid);
    const p1: CaptionPhrase = {
      id: `${p.id}a`,
      text: words1.map((w) => w.text).join(' '),
      startMs: words1[0].startMs,
      endMs: words1[words1.length - 1].endMs,
      words: words1,
    };
    const p2: CaptionPhrase = {
      id: `${p.id}b`,
      text: words2.map((w) => w.text).join(' '),
      startMs: words2[0].startMs,
      endMs: words2[words2.length - 1].endMs,
      words: words2,
    };
    phrases.splice(index, 1, p1, p2);
    commitPhrases({ ...doc, phrases });
  };

  const addTitleCard = () => {
    if (!doc) return;
    const startMs = Math.round(currentMs);
    const newTitle: CaptionTitle = {
      id: `t${Date.now()}`,
      text: 'New title',
      startMs,
      endMs: startMs + 2000,
    };
    const next = { ...doc, titles: [...(doc.titles ?? []), newTitle] };
    commitPhrases(next);
  };

  const updateTitleText = (id: string, text: string) => {
    if (!doc) return;
    const next = { ...doc, titles: (doc.titles ?? []).map((t) => (t.id === id ? { ...t, text } : t)) };
    setDoc(next);
  };

  const nudgeTitle = (id: string, field: 'startMs' | 'endMs', deltaMs: number) => {
    if (!doc) return;
    const next: CaptionDoc = {
      ...doc,
      titles: (doc.titles ?? []).map((t) => {
        if (t.id !== id) return t;
        const value = Math.max(0, t[field] + deltaMs);
        return field === 'startMs' ? { ...t, startMs: value } : { ...t, endMs: value };
      }),
    };
    commitPhrases(next);
  };

  const removeTitle = (id: string) => {
    if (!doc) return;
    commitPhrases({ ...doc, titles: (doc.titles ?? []).filter((t) => t.id !== id) });
  };

  const startExport = async () => {
    setExportError(null);
    setExporting(true);
    router.push(`/jobs/${id}/exporting`);
  };

  if (!doc || !sourceUrl) {
    return (
      <main className="container">
        <p>Loading editor…</p>
      </main>
    );
  }

  return (
    <main className="editor-layout">
      <div>
        <div className="video-frame">
          <video
            ref={videoRef}
            src={sourceUrl}
            controls
            onTimeUpdate={(e) => setCurrentMs(e.currentTarget.currentTime * 1000)}
          />
          <CaptionOverlay phrase={activePhrase} template={template} currentMs={currentMs} />
          <TitleCardOverlay title={activeTitle} />
        </div>

        <button className="btn" style={{ marginTop: 12 }} onClick={addTitleCard}>
          + Add title card at current time
        </button>

        <h3 style={{ marginTop: 24 }}>Style</h3>
        <div className="template-strip">
          {TEMPLATE_LIST.map((t) => (
            <button
              key={t.presetId}
              className={`template-chip${t.presetId === presetId ? ' active' : ''}`}
              onClick={() => selectTemplate(t.presetId)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {exportError && <div className="error-box">{exportError}</div>}

        <button className="btn btn-primary" style={{ width: '100%', marginTop: 16 }} onClick={startExport} disabled={exporting}>
          {exporting ? 'Starting export…' : 'Export'}
        </button>
        {saving && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Saving…</p>}
      </div>

      <div>
        <h3>Title cards</h3>
        <div className="phrase-list">
          {(doc.titles ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              No title cards yet — big yellow headline text overlaid mid-frame, separate from the
              spoken captions below.
            </p>
          )}
          {(doc.titles ?? []).map((title) => (
            <div key={title.id} className="phrase-row">
              <input
                type="text"
                value={title.text}
                onChange={(e) => updateTitleText(title.id, e.target.value)}
                onBlur={() => commitPhrases(doc)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                {(title.startMs / 1000).toFixed(2)}s – {(title.endMs / 1000).toFixed(2)}s
              </div>
              <div className="phrase-actions">
                <button onClick={() => nudgeTitle(title.id, 'startMs', -250)}>start -250ms</button>
                <button onClick={() => nudgeTitle(title.id, 'startMs', 250)}>start +250ms</button>
                <button onClick={() => nudgeTitle(title.id, 'endMs', -250)}>end -250ms</button>
                <button onClick={() => nudgeTitle(title.id, 'endMs', 250)}>end +250ms</button>
                <button onClick={() => removeTitle(title.id)}>delete</button>
              </div>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 24 }}>Phrases</h3>
        <div className="phrase-list">
          {doc.phrases.map((phrase, index) => (
            <div key={phrase.id} className="phrase-row">
              <input
                type="text"
                value={phrase.text}
                onChange={(e) => updatePhraseText(phrase.id, e.target.value)}
                onBlur={() => commitPhrases(doc)}
              />
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>
                {(phrase.startMs / 1000).toFixed(2)}s – {(phrase.endMs / 1000).toFixed(2)}s
              </div>
              <div className="phrase-actions">
                <button onClick={() => nudge(phrase.id, 'startMs', -100)}>start -100ms</button>
                <button onClick={() => nudge(phrase.id, 'startMs', 100)}>start +100ms</button>
                <button onClick={() => nudge(phrase.id, 'endMs', -100)}>end -100ms</button>
                <button onClick={() => nudge(phrase.id, 'endMs', 100)}>end +100ms</button>
                <button onClick={() => splitPhrase(index)}>split</button>
                <button onClick={() => mergeWithNext(index)}>merge with next</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
