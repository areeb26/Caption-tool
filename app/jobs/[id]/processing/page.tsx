'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const STEPS = [
  { key: 'uploaded', label: 'Uploading' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'grouping', label: 'Building phrases' },
  { key: 'ready', label: 'Ready' },
];

function stepState(stepKey: string, status: string): 'pending' | 'active' | 'done' {
  const order = ['pending', 'uploaded', 'transcribing', 'grouping', 'ready'];
  const stepIndex = order.indexOf(stepKey);
  const statusIndex = order.indexOf(status);
  if (status === 'failed') return stepIndex <= 1 ? 'done' : 'pending';
  if (statusIndex > stepIndex) return 'done';
  if (statusIndex === stepIndex) return 'active';
  return 'pending';
}

export default function ProcessingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState('pending');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setStatus(data.job.status);
        setErrorMessage(data.job.errorMessage);
        if (data.job.status === 'ready') {
          router.push(`/jobs/${id}/editor`);
        }
      } catch {
        // ignore transient poll errors
      }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, router]);

  const retry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/jobs/${id}/uploaded`, { method: 'POST' });
      setStatus('uploaded');
      setErrorMessage(null);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <main className="container" style={{ maxWidth: 480, paddingTop: 48 }}>
      <h1>Processing your video</h1>
      <p style={{ color: 'var(--text-dim)' }}>This usually takes under a minute.</p>

      <ul className="step-list">
        {STEPS.map((step) => (
          <li key={step.key} className={`step-item ${stepState(step.key, status)}`}>
            <span className="step-dot" />
            <span>{step.label}</span>
          </li>
        ))}
      </ul>

      {status === 'failed' && (
        <div className="error-box">
          <p>
            <strong>Something went wrong.</strong>
          </p>
          <p style={{ fontSize: 13 }}>{errorMessage || 'Unknown error.'}</p>
          <button className="btn btn-primary" onClick={retry} disabled={retrying} style={{ marginTop: 12 }}>
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}
    </main>
  );
}
