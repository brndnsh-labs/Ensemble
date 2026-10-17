import {
    appUrl,
    barField,
    closeKeyPopover,
    expect,
    leaveBar,
    openKeyPopover,
    test,
} from './fixtures';

/**
 * #1700 — while editing a measure chart, the chart shows which bar the editor holds, and a tap
 * anywhere on a bar (not on its chord, which still auditions) picks that bar for the editor. Since
 * #1726 the editor is the bar's own field (a laptop) or the dock (a phone), not a side panel.
 */
test('editing rings the bar the editor holds, and a tap on a bar picks it', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();

    const bars = page.locator('.bar');
    await expect(page.locator('.bar.selected')).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.locator('.bar.selected')).toHaveCount(1);
    // Entering Edit opens no bar for typing, though the selected one is ringed.
    await expect(page.locator('.bar.typing')).toHaveCount(0);
    await expect(page.getByLabel(/^Chords in bar \d+$/)).toHaveCount(0);

    // The bar number's corner, away from the chord button.
    await bars.nth(4).click({ position: { x: 6, y: 6 } });
    await expect(bars.nth(4)).toHaveClass(/\bselected\b/);
    await expect(page.locator('.bar.selected')).toHaveCount(1);
    await expect(barField(page, 5)).toBeFocused();
    await bars.nth(6).click({ position: { x: 6, y: 6 } });
    await expect(bars.nth(6)).toHaveClass(/\bselected\b/);
    await expect(page.locator('.bar.selected')).toHaveCount(1);
    await expect(barField(page, 7)).toBeFocused();
    await expect(barField(page, 5)).toHaveCount(0);

    // Leaving the editor drops the ring.
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.bar.selected')).toHaveCount(0);
});

/** Whether `locator` is wholly inside the window — not merely scrolled-to inside its pane. */
async function onScreen(locator: import('@playwright/test').Locator) {
    return locator.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= window.innerHeight && box.height > 0;
    });
}

test('the bar being edited and its editor are on screen together, wherever the bar is (#1705)', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const bars = page.locator('.bar');
    const count = await bars.count();

    // The last bar, pressed: its field (in the bar, or the phone's dock) opens, and the chart
    // keeps the bar in view beside it.
    const last = bars.last();
    await last.click({ position: { x: 6, y: 6 } });
    const editor = barField(page, count);
    await expect(editor).toBeFocused();
    await expect(last).toHaveClass(/\bselected\b/);
    await expect.poll(() => onScreen(last)).toBe(true);
    await expect.poll(() => onScreen(editor)).toBe(true);

    // A tap on another bar retargets the editor, and the bar and its field stay on screen.
    const other = bars.nth(count - 3);
    await other.click({ position: { x: 6, y: 6 } });
    await expect(other).toHaveClass(/\bselected\b/);
    await expect(barField(page, count - 2)).toBeFocused();
    await expect.poll(() => onScreen(other)).toBe(true);
    await expect.poll(() => onScreen(barField(page, count - 2))).toBe(true);
    await leaveBar(page);
    await expect(other).toHaveClass(/\bselected\b/);

    // The whole-song settings are the transport's Key popover (#1757).
    await expect(page.getByLabel('Meter', { exact: true })).toBeHidden();
    await openKeyPopover(page);
    await expect(page.getByLabel('Meter', { exact: true })).toBeVisible();
    await closeKeyPopover(page);
    await expect(page.getByLabel('Meter', { exact: true })).toBeHidden();
});
