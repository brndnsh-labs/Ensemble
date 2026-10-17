import type { Locator, Page } from '@playwright/test';
import { openAccountPage, openWithAccounts, signUp } from './account-helpers';
import {
    accountTest,
    appUrl,
    editorRevealed,
    expect,
    measureSong,
    openBand,
    openBar,
    seedStarters,
    songLink,
    songMenuAction,
    test,
} from './fixtures';
import { addVirtualAuthenticator } from './virtual-authenticator';

/**
 * One rule set for every dialog (#1760), walked dialog by dialog on both projects:
 *
 * - **A backdrop tap** closes a dialog with nothing to lose, and never one holding typed input
 *   not yet saved, a choice not yet applied, or a running action (`dialogRule`,
 *   `app/dialog-close.ts`). Esc still closes those.
 * - **Confirms** put Cancel next to last and the red destructive button last.
 * - **Menu triggers** carry `aria-haspopup` and `aria-expanded`; the Chart | Neck | Edit switch
 *   says its mode with `aria-pressed`.
 * - **Sign out** is on the account page; the header keeps only the account chip.
 * - **Labels** are plain words, and the import dialog is titled for its state.
 */

/** The page's top-left corner, which is backdrop on every layout: no dialog reaches it. */
async function tapBackdrop(page: Page, dialog: Locator): Promise<void> {
    const box = (await dialog.boundingBox())!;
    expect(box.x > 4 || box.y > 4, 'the corner is outside the dialog').toBe(true);
    await page.mouse.click(4, 4);
}

async function closesOnBackdrop(page: Page, dialog: Locator): Promise<void> {
    await expect(dialog).toBeVisible();
    await tapBackdrop(page, dialog);
    await expect(dialog).toBeHidden();
}

async function keepsOnBackdrop(page: Page, dialog: Locator): Promise<void> {
    await expect(dialog).toBeVisible();
    await tapBackdrop(page, dialog);
    // Longer than the close event's queued task: a dialog that was going to close has by now.
    await page.waitForTimeout(300);
    await expect(dialog).toBeVisible();
}

/**
 * Only the dialog's own buttons close it (`busy`): Esc is refused, the backdrop too, and a close
 * that gets past the refusal anyway — Chrome honours a refused `cancel` only with fresh user
 * activation, so a repeated Esc or Android's Back closes the dialog outright — re-opens it.
 */
async function holdsOpen(page: Page, dialog: Locator): Promise<void> {
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await keepsOnBackdrop(page, dialog);
    await dialog.evaluate((node: HTMLDialogElement) => node.close());
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveJSProperty('open', true);
}

/** The dialog's last row of buttons, by name, in reading order. */
async function actions(dialog: Locator): Promise<string[]> {
    const names = await dialog
        .locator('.dialog-actions')
        .last()
        .getByRole('button')
        .allInnerTexts();
    return names.map((name) => name.trim());
}

/** A confirm: Cancel next to last, the red `last` button last. */
async function cancelThenLast(dialog: Locator, last: string): Promise<void> {
    const names = await actions(dialog);
    expect(names.at(-1)).toBe(last);
    expect(names.at(-2)).toBe('Cancel');
    await expect(dialog.locator('.dialog-actions').last().getByRole('button').last()).toHaveClass(
        /\bdanger\b/,
    );
}

/** Every menu or popover trigger on the page carries `aria-expanded` next to `aria-haspopup`. */
async function triggersSayTheyOpen(page: Page): Promise<void> {
    const missing = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[aria-haspopup]'))
            .filter((node) => !node.hasAttribute('aria-expanded'))
            .map((node) => node.getAttribute('aria-label') ?? node.textContent?.trim() ?? ''),
    );
    expect(missing).toEqual([]);
}

