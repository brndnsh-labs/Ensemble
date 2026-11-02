import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * The neck on a tablet (#1995): the board is scaled up and the chart's current row stays under
 * it, with the playing bar, the section letter and bar numbers, following the band.
 */
test('the neck fills a tablet and keeps the chart row under the board (#1995)', async ({
    page,
}, info) => {
    test.setTimeout(60_000);
    const sizes =
        info.project.name === 'laptop'
            ? [
                  { width: 1024, height: 1366 },
                  { width: 1366, height: 1024 },
              ]
            : [page.viewportSize() ?? { width: 402, height: 874 }];
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Neck', exact: true }).click();
    const view = page.getByRole('region', { name: 'Neck' });
    for (const size of sizes) {
        await page.setViewportSize(size);
        await expect(view.locator('svg.neck')).toBeVisible();
        const row = view.getByTestId('neck-chart');
        await expect(row).toBeVisible();
        await expect(row.locator('.section-letter')).toHaveText('A');
        await expect(row.locator('.bar')).toHaveCount(4);
        await expect(row.locator('.bar-number')).toHaveText(['1', '2', '3', '4']);
        // Nothing to scroll for: the strip, the board, the row and the settings are all on screen.
        await expect
            .poll(() =>
                view.evaluate((el) => ({
                    fits: el.scrollHeight <= el.clientHeight,
                    sideways: document.documentElement.scrollWidth > window.innerWidth,
                })),
            )
            .toEqual({ fits: true, sideways: false });
        const rows = await view.evaluate((el) => {
            const box = (s: string) => el.querySelector(s)?.getBoundingClientRect();
            return {
                vh: window.innerHeight,
                stripTop: box('.neck-strip')?.top ?? 0,
                boardBottom: box('svg.neck')?.bottom ?? 0,
                chartTop: box('.neck-chart')?.top ?? 0,
                chartBottom: box('.neck-chart')?.bottom ?? 0,
                settingsBottom: box('.neck-settings')?.bottom ?? 0,
            };
        });
        // The row sits under the board and inside the screen.
        expect(rows.chartTop).toBeGreaterThanOrEqual(rows.boardBottom);
        expect(rows.chartBottom).toBeLessThanOrEqual(rows.vh);
        if (size.width > 760) {
            // On a tablet the neck (strip to settings) takes at least half the screen's height.
            expect((rows.settingsBottom - rows.stripTop) / rows.vh).toBeGreaterThanOrEqual(0.5);
        }
    }
    // Playing: the row follows the band, and its playing bar is the chart's own (`.bar.active`).
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(view.locator('.neck-chart .bar.active')).toHaveCount(1);
    const first = await view.locator('.neck-chart .bar.active .bar-number').textContent();
    await expect
        .poll(() => view.locator('.neck-chart .bar.active .bar-number').textContent(), {
            timeout: 20_000,
        })
        .not.toBe(first);
});
