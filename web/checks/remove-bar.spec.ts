import type { Page } from '@playwright/test';
import {
    appUrl,
    barField,
    editorRevealed,
    expect,
    leaveBar,
    openBar,
    openSectionMenu,
    test,
} from './fixtures';

/**
 * Removing a bar or a section (#1373): the bar menu's Delete bar and the section letter's Delete
 * section (#1726). The rules — context hand-off and the refusals — are pinned in
 * `lib/documents.test.ts`; this proves the menus reach them and that a shortened chart still plays.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

/** The open bar's menu (#1725): ⋯ on the bar, or in the dock on a phone. */
async function openBarMenu(page: Page) {
    const trigger = page.getByRole('button', { name: 'Bar menu', exact: true });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: /^Bar \d+ menu$/ })).toBeVisible();
}

test('removing bar 2 of a new song leaves three bars, and it plays', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    await expect(await openBar(page, 2)).toHaveValue('G');

    await openBarMenu(page);
    await page.getByRole('button', { name: 'Delete bar', exact: true }).click();

    // The bar before the removed one opens for typing.
    await expect(barField(page, 1)).toHaveValue('C');
    await expect(page.locator('.bar')).toHaveCount(3);
    await leaveBar(page);
    await expect(page.locator('.chord')).toHaveText(['C', 'Am', 'F']);
    await expect(alert(page)).toHaveCount(0);
    // The new song is kept on its first change (#1707) before anything else is pressed.
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved changes');

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

    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Delete section', exact: true })
        .click();

    await expect(alert(page)).toContainText(
        'A chart needs at least one section. Change its bars instead.',
    );
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
});

test('a removed section goes with its bars', async ({ page }) => {
    await newSong(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    // The new section's one bar opens for typing, its tonic selected.
    await expect(barField(page, 5)).toHaveValue('C');
    await leaveBar(page);
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F', 'C']);

    await (await openSectionMenu(page, 'B'))
        .getByRole('button', { name: 'Delete section', exact: true })
        .click();

    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
    // The bar before the removed section is the one selected.
    await expect(page.locator('.bar').nth(3)).toHaveClass(/\bselected\b/);
    await expect(alert(page)).toHaveCount(0);
});
