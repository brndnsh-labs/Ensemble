import { appUrl, editorRevealed, expect, songLink, test } from './fixtures';

/**
 * The stand's Neck mode (#1587): a third view beside Chart and Edit chart that shows the grip for
 * the chord sounding now, previews the next one, follows the band, and is remembered per device.
 */
test('the neck shows the grip, follows the band and is remembered', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Neck study');
    for (const [i, bar] of ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'].entries()) {
        await page.getByLabel('Chords in this bar').fill(bar);
        if (i < 3) {
            await page.getByRole('button', { name: 'Next bar', exact: true }).click();
        }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);

    // Neck replaces the chart sheet; stopped, it shows the first grip and points at the second.
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('button', { name: 'Chart', exact: true })).not.toHaveClass(
        /active/,
    );
    const view = page.getByRole('region', { name: 'Neck' });
    await expect(view).toBeVisible();
    await expect(page.getByRole('region', { name: 'Chord chart' })).toHaveCount(0);
    await expect(view.locator('svg.neck')).toBeVisible();
    await expect(view.locator('.neck-dot')).toHaveCount(3);
    await expect(view.getByTestId('neck-current')).toHaveText('Dm7');
    await expect(view.getByTestId('neck-next')).toContainText('G7');
    await expect(view.locator('.neck-narration')).toContainText('Then G7: root up a 4th');

    // The phone keeps the page inside the screen in Neck mode.
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    // The hand position is the neck's own slider.
    const hand = view.getByRole('slider', { name: 'Hand position' });
    await expect(hand).toHaveAttribute('aria-valuenow', '2');
    await hand.focus();
    await hand.press('ArrowRight');
    await expect(hand).toHaveAttribute('aria-valuenow', '3');

    // A ukulele has four strings, a guitar six.
    const instrument = view.getByLabel('Instrument', { exact: true });
    await instrument.selectOption('uke');
    await expect(view.locator('.neck-string')).toHaveCount(4);
    await expect(view.getByLabel('Root strings')).toHaveCount(0);
    await instrument.selectOption('guitar');
    await expect(view.locator('.neck-string')).toHaveCount(6);

    // Playing, the neck follows the band to the second chord, with the preview layer up.
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect(view.getByTestId('neck-current')).toHaveText('G7', { timeout: 20_000 });
    await expect(view.locator('.neck-preview')).toHaveCount(1);
    await expect(view.locator('.neck-narration')).toContainText('Next: Cmaj7.');
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();

    // Neck mode is remembered on this device.
    await page.reload();
    await songLink(page, 'Neck study').first().click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveClass(/active/);
    await expect(page.getByRole('region', { name: 'Neck' }).locator('.neck-dot')).toHaveCount(3);
    // Editing takes over from the neck, and Chart brings the sheet back.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).not.toHaveClass(/active/);
    await expect(page.getByRole('region', { name: 'Neck' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
    expect(errors).toEqual([]);
});
