import type { Page } from '@playwright/test';
import {
    expect,
    openSectionMenu,
    openSectionNames,
    seedStarters,
    songLink,
    test,
    typeBar,
} from './fixtures';

/**
 * #1733 — a press that leaves an open bar (or commits a typed field) lands where it was pressed.
 *
 * Leaving a bar applies it, and an applied change can re-lay the page out: on a CI WebKit the
 * header's status line ("Unsaved changes · locally recovered") took a second line and moved Play
 * 22px down. When that happened between the press's down and its up, the up landed off the
 * button and the click never reached it: Play, pressed with a bar open, left the bar and did not
 * play. How far a change moves the page depends on the fonts, so these checks make it move the
 * same way on every machine: the page drops by 60px the moment the change shows (the bar's field
 * closes, or the status line changes). A press whose change waits for the press to land is
 * unaffected; one whose change lands on the way down misses.
 */
async function shiftOnChange(page: Page) {
    await page.evaluate(() => {
        const status = () => document.querySelector('.song-subtitle')?.textContent ?? '';
        const before = status();
        const field = document.querySelector('.bar-input');
        const observer = new MutationObserver(() => {
            if ((field && !field.isConnected) || status() !== before) {
                observer.disconnect();
                document.body.style.paddingTop = '60px';
            }
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    });
}

/** A mouse press on `name`'s button: down, then up at the same point, as a finger does. */
async function press(page: Page, name: string) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // The page has had every chance to change under the press before it lifts.
    await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 50))),
    );
    await page.mouse.up();
}

async function editBluePocket(page: Page) {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    // A laptop-wide stand on both projects: the bar's own field, the transport beside it.
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await typeBar(page, 1, 'Dm7 G7');
}

test('Play pressed with a bar open applies the bar and plays (#1733)', async ({ page }) => {
    await editBluePocket(page);
    await shiftOnChange(page);
    await press(page, 'Start playback');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Edit chart' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.locator('.bar-input')).toHaveCount(0);
    await expect(page.locator('.sheet .bar').first()).toContainText('Dm');
});

test('Save pressed with a bar open saves the bar (#1733)', async ({ page }) => {
    await editBluePocket(page);
    await shiftOnChange(page);
    await press(page, 'Save');
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    await expect(page.locator('.bar-input')).toHaveCount(0);
    await expect(page.locator('.sheet .bar').first()).toContainText('Dm');
});

test('Neck pressed with a bar open applies the bar and shows the neck (#1733)', async ({
    page,
}) => {
    await editBluePocket(page);
    await shiftOnChange(page);
    await press(page, 'Neck');
    await expect(page.getByRole('button', { name: 'Neck', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved changes');
});

test('Play pressed with a tempo typed takes the tempo and plays (#1733)', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.getByLabel('Tempo', { exact: true }).fill('132');
    await shiftOnChange(page);
    await press(page, 'Start playback');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Edit chart' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('132');
});

test('Band… pressed with a bar open applies the bar and opens the band (#1733)', async ({
    page,
}) => {
    await editBluePocket(page);
    await shiftOnChange(page);
    await press(page, 'Band…');
    await expect(page.getByRole('dialog', { name: 'Band' })).toBeVisible();
    await expect(page.locator('.sheet .bar').first()).toContainText('Dm');
});

test('Play pressed with the bar menu open applies the bar and plays (#1733)', async ({ page }) => {
    await editBluePocket(page);
    await page
        .locator('.sheet .bar')
        .first()
        .getByRole('button', { name: 'Bar menu', exact: true })
        .click();
    await expect(page.getByRole('dialog', { name: 'Bar 1 menu' })).toBeVisible();
    await shiftOnChange(page);
    await press(page, 'Start playback');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Edit chart' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.locator('.sheet .bar').first()).toContainText('Dm');
});

test('Play pressed with a section name typed renames it and plays (#1733)', async ({ page }) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await page.setViewportSize({ width: 820, height: 1180 });
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name', { exact: true }).fill('Head');
    await shiftOnChange(page);
    await press(page, 'Start playback');
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Edit chart' })).toHaveAttribute(
        'aria-pressed',
        'false',
    );
    await expect(page.getByRole('button', { name: 'Section Head', exact: true })).toBeAttached();
});
