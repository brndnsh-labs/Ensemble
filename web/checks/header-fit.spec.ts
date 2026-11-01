import type { Page } from '@playwright/test';
import { appUrl, expect, seedStarters, songLink, test } from './fixtures';

/**
 * #1704 — the song header's action row stays ONE row, inside the screen, in both of its widths:
 * "Save" and the wider "Keep a copy" (a standard or a shared link). Measured, not clicked:
 * Playwright scrolls the page sideways to reach an off-screen button, so a click-only check
 * passed for months while ••• sat past the right edge on a phone.
 */
async function rowFits(page: Page) {
    return page.locator('.song-actions').evaluate((row) => {
        const bounds = row.getBoundingClientRect();
        const children = [...row.children].filter(
            (child) => (child as HTMLElement).offsetParent !== null,
        );
        const boxes = children.map((child) => child.getBoundingClientRect());
        return {
            oneRow: boxes.every((box) => Math.abs(box.top - boxes[0].top) < 2),
            inside: boxes.every(
                (box) => box.right <= Math.min(bounds.right, window.innerWidth) + 0.5,
            ),
            // A squeezed row shrinks its children rather than wrapping — the mode switch first —
            // so a child whose own content no longer fits is the overflow too.
            unclipped: children.every((child) => child.scrollWidth <= child.clientWidth + 1),
            noSideScroll: document.documentElement.scrollWidth <= window.innerWidth,
        };
    });
}

test('the header action row is one row inside the screen with Save showing', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    expect(await rowFits(page)).toEqual({
        oneRow: true,
        inside: true,
        unclipped: true,
        noSideScroll: true,
    });
});

test('the header action row is one row inside the screen with Keep a copy showing', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('button', { name: 'Keep a copy', exact: true })).toBeVisible();
    expect(await rowFits(page)).toEqual({
        oneRow: true,
        inside: true,
        unclipped: true,
        noSideScroll: true,
    });
});

/**
 * #1986 - at 400% zoom (320x256 CSS px, a landscape-short window) the transport wraps instead of
 * running past the edge, so every mute chip can be reached; the page never scrolls sideways.
 */
test('every mute chip is inside the screen at 320x256', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 256 });
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    const chips = page.locator('.band-controls .band-toggle');
    await expect(chips.first()).toBeVisible();
    expect(await chips.count()).toBeGreaterThan(2);
    const boxes = await chips.evaluateAll((els) =>
        els.map((el) => {
            const box = el.getBoundingClientRect();
            return { left: box.left, right: box.right };
        }),
    );
    for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(320.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});

test('what you play adds a chip that is inside the screen at 320x256 too (#1992)', async ({
    page,
}) => {
    // A B♭ horn: the instrument chip plus its own lane (the soloist) muted for it.
    await page.addInitScript(() => {
        localStorage.setItem('ensemble-v2-preview:player-instrument', 'horn-bb');
    });
    await page.setViewportSize({ width: 320, height: 256 });
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    await expect(page.getByRole('button', { name: /^You play: B♭ horn/ })).toBeVisible();
    const chips = page.locator('.band-controls .band-toggle');
    expect(await chips.count()).toBeGreaterThan(3);
    const boxes = await chips.evaluateAll((els) =>
        els.map((el) => {
            const box = el.getBoundingClientRect();
            return { left: box.left, right: box.right };
        }),
    );
    for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(320.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
});

test('a landscape phone keeps the transport on one row (#1986)', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket').first().click();
    for (const size of [
        { width: 844, height: 390 },
        { width: 740, height: 360 },
    ]) {
        await page.setViewportSize(size);
        const tops = await page
            .locator('.transport-bar > *')
            .evaluateAll((els) =>
                els
                    .filter((el) => (el as HTMLElement).offsetParent !== null)
                    .map((el) => Math.round(el.getBoundingClientRect().top)),
            );
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(12);
    }
});
