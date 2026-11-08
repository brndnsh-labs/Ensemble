import { expect, openBand, seedStarters, songLink, test } from './fixtures';

/**
 * The count-in on the chart (#1991): while the band counts in, the beat is drawn large over the
 * bar Play starts from, not only as the digit inside the Play button. The countdown reads the
 * band host's count-in clock (`runtime.countInSlot`/`countInBeat`), so no UI timer drives it.
 */
async function openWithCountIn(page: import('@playwright/test').Page) {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await openBand(page, 'Practice');
    await page.getByLabel('Count-in', { exact: true }).check();
    await page.getByRole('button', { name: 'Close band' }).click();
    // why: at 40 BPM the count-in bar lasts six seconds. At the song's own tempo it lasted about
    // two, and a slow WebKit read the countdown's font size after the element had gone (NaN).
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('40');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('40');
}

test('the count-in counts down large over the first bar, then the bar lights as playing', async ({
    page,
}) => {
    await openWithCountIn(page);
    const toggle = page.locator('[data-play-toggle]');
    await toggle.click();

    const countdown = page.locator('.bar-countin');
    await expect(countdown).toBeVisible();
    const firstBar = page.locator('.bar').first();
    const digit = await countdown.textContent();
    expect(['1', '2', '3', '4']).toContain(digit?.trim());
    // It sits inside the first bar, and its digits are large (not button-sized).
    const size = await countdown.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(48);
    await expect(firstBar.locator('.bar-countin')).toHaveCount(1);
    // The play button counts the bar down instead of showing the stop glyph, and the chart's
    // playhead doesn't move yet: the count-in must not advance it (#1422).
    await expect(toggle).toHaveText(/^[1-4]$/);
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);

    // The count-in ends; the band's own downbeat lands, the glyph returns to stop, and the
    // playing bar takes over.
    await expect(countdown).toHaveCount(0, { timeout: 12_000 });
    await expect(toggle).toHaveText('■');
    await expect(page.locator('.bar.active')).toHaveCount(1);
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(1);
});
