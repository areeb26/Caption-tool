// Storage interface: S3-compatible (R2/S3) when env vars are present,
// falling back transparently to local filesystem storage so the app runs
// out of the box without cloud credentials.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_BUCKET = process.env.S3_BUCKET;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_REGION = process.env.S3_REGION || 'auto';

export const usingCloudStorage = Boolean(
  S3_BUCKET && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY
);

const LOCAL_ROOT = path.resolve(process.env.LOCAL_STORAGE_ROOT || './data');

function localPathFor(key: string): string {
  // key looks like "uploads/<jobId>/source.mp4" or "outputs/<jobId>/out.mp4"
  return path.join(LOCAL_ROOT, key);
}

// Lazily construct the S3 client so this module can be imported even when
// the AWS SDK env vars are absent (local-storage mode).
let _s3Client: import('@aws-sdk/client-s3').S3Client | null = null;
async function getS3Client() {
  if (_s3Client) return _s3Client;
  const { S3Client } = await import('@aws-sdk/client-s3');
  _s3Client = new S3Client({
    region: S3_REGION,
    endpoint: S3_ENDPOINT,
    forcePathStyle: Boolean(S3_ENDPOINT),
    credentials: {
      accessKeyId: S3_ACCESS_KEY_ID!,
      secretAccessKey: S3_SECRET_ACCESS_KEY!,
    },
  });
  return _s3Client;
}

/** Upload a buffer/stream to storage under `key`. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string
): Promise<void> {
  if (usingCloudStorage) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }
  const target = localPathFor(key);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, body);
}

/**
 * Return a URL the client can PUT the source file to directly.
 * In local-storage mode, this is a same-origin API route
 * (`/api/local-storage/[...key]`) that accepts a PUT and writes to disk,
 * so the "direct to storage upload" code path in the client is identical
 * in both modes.
 */
export async function getSignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (usingCloudStorage) {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await getS3Client();
    return getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds }
    );
  }
  return `/api/local-storage/${encodeURIComponent(key)}?contentType=${encodeURIComponent(
    contentType
  )}`;
}

/** Return a URL the client can GET/download the object from. */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  if (usingCloudStorage) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const client = await getS3Client();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }),
      { expiresIn: expiresInSeconds }
    );
  }
  return `/api/local-storage/${encodeURIComponent(key)}`;
}

/** Get a readable stream for an object (used server-side, e.g. for ffmpeg input). */
export async function getObjectStream(key: string): Promise<Readable> {
  if (usingCloudStorage) {
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    const res = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return res.Body as Readable;
  }
  return fs.createReadStream(localPathFor(key));
}

/** Download an object to a local temp path (convenient for ffmpeg CLI calls). */
export async function downloadToTmp(key: string, destPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  if (usingCloudStorage) {
    const stream = await getObjectStream(key);
    await fsp.writeFile(destPath, Buffer.concat(await streamToChunks(stream)));
  } else {
    await fsp.copyFile(localPathFor(key), destPath);
  }
}

/** Upload a local file (e.g. ffmpeg output) to storage under `key`. */
export async function uploadFromTmp(
  key: string,
  srcPath: string,
  contentType?: string
): Promise<void> {
  const buf = await fsp.readFile(srcPath);
  await putObject(key, buf, contentType);
}

export async function deleteObject(key: string): Promise<void> {
  if (usingCloudStorage) {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    await client.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return;
  }
  const target = localPathFor(key);
  await fsp.rm(target, { force: true });
}

/** Absolute local path for a key — used only by the local-storage API route. */
export function localFsPath(key: string): string {
  return localPathFor(key);
}

async function streamToChunks(stream: Readable): Promise<Buffer[]> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks;
}
