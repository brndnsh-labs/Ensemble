import type { Page } from '@playwright/test';
import { expect, measureSong, seedGuestDocuments, songLink, test } from './fixtures';

/**
 * #1993 — on a phone, while the band plays, the header's second row (Settings, Stage, the mode
 * switch, Save) folds into the Song menu so the controls leave the chart its height. Laptop and
 * tablet keep the row (#1969). Geometry, not clicks: a folded button must be out of the layout, and
 * every one of them must still be reachable from the •••.
 */
const SONG = measureSong(['fold-song', 'Fold song', 'Rock', 'C', 'C|G|Am|F', 90]);

/** The header and transport's share of the window's height, and the row's visible state. */
async function controls(page: Page) {
    return page.evaluate(() => {
        const header = document.querySelector('.song-header')?.getBoundingClientRect();
        const transport = document.querySelector('.transport-bar')?.getBoundingClientRect();
        const height = window.innerHeight;
        const shown = (selector: string) => {
            const el = document.querySelector<HTMLElement>(selector);
            return !!el && el.getBoundingClientRect().height > 0;
        };
        return {
            share: ((header?.height ?? 0) + (transport?.height ?? 0)) / height,
            header: header?.height ?? 0,
            transport: transport?.height ?? 0,
            mode: shown('.mode-switch'),
            save: shown('.save-btn'),
            settings: shown('.song-actions .settings-btn'),
            theme: shown('.theme-toggle'),
            menu: shown('.menu-btn'),
        };
    });
}

async function open(page: Page) {
    await seedGuestDocuments(page, [SONG]);
    await songLink(page, 'Fold song').first().click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeVisible();
}

const play = (page: Page) =>
    page.getByRole('button', { name: 'Start playback', exact: true }).click();

test('a phone folds the header row while playing and unfolds on stop (#1993)', async ({
    page,
}, testInfo) => {
    test.setTimeout(60_000);
    await open(page);
    const phone = testInfo.project.name === 'webkit-phone';
    const stopped = await controls(page);
    expect(stopped).toMatchObject({ mode: true, save: true, settings: true, theme: true });
    await play(page);
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    const playing = await controls(page);
    const size = page.viewportSize();
    console.log(
        `fold ${testInfo.project.name} ${size?.width}x${size?.height}`,
        JSON.stringify({ stopped, playing }),
    );
    if (phone) {
        expect(playing).toMatchObject({
            mode: false,
            save: false,
            settings: false,
            theme: false,
            menu: true,
        });
        expect(playing.header).toBeLessThan(stopped.header);
        await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
        await expect.poll(async () => (await controls(page)).mode).toBe(true);
    } else {
        // Laptop and tablet: nothing changes.
        expect(playing).toMatchObject({ mode: true, save: true, settings: true, theme: true });
        expect(playing.header).toBeCloseTo(stopped.header, 0);
    }
});

test('what folded is in the Song menu, and it works (#1993)', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-phone', 'the fold is a phone layout');
    test.setTimeout(60_000);
    await open(page);
    await play(page);
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Song actions' }).click();
    const menu = page.getByRole('menu', { name: 'Song actions' });
    for (const name of ['Settings…', 'Band…', 'Switch to stage mode', 'Save']) {
        await expect(menu.getByRole('menuitem', { name, exact: true })).toBeVisible();
    }
    // The stand's modes are a radio group, the one showing checked.
    for (const name of ['Chart', 'Neck', 'Edit chart']) {
        await expect(menu.getByRole('menuitemradio', { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole('menuitemradio', { name: 'Chart', exact: true })).toBeChecked();
    // The ordinary actions are still there, after them.
    await expect(menu.getByRole('menuitem', { name: 'Copy link' })).toBeVisible();
    // A choice closes the menu, as every other row does.
    await menu.getByRole('menuitem', { name: 'Switch to stage mode', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stage');
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('menuitem', { name: 'Settings…', exact: true }).click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('dialog', { name: /settings/i })).toBeVisible();
});

test('stopped, the Song menu is the five actions only (#1993)', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Song actions' }).click();
    const menu = page.getByRole('menu', { name: 'Song actions' });
    await expect(menu.getByRole('menuitem', { name: 'Settings…' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem')).toHaveCount(5);
});

for (const [width, height, limit] of [
    [375, 667, 0.25],
    [390, 844, 0.25],
] as const) {
    test(`playing at ${width}x${height} the controls take at most ${limit * 100}% (#1993)`, async ({
        page,
    }, testInfo) => {
        test.skip(testInfo.project.name !== 'webkit-phone', 'the fold is a phone layout');
        test.setTimeout(60_000);
        await page.setViewportSize({ width, height });
        await open(page);
        const before = await controls(page);
        await play(page);
        await expect(
            page.getByRole('button', { name: 'Stop playback', exact: true }),
        ).toBeVisible();
        const after = await controls(page);
        console.log(`share ${width}x${height} before ${before.share} after ${after.share}`);
        expect(after.share).toBeLessThanOrEqual(limit);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            width,
        );
    });
}

test('landscape phone: mute chips are 12px and inside the screen (#1993)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-phone', 'the fold is a phone layout');
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page);
    const chips = await page.locator('.band-controls .band-toggle').evaluateAll((els) =>
        els.map((el) => ({
            size: Number.parseFloat(getComputedStyle(el).fontSize),
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
        })),
    );
    expect(chips.length).toBeGreaterThan(2);
    for (const chip of chips) {
        expect(chip.size).toBeGreaterThanOrEqual(12);
        expect(chip.left).toBeGreaterThanOrEqual(0);
        expect(chip.right).toBeLessThanOrEqual(844);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        844,
    );
});
