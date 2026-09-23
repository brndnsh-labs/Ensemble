import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * Removing a bar or a section from the bar editor (#1373). The rules — context hand-off and the
 * refusals — are pinned in `lib/documents.test.ts`; this proves the buttons reach them and that a
 * shortened chart still plays.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

test('removing bar 2 of a new song leaves three bars, and it plays', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('G');

    await page.getByRole('button', { name: '− Bar', exact: true }).click();

    await expect(page.locator('.chord')).toHaveText(['C', 'Am', 'F']);
    // The bar before the removed one is selected.
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await expect(alert(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(alert(page)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('removing the only section is refused with a message and changes nothing', async ({
    page,
}) => {
    await newSong(page);

    await page.getByRole('button', { name: '− Section', exact: true }).click();

    await expect(alert(page)).toContainText(
        'A chart needs at least one section. Change its bars instead.',
    );
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
});

test('a removed section goes with its bars', async ({ page }) => {
    await newSong(page);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F', 'C']);

    await page.getByRole('button', { name: '− Section', exact: true }).click();

    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('F');
    await expect(alert(page)).toHaveCount(0);
});
