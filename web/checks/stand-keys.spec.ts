import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

/**
 * Keys on the stand (UI audit): Space plays and stops, PageDown/PageUp turn a section — what a
 * page-turn pedal sends. Never while typing or with a sheet open.
 */

async function openStandard(page: Page, title: string) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    await page
        .locator('.standards-table .song-row', { hasText: title })
        .getByRole('button', { name: 'Open' })
        .click();
    await expect(page.locator('.chart-scroll[data-fit]')).toBeVisible();
}

test('Space plays and stops, but not while typing or with a sheet open', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await openStandard(page, 'Autumn Leaves');
    // Focus somewhere neutral on the stand: the chart itself.
    await page.getByLabel('Chord chart').focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();

    // Typing a tempo: the space is the field's.
    await page.getByLabel('Tempo').focus();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();

    // A sheet open over the stand: the space is the sheet's.
    await page.getByRole('button', { name: 'Band…' }).click();
    await expect(page.getByRole('dialog', { name: 'Band' })).toBeVisible();
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();
});

test('PageDown and PageUp step a scrolling chart a section at a time', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard or pedal');
    await openStandard(page, 'Cherokee');
    await expect(page.locator('.chart-scroll[data-fits="false"]')).toBeVisible();
    const sectionTop = (index: number) =>
        page.evaluate((i) => {
            const box = document.querySelector('.chart-scroll')!.getBoundingClientRect();
            return Math.round(
                document.querySelectorAll('.section')[i].getBoundingClientRect().top - box.top,
            );
        }, index);

    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('PageDown');
    await expect.poll(() => sectionTop(1)).toBeLessThan(40);
    await page.keyboard.press('PageDown');
    await expect.poll(() => sectionTop(2)).toBeLessThan(40);
    await page.keyboard.press('PageUp');
    await expect.poll(() => sectionTop(1)).toBeLessThan(40);
    await expect.poll(() => sectionTop(1)).toBeGreaterThan(-10);
});

test('Space after a mouse click on a mute chip plays; after the keyboard it toggles the chip', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await openStandard(page, 'Autumn Leaves');
    const chip = page.getByLabel('Band instruments').getByRole('button').first();
    const before = (await chip.getAttribute('aria-pressed')) as string;
    const after = before === 'true' ? 'false' : 'true';

    // Pointer-focused: Space starts the band and the chip keeps its state.
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', after);
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await expect(chip).toHaveAttribute('aria-pressed', after);
    await page.keyboard.press(' ');
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();

    // Keyboard-focused (Tab away and back): Space is the chip's own.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(chip).toBeFocused();
    await page.keyboard.press(' ');
    await expect(chip).toHaveAttribute('aria-pressed', before);
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();
});
