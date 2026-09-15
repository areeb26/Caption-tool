'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ExportingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      try {
        const res = await fetch(`/api/jobs/${id}/export`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Export failed (${res.status})`);
        }
        router.push(`/jobs/${id}/done`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed.');
      }
    })();
  }, [id, router]);

  return (
    <main className="container" style={{ maxWidth: 480, paddingTop: 80, textAlign: 'center' }}>
      {error ? (
        <>
          <h1>Export failed</h1>
          <div className="error-box">{error}</div>
          <button className="btn btn-primary" onClick={() => router.push(`/jobs/${id}/editor`)}>
            Back to editor
          </button>
        </>
      ) : (
        <>
          <h1>Rendering captions…</h1>
          <p style={{ color: 'var(--text-dim)' }}>
            Burning your captions into the video. This can take a minute or two depending on
            length.
          </p>
          <div className="spinner" style={{ margin: '32px auto' }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: '4px solid var(--border)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                margin: '0 auto',
                animation: 'spin 1s linear infinite',
              }}
            />
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </main>
  );
}