test('the stand: triggers say they open, the mode switch says its mode, Band and Export close on a backdrop tap, and the delete confirm ends on Delete', async ({
    page,
}) => {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
    await triggersSayTheyOpen(page);

    // The mode switch: the current mode is pressed, the others are not.
    const chart = page.getByRole('button', { name: 'Chart', exact: true });
    const neck = page.getByRole('button', { name: 'Neck', exact: true });
    const edit = page.getByRole('button', { name: 'Edit chart', exact: true });
    await expect(chart).toHaveAttribute('aria-pressed', 'true');
    await expect(neck).toHaveAttribute('aria-pressed', 'false');
    await expect(edit).toHaveAttribute('aria-pressed', 'false');
    await edit.click();
    await editorRevealed(page);
    await expect(edit).toHaveAttribute('aria-pressed', 'true');
    await expect(chart).toHaveAttribute('aria-pressed', 'false');
    await chart.click();
    await expect(chart).toHaveAttribute('aria-pressed', 'true');

    // The Song menu's ••• says it is open while it is.
    const songActions = page.getByRole('button', { name: 'Song actions', exact: true });
    await expect(songActions).toHaveAttribute('aria-haspopup', 'menu');
    await expect(songActions).toHaveAttribute('aria-expanded', 'false');
    await songActions.click();
    await expect(songActions).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(songActions).toHaveAttribute('aria-expanded', 'false');

    // The Band sheet: settings, nothing to lose. Its Trade tab says what it means.
    const band = await openBand(page, 'Trade');
    await expect(band.getByLabel('Melody comes back', { exact: true })).toBeVisible();
    await expect(band.getByText('Head returns')).toHaveCount(0);
    await closesOnBackdrop(page, band);
    await expect(page.getByRole('button', { name: 'Band…' })).toHaveAttribute(
        'aria-expanded',
        'false',
    );

    // Export…: a list of formats, nothing to lose while no render runs.
    await songMenuAction(page, 'Export…');
    await closesOnBackdrop(page, page.getByTestId('export-dialog'));

    // The guest delete confirm: Export first, then Cancel, the red Delete last. Cancelling it
    // loses nothing, so a backdrop tap closes it, and the song is still on the stand.
    await songMenuAction(page, 'Delete…');
    const confirm = page.getByRole('dialog', { name: 'Delete “Blue pocket”?' });
    await expect(confirm).toBeVisible();
    expect(await actions(confirm)).toEqual(['Export file', 'Cancel', 'Delete']);
    await cancelThenLast(confirm, 'Delete');
    await closesOnBackdrop(page, confirm);
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
});

