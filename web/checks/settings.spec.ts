import type { Page } from '@playwright/test';
import { expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1783 — the Settings sheet: one gear on the songbook and on a chart, and Appearance's
 * System / Day / Stage. System is the way back to the OS theme, which the header's Stage toggle
 * (always an explicit Day or Stage) cannot give.
 */
const THEME_KEY = 'ensemble-v2-preview:theme';

const dataTheme = (page: Page) =>
    page.evaluate(() => document.documentElement.dataset.theme ?? null);
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), THEME_KEY);
const paper = (page: Page) =>
    page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
/** Rough darkness of `rgb(r, g, b)`: 0 black, 255 white. */
const lightness = (color: string) => {
    const [r, g, b] = color.match(/\d+/g)!.map(Number);
    return (r + g + b) / 3;
};

async function openSettings(page: Page) {
    const gear = page.getByRole('button', { name: 'Settings', exact: true });
    await expect(gear).toHaveAttribute('aria-expanded', 'false');
    await gear.click();
    const sheet = page.getByRole('dialog', { name: 'Settings' });
    await expect(sheet).toBeVisible();
    await expect(gear).toHaveAttribute('aria-expanded', 'true');
    return sheet;
}

test('the gear opens Settings from the songbook and from a chart', async ({ page }) => {
    await seedStarters(page);
    let sheet = await openSettings(page);
    await expect(sheet.getByRole('radio', { name: /^System/ })).toBeChecked();
    await sheet.getByRole('button', { name: 'Close settings' }).click();
    await expect(sheet).toBeHidden();

    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    sheet = await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
});

test('System hands the theme back to the OS, live and across a reload; the header toggle agrees', async ({
    page,
}) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');
    const toggle = page.getByRole('button', { name: 'Stage', exact: true });

    // Stage from the sheet: the header toggle reads pressed, the choice is stored.
    let sheet = await openSettings(page);
    await sheet.getByRole('radio', { name: /^Stage/ }).check();
    await expect(sheet.getByRole('radio', { name: /^Stage/ })).toBeChecked();
    expect(await dataTheme(page)).toBe('stage');
    expect(await stored(page)).toBe('stage');
    await sheet.getByRole('button', { name: 'Close settings' }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // The header toggle sets an explicit Day; the sheet follows it.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    sheet = await openSettings(page);
    await expect(sheet.getByRole('radio', { name: /^Day/ })).toBeChecked();

    // System: the stored key and data-theme go, and the OS drives the paper, live.
    await sheet.getByRole('radio', { name: /^System/ }).check();
    expect(await dataTheme(page)).toBeNull();
    expect(await stored(page)).toBeNull();
    expect(lightness(await paper(page))).toBeGreaterThan(200);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(async () => lightness(await paper(page))).toBeLessThan(40);
    expect(await dataTheme(page)).toBeNull();
    await sheet.getByRole('button', { name: 'Close settings' }).click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // A reload keeps System, with no data-theme and the OS's paper.
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    expect(await dataTheme(page)).toBeNull();
    expect(await stored(page)).toBeNull();
    expect(lightness(await paper(page))).toBeLessThan(40);
    sheet = await openSettings(page);
    await expect(sheet.getByRole('radio', { name: /^System/ })).toBeChecked();
});
