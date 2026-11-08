// Installed sounds are ready on a repeat visit (#2082): a device that already holds the style's
// packs decodes them before Play, so the first note is the real sound — not the built-in one with
// a swap to the real one a few bars in — and each cached file is checked against its hash once.
import type { Page } from '@playwright/test';
import { expect, openBand, seedStarters, songLink } from './fixtures';
import { closeSounds, observeSamples, sampleStarts, test } from './foundation-helpers';

async function autoSoundsOn(page: Page) {
    await page.addInitScript(() => {
        try {
            localStorage.setItem('ensemble-v2-preview:auto-sounds', '1');
        } catch {
            // A spec that blocks storage reads the default, which is on.
        }
    });
}

/** From each page load: when every pack decode finished, and how many hashes were taken. */
async function timePackWork(page: Page) {
    await page.addInitScript(() => {
        const work = { decodedAt: [] as number[], digests: 0, firstStart: 0 };
        Object.assign(window, { __packWork: work });
        const decode = BaseAudioContext.prototype.decodeAudioData;
        BaseAudioContext.prototype.decodeAudioData = function (bytes: ArrayBuffer) {
            return decode.call(this, bytes).then((buffer) => {
                work.decodedAt.push(performance.now());
                return buffer;
            });
        };
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        crypto.subtle.digest = (...args: Parameters<SubtleCrypto['digest']>) => {
            work.digests++;
            return digest(...args);
        };
    });
}

function packWork(page: Page) {
    return page.evaluate(
        () =>
            (
                window as unknown as {
                    __packWork: { decodedAt: number[]; digests: number };
                }
            ).__packWork,
    );
}

function resolvedSound(page: Page, lane: string) {
    return page
        .locator('.player-row')
        .filter({ has: page.getByRole('heading', { name: lane, exact: true }) })
        .locator('.resolved-sound');
}

test('on a repeat visit the style’s sounds are decoded before Play and the band never starts on built-in', async ({
    page,
}, info) => {
    test.skip(
        info.project.name !== 'laptop',
        'a scheduling claim (decode before Play, digests once), not browser speed; WebKit still plays on fetched sounds in style-sounds’ fresh-device test and the one-install test',
    );
    test.setTimeout(120_000);
    await autoSoundsOn(page);
    await observeSamples(page);
    await timePackWork(page);
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    // First visit: the sounds arrive behind the band, as they always did.
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByTestId('stand-sounds')).toHaveAttribute('data-empty', 'true', {
        timeout: 60_000,
    });
    await expect.poll(() => sampleStarts(page), { timeout: 60_000 }).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Stop playback' }).click();

    // A repeat visit: the packs are in Cache Storage, nothing is decoded yet.
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    // Before Play: every lane the chart plays already names the installed pack, and the packs
    // are decoded without any press (the page is idle: no band, no gesture).
    await openBand(page, 'Players');
    await expect(resolvedSound(page, 'Drums')).toHaveText('Using Acoustic Drum Kit');
    await expect(resolvedSound(page, 'Bass')).toHaveText('Using Upright Bass');
    await expect(resolvedSound(page, 'Chords')).toHaveText('Using Acoustic Grand Piano');
    await closeSounds(page);
    // The idle decode runs to its end on its own: the count settles before any press.
    let decodedBeforePlay = 0;
    await expect
        .poll(
            async () => {
                const count = (await packWork(page)).decodedAt.length;
                const settled = count > 0 && count === decodedBeforePlay;
                decodedBeforePlay = count;
                return settled;
            },
            { intervals: [600], timeout: 30_000 },
        )
        .toBe(true);

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    const stop = page.getByRole('button', { name: 'Stop playback' });
    await expect(stop).toBeVisible();
    await expect.poll(() => sampleStarts(page), { timeout: 30_000 }).toBeGreaterThan(0);
    // No background fetch, so no later swap: the line stayed empty and the packs stayed decoded.
    await expect(page.getByTestId('stand-sounds')).toHaveAttribute('data-empty', 'true');
    // A bar or two of the band: nothing was left to decode behind it, so no swap can have come.
    await page.waitForTimeout(4000);
    const work = await packWork(page);
    expect(work.decodedAt.length).toBe(decodedBeforePlay);
    // Each cached file is checked once per load (plus the pack manifests), not once to prepare
    // it and again to decode it.
    expect(work.digests).toBeLessThanOrEqual(work.decodedAt.length + 12);
    info.annotations.push({
        type: 'timing',
        description: `decodes before Play ${decodedBeforePlay}, total ${work.decodedAt.length}; last decode at ${Math.round(Math.max(...work.decodedAt))} ms after load; digests ${work.digests}`,
    });
    await stop.click();
});
