import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * Chromium-only, same reasoning as `audio-export.chromium.spec.ts`: this exercises a real
 * `OfflineAudioContext` render, and headless WebKit's support for one is unproven here.
 *
 * This proves audio (WAV) export works on the band engine: `runtime.exportAudio` renders `BandHost`'s
 * event stream (`band-export.ts`) through the same `playBandEvent` voice adapter the live host
 * schedules with, so what downloads is what was heard.
 */

interface ParsedWav {
    numChannels: number;
    bitsPerSample: number;
    durationSeconds: number;
}

/** Same fixed 44-byte RIFF/WAVE/fmt/data header `encodeWav` always writes — see the sibling
 * `audio-export.chromium.spec.ts`'s copy of this parser. */
function parseWav(buf: Buffer): ParsedWav {
    if (
        buf.length < 44 ||
        buf.toString('ascii', 0, 4) !== 'RIFF' ||
        buf.toString('ascii', 8, 4 + 8) !== 'WAVE'
    ) {
        throw new Error('Not a WAV file produced by encodeWav');
    }
    const numChannels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const bitsPerSample = buf.readUInt16LE(34);
    const dataSize = buf.readUInt32LE(40);
    const bytesPerFrame = numChannels * (bitsPerSample / 8);
    return { numChannels, bitsPerSample, durationSeconds: dataSize / bytesPerFrame / sampleRate };
}

/** Loudest sample of a 16-bit WAV's data chunk, 0–1. */
function peakOf(buf: Buffer): number {
    let peak = 0;
    for (let offset = 44; offset + 1 < buf.length; offset += 2) {
        peak = Math.max(peak, Math.abs(buf.readInt16LE(offset)) / 0x8000);
    }
    return peak;
}

/** Same New-song-via-bar-editor flow `band-engine.spec.ts` uses, shared by both tests below. */
async function newBandChart(page: Page, title: string): Promise<void> {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill(title);
    for (const [i, bar] of ['C', 'F', 'G7', 'C'].entries()) {
        await page.getByLabel('Chords in this bar').fill(bar);
        if (i < 3) {
            await page.getByRole('button', { name: 'Next bar', exact: true }).click();
        }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
}

test('Export audio (mix) works on the band engine and downloads a valid WAV', async ({
    page,
}, testInfo) => {
    test.setTimeout(60_000);
    await newBandChart(page, 'Band export study');

    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download', { timeout: 45_000 });
    await page.getByRole('button', { name: 'Export audio (mix)' }).click();
    const downloadEvent = await download;
    expect(downloadEvent.suggestedFilename()).toBe('Band export study.wav');
    const dest = testInfo.outputPath('band-mix.wav');
    await downloadEvent.saveAs(dest);
    await page.getByRole('button', { name: 'Close', exact: true }).click();

    const wav = parseWav(await readFile(dest));
    expect(wav.numChannels).toBe(2);
    expect(wav.bitsPerSample).toBe(16);
    // A 4-bar pass at any plausible tempo, plus the render's lead-in/tail (`band-export.ts`) —
    // a wide band, not an exact swing-adjusted sum (this suite doesn't fix the new-song tempo).
    expect(wav.durationSeconds).toBeGreaterThan(1);
    expect(wav.durationSeconds).toBeLessThan(30);
    // No error along the way (a thrown export would surface as the menu's own error banner,
    // not a page crash, so check that too).
    await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('Export audio (stems) renders drums/bass/chords/soloist, never harmony', async ({
    page,
}, testInfo) => {
    // Four full offline renders (`renderBandStemsToWav`), one per lane the band engine has.
    test.setTimeout(120_000);
    await newBandChart(page, 'Band stems study');

    await page.getByRole('button', { name: 'Song actions' }).click();
    // `renderBandStemsToWav` drops `harmony` before rendering anything for it (band-export.ts)
    // — the band engine has no such lane — so exactly 4 downloads land, not the old engine's
    // 5; the soloist stem is the lead, forced on like every stem even though it is off live.
    // Matches `audio-export.chromium.spec.ts`'s accumulation pattern for
    // `downloadExportResult`'s tight synchronous loop.
    const downloads: import('@playwright/test').Download[] = [];
    page.on('download', (event) => downloads.push(event));
    await page.getByRole('button', { name: 'Export audio (stems)' }).click();
    await expect.poll(() => downloads.length, { timeout: 110_000 }).toBe(4);
    const names = downloads.map((event) => event.suggestedFilename()).sort();
    expect(names).toEqual(
        ['drums', 'bass', 'chords', 'soloist']
            .map((instrument) => `Band stems study-stem-${instrument}.wav`)
            .sort(),
    );
    for (const [i, event] of downloads.entries()) {
        const dest = testInfo.outputPath(`band-stem-${i}.wav`);
        await event.saveAs(dest);
        const buf = await readFile(dest);
        const wav = parseWav(buf);
        expect(wav.durationSeconds).toBeGreaterThan(1);
        // Every stem is heard, the lead included though it is off live: a lane that is off
        // renders its stem with its bus open (`renderBandPasses`), not at −80 dB (−40 dBFS
        // is a floor far under any lane's real level and far over a closed bus's).
        expect(peakOf(buf), event.suggestedFilename()).toBeGreaterThan(0.01);
    }
    await expect(page.locator('.error-banner')).toHaveCount(0);
});
