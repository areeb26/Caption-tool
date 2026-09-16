/**
 * Manual smoke/stress test for the caption render pipeline. Not part of the
 * app build — run with `npx tsx scripts/render-smoketest.ts <sourceVideo> <outDir>`.
 * Exercises phraseGrouper + all 10 templates + adversarial caption docs
 * directly against the real ASS generator and ffmpeg burn-in, bypassing
 * ASR (no vendor keys in this environment) with a hand-built word list.
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { groupWordsIntoPhrases } from '../lib/phraseGrouper';
import { burnInCaptions, probeDurationMs } from '../lib/export/burnin';
import { generateAss } from '../lib/export/ass';
import { TEMPLATE_LIST } from '../lib/templates';
import type { TranscriptWord } from '../lib/asr/types';
import type { CaptionDoc } from '../lib/captionTypes';

const [, , sourceVideo, outDirArg] = process.argv;
if (!sourceVideo || !outDirArg) {
  console.error('usage: tsx scripts/render-smoketest.ts <sourceVideo> <outDir>');
  process.exit(1);
}
const outDir = path.resolve(outDirArg);

// Natural case + punctuation, like real ASR output (Deepgram/AssemblyAI
// both return punctuated, cased transcripts) — needed to exercise
// `textTransform: 'none'` on viral-yellow properly instead of masking it
// with all-lowercase test input.
const NARRATION =
  'If you want to grow your business, you have to fire your excuses right now. ' +
  'Save this video and thank me later, this is the secret nobody tells you. ' +
  'Love the process, stack your money, and give value every single day. ' +
  'That is the real tip nobody shares.';

function buildEvenlySpacedWords(text: string, durationMs: number): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const slot = durationMs / words.length;
  return words.map((w, i) => ({
    text: w,
    startMs: Math.round(i * slot + 60),
    endMs: Math.round(i * slot + slot * 0.82),
  }));
}

const ADVERSARIAL_DOC: CaptionDoc = {
  presetId: 'viral-yellow',
  phrases: [
    {
      id: 'a1',
      text: '',
      startMs: 0,
      endMs: 0,
      words: [],
    },
    {
      id: 'a2',
      text: '   ',
      startMs: 200,
      endMs: 200,
      words: [{ text: '   ', startMs: 200, endMs: 200 }],
    },
    {
      id: 'a3',
      text: 'supercalifragilisticexpialidocious antidisestablishmentarianism pneumonoultramicroscopicsilicovolcanoconiosis',
      startMs: 500,
      endMs: 3000,
      words: [
        { text: 'supercalifragilisticexpialidocious', startMs: 500, endMs: 1500 },
        { text: 'antidisestablishmentarianism', startMs: 1500, endMs: 2200 },
        { text: 'pneumonoultramicroscopicsilicovolcanoconiosis', startMs: 2200, endMs: 3000 },
      ],
    },
    {
      id: 'a4',
      text: 'quote "this" and {braces} and \\backslash\\ and | pipe',
      startMs: 3000,
      endMs: 5000,
      words: [
        { text: 'quote', startMs: 3000, endMs: 3300 },
        { text: '"this"', startMs: 3300, endMs: 3600 },
        { text: 'and', startMs: 3600, endMs: 3800 },
        { text: '{braces}', startMs: 3800, endMs: 4100 },
        { text: 'and', startMs: 4100, endMs: 4300 },
        { text: '\\backslash\\', startMs: 4300, endMs: 4700 },
        { text: 'and', startMs: 4700, endMs: 4850 },
        { text: '|', startMs: 4850, endMs: 4900 },
        { text: 'pipe', startMs: 4900, endMs: 5000 },
      ],
    },
    {
      id: 'a5-overlap-1',
      text: 'overlapping phrase one here',
      startMs: 5000,
      endMs: 7000,
      words: [
        { text: 'overlapping', startMs: 5000, endMs: 5500 },
        { text: 'phrase', startMs: 5500, endMs: 6000 },
        { text: 'one', startMs: 6000, endMs: 6500 },
        { text: 'here', startMs: 6500, endMs: 7000 },
      ],
    },
    {
      id: 'a5-overlap-2',
      text: 'overlapping phrase two here',
      startMs: 6000,
      endMs: 8000,
      words: [
        { text: 'overlapping', startMs: 6000, endMs: 6500 },
        { text: 'phrase', startMs: 6500, endMs: 7000 },
        { text: 'two', startMs: 7000, endMs: 7500 },
        { text: 'here', startMs: 7500, endMs: 8000 },
      ],
    },
    {
      id: 'a6-reversed',
      text: 'time travels backwards now',
      startMs: 9000,
      endMs: 8500,
      words: [{ text: 'time travels backwards now', startMs: 9000, endMs: 8500 }],
    },
    {
      id: 'a7-unicode',
      text: 'improve karna start kiya आज ही 🔥💰',
      startMs: 9500,
      endMs: 11500,
      words: [
        { text: 'improve', startMs: 9500, endMs: 9800 },
        { text: 'karna', startMs: 9800, endMs: 10100 },
        { text: 'start', startMs: 10100, endMs: 10400 },
        { text: 'kiya', startMs: 10400, endMs: 10700 },
        { text: 'आज', startMs: 10700, endMs: 11000 },
        { text: 'ही', startMs: 11000, endMs: 11200 },
        { text: '🔥💰', startMs: 11200, endMs: 11500 },
      ],
    },
    // ~250 rapid-fire micro-phrases packed into 4s to stress ffmpeg/libass event count.
    ...Array.from({ length: 250 }, (_, i) => {
      const start = 12000 + i * 16;
      return {
        id: `flood-${i}`,
        text: `w${i}`,
        startMs: start,
        endMs: start + 15,
        words: [{ text: `w${i}`, startMs: start, endMs: start + 15 }],
      };
    }),
  ],
};

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const durationMs = await probeDurationMs(sourceVideo);
  console.log(`source duration: ${durationMs}ms`);

  const words = buildEvenlySpacedWords(NARRATION, durationMs - 500);
  const grouped = groupWordsIntoPhrases(words, 'viral-yellow');
  console.log(`phrase grouper produced ${grouped.phrases.length} phrases:`);
  for (const p of grouped.phrases) {
    console.log(
      `  [${p.startMs}-${p.endMs}] (${p.text.length} chars, ${p.words.length}w) "${p.text}"`
    );
  }

  // Chapter-heading title cards, like "01. Everyone grows differently" in
  // the reference footage — a separate mid-frame overlay track, not part
  // of the spoken captions.
  grouped.titles = [
    { id: 't1', text: '01. Consistency beats motivation', startMs: 400, endMs: 3200 },
    { id: 't2', text: '02. Nobody watches your first 90 reels', startMs: 8900, endMs: 12300 },
  ];

  await fs.writeFile(path.join(outDir, 'captions.json'), JSON.stringify(grouped, null, 2));

  const results: { presetId: string; ok: boolean; error?: string; outPath?: string }[] = [];

  for (const template of TEMPLATE_LIST) {
    const doc: CaptionDoc = { ...grouped, presetId: template.presetId };
    const outPath = path.join(outDir, `${template.presetId}.mp4`);
    try {
      await burnInCaptions(sourceVideo, doc, template.presetId, outPath);
      results.push({ presetId: template.presetId, ok: true, outPath });
      console.log(`OK   ${template.presetId} -> ${outPath}`);
    } catch (err: any) {
      results.push({ presetId: template.presetId, ok: false, error: err?.message ?? String(err) });
      console.error(`FAIL ${template.presetId}: ${err?.message ?? err}`);
    }
  }

  console.log('\n--- Adversarial stress pass ---');
  for (const template of TEMPLATE_LIST) {
    const doc: CaptionDoc = { ...ADVERSARIAL_DOC, presetId: template.presetId };
    const outPath = path.join(outDir, `adversarial-${template.presetId}.mp4`);
    try {
      // Also sanity check the raw ASS text is generated without throwing.
      generateAss(doc, template.presetId);
      await burnInCaptions(sourceVideo, doc, template.presetId, outPath);
      results.push({ presetId: `adversarial-${template.presetId}`, ok: true, outPath });
      console.log(`OK   adversarial/${template.presetId} -> ${outPath}`);
    } catch (err: any) {
      results.push({
        presetId: `adversarial-${template.presetId}`,
        ok: false,
        error: err?.message ?? String(err),
      });
      console.error(`FAIL adversarial/${template.presetId}: ${err?.message ?? err}`);
    }
  }

  await fs.writeFile(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
  const failures = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failures.length}/${results.length} renders succeeded.`);
  if (failures.length) {
    console.log('Failures:', failures.map((f) => f.presetId).join(', '));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
});
