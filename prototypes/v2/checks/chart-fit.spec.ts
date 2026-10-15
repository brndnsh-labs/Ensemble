import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

/**
 * The stand as a page (#1712): a 32–36 bar chart reads on one screen, four bars to a row at
 * every width, its chords never under the 18px floor; a chart too long for that scrolls instead.
 */

async function openStandard(page: Page, title: string) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: title });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.locator('.chart-scroll[data-fit]')).toBeVisible();
}

function layout(page: Page) {
    return page.evaluate(() => {
        const box = document.querySelector<HTMLElement>('.chart-scroll')!;
        const bars = [...document.querySelectorAll<HTMLElement>('.bar')];
        const firstRow = bars.filter(
            (bar) => bar.getBoundingClientRect().top === bars[0].getBoundingClientRect().top,
        );
        const chordSizes = [
            ...document.querySelectorAll<HTMLElement>('.bar:not(.split) .chord'),
        ].map((chord) => parseFloat(getComputedStyle(chord).fontSize));
        const head = document.querySelector<HTMLElement>('.section-head')!.getBoundingClientRect();
        const firstBar = bars[0].getBoundingClientRect();
        return {
            step: Number(box.dataset.fit),
            fits: box.dataset.fits,
            page: box.dataset.page !== undefined,
            scrolls: box.scrollHeight > box.clientHeight + 1,
            perRow: firstRow.length,
            smallestChord: Math.min(...chordSizes),
            // The section letter sits beside its first row, not on a row of its own.
            letterBeside: head.right <= firstBar.left && head.top < firstBar.bottom,
        };
    });
}

test('a 36-bar standard fits on one page, four bars to a row', async ({ page }) => {
    await openStandard(page, 'All The Things You Are');
    const fitted = await layout(page);
    expect(fitted).toMatchObject({
        fits: 'true',
        page: true,
        scrolls: false,
        perRow: 4,
        letterBeside: true,
    });
    expect(fitted.smallestChord).toBeGreaterThanOrEqual(18);
});

test('a 64-bar form scrolls rather than shrinking past legibility', async ({ page }) => {
    await openStandard(page, 'Cherokee');
    const long = await layout(page);
    expect(long).toMatchObject({ fits: 'false', scrolls: true, perRow: 4 });
    expect(long.smallestChord).toBeGreaterThanOrEqual(18);
});

test('a bigger window takes a bigger step; playing never changes it', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'resizes a desktop window');
    await openStandard(page, 'Autumn Leaves');
    const small = await layout(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect.poll(async () => (await layout(page)).step).toBeLessThan(small.step);
    const large = await layout(page);
    expect(large).toMatchObject({ fits: 'true', scrolls: false });

    // The line under the chart hides while playing; its room is held, so nothing moves.
    // Measured inside the chart's box: playing shortens the header, which moves the box itself.
    const lastBar = () =>
        page.evaluate(() => {
            const box = document.querySelector('.chart-scroll')!.getBoundingClientRect();
            const bars = document.querySelectorAll('.bar');
            const bar = bars[bars.length - 1].getBoundingClientRect();
            return { top: bar.top - box.top, left: bar.left - box.left, height: bar.height };
        });
    const before = await lastBar();
    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.locator('.chart-bottom')).toBeHidden();
    expect((await layout(page)).step).toBe(large.step);
    expect(await lastBar()).toEqual(before);
    // Playing hides the controls, and the height that frees is never spent on a bigger step:
    // more height while playing (as the hidden controls give) keeps the step until it stops.
    await expect(page.locator('.app-shell.performance-focus')).toHaveCount(1);
    await page.setViewportSize({ width: 1920, height: 1600 });
    await page.evaluate(() => new Promise((done) => setTimeout(done, 200)));
    expect((await layout(page)).step).toBe(large.step);
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect.poll(async () => (await layout(page)).step).toBeLessThan(large.step);
});

test('editing leaves the page: section heads above their bars, still four to a row', async ({
    page,
}) => {
    await openStandard(page, 'Autumn Leaves');
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(page.locator('.chart-scroll[data-page]')).toHaveCount(0);
    const editing = await layout(page);
    expect(editing).toMatchObject({ fits: 'false', page: false, perRow: 4, letterBeside: false });
    expect(editing.smallestChord).toBeGreaterThanOrEqual(18);
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chart-scroll[data-page]')).toHaveCount(1);
});
