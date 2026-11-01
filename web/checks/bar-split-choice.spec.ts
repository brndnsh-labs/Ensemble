import type { Locator, Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

/**
 * #1980 — chords typed in a bar with no lengths that do not divide it onto the grid (three in
 * 4/4 would be triplets) wait for the musician to choose 2+1+1, 1+2+1 or 1+1+2. Nothing is
 * applied until one is picked, or Enter takes the highlighted first. On a phone the choice sits
 * in the dock above the field. Explicit lengths bypass it.
 */

async function editAutumnLeaves(page: Page, tap: boolean) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: 'Autumn Leaves' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: 'Autumn Leaves', exact: true })).toBeVisible();
    const edit = page.getByRole('button', { name: 'Edit chart', exact: true });
    await (tap ? edit.tap() : edit.click());
}

function field(page: Page, bar: number): Locator {
    return page.getByLabel(`Chords in bar ${bar}`, { exact: true });
}

function choices(page: Page): Locator {
    return page.getByRole('radiogroup', { name: 'Split the bar' });
}

test('three chords in 4/4 wait for a split; arrows move, Enter applies (#1980)', async ({
    page,
    isMobile,
}) => {
    test.skip(isMobile, 'the laptop field; the phone dock is next');
    await editAutumnLeaves(page, false);
    const bars = page.locator('.bar');
    await bars.nth(5).click();
    await field(page, 6).fill('Gm7 C7 F');

    const radios = choices(page).getByRole('radio');
    await expect(radios).toHaveText(['2+1+1', '1+2+1', '1+1+2']);
    await expect(radios.nth(0)).toHaveAttribute('aria-checked', 'true');
    // Nothing is applied, and the bar says it is waiting.
    await expect(bars.nth(5)).toHaveClass(/\bunreadable\b/);

    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(radios.nth(1)).toHaveAttribute('aria-checked', 'true');

    await page.keyboard.press('Enter');
    await expect(field(page, 6)).toHaveValue('Gm7:1 C7:2 F:1');
    await expect(choices(page)).toHaveCount(0);
    await expect(bars.nth(5)).not.toHaveClass(/\bunreadable\b/);

    // The next Enter leaves the bar with its three chords applied.
    await page.keyboard.press('Enter');
    await expect(bars.nth(5).locator('.chord')).toHaveText(['Gm7', 'C7', 'F']);
});

test('Enter on the first choice applies 2+1+1, and a click picks another (#1980)', async ({
    page,
    isMobile,
}) => {
    test.skip(isMobile, 'the laptop field');
    await editAutumnLeaves(page, false);
    const bars = page.locator('.bar');
    await bars.nth(5).click();
    await field(page, 6).fill('Gm7 C7 F');
    await page.keyboard.press('Enter');
    await expect(field(page, 6)).toHaveValue('Gm7:2 C7:1 F:1');

    await field(page, 6).fill('Gm7 C7 F');
    await choices(page).getByRole('radio', { name: '1+1+2' }).click();
    await expect(field(page, 6)).toHaveValue('Gm7:1 C7:1 F:2');
    await expect(field(page, 6)).toBeFocused();
});

test('leaving the bar without choosing keeps it pending, and explicit lengths skip the choice (#1980)', async ({
    page,
    isMobile,
}) => {
    test.skip(isMobile, 'the laptop field');
    await editAutumnLeaves(page, false);
    const bars = page.locator('.bar');
    await bars.nth(5).click();
    await field(page, 6).fill('Gm7 C7 F');
    await page.keyboard.press('Tab');
    await expect(bars.nth(5)).toHaveClass(/\bunreadable\b/);
    await expect(bars.nth(5).locator('.bar-problem')).toContainText('Choose how the 3 chords');

    // Lengths written by hand never ask.
    await bars.nth(5).click();
    await field(page, 6).fill('Gm7:2 C7:1 F:1');
    await expect(choices(page)).toHaveCount(0);
    // Two chords divide the bar evenly: no choice either.
    await field(page, 6).fill('Gm7 C7');
    await expect(choices(page)).toHaveCount(0);
    await page.keyboard.press('Tab');
    await expect(bars.nth(5)).not.toHaveClass(/\bunreadable\b/);
});

test('on a phone the choice sits in the dock (#1980)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the phone dock');
    await editAutumnLeaves(page, true);
    const bars = page.locator('.bar');
    await bars.nth(5).tap();
    await field(page, 6).fill('Gm7 C7 F');

    const dock = page.locator('.bar-dock');
    const group = dock.getByRole('radiogroup', { name: 'Split the bar' });
    await expect(group.getByRole('radio')).toHaveText(['2+1+1', '1+2+1', '1+1+2']);
    expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await group.getByRole('radio', { name: '1+2+1' }).tap();
    await expect(field(page, 6)).toHaveValue('Gm7:1 C7:2 F:1');
    await expect(field(page, 6)).toBeFocused();
    await expect(group).toHaveCount(0);
    await dock.getByRole('button', { name: 'Done', exact: true }).tap();
    await expect(bars.nth(5).locator('.chord')).toHaveText(['Gm7', 'C7', 'F']);
});
