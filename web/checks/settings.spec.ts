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

/**
 * #1280 — Palette: five choices under Appearance, each a per-device token set on
 * `html[data-palette]` (none for Warm, the default), combined with Day/Stage.
 */
const PALETTE_KEY = 'ensemble-v2-preview:palette';
const dataPalette = (page: Page) =>
    page.evaluate(() => document.documentElement.dataset.palette ?? null);
const storedPalette = (page: Page) =>
    page.evaluate((key) => localStorage.getItem(key), PALETTE_KEY);

test('each palette repaints the page, combines with Day and Stage, and keeps across a reload with no flash', async ({
    page,
}) => {
    // Every `data-palette` value <html> holds from the moment <body> is parsed: the
    // pre-hydration script must have set it by then, and hydration must never take it away.
    await page.addInitScript(() => {
        const w = window as unknown as { __palettes: (string | null)[] };
        w.__palettes = [];
        // The script runs before <html> exists, so it watches the document for <body>.
        new MutationObserver((_, observer) => {
            if (!document.body) {
                return;
            }
            observer.disconnect();
            const html = document.documentElement;
            // Only changes: the app re-writing the value it already holds is no flash.
            const record = () => {
                const now = html.dataset.palette ?? null;
                if (w.__palettes.length === 0 || w.__palettes.at(-1) !== now) {
                    w.__palettes.push(now);
                }
            };
            record();
            new MutationObserver(record).observe(html, {
                attributes: true,
                attributeFilter: ['data-palette'],
            });
        }).observe(document, { childList: true, subtree: true });
    });
    await page.emulateMedia({ colorScheme: 'light' });
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.waitForSelector('.bar');

    const sheet = await openSettings(page);
    const choice = (name: string) => sheet.getByRole('radio', { name, exact: true });
    await expect(choice('Warm')).toBeChecked();
    expect(await dataPalette(page)).toBeNull();
    const warmDay = await paper(page);

    // Each palette sets its attribute and its own paper; Warm takes both away again.
    const dayPapers = new Set([warmDay]);
    for (const [name, id] of [
        ['Cool', 'cool'],
        ['High contrast', 'contrast'],
        ['Forest', 'forest'],
        ['Plum', 'plum'],
    ] as const) {
        await choice(name).check();
        await expect(choice(name)).toBeChecked();
        expect(await dataPalette(page)).toBe(id);
        expect(await storedPalette(page)).toBe(id);
        const day = await paper(page);
        expect(lightness(day)).toBeGreaterThan(200);
        dayPapers.add(day);
    }
    expect(dayPapers.size).toBe(5);
    await choice('Warm').check();
    expect(await dataPalette(page)).toBeNull();
    expect(await storedPalette(page)).toBeNull();
    expect(await paper(page)).toBe(warmDay);

    // Stage and a palette combine: Plum's Stage is dark and not Warm's Stage.
    await sheet.getByRole('radio', { name: /^Stage/ }).check();
    const warmStage = await paper(page);
    await choice('Plum').check();
    const plumStage = await paper(page);
    expect(lightness(plumStage)).toBeLessThan(40);
    expect(plumStage).not.toBe(warmStage);
    expect(await dataTheme(page)).toBe('stage');

    // A reload keeps both, and <html> carried Plum before the body was parsed and was never
    // dropped through hydration — read once the sheet shows the stored choice, so the app's
    // own effects have run.
    await page.reload();
    await expect(
        (await openSettings(page)).getByRole('radio', { name: 'Plum', exact: true }),
    ).toBeChecked();
    expect(
        await page.evaluate(() => (window as unknown as { __palettes: unknown }).__palettes),
    ).toEqual(['plum']);
    expect(await dataTheme(page)).toBe('stage');
    expect(await paper(page)).toBe(plumStage);

    // Storage is untrusted: anything but a palette id is Warm, with no attribute.
    await page.evaluate((key) => localStorage.setItem(key, 'constructor'), PALETTE_KEY);
    await page.reload();
    expect(await dataPalette(page)).toBeNull();
    await expect(
        (await openSettings(page)).getByRole('radio', { name: 'Warm', exact: true }),
    ).toBeChecked();
});
