import { appUrl, expect, test } from './fixtures';

/**
 * #1700 — while editing a measure chart, the chart shows which bar the editor holds, and a tap
 * anywhere on a bar (not on its chord, which still auditions) picks that bar for the editor.
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

    // The bar number's corner, away from the chord button.
    await bars.nth(4).click({ position: { x: 6, y: 6 } });
    await expect(bars.nth(4)).toHaveClass(/\bselected\b/);
    await expect(page.locator('.bar.selected')).toHaveCount(1);
    await expect(page.getByLabel('Bar to edit')).toHaveValue(/.+/);
    const picked = await page.getByLabel('Bar to edit').inputValue();
    await bars.nth(6).click({ position: { x: 6, y: 6 } });
    await expect(bars.nth(6)).toHaveClass(/\bselected\b/);
    expect(await page.getByLabel('Bar to edit').inputValue()).not.toBe(picked);

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
    const editor = page.getByLabel('Bar to edit');
    await expect(editor).toBeVisible();

    // The last bar, picked from the editor: the chart brings it into view beside the editor.
    const options = await editor.locator('option').count();
    await editor.selectOption({ index: options - 1 });
    const last = page.locator('.bar').last();
    await expect(last).toHaveClass(/\bselected\b/);
    await expect.poll(() => onScreen(last)).toBe(true);
    await expect.poll(() => onScreen(editor)).toBe(true);

    // A tap on another bar retargets the editor without closing it.
    const other = page.locator('.bar').nth(options - 3);
    await other.click({ position: { x: 6, y: 6 } });
    await expect(other).toHaveClass(/\bselected\b/);
    await expect.poll(() => onScreen(editor)).toBe(true);

    // The whole-song settings are folded away, one tap from open.
    await expect(page.getByLabel('Song meter')).toBeHidden();
    await page.getByText('Whole song', { exact: true }).click();
    await expect(page.getByLabel('Song meter')).toBeVisible();
});
