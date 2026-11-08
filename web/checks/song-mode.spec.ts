import type { Page } from '@playwright/test';
import {
    appUrl,
    expect,
    formLength,
    measureSong,
    openBand,
    seedGuestDocuments,
    songLink,
    test,
} from './fixtures';

/**
 * #1784: song mode plays a looping chart a counted number of choruses, picked to land nearest
 * the target length, then stops on its held ending — and never writes the chart. Observed as
 * `choruses.spec.ts` observes a counted chart: through the chart's pointer (every time the
 * form's first chord becomes current is one more pass) and the transport's Play/Stop button.
 *
 * The form is one bar, `C G`, at 240 bpm: a second a chorus, so three minutes asks for 180 of
 * them and song mode's 16-chorus cap decides — a 16-second performance. Not 320: the count is
 * exact and every half-bar chord sits at a lap wrap, where a WebKit stall has swallowed one
 * (docs/FLAKY_TESTS.md); at 320 a chord is 375 ms, shorter than a 484 ms stall seen there.
 */

declare global {
    interface Window {
        __songEvidence: { armed: boolean; current: string[] };
    }
}

const LOOPING = measureSong(['song-mode-loop', 'Song mode loop', 'Rock', 'C', 'C G', 240]);
const COUNTED = (() => {
    const doc = measureSong(['song-mode-counted', 'Song mode counted', 'Rock', 'C', 'C G', 240]);
    doc.chart.score.choruses = 2;
    return doc;
})();

async function observePointer(page: Page) {
    await page.addInitScript(() => {
        const evidence = { armed: false, current: [] as string[] };
        window.__songEvidence = evidence;
        // The mutation RECORDS, not the DOM: a starved tab can batch two transitions.
        new MutationObserver((records) => {
            if (!evidence.armed) {
                return;
            }
            for (const record of records) {
                const target = record.target as Element;
                if (
                    target.classList?.contains('chord') &&
                    record.attributeName === 'aria-current' &&
                    record.oldValue !== 'true' &&
                    target.getAttribute('aria-current') === 'true'
                ) {
                    evidence.current.push(target.textContent?.trim() ?? '');
                }
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-current'],
        });
    });
}

const passes = (page: Page) =>
    page.evaluate(() => window.__songEvidence.current.filter((name) => name === 'C').length);

async function arm(page: Page) {
    await page.evaluate(() => {
        window.__songEvidence.current = [];
        window.__songEvidence.armed = true;
    });
}

/** The guest store's row for `id`, exactly as saved. */
const storedRow = (page: Page, id: string) =>
    page.evaluate(async (key) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('ensemble-v2-preview', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        const row = await new Promise<unknown>((resolve, reject) => {
            const request = db.transaction('documents').objectStore('documents').get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
        db.close();
        return JSON.stringify(row);
    }, id);

async function closeBand(page: Page) {
    await page.getByRole('button', { name: 'Close band' }).click();
    await expect(page.locator('dialog.band-panel[open]')).toHaveCount(0);
}

test('song mode plays the counted choruses and stops; Off loops; the chart is never written (#1784)', async ({
    page,
}) => {
    test.setTimeout(120_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePointer(page);
    await seedGuestDocuments(page, [LOOPING, COUNTED]);
    await songLink(page, 'Song mode loop').first().click();
    const play = page.getByRole('button', { name: 'Start playback', exact: true });
    const stop = page.getByRole('button', { name: 'Stop playback', exact: true });
    await expect(play).toBeVisible();

    // Off by default: the band repeats the song.
    let sheet = await openBand(page, 'Practice');
    const length = sheet.getByLabel('Song length', { exact: true });
    await expect(length).toHaveValue('off');
    await expect(sheet.locator('#song-length-detail')).toHaveText(
        'The band repeats the song until you stop it.',
    );
    // Three minutes of a 750 ms chorus is past the cap: 16 choruses, 12 seconds.
    await length.selectOption('3');
    await expect(sheet.locator('#song-length-detail')).toHaveText('≈0:16 · 16 choruses');
    await closeBand(page);

    const before = await storedRow(page, LOOPING.id);
    await arm(page);
    await play.click();
    await expect(stop).toBeVisible();
    // The band stops by itself after the 16th chorus.
    await expect(play).toBeVisible({ timeout: 60_000 });
    expect(await passes(page)).toBe(16);
    // On the last chorus's last chord, not inside the form.
    expect(await page.evaluate(() => window.__songEvidence.current.at(-1))).toBe('G');
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);

    // The chart is untouched: still Loop, nothing unsaved, the stored row byte-identical.
    expect(await formLength(page)).toBe('Repeats continuously');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(await storedRow(page, LOOPING.id)).toBe(before);

    // A chart that counts its own choruses sets its own length: the control is off for it.
    // (That the setting survives a reload is where-you-are's and `session.test.ts`'s claim.)
    await page.goto(appUrl());
    await songLink(page, 'Song mode counted').first().click();
    sheet = await openBand(page, 'Practice');
    await expect(sheet.getByLabel('Song length', { exact: true })).toBeDisabled();
    await expect(sheet.locator('#song-length-detail')).toHaveText(
        'This chart plays 2 times, then ends, so it sets its own length.',
    );
    await closeBand(page);

    // Off: the counter keeps counting choruses with no end ("Chorus 3", never "Chorus 3 / 16"),
    // so the looping chart plays on past where song mode would have stopped it.
    await page.goto(appUrl());
    await songLink(page, 'Song mode loop').first().click();
    sheet = await openBand(page, 'Practice');
    await sheet.getByLabel('Song length', { exact: true }).selectOption('off');
    await closeBand(page);
    await arm(page);
    await play.click();
    await expect(stop).toBeVisible();
    await expect(page.getByTestId('chorus-counter')).toHaveText(/^Chorus \d+$/);
    await stop.click();
    await expect(play).toBeVisible();

    await page.evaluate(() => {
        window.__songEvidence.armed = false;
    });
    expect(pageErrors).toEqual([]);
});

test('song mode keeps the stand at its size through Play and Stop (#1784)', async ({ page }) => {
    // A real standard that needs a smaller step to fit: re-fitting at Play (when the controls
    // fold away and free height) would pick a larger one. The step is never re-chosen for
    // play/stop, song mode included — its counted view reuses the written blocks.
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: 'Autumn Leaves' });
    await row.getByRole('button', { name: 'Open' }).click();
    const scroll = page.locator('.chart-scroll[data-fit]');
    await expect(scroll).toBeVisible();
    const sheet = await openBand(page, 'Practice');
    await sheet.getByLabel('Song length', { exact: true }).selectOption('3');
    await expect(sheet.locator('#song-length-detail')).toHaveText(/^≈\d+:\d\d · \d+ choruses$/);
    await closeBand(page);
    const stopped = await scroll.getAttribute('data-fit');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    // Give a re-fit, if any, its layout pass.
    await page.waitForTimeout(500);
    expect(await scroll.getAttribute('data-fit')).toBe(stopped);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await page.waitForTimeout(500);
    expect(await scroll.getAttribute('data-fit')).toBe(stopped);
});
