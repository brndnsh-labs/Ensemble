import type { Page } from '@playwright/test';
import { expect, measureSong, openBand, seedGuestDocuments, songLink, test } from './fixtures';

/**
 * #1990: the stand says where you are. A chorus counter on the transport (read off the band's
 * clock), the bars of the player's turn tinted and named while the band trades, and the chart
 * footer saying what the device's Song length will really play.
 *
 * Four bars at 240 bpm is a four-second chorus, so each pass is quick to reach.
 */
const FORM = 'C|G|Am|F';
const COUNTED = (() => {
    const doc = measureSong(['where-counted', 'Where counted', 'Rock', 'C', FORM, 240]);
    doc.chart.score.choruses = 3;
    return doc;
})();
const LOOPING = measureSong(['where-loop', 'Where loop', 'Rock', 'C', FORM, 240]);
const JAZZ = measureSong(['where-trade', 'Where trade', 'Jazz', 'C', FORM, 240]);

const counter = (page: Page) => page.getByTestId('chorus-counter');

test('the transport counts the choruses of a counted chart (#1990)', async ({ page }) => {
    test.setTimeout(60_000);
    await seedGuestDocuments(page, [COUNTED]);
    await songLink(page, 'Where counted').first().click();
    await expect(counter(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(counter(page)).toContainText('Chorus 1 / 3', { timeout: 15_000 });
    await expect(counter(page)).toContainText('Chorus 2 / 3', { timeout: 15_000 });
    await expect(counter(page)).toContainText('Chorus 3 / 3', { timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeVisible({
        timeout: 30_000,
    });
    await expect(counter(page)).toHaveCount(0);
});

test('a chart that repeats counts its laps without a total (#1990)', async ({ page }) => {
    test.setTimeout(60_000);
    await seedGuestDocuments(page, [LOOPING]);
    await songLink(page, 'Where loop').first().click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(counter(page)).toHaveText(/^Chorus 1$/, { timeout: 15_000 });
    await expect(counter(page)).toHaveText(/^Chorus 2$/, { timeout: 15_000 });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test("trading tints the player's turns and names who has each (#1990)", async ({ page }) => {
    test.setTimeout(60_000);
    await seedGuestDocuments(page, [JAZZ]);
    await songLink(page, 'Where trade').first().click();
    const sheet = await openBand(page, 'Trade');
    await sheet.getByLabel('Trade with').selectOption('drums');
    await sheet.getByLabel('Turns', { exact: true }).selectOption('2');
    await sheet.getByRole('button', { name: 'Close band' }).click();

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    // The head is not traded: no bar is a turn.
    await expect(counter(page)).toContainText('Chorus 1', { timeout: 15_000 });
    await expect(page.locator('.bar[data-turn]')).toHaveCount(0);
    // After it, two bars are the player's and two the drummer's.
    await expect(counter(page)).toContainText('Chorus 2', { timeout: 15_000 });
    await expect(page.locator('.bar[data-turn="you"]')).toHaveCount(2);
    await expect(page.locator('.bar[data-turn="band"]')).toHaveCount(2);
    await expect(page.locator('.bar-turn[data-turn-label="you"]')).toHaveText('You');
    await expect(page.locator('.bar-turn[data-turn-label="band"]')).toHaveText('Drums');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('the chart footer follows the device Song length, across a reload (#1990)', async ({
    page,
}) => {
    await seedGuestDocuments(page, [LOOPING]);
    await songLink(page, 'Where loop').first().click();
    const footer = page.locator('.chart-bottom').getByRole('button');
    await expect(footer).toHaveText('4 bars · repeats continuously');

    const sheet = await openBand(page, 'Practice');
    await sheet.getByLabel('Song length', { exact: true }).selectOption('3');
    await sheet.getByRole('button', { name: 'Close band' }).click();
    await expect(footer).toHaveText(/^4 bars · ≈\d+:\d\d · \d+ choruses$/);

    await page.reload();
    await songLink(page, 'Where loop').first().click();
    await expect(footer).toHaveText(/^4 bars · ≈\d+:\d\d · \d+ choruses$/);

    const again = await openBand(page, 'Practice');
    await again.getByLabel('Song length', { exact: true }).selectOption('off');
    await again.getByRole('button', { name: 'Close band' }).click();
    await expect(footer).toHaveText('4 bars · repeats continuously');
});
