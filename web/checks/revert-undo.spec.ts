import {
    appUrl,
    expect,
    pickSongKey,
    seedStarters,
    songLink,
    songMenu,
    songMenuAction,
    test,
} from './fixtures';

/**
 * #1981 — the home page's Continue card says when the song it shows has unsaved changes, and
 * both reverts (to saved, to original) offer the delete toast's Undo, which puts the reverted
 * draft back exactly.
 */

const firstChord = (page: import('@playwright/test').Page) =>
    page.locator('.bar').first().locator('.chord');
const undoToast = (page: import('@playwright/test').Page) => page.getByTestId('stand-undo');
const undoButton = (page: import('@playwright/test').Page) =>
    undoToast(page).getByRole('button', { name: 'Undo', exact: true });

test('Continue is tagged while the song has unsaved changes; Revert to saved offers Undo', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Minor swing sketch', 'Jazz').click();
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    const card = page.getByTestId('continue-card');
    await expect(card).toBeVisible();
    await expect(page.getByTestId('continue-unsaved')).toHaveCount(0);

    await card.getByRole('button', { name: 'Open chart' }).click();
    const before = await firstChord(page).allTextContents();
    await pickSongKey(page, 'D');
    const changed = await firstChord(page).allTextContents();
    expect(changed).not.toEqual(before);

    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('continue-unsaved')).toHaveText('Unsaved changes');
    await page.getByTestId('continue-card').getByRole('button', { name: 'Open chart' }).click();

    // Revert to saved sits below the save rows, and Undo brings the draft back.
    await songMenuAction(page, 'More');
    await songMenu(page, 'more').getByRole('menuitem', { name: 'Revert to saved' }).click();
    await expect(firstChord(page)).toHaveText(before);
    await expect(undoToast(page)).toContainText('Reverted to saved');
    await undoButton(page).click();
    await expect(firstChord(page)).toHaveText(changed);
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved changes');

    // Reverted for good, the tag goes.
    await songMenuAction(page, 'More');
    await songMenu(page, 'more').getByRole('menuitem', { name: 'Revert to saved' }).click();
    await expect(firstChord(page)).toHaveText(before);
    await page.getByRole('button', { name: 'Back to songbook' }).click();
    await expect(page.getByTestId('continue-unsaved')).toHaveCount(0);
});

test('Revert to original offers the same Undo', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    await pickSongKey(page, 'D');
    await expect(firstChord(page)).toHaveText(['D7']);

    await songMenuAction(page, 'More');
    await songMenu(page, 'more').getByRole('menuitem', { name: 'Revert to original' }).click();
    await expect(firstChord(page)).toHaveText(['C7']);
    await expect(undoToast(page)).toContainText('Reverted to original');
    await undoButton(page).click();
    await expect(firstChord(page)).toHaveText(['D7']);
    await expect(page.locator('.song-subtitle')).toContainText('Changed · Keep a copy');
});
