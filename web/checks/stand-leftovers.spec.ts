import type { Page } from '@playwright/test';
import {
    expect,
    measureSong,
    openBand,
    openKeyPopover,
    openSectionMenu,
    openSongMenu,
    seedGuestDocuments,
    seedStarters,
    songLink,
    songMenuAction,
    starterDocuments,
    test,
} from './fixtures';

/**
 * The stand leftovers (#2069): the Resume pill after a refit (#1986), the count-in scroll (#1991),
 * Ctrl/⌘+S inside the menus and the tempo field (#1984), Forward onto a shared link (#1979) and
 * focus when playback ends under an open Song menu (#1993).
 */

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

function longChart(bpm = 110) {
    return measureSong(
        [
            'long-chart',
            'Long chart',
            'Jazz',
            'C',
            Array.from({ length: 64 }, (_, i) => ['Cmaj7', 'Am7', 'Dm7', 'G7'][i % 4]).join(' | '),
            bpm,
        ],
        new Date(Date.now() - 60_000).toISOString(),
    );
}

test('Resume follow appears when a resize pushes the playing row out of view (#1986)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a resize of the window');
    await page.setViewportSize({ width: 1100, height: 900 });
    await seedGuestDocuments(page, [...starterDocuments(), longChart(40)]);
    await songLink(page, 'Long chart').click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    const scroller = page.locator('.chart-scroll');
    await scroller.press('PageDown');
    const pill = page.getByTestId('resume-follow');
    await expect(pill).toBeVisible();
    // Scrolled back to the top the playing row (bar 1) is in view, so no pill: a scroll event,
    // which the hook always measured.
    await scroller.evaluate((el) => {
        el.scrollTop = 0;
    });
    await expect(pill).toHaveCount(0);
    // The scroller shrinks under the row (a rotate, a refit, the on-screen keyboard): its bottom
    // edge moves up over the playing row. Nothing scrolls, so only a resize can say so, and at
    // 40 BPM a bar lasts six seconds, far longer than this waits for the next chord to measure it.
    await scroller.evaluate((el) => {
        el.style.flex = '0 0 auto';
        el.style.height = '80px';
        el.style.paddingBottom = '0';
        el.style.maxHeight = '80px';
        el.style.minHeight = '0';
    });
    await expect(pill).toBeVisible({ timeout: 1000 });
});

test('Play on a scrolled chart brings the start bar into view for the count-in (#1991)', async ({
    page,
}) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await seedGuestDocuments(page, [...starterDocuments(), longChart()]);
    await songLink(page, 'Long chart').click();
    await openBand(page, 'Practice');
    await page.getByLabel('Count-in', { exact: true }).check();
    await page.getByRole('button', { name: 'Close band' }).click();
    const scroller = page.locator('.chart-scroll');
    await scroller.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    expect(await scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
    await page.locator('[data-play-toggle]').click();
    const countdown = page.locator('.bar-countin');
    await expect(countdown).toBeVisible();
    await expect(countdown).toBeInViewport({ ratio: 0.9 });
});

test.describe('Ctrl/⌘+S inside a menu saves (#1984, #2069)', () => {
    test.beforeEach(async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
        await seedStarters(page);
        await songLink(page, 'Blue pocket').first().click();
        await page.getByRole('button', { name: 'Faster' }).click();
        await expect(save(page)).toBeEnabled();
    });

    test('in the Song menu', async ({ page }) => {
        const menu = await openSongMenu(page);
        await expect(menu.locator(':focus')).toHaveCount(1);
        await page.keyboard.press('Control+s');
        await expect(save(page)).toBeDisabled();
    });

    test('in the Key popover', async ({ page }) => {
        const popover = await openKeyPopover(page);
        await popover.getByLabel('Key', { exact: true }).focus();
        await page.keyboard.press('Control+s');
        await expect(save(page)).toBeDisabled();
    });

    test('in the section menu', async ({ page }) => {
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        const menu = await openSectionMenu(page, 'A');
        await menu.getByRole('button', { name: 'Start here' }).focus();
        await page.keyboard.press('Control+s');
        await expect(save(page)).toBeDisabled();
    });
});

test('the tempo field clamps what was typed before it steps, and is a spinbutton (#1984)', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    const tempo = page.getByRole('spinbutton', { name: 'Tempo' });
    await expect(tempo).toHaveAttribute('aria-valuemin', '40');
    await expect(tempo).toHaveAttribute('aria-valuemax', '320');
    await tempo.fill('1');
    await tempo.press('ArrowUp');
    await expect(tempo).toHaveValue('41');
    await expect(tempo).toHaveAttribute('aria-valuenow', '41');
    await tempo.fill('999');
    await tempo.press('ArrowDown');
    await expect(tempo).toHaveValue('319');
});

test('Forward onto a shared link lands the changes it was left with (#1979)', async ({ page }) => {
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await songMenuAction(page, 'Copy link');
    const link = await page.getByTestId('share-link-fallback').inputValue();
    await page.goto('about:blank');
    await page.goto(link);
    await expect(page.locator('.song-subtitle')).toContainText('Opened from a shared link');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await page.getByRole('button', { name: 'Faster' }).click();
    const changed = await tempo.inputValue();
    // Back leaves at once (the change is kept on this device)…
    await page.goBack();
    await expect(page.locator('main.home').first()).toBeVisible();
    // …and Forward lands it again, marked.
    await page.goForward();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    await expect(tempo).toHaveValue(changed);
    await expect(page.locator('.song-subtitle')).toContainText('Changed');
});

test('focus stays in the Song menu when playback ends under it (#1993)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-phone', 'the fold is a phone layout');
    test.setTimeout(60_000);
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    const menu = await openSongMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Settings…' })).toBeVisible();
    // The band stops by itself (a counted chart's last bar does the same): a click that moves no
    // focus, with the menu left open.
    await page.evaluate(() => document.querySelector<HTMLElement>('[data-play-toggle]')?.click());
    await expect(menu.getByRole('menuitem', { name: 'Settings…' })).toHaveCount(0);
    await expect(menu).toBeVisible();
    await expect(menu.locator(':focus')).toHaveCount(1);
});