test('the songbook: Rename and New collection keep what is typed, the collection ⋯ holds Rename and Delete, and its confirm ends on Delete', async ({
    page,
}) => {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();
    await expect(page.getByRole('heading', { name: /All songs/ })).toContainText('· 3');
    await triggersSayTheyOpen(page);
    const more = page
        .locator('.all-songs-table .song-row', { hasText: 'Blue pocket' })
        .getByRole('button', { name: 'More actions for Blue pocket' });

    // Rename…, untouched: a backdrop tap closes it.
    const rename = page.getByRole('dialog', { name: 'Rename “Blue pocket”' });
    await more.click();
    await page.getByTestId('row-menu-rename').click();
    await closesOnBackdrop(page, rename);
    // Typed: the backdrop keeps it, with the typing; Esc is the way out on purpose.
    await more.click();
    await page.getByTestId('row-menu-rename').click();
    await page.getByTestId('row-menu-rename-input').fill('Blue pocket, slower');
    await keepsOnBackdrop(page, rename);
    await expect(page.getByTestId('row-menu-rename-input')).toHaveValue('Blue pocket, slower');
    expect(await actions(rename)).toEqual(['Cancel', 'Save']);
    await page.keyboard.press('Escape');
    await expect(rename).toBeHidden();

    // Add to collection…, nothing typed: a backdrop tap closes it.
    await more.click();
    await page.getByTestId('row-menu-add-to-collection').click();
    const addTo = page.getByRole('dialog', { name: 'Add “Blue pocket” to a collection' });
    await closesOnBackdrop(page, addTo);
    // A new collection's name typed: kept against a stray tap; Esc is the way out on purpose.
    await more.click();
    await page.getByTestId('row-menu-add-to-collection').click();
    await page.getByTestId('row-menu-new-collection-input').fill('Practice');
    await keepsOnBackdrop(page, addTo);
    await expect(page.getByTestId('row-menu-new-collection-input')).toHaveValue('Practice');
    await page.keyboard.press('Escape');
    await expect(addTo).toBeHidden();

    // New collection: closes untouched, keeps a typed name.
    const name = page.getByRole('dialog', { name: 'New collection' });
    await page.getByTestId('new-collection').click();
    await closesOnBackdrop(page, name);
    await page.getByTestId('new-collection').click();
    await page.getByTestId('collection-name-input').fill('Gig');
    await keepsOnBackdrop(page, name);
    expect(await actions(name)).toEqual(['Cancel', 'Create']);
    await page.getByTestId('collection-name-save').click();
    await expect(name).toBeHidden();

    // The collection bar shows its name and one ⋯; Rename… and the red Delete… are in its menu.
    await page.getByTestId('collection-filter').filter({ hasText: 'Gig' }).click();
    const bar = page.getByTestId('collection-bar');
    await expect(bar.getByRole('heading')).toHaveText('Gig');
    const collectionMore = bar.getByRole('button');
    await expect(collectionMore).toHaveCount(1);
    await expect(collectionMore).toHaveAttribute('aria-haspopup', 'menu');
    await expect(collectionMore).toHaveAttribute('aria-expanded', 'false');
    await triggersSayTheyOpen(page);
    await collectionMore.click();
    await expect(collectionMore).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('menu', { name: 'Actions for the collection Gig' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Rename…', 'Delete…']);
    await expect(menu.getByRole('menuitem', { name: 'Delete…' })).toHaveClass(/menu-danger/);
    await menu.getByRole('menuitem', { name: 'Delete…' }).click();

    const confirm = page.getByRole('dialog', { name: 'Delete the collection “Gig”?' });
    await expect(confirm).toBeVisible();
    await cancelThenLast(confirm, 'Delete collection');
    await closesOnBackdrop(page, confirm);
    await expect(bar.getByRole('heading')).toHaveText('Gig');
});

test('import is titled for its state and keeps a typed link; sign-in closes on a backdrop tap', async ({
    page,
}) => {
    await page.goto(appUrl());
    await expect(page.getByTestId('library-heading')).toBeVisible();

    // Nothing chosen yet: it says what it is for, and a backdrop tap loses nothing.
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const choosing = page.getByRole('dialog', { name: 'Import a chart', exact: true });
    await expect(choosing.getByRole('heading', { name: 'Import a chart' })).toBeVisible();
    await expect(page.getByText('Review import')).toHaveCount(0);
    await closesOnBackdrop(page, choosing);

    // A link typed is kept against a stray tap.
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    await choosing.getByText('Or paste an iReal link', { exact: true }).click();
    await choosing.getByLabel('iReal link', { exact: true }).fill('irealb://');
    await keepsOnBackdrop(page, choosing);
    await page.keyboard.press('Escape');
    await expect(choosing).toBeHidden();

    // A file chosen: now it is a review, and a tap on the backdrop does not throw it away.
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    await choosing.getByLabel('Import chart file', { exact: true }).setInputFiles({
        name: 'dialog-study.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(
            JSON.stringify(
                measureSong(['dialog-study', 'Dialog study', 'Rock', 'C', 'C | F | G | C', 100]),
            ),
        ),
    });
    const reviewing = page.getByRole('dialog', { name: 'Review import', exact: true });
    await expect(reviewing.getByRole('heading', { name: 'Review import' })).toBeVisible();
    await expect(reviewing.getByRole('button', { name: 'Add to songbook' })).toBeEnabled();
    await keepsOnBackdrop(page, reviewing);
    expect((await actions(reviewing)).slice(-2)).toEqual(['Cancel', 'Add to songbook']);
    await page.keyboard.press('Escape');
    await expect(reviewing).toBeHidden();

    // The sign-in step, before anything is asked of a passkey: nothing to lose.
    const signIn = page.locator('dialog.account-dialog');
    await page.getByTestId('account-sign-in').click();
    await closesOnBackdrop(page, signIn);
});

test('Older drafts and the Copy link fallback close on a backdrop tap', async ({
    page,
    context,
}) => {
    // No clipboard, so Copy link always shows its fallback (as `share-link.spec.ts` does).
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await songMenuAction(page, 'Copy link');
    await expect(page.getByTestId('share-link-fallback')).toBeVisible();
    await closesOnBackdrop(page, page.getByRole('dialog', { name: 'Copy this link' }));

    // An older competing draft (`foundation.spec.ts`): this tab's tempo change, another tab's Save.
    const second = await context.newPage();
    await second.goto(appUrl());
    await songLink(second, 'Blue pocket', 'Blues').click();
    await page.getByRole('button', { name: 'Slower', exact: true }).click();
    await second.getByRole('button', { name: 'Faster', exact: true }).click();
    await second.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(second.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await second.close();
    await page.reload();
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByLabel('Tempo', { exact: true })).toHaveValue('115');
    await songMenuAction(page, /Older drafts \(/);
    await closesOnBackdrop(page, page.getByRole('dialog', { name: 'Older drafts' }));
});

test('Repeats and endings closes on a backdrop tap until a bar is chosen in it', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    const guide = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    const open = async () => {
        const barMenu = page.getByRole('button', { name: 'Bar menu', exact: true });
        if (!(await barMenu.isVisible())) {
            await openBar(page, 1);
        }
        await barMenu.click();
        await page.getByRole('button', { name: /^Repeat or ending/ }).click();
        await expect(guide).toBeVisible();
    };
    await open();
    await closesOnBackdrop(page, guide);

    await open();
    await guide.getByRole('button', { name: 'Select bar 2', exact: true }).click();
    await keepsOnBackdrop(page, guide);
    await guide.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(guide).toHaveCount(0);
});

accountTest.describe('signed in', () => {
    // Passkeys need the CDP virtual authenticator; the guest dialogs above run on both projects.
    accountTest.skip(({ browserName }) => browserName !== 'chromium', 'Chromium passkeys only');

    accountTest(
        'the header keeps only the account chip; the account page holds Sign out and closes on a backdrop tap; the sign-out step ends on Sign out',
        async ({ page }) => {
            await addVirtualAuthenticator(page);
            await openWithAccounts(page);
            await signUp(page);
            const entry = page.getByTestId('account-entry');
            await expect(entry.getByRole('button')).toHaveText([
                'Finish protecting your account',
                'Account',
            ]);
            await expect(entry.getByText('Sign out')).toHaveCount(0);

            const accountPage = await openAccountPage(page);
            await closesOnBackdrop(page, accountPage);

            await openAccountPage(page);
            await accountPage.getByTestId('account-sign-out').click();
            const signOut = page.locator('dialog[aria-labelledby="sign-out-title"]');
            await expect(signOut).toBeVisible();
            await expect(signOut.getByTestId('sign-out-confirm')).toBeEnabled();
            const names = await actions(signOut);
            expect(names.at(-1)).toBe('Sign out');
            expect(names.at(-2)).toBe('Cancel');
            await closesOnBackdrop(page, signOut);
            await expect(entry.getByTestId('account-open')).toBeVisible();
        },
    );

    accountTest(
        'the sign-in recover stage keeps against a backdrop tap; Esc closes it',
        async ({ page }) => {
            // Chromium only: the recover stage is offered where passkeys are (WebKit here has none).
            await addVirtualAuthenticator(page);
            await openWithAccounts(page);
            const signIn = page.locator('dialog.account-dialog');
            await page.getByTestId('account-sign-in').click();
            await signIn.getByTestId('account-recover').click();
            await expect(
                signIn.getByRole('heading', { name: 'Take your songbook with you.' }),
            ).toHaveCount(0);
            await keepsOnBackdrop(page, signIn);
            await page.keyboard.press('Escape');
            await expect(signIn).toBeHidden();
        },
    );

    accountTest(
        'a recovery code on screen holds the page open; the delete step keeps against a backdrop tap; a running sign-out takes no Esc',
        async ({ page }) => {
            await addVirtualAuthenticator(page);
            await openWithAccounts(page);
            await signUp(page);

            // Replace recovery code: the new code is shown once, so only its buttons close it.
            const accountPage = await openAccountPage(page);
            await accountPage.getByTestId('replace-recovery-code').click();
            await expect(accountPage.getByTestId('recovery-code')).toBeVisible();
            await holdsOpen(page, accountPage);
            await expect(accountPage.getByTestId('recovery-code')).toBeVisible();
            await accountPage.getByTestId('recovery-not-now').click();
            await expect(accountPage.getByRole('heading', { name: 'Your account.' })).toBeVisible();

            // The delete step takes a typed confirmation: a backdrop tap keeps it, Esc closes.
            await accountPage.getByTestId('delete-account-open').click();
            await accountPage.getByTestId('delete-account-input').fill('del');
            await keepsOnBackdrop(page, accountPage);
            await expect(accountPage.getByTestId('delete-account-confirm')).toBeVisible();
            await page.keyboard.press('Escape');
            await expect(accountPage).toBeHidden();

            // A sign-out in flight: the logout is held, and nothing but its answer closes the step.
            let release = () => {};
            const held = new Promise<void>((resolve) => {
                release = resolve;
            });
            await page.route('**/api/auth/logout', async (route) => {
                await held;
                await route.continue();
            });
            await openAccountPage(page);
            await accountPage.getByTestId('account-sign-out').click();
            const signOut = page.locator('dialog[aria-labelledby="sign-out-title"]');
            await expect(signOut.getByTestId('sign-out-confirm')).toBeEnabled();
            await signOut.getByTestId('sign-out-confirm').click();
            await expect(signOut.getByTestId('sign-out-cancel')).toBeDisabled();
            await holdsOpen(page, signOut);
            release();
            await expect(signOut).toBeHidden();
            await expect(page.getByTestId('account-sign-in')).toBeVisible();
        },
    );
});
