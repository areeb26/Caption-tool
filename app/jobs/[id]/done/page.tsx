'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';

export default function DonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setOutputUrl(data.outputUrl);
    })();
  }, [id]);

  return (
    <main className="container" style={{ maxWidth: 480, paddingTop: 48, textAlign: 'center' }}>
      <h1>Your Reel is ready</h1>

      <div className="video-frame">
        {outputUrl && <video src={outputUrl} controls />}
      </div>

      {outputUrl && (
        <a href={outputUrl} download className="btn btn-primary" style={{ width: '100%', marginTop: 24 }}>
          Download MP4
        </a>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
        <Link href={`/jobs/${id}/editor`} className="btn btn-secondary">
          Back to editor
        </Link>
        <Link href="/upload" className="btn btn-secondary">
          New project
        </Link>
      </div>
    </main>
  );
}
