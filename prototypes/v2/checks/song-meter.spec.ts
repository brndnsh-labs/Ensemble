import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * The song's own meter (#1371). The bar editor's "Meter from this bar" is a different control: it
 * writes an override that ends with its section, and it is refused on a fresh song because the
 * other bars still hold four beats. This one writes `score.meter` and re-fits the bars with it.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

test('a new song can be put in 3/4, and it plays', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    // An unchecked bar edit is committed with the change, not left beside it.
    await page.getByLabel('Chords in this bar').fill('C Dm');

    await page.getByLabel('Song meter').selectOption('3/4');

    await expect(page.locator('.song-subtitle')).toContainText('3/4');
    await expect(page.getByLabel('Song meter')).toHaveValue('3/4');
    await expect(page.locator('.measure-editor-context')).toHaveText('C major · 3/4');
    await expect(page.locator('.measure-editor-lengths legend')).toContainText('3 beats per bar');
    await expect(page.locator('.chord')).toHaveText(['C', 'Dm', 'G', 'Am', 'F']);
    await expect(alert(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(alert(page)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('a bar whose written lengths cannot follow blocks the change and is named', async ({
    page,
}) => {
    await newSong(page);
    await page.getByLabel('Chords in this bar').fill('C Dm G7');
    await page.getByLabel('Length of chord 1 (C)', { exact: true }).selectOption('2');
    await page.getByLabel('Length of chord 2 (Dm)', { exact: true }).selectOption('1');
    await page.getByLabel('Length of chord 3 (G7)', { exact: true }).selectOption('1');
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();

    await page.getByLabel('Song meter').selectOption('3/4');

    await expect(alert(page)).toContainText('A · bar 1');
    await expect(alert(page)).toContainText('Nothing was changed');
    await expect(page.getByLabel('Song meter')).toHaveValue('4/4');
    await expect(page.locator('.song-subtitle')).toContainText('4/4');
    // The bar that needs the decision is the one now open in the editor.
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C:2 Dm:1 G7:1');
});
