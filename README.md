# Viral Auto Captions

Turn talking-head videos into Reels-ready clips with Hormozi/Instagram-style
burned-in captions: upload → auto speech-to-text with word timestamps →
group into phrases → pick a caption style → tweak text/timing in an editor
with live preview → server renders a burned-in MP4 → download.

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Drizzle ORM** + `better-sqlite3` for local/dev (`./data/app.db`). The
  schema (`db/schema.ts`) deliberately avoids sqlite-only column shapes so
  it ports to Postgres with a mostly mechanical `sqliteTable` → `pgTable`
  swap.
- **Storage**: S3-compatible (Cloudflare R2 / AWS S3) via
  `@aws-sdk/client-s3` + presigned URLs, falling back to local filesystem
  storage (`./data/uploads`, `./data/outputs`) behind the same
  `lib/storage.ts` interface when `S3_*` env vars are absent.
- **Auth**: NextAuth v5 (`next-auth@beta`) with Google OAuth + Email
  magic-link, via `@auth/drizzle-adapter` against the same Drizzle DB.
- **ASR**: Deepgram → AssemblyAI → OpenAI Whisper, in that fallback order,
  behind one interface (`lib/asr/`).
- **Phrase grouping**: `lib/phraseGrouper.ts`.
- **Video processing**: `ffmpeg` CLI, spawned via `node:child_process`.
  Burn-in uses a generated ASS/libass subtitle file
  (`lib/export/ass.ts` + `lib/export/burnin.ts`).
- **Job "queue"**: none for this MVP pass — ASR and export run
  synchronously inside API route handlers, but are isolated in
  `lib/pipeline/process.ts` and `lib/pipeline/export.ts` so swapping in a
  real queue (BullMQ/Inngest) later is a small change.

## Setup

1. **Install ffmpeg** (required — the app spawns `ffmpeg`/`ffprobe` as CLI
   subprocesses). E.g. `apt install ffmpeg` / `brew install ffmpeg`.
2. `npm install`
3. Copy `.env.example` to `.env` and fill in what you have. **Nothing is
   required to boot the app** — every integration degrades gracefully:
   - No `S3_*` vars → local filesystem storage is used automatically.
   - No `GOOGLE_CLIENT_ID`/`SECRET` or `EMAIL_SERVER`/`FROM` → those
     sign-in options are hidden, and in non-production environments the
     app transparently signs you in as a single local "dev user" so you
     can exercise the whole flow without configuring OAuth
     (`lib/auth-helpers.ts`). This fallback never applies when
     `NODE_ENV=production`.
   - No ASR vendor key → that vendor is skipped in the fallback chain; if
     **none** are configured, transcription fails with a clear error
     surfaced on the processing screen (with a Retry button).
4. `npx drizzle-kit push` — creates/updates `./data/app.db` from
   `db/schema.ts`.
5. `npm run dev` and open http://localhost:3000.

### Using real ASR vendors locally

Deepgram/AssemblyAI/Whisper need to fetch (or receive) your audio file over
HTTPS. When running with **local filesystem storage** (no `S3_*` vars),
`localhost` URLs aren't reachable from Deepgram/AssemblyAI's servers — you'll
need either real S3/R2 credentials, or a tunnel (e.g. `ngrok`) exposing your
dev server, for those two vendors to work end-to-end locally. Whisper works
either way since we fetch the audio ourselves and upload bytes directly to
OpenAI.

## Architecture overview

