import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { appUrl, expect, exportAs, openBand, seedStarters, songLink, test } from './fixtures';

// Same starter facts `checks/midi-export.spec.ts` hardcodes, for the same reason: an
// independent check on the exporter, not a mirror of the app's own arranger math.
const STARTER_BPM = 110;
const STARTER_BARS = 12;
const STEPS_PER_BAR = 16;
const ONE_LOOP_SECONDS = (STARTER_BARS * STEPS_PER_BAR * 60) / STARTER_BPM / 4;

/**
 * Chromium-only (see the filename suffix in `playwright.config.ts`'s
 * `chromiumOnly` match): this exercises a real `OfflineAudioContext` render
 * (`renderBandMixToWav` in `lib/band-export.ts`), and this repo's only other proof that real
 * Web Audio behaves under headless automation (`npm run test:browser`,
 * root CLAUDE.md) is Chromium-only too — WebKit's headless Web Audio support
 * under Playwright is unproven here, so this doesn't bet on it.
 */

interface ParsedWav {
    sampleRate: number;
    numChannels: number;
    bitsPerSample: number;
    dataSize: number;
    durationSeconds: number;
}

/** `encodeWav` (core/engine/wav-encoder.ts) always writes the same fixed
 * 44-byte RIFF/WAVE/fmt/data header — no extra chunks, no chunk search needed. */
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
    return {
        sampleRate,
        numChannels,
        bitsPerSample,
        dataSize,
        durationSeconds: dataSize / bytesPerFrame / sampleRate,
    };
}

test('Export → Audio (mix) downloads a valid WAV of plausible duration, and the live chart is unchanged after', async ({
    page,
}, testInfo) => {
    // A WAV mix render does real per-step note generation AND full audio
    // synthesis for the whole rendered duration (`renderClonedStateToWav`),
    // unlike the MIDI exporter's plain event walk — comfortably slower, and
    // this suite's own machine has shown enough variance to need real headroom
    // rather than the default 45s.
    test.setTimeout(120_000);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket' })).toBeVisible();
    const before = await page.locator('.sheet').innerText();

    const download = page.waitForEvent('download', { timeout: 100_000 });
    await exportAs(page, 'Audio (mix)');
    const downloadEvent = await download;
    expect(downloadEvent.suggestedFilename()).toBe('Blue pocket.wav');
    const dest = testInfo.outputPath('mix.wav');
    await downloadEvent.saveAs(dest);
    const wav = parseWav(await readFile(dest));

    expect(wav.numChannels).toBe(2);
    expect(wav.bitsPerSample).toBe(16);
    // One loop (the default) plus the render's fixed 0.25s lead-in and 2s tail
    // (`renderBandPasses`) — a wide band, not the exact swing-adjusted sum.
    expect(wav.durationSeconds).toBeGreaterThan(ONE_LOOP_SECONDS);
    expect(wav.durationSeconds).toBeLessThan(ONE_LOOP_SECONDS + 10);

    // The render runs on a detached state clone (#1278's acceptance): the live chart must read back
    // identical to before the render, not just "the app didn't crash." Read
    // both sides the same way (`innerText`, not the `textContent`-based
    // `toHaveText` matcher) so this compares like with like.
    const after = await page.locator('.sheet').innerText();
    expect(after).toBe(before);
});

