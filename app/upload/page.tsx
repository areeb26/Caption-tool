'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const MAX_BYTES = 500 * 1024 * 1024;
const MAX_DURATION_SEC = 3 * 60;
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime'];

export default function UploadPage() {
  const router = useRouter();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback((file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        resolve('Unsupported format — please upload an MP4 or MOV file.');
        return;
      }
      if (file.size > MAX_BYTES) {
        resolve('File is larger than the 500MB limit.');
        return;
      }
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        if (video.duration > MAX_DURATION_SEC) {
          resolve('Video is longer than 3 minutes — please trim it first.');
        } else {
          resolve(null);
        }
      };
      video.onerror = () => resolve('Could not read this video file.');
      video.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      const validationError = await validate(file);
      if (validationError) {
        setError(validationError);
        return;
      }

      setBusy(true);
      setProgress(0);
      try {
        const createRes = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name.replace(/\.[^.]+$/, '') }),
        });
        if (!createRes.ok) throw new Error('Could not create project.');
        const { id: jobId } = await createRes.json();

        const urlRes = await fetch(`/api/jobs/${jobId}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
        });
        if (!urlRes.ok) {
          const body = await urlRes.json().catch(() => ({}));
          throw new Error(body.error || 'Could not get an upload URL.');
        }
        const { uploadUrl } = await urlRes.json();

        await uploadWithProgress(uploadUrl, file, setProgress);

        const uploadedRes = await fetch(`/api/jobs/${jobId}/uploaded`, { method: 'POST' });
        if (!uploadedRes.ok) throw new Error('Upload finished, but starting processing failed.');

        router.push(`/jobs/${jobId}/processing`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed.');
        setBusy(false);
      }
    },
    [router, validate]
  );

  return (
    <main className="container" style={{ maxWidth: 640, paddingTop: 48 }}>
      <h1>New project</h1>
      <p style={{ color: 'var(--text-dim)' }}>
        MP4 or MOV, up to 3 minutes and 500MB. Direct upload — nothing touches our servers
        until it&apos;s time to transcribe.
      </p>

      {error && <div className="error-box">{error}</div>}

      <div
        className={`dropzone${dragOver ? ' dragover' : ''}`}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
      >
        {busy ? (
          <>
            <p>Uploading… {progress}%</p>
            <div
              style={{
                height: 6,
                background: '#26262f',
                borderRadius: 3,
                overflow: 'hidden',
                marginTop: 12,
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progress}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          </>
        ) : (
          <>
            <p style={{ fontSize: 18, marginBottom: 8 }}>Drag & drop your video here</p>
            <p style={{ fontSize: 14 }}>or click to browse</p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/quicktime"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </main>
  );
}

function uploadWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed with status ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload.'));
    xhr.send(file);
  });
}
