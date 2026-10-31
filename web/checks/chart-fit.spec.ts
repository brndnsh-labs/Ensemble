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

test('a 32–36 bar standard fits on one page, four bars to a row', async ({ page }, testInfo) => {
    // A phone holds All The Things You Are only at the floor, so whether it fits there turns on
    // the serif the browser has (CI's Linux WebKit has no Georgia and sets wider): the phone is
    // held to a 32-bar tune, the laptop to the 36.
    await openStandard(
        page,
        testInfo.project.name === 'laptop' ? 'All The Things You Are' : 'Autumn Leaves',
    );
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
    // Measured inside the chart's box, so only the chart's own layout counts.
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
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(page.locator('.chart-bottom')).toBeVisible();
    expect((await layout(page)).step).toBe(large.step);
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

test('a chart that scrolls shows the next time through and where it is in the form (#1713)', async ({
    page,
}, testInfo) => {
    await openStandard(page, 'Cherokee');
    await expect(page.locator('.chart-scroll[data-fits="false"]')).toBeVisible();
    // The form's first line again after its last: faded, and never a bar.
    const ghost = page.locator('.next-chorus');
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('.sheet .bar')).toHaveCount(64);
    await expect(page.locator('.chart-bottom')).toContainText('64 bars');

    const strip = page.getByRole('navigation', { name: 'Form' });
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('button')).toHaveCount(4);
    // A segment takes the chart to its section.
    const last = page.locator('.section').last();
    await strip.getByRole('button', { name: 'Go to section A3' }).click();
    await expect(last).toBeInViewport();
    await strip.getByRole('button', { name: 'Go to section A', exact: true }).click();
    await expect(page.locator('.section').first()).toBeInViewport();
    await expect(last).not.toBeInViewport();

    if (testInfo.project.name === 'laptop') {
        // The band's place in the form.
        await expect(page.locator('.form-strip-band')).toHaveCount(0);
        await page.getByRole('button', { name: 'Start playback' }).click();
        await expect(page.locator('.form-strip-band')).toHaveCount(1);
        await page.getByRole('button', { name: 'Stop playback' }).click();
    }

    // Editing has neither.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await expect(ghost).toBeHidden();
    await expect(strip).toBeHidden();
});

test('a chart that fits shows neither the next-chorus line nor the strip', async ({ page }) => {
    await openStandard(page, 'Autumn Leaves');
    await expect(page.locator('.chart-scroll[data-fits="true"]')).toBeVisible();
    await expect(page.locator('.next-chorus')).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Form' })).toBeHidden();
    // Never leaves Gm · 4/4, so it says so once, at bar 1, not at every section (UI audit).
    await expect(page.locator('.bar-context')).toHaveCount(1);
    await expect(page.locator('.bar').first().locator('.bar-context')).toHaveText('Gm · 4/4');
});
