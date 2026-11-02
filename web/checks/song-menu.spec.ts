import type { Page } from '@playwright/test';
import {
    appUrl,
    closeKeyPopover,
    expect,
    exportAs,
    exportDialog,
    openKeyPopover,
    openSongMenu,
    phoneWidth,
    seedGuestDocuments,
    seedStarters,
    songLink,
    songMenu,
    songMenuAction,
    starterDocuments,
    test,
} from './fixtures';

/**
 * The Song menu (•••, #1756): an anchored `<Menu>` of five actions — Copy link, Duplicate,
 * Export…, More, then Delete… after a divider — with no form fields and no help text. More swaps
 * in a second list; Export… is a small dialog of formats. `anchored-menu.spec.ts` drives the
 * `<Menu>` itself (placement, sheet, keys) through the row ⋯.
 */

const trigger = (page: Page) => page.getByRole('button', { name: 'Song actions', exact: true });

async function openBlue(page: Page) {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    await expect(trigger(page)).toBeEnabled();
}

test('the ••• opens five actions, Delete… last after a divider, and no fields or help', async ({
    page,
}) => {
    await openBlue(page);
    await expect(trigger(page)).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    const menu = await openSongMenu(page);
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.getByRole('menuitem')).toHaveText([
        // A phone's menu leads with the band's intensity (#1994): the transport has no room.
        ...(phoneWidth(page) ? [/^Intensity/] : []),
        'Copy link',
        'Duplicate',
        'Export…',
        /^More/,
        'Delete…',
    ]);
    await expect(menu.getByRole('separator')).toHaveCount(1);
    expect(
        await menu.evaluate(
            (list) => Array.from(list.children).at(-2)?.getAttribute('role') === 'separator',
        ),
    ).toBe(true);
    // Rows only: nothing to type or pick in place, no paragraph of help, no modal behind it.
    const box = page.locator('.menu');
    await expect(box.locator('input, select, textarea')).toHaveCount(0);
    // (A phone's sheet repeats the song's title at its top: a heading, not help.)
    await expect(box.locator('p:not(.menu-title)')).toHaveCount(0);
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    // A guest song has no sync facts to show.
    await expect(page.getByTestId('sync-status')).toHaveCount(0);

    // Esc closes it onto the •••; on a laptop the ••• toggles it (a phone's sheet covers it).
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
    await expect(trigger(page)).toHaveAttribute('aria-expanded', 'false');
    if (phoneWidth(page)) {
        return;
    }
    await trigger(page).click();
    await expect(menu).toBeVisible();
    await trigger(page).click();
    await expect(menu).toHaveCount(0);
});

test('More holds Revert to saved; the song settings are the Key popover’s, Choruses the footer’s', async ({
    page,
}) => {
    await openBlue(page);
    const menu = await openSongMenu(page);
    await menu.getByRole('menuitem', { name: 'More', exact: true }).click();
    const more = songMenu(page, 'more');
    await expect(more).toBeVisible();
    await expect(menu).toHaveCount(0);
    // Nothing to revert yet and no preserved drafts to list; no Song settings any more (#1757).
    await expect(more.getByRole('menuitem')).toHaveText(['Revert to saved']);
    await expect(more.getByRole('menuitem', { name: 'Revert to saved' })).toHaveAttribute(
        'aria-disabled',
        'true',
    );
    await expect(more.getByRole('menuitem').first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(more).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();

    // Meter and Mode are the transport's Key popover's, and it has nothing about choruses.
    const popover = await openKeyPopover(page);
    await expect(popover.getByLabel('Meter', { exact: true })).toHaveValue('4/4');
    await expect(popover.getByLabel('Mode', { exact: true })).toHaveValue('major');
    await expect(popover.getByLabel('Choruses')).toHaveCount(0);
    await closeKeyPopover(page);
});

test('Export… offers each format by a plain name and writes the song file', async ({ page }) => {
    await openBlue(page);
    await songMenuAction(page, 'Export…');
    const dialog = exportDialog(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button')).toHaveText([
        /^Song file/,
        /^MIDI/,
        /^Audio \(mix\)/,
        /^Audio \(separate tracks\)/,
        'Close',
    ]);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Song file', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('Blue pocket.ensemble');
    // Written, and the dialog has closed itself.
    await expect(dialog).toBeHidden();
});

test('Export… offers the original source when the song kept one', async ({ page }) => {
    const [blues, ...rest] = starterDocuments();
    await seedGuestDocuments(page, [
        { ...blues, importSource: { format: 'irealb', text: 'irealb://Blue%20pocket' } },
        ...rest,
    ]);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(trigger(page)).toBeEnabled();
    const download = page.waitForEvent('download');
    await exportAs(page, 'Original source');
    expect((await download).suggestedFilename()).toBe('original-ireal-source.txt');
    await expect(exportDialog(page)).toBeHidden();
});

test('Duplicate moves the stand onto a copy and leaves the original', async ({ page }) => {
    await openBlue(page);
    await songMenuAction(page, 'Duplicate');
    await expect(
        page.getByRole('heading', { name: 'Blue pocket — copy', exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId('stand-toast')).toContainText('Duplicated as');
});

test('a guest song is deleted from the stand, and the stand goes back to the songbook', async ({
    page,
}) => {
    await openBlue(page);
    await songMenuAction(page, 'Delete…');
    const confirm = page.getByTestId('delete-guest-song-confirm');
    await expect(confirm).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Delete “Blue pocket”?' })).toBeVisible();
    // Cancel keeps it, on the stand.
    await page.getByTestId('delete-guest-song-cancel').click();
    await expect(confirm).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();

    await songMenuAction(page, 'Delete…');
    await confirm.click();
    await expect(page.getByRole('button', { name: 'Back to songbook' })).toHaveCount(0);
    await expect(songLink(page, 'Blue pocket')).toHaveCount(0);
    // Gone for good: a reload does not bring it back.
    await page.reload();
    await expect(songLink(page, 'Minor swing sketch').first()).toBeVisible();
    await expect(songLink(page, 'Blue pocket')).toHaveCount(0);
});

test('a standard on the stand has nothing to delete or duplicate yet', async ({ page }) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: '12-Bar Blues' });
    await row.getByRole('button', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: '12-Bar Blues', exact: true })).toBeVisible();
    const menu = await openSongMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Delete…' })).toHaveAttribute(
        'aria-disabled',
        'true',
    );
    await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toHaveAttribute(
        'aria-disabled',
        'true',
    );
});

test('Back with the Song menu open closes it and keeps the song', async ({ page }) => {
    await openBlue(page);
    const menu = await openSongMenu(page);
    await page.goBack();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
});
