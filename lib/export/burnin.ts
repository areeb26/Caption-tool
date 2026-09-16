import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateAss } from './ass';
import type { CaptionDoc } from '../captionTypes';

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn "${cmd}". Is ffmpeg installed and on PATH? (${err.message})`
        )
      );
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}\n${stderr.slice(-4000)}`));
    });
  });
}

/** Extract mono 16kHz PCM WAV audio from a source video, for ASR. */
export async function extractAudio(sourcePath: string, destWavPath: string): Promise<void> {
  await fs.mkdir(path.dirname(destWavPath), { recursive: true });
  await run('ffmpeg', [
    '-y',
    '-i',
    sourcePath,
    '-vn',
    '-acodec',
    'pcm_s16le',
    '-ar',
    '16000',
    '-ac',
    '1',
    destWavPath,
  ]);
}

/** Probe a video's duration in milliseconds using ffprobe. */
export async function probeDurationMs(sourcePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      sourcePath,
    ]);
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', (err) => reject(err));
    proc.on('close', (code) => {
      if (code === 0) {
        const seconds = parseFloat(stdout.trim());
        resolve(Math.round(seconds * 1000));
      } else {
        reject(new Error(`ffprobe failed: ${stderr.slice(-2000)}`));
      }
    });
  });
}

/**
 * Burn captions into a video using a generated ASS subtitle file + libass,
 * via `ffmpeg -vf ass=...`. Writes the rendered MP4 to `destMp4Path`.
 */
// Self-hosted fonts shipped with the app (see lib/export/ass.ts for the
// exact family name libass is told to use). Passed to the `ass` filter via
// `fontsdir=` so rendering never depends on whatever fonts happen to be
// installed on the host — the whole point of locking a design token like
// "Montserrat Black" is that it looks the same everywhere.
const FONTS_DIR = path.join(process.cwd(), 'fonts');

export async function burnInCaptions(
  sourceVideoPath: string,
  captionDoc: CaptionDoc,
  presetId: string,
  destMp4Path: string
): Promise<void> {
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'caption-export-'));
  const assPath = path.join(workDir, 'captions.ass');
  try {
    const assContent = generateAss(captionDoc, presetId);
    await fs.writeFile(assPath, assContent, 'utf-8');
    await fs.mkdir(path.dirname(destMp4Path), { recursive: true });

    // libass needs filesystem paths; escape for the ffmpeg filter-graph
    // (colons and backslashes are special inside -vf ass=... on all platforms).
    const escapedAssPath = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    const escapedFontsDir = FONTS_DIR.replace(/\\/g, '/').replace(/:/g, '\\:');

    await run('ffmpeg', [
      '-y',
      '-i',
      sourceVideoPath,
      '-vf',
      `ass=${escapedAssPath}:fontsdir=${escapedFontsDir}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-c:a',
      'copy',
      destMp4Path,
    ]);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
