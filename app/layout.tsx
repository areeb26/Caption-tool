import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Viral Auto Captions',
  description: 'Turn talking-head videos into Reels-ready clips with burned-in captions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <Link href="/" className="logo">
            Viral<span>Captions</span>
          </Link>
          <div style={{ display: 'flex', gap: 12 }}>
            <Link href="/dashboard" className="btn btn-secondary">
              Dashboard
            </Link>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
