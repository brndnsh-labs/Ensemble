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
}

test('the count-in counts down large over the first bar, then the bar lights as playing', async ({
    page,
}) => {
    await openWithCountIn(page);
    await page.locator('[data-play-toggle]').click();

    const countdown = page.locator('.bar-countin');
    await expect(countdown).toBeVisible();
    const firstBar = page.locator('.bar').first();
    const digit = await countdown.textContent();
    expect(['1', '2', '3', '4']).toContain(digit?.trim());
    // It sits inside the first bar, and its digits are large (not button-sized).
    const size = await countdown.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(48);
    await expect(firstBar.locator('.bar-countin')).toHaveCount(1);

    // The count-in ends; the playing bar takes over.
    await expect(countdown).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator('.bar.active')).toHaveCount(1);
});

test('reduced motion: the countdown does not animate', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openWithCountIn(page);
    await page.locator('[data-play-toggle]').click();
    const countdown = page.locator('.bar-countin');
    await expect(countdown).toBeVisible();
    expect(await countdown.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
});