```
app/                      Next.js App Router pages + API routes
  page.tsx                Marketing/home
  signin/                 Sign-in (Google / email magic link / dev user)
  dashboard/               Job list
  upload/                 Drag-and-drop upload → presigned URL → direct upload
  jobs/[id]/processing/   Polls job status through the ASR/grouping pipeline
  jobs/[id]/editor/       Core editor: video + live caption preview,
                          template strip (10 presets), phrase list editing
  jobs/[id]/exporting/    Kicks off + polls the burn-in export
  jobs/[id]/done/         Preview + download the rendered MP4
  api/jobs/...            Route handlers (see below)
  api/local-storage/...   Local-filesystem stand-in for a presigned S3 URL

lib/
  asr/                    Deepgram / AssemblyAI / Whisper adapters + fallback
  phraseGrouper.ts        Word-timestamp -> phrase grouping (2-5 words, 42
                          char soft cap, break on >350ms pause)
  captionTypes.ts         Shared Caption JSON shape
  templates.ts            All 10 caption style presets (typed record)
  export/ass.ts           Caption JSON + template -> .ass subtitle document
  export/burnin.ts        ffmpeg orchestration (audio extraction, probing,
                          libass burn-in)
  pipeline/process.ts     uploaded -> transcribing -> grouping -> ready
  pipeline/export.ts      ready -> exporting -> done
  storage.ts              S3-or-local storage interface
  auth-helpers.ts         Current-user resolution + dev-user fallback

db/
  schema.ts               Drizzle schema (Auth.js tables + `jobs`)
  index.ts                Drizzle client (better-sqlite3)

components/
  CaptionOverlay.tsx      CSS approximation of a template, used for the
                          live editor preview (the ASS generator is the
                          actual source of truth for the rendered MP4)

scripts/retention-cron.ts  Deletes source/output objects + marks jobs
                           `expired` after 7 days (or once soft-deleted)
```

### API routes

- `POST /api/jobs` — create a job
- `GET /api/jobs` — list the current user's jobs
- `GET /api/jobs/[id]` — job status, caption JSON, signed source/output URLs
- `POST /api/jobs/[id]/upload-url` — presigned PUT URL for the source video
- `POST /api/jobs/[id]/uploaded` — marks `uploaded`, kicks off the pipeline
- `PATCH /api/jobs/[id]/captions` — save edited caption JSON and/or presetId
- `POST /api/jobs/[id]/export` — run the burn-in pipeline, return a signed
  download URL. Enforces **one active render per user** — a second export
  while one is already `exporting` gets `429`.

### Job status lifecycle

`pending → uploaded → transcribing → grouping → ready → exporting → done`,
or `failed` (with `errorMessage` set) at any step, or `expired` via the
retention cron.

### Retention

`npm run retention` runs `scripts/retention-cron.ts` once. Schedule it with
your host's scheduler, e.g. a crontab entry:

```
0 3 * * * cd /path/to/app && npm run retention >> retention.log 2>&1
```

## What's stubbed / deferred (explicitly out of scope for this MVP pass)

- **Auto-post to Instagram, batch upload, custom brand fonts/colors, a
  full multi-track NLE, real-time collaboration, the "Depth" occlusion
  toggle, and native mobile apps** — all explicitly out of scope per the
  product brief.
- **No external job queue** — ASR and export run synchronously inside the
  route handler. Fine for MVP traffic levels; `lib/pipeline/*` is
  structured so a queue can wrap those functions later without touching
  route handlers or the DB schema.
- **AssemblyAI "upload" step**: the adapter submits the signed download
  URL directly to AssemblyAI's `audio_url` param rather than re-uploading
  bytes through AssemblyAI's `/upload` endpoint — simpler and equivalent
  as long as that URL is fetchable from the internet (see the ASR note
  above for local dev).
- **ASS burn-in approximations**: `hormozi-box`'s pill background,
  `karaoke-highlight`'s active-word color sweep, and `neon-pop`'s glow are
  all implemented via libass drawing/`\t()`/`\kf` tags rather than a
  pixel-perfect reproduction of the CSS spec — they're a close
  approximation, not guaranteed identical to the editor's CSS preview.
- **Thumbnails**: the dashboard shows a placeholder "No preview" tile
  instead of an extracted video frame.
- **Auth in local dev**: when no OAuth/email provider is configured, the
  app signs every request in as one shared local "dev user"
  (`lib/auth-helpers.ts`). This never happens in production.
- **Video duration probing** happens after download during the processing
  step rather than client-side before upload (client-side validation
  reads `<video>` metadata directly for the 3-minute check, so oversized
  uploads are still rejected before the network request).

## Quality bar notes

- `npx tsc --noEmit` passes with no errors.
- `npm run build` completes successfully.
- No fabricated API keys — every vendor call reads from `process.env` and
  throws a clear, caught error (surfaced to the user via the job's
  `errorMessage` and the processing screen's Retry button) when its key is
  missing.
