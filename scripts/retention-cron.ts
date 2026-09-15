// Retention cron: deletes source + output objects/files and marks jobs
// `expired` for jobs older than 7 days (createdAt), or already
// soft-deleted by the user (deletedAt set) more than 7 days ago.
//
// This script does NOT schedule itself — run it periodically with your
// host's scheduler, e.g. a crontab entry:
//   0 3 * * * cd /path/to/app && npm run retention >> retention.log 2>&1
// or a systemd timer / platform cron job pointed at `npm run retention`.
import { and, eq, lt, or, isNotNull, ne } from 'drizzle-orm';
import { db, schema } from '../db';
import { deleteObject } from '../lib/storage';

const RETENTION_DAYS = Number(process.env.RETENTION_DAYS || 7);

async function main() {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await db
    .select()
    .from(schema.jobs)
    .where(
      and(
        ne(schema.jobs.status, 'expired'),
        or(lt(schema.jobs.createdAt, cutoff), isNotNull(schema.jobs.deletedAt))
      )
    );

  console.log(`Found ${candidates.length} job(s) eligible for retention cleanup.`);

  for (const job of candidates) {
    try {
      if (job.sourceKey) await deleteObject(job.sourceKey);
      if (job.audioKey) await deleteObject(job.audioKey);
      if (job.outputKey) await deleteObject(job.outputKey);

      await db
        .update(schema.jobs)
        .set({
          status: 'expired',
          sourceKey: null,
          audioKey: null,
          outputKey: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.jobs.id, job.id));

      console.log(`Expired job ${job.id} (${job.name}).`);
    } catch (err) {
      console.error(`Failed to expire job ${job.id}:`, err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