test('Export → Audio during playback does not stop or glitch the band', async ({ page }) => {
    // Same single-render cost as the plain mix export test above (this
    // environment has shown real variance on that one too), plus the offline
    // render's step-generation loop now shares the main thread with the live
    // scheduler's real-time ticks — same generous budget, not a tighter one.
    test.setTimeout(120_000);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();

    const download = page.waitForEvent('download', { timeout: 100_000 });
    await exportAs(page, 'Audio (mix)');
    await download;

    // The render runs on a detached clone via a fresh `OfflineAudioContext`
    // (`renderClonedStateToWav`); it must never touch the live scheduler.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

/**
 * Blue pocket on the stand with the grand piano chosen but evicted, and its manifest fetch held
 * back 4s once armed: an export's own `prepareSounds` then has slow work to do.
 */
async function slowGrandExport(page: Page) {
    // Delay (never fail) only the pack's OWN manifest fetch once armed — not
    // every sample file, which would stack a serial multi-second delay onto
    // each of `grand`'s 21 samples (`prepareSound` fetches at concurrency 1) —
    // so there is one bounded, reliable window to click Cancel while
    // `exportAudio`'s pre-flight `prepareSounds` is in flight, and the rest of
    // the (locally-served, fast) install still finishes soon after.
    // `manifest` crosses into the page as an argument: this body runs in the browser, where the
    // suite's `appUrl` does not exist.
    await page.addInitScript((manifest: string) => {
        const original = window.fetch;
        Object.assign(window, { __delayPack: false });
        window.fetch = async (input, init) => {
            if (
                (window as unknown as { __delayPack: boolean }).__delayPack &&
                String(input).includes(manifest)
            ) {
                await new Promise((resolve) => setTimeout(resolve, 4000));
            }
            return original(input, init);
        };
    }, appUrl('packs/grand/manifest.json'));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Players');
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    // Wait for the picker's OWN install to fully finish (`toBeEnabled`, not just
    // the optimistic `toHaveValue`, which flips the instant the click is made —
    // see `pendingSound` in app/ensemble.tsx) before touching the cache below,
    // or this races the picker's still-in-flight `prepareSound` instead of the
    // export's.
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await page.getByRole('button', { name: 'Close band' }).click();

    // Evict what was just installed and arm the delay, so the export's own
    // `prepareSounds` call has real (slow) work to do rather than a cache hit.
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        for (const request of await cache.keys()) {
            if (request.url.includes('/packs/grand/')) {
                await cache.delete(request);
            }
        }
        Object.assign(window, { __delayPack: true });
    });
}

test('Cancel stops an in-flight export before any download', async ({ page }) => {
    await slowGrandExport(page);
    const download = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await exportAs(page, 'Audio (mix)');
    await expect(page.getByText(/Preparing Acoustic Grand Piano/)).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await download).toBeNull();

    // The delayed manifest fetch keeps running in the background for up to 4s,
    // then the (fast, local) 21-sample install still finishes behind it; once
    // it all settles, a cancelled `exportAudio` must return quietly — no error
    // banner (`ExportCancelled` is swallowed, not rethrown) and the menu's own
    // busy state must have cleared, proving the export genuinely unwound
    // rather than being stuck "in progress" forever.
    await expect(page.getByText(/Preparing Acoustic Grand Piano/)).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.getByTestId('export-dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
});

test('Esc never closes Export… while audio renders: Cancel stays in reach (#1756)', async ({
    page,
}) => {
    await slowGrandExport(page);
    await exportAs(page, 'Audio (mix)');
    const dialog = page.getByTestId('export-dialog');
    await expect(page.getByText(/Preparing Acoustic Grand Piano/)).toBeVisible();
    // A browser honours a refused `cancel` only with fresh user activation, so the third Esc
    // closes a modal dialog anyway; the dialog opens itself again while the render runs.
    for (let press = 0; press < 3; press += 1) {
        await page.keyboard.press('Escape');
    }
    await expect(dialog).toBeVisible();
    await expect(page.getByText(/Preparing Acoustic Grand Piano/)).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('A pack that fails to install surfaces an error, never a silent synth fallback', async ({
    page,
}) => {
    // Browser-side body; the pack URL arrives as an argument (see the Cancel test above).
    await page.addInitScript((grand: string) => {
        const original = window.fetch;
        Object.assign(window, { __breakPack: false });
        window.fetch = async (input, init) => {
            if (
                (window as unknown as { __breakPack: boolean }).__breakPack &&
                String(input).includes(grand)
            ) {
                return new Response('offline', { status: 503 });
            }
            return original(input, init);
        };
    }, appUrl('packs/grand/'));
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Players');
    await page.getByLabel('Chords sound', { exact: true }).selectOption('pack:grand');
    await expect(page.getByLabel('Chords sound', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Chords sound', { exact: true })).toHaveValue('pack:grand');
    await page.getByRole('button', { name: 'Close band' }).click();

    // Evict the just-installed pack and break its re-fetch route, matching
    // `checks/foundation-sounds.spec.ts`'s "partial cache eviction" scenario — a
    // pack the chart genuinely selects but can no longer install, not merely
    // one that was never tried.
    await page.evaluate(async () => {
        const cache = await caches.open('ensemble-v2-sounds-v1');
        for (const request of await cache.keys()) {
            if (request.url.includes('/packs/grand/')) {
                await cache.delete(request);
            }
        }
        Object.assign(window, { __breakPack: true });
    });

    const download = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
    await exportAs(page, 'Audio (mix)');
    await expect(page.locator('.error-banner')).toBeVisible();
    // Never a WAV rendered with a silent synth stand-in for the unavailable pack.
    expect(await download).toBeNull();
});
