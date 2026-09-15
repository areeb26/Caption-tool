import Link from 'next/link';

export default function HomePage() {
  return (
    <main>
      <section className="hero">
        <h1>
          <span className="highlight">Viral captions</span> in one click
        </h1>
        <p>
          Upload a talking-head video, get Hormozi-style burned-in captions with word-perfect
          timing — no editing software required.
        </p>
        <Link href="/signin" className="btn btn-primary">
          Start free
        </Link>
      </section>

      <div className="container">
        <div className="job-grid" style={{ marginBottom: 64 }}>
          <div className="card">
            <h3>1. Upload</h3>
            <p style={{ color: 'var(--text-dim)' }}>Drop a clip up to 3 minutes / 500MB.</p>
          </div>
          <div className="card">
            <h3>2. Auto-transcribe</h3>
            <p style={{ color: 'var(--text-dim)' }}>
              Word-level speech-to-text groups itself into punchy phrases.
            </p>
          </div>
          <div className="card">
            <h3>3. Pick a style</h3>
            <p style={{ color: 'var(--text-dim)' }}>
              10 caption presets, from Viral Yellow to Karaoke Highlight.
            </p>
          </div>
          <div className="card">
            <h3>4. Export</h3>
            <p style={{ color: 'var(--text-dim)' }}>Burned-in MP4, ready for Reels/TikTok.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
