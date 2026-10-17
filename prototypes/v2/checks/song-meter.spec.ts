import type { Page } from '@playwright/test';
import {
    appUrl,
    closeKeyPopover,
    editorRevealed,
    expect,
    leaveBar,
    openBar,
    openKeyPopover,
    test,
    typeBar,
} from './fixtures';

/**
 * The song's own meter (#1371). The bar menu's "Meter from this bar" is a different control: it
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
    await typeBar(page, 1, 'C Dm');

    const menu = await openKeyPopover(page);
    await menu.getByLabel('Meter', { exact: true }).selectOption('3/4');
    await expect(menu.getByLabel('Meter', { exact: true })).toHaveValue('3/4');
    await closeKeyPopover(page);

    await expect(page.locator('.song-subtitle')).toContainText('3/4');
    await expect(page.locator('.bar-context').first()).toHaveText('C · 3/4');
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
    await typeBar(page, 1, 'C:2 Dm:1 G7:1');
    await leaveBar(page);
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C', 'Dm', 'G7']);

    const menu = await openKeyPopover(page);
    await menu.getByLabel('Meter', { exact: true }).selectOption('3/4');

    // The refusal closes the Key popover itself and names the bar.
    await expect(menu).toHaveCount(0);
    await expect(alert(page)).toContainText('A · bar 1');
    await expect(alert(page)).toContainText('Nothing was changed');
    await expect(page.locator('.song-subtitle')).toContainText('4/4');
    await expect((await openKeyPopover(page)).getByLabel('Meter', { exact: true })).toHaveValue(
        '4/4',
    );
    await closeKeyPopover(page);
    // The bar that needs the decision is the one now selected; opening it shows its lengths.
    await expect(page.locator('.bar').first()).toHaveClass(/\bselected\b/);
    await expect(await openBar(page, 1)).toHaveValue('C:2 Dm:1 G7:1');
});
