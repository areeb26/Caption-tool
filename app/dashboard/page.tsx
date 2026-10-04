import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/db';
import { getCurrentUserId, getUser } from '@/lib/auth-helpers';
import { redirect } from 'next/navigation';

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default async function DashboardPage() {
  const userId = await getCurrentUserId();
  if (!userId) redirect('/signin');

  const me = await getUser(userId);

  const jobs = await db
    .select()
    .from(schema.jobs)
    .where(and(eq(schema.jobs.userId, userId), isNull(schema.jobs.deletedAt)))
    .orderBy(desc(schema.jobs.updatedAt));

  return (
    <main className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Your projects</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {me?.role === 'admin' && (
            <Link href="/admin" className="btn btn-secondary">
              Users
            </Link>
          )}
          <Link href="/upload" className="btn btn-primary">
            New project
          </Link>
        </div>
      </div>

      {jobs.length === 0 ? (
        <div className="empty-state">
          <h2>Drop your first Reel</h2>
          <p>Upload a talking-head video to get burned-in captions in minutes.</p>
          <Link href="/upload" className="btn btn-primary">
            New project
          </Link>
        </div>
      ) : (
        <div className="job-grid">
          {jobs.map((job) => (
            <Link
              key={job.id}
              href={jobHref(job.id, job.status)}
              className="card"
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="job-thumb">No preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{job.name}</strong>
                <span className={`badge badge-${job.status}`}>{job.status}</span>
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 6 }}>
                Updated {formatRelativeTime(new Date(job.updatedAt))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

function jobHref(id: string, status: string): string {
  switch (status) {
    case 'pending':
      return '/upload';
    case 'uploaded':
    case 'transcribing':
    case 'grouping':
      return `/jobs/${id}/processing`;
    case 'exporting':
      return `/jobs/${id}/exporting`;
    case 'done':
      return `/jobs/${id}/done`;
    case 'ready':
    case 'failed':
    default:
      return `/jobs/${id}/editor`;
  }
}
