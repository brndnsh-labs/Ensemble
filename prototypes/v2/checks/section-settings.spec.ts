import type { Page } from '@playwright/test';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * One section settings surface (#1374). The rules — bounds, overrides, the section meter re-fit —
 * are pinned in `lib/documents.test.ts` and `lib/song-meter.test.ts`; this proves the Edit panel
 * reaches them and that the stand shows the result.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

test('a new section can be named, repeated and put in 6/8, and it plays', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();

    await page.getByText('Section settings · B').click();
    await page.getByLabel('Section name').fill('Bridge');
    await page.getByLabel('Section name').press('Enter');
    await expect(page.getByText('Section settings · Bridge')).toBeVisible();
    await page.getByLabel('Section plays').fill('2');
    await page.getByLabel('Section plays').press('Enter');
    await page.getByLabel('Section meter').selectOption('6/8');

    const bridge = page.getByRole('button', { name: 'Section Bridge · hold to practice-loop' });
    await expect(bridge).toBeVisible();
    await expect(page.locator('.section-repeat')).toHaveText('Section ×2');
    // The section's first bar carries its meter mark; the song itself is still in 4/4.
    await expect(page.locator('.bar-context').last()).toContainText('6/8');
    await expect(page.locator('.song-subtitle')).toContainText('4/4');
    await expect(page.getByLabel('Section meter')).toHaveValue('6/8');
    await expect(alert(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(alert(page)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('an empty section name is refused and the old name comes back', async ({ page }) => {
    await newSong(page);
    await page.getByText('Section settings · A').click();

    await page.getByLabel('Section name').fill('   ');
    await page.getByLabel('Section name').press('Enter');

    await expect(alert(page)).toContainText('A section name needs 1 to 24 characters');
    await expect(page.getByLabel('Section name')).toHaveValue('A');
});
