import type { Page } from '@playwright/test';
import {
    appUrl,
    editorRevealed,
    expect,
    leaveBar,
    openSectionBand,
    openSectionContext,
    openSectionMenu,
    openSectionNames,
    phoneWidth,
    test,
    typeBar,
} from './fixtures';

/**
 * One section settings surface (#1374), opened from the section letter while editing (#1726).
 * The rules — bounds, overrides, the section meter re-fit — are pinned in `lib/documents.test.ts`
 * and `lib/song-meter.test.ts`; this proves the section menu reaches them and that the stand
 * shows the result.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

test('a section takes a role and sits a player out, and the letter hints it (#2021)', async ({
    page,
}) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    await leaveBar(page);

    let menu = await openSectionMenu(page, 'B');
    await openSectionBand(menu);
    await expect(menu.getByLabel('Section role')).toHaveValue('Bridge');
    await menu.getByLabel('Section role').selectOption('Break');
    // A lone B already reads as a Bridge to the band; the role is its reading of the name, so the section is now called Break.
    menu = page.getByRole('dialog', { name: 'Section Break menu', exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByLabel('Section role')).toHaveValue('Break');
    await menu.getByLabel('Drums').uncheck();
    await menu.getByLabel('Bass').uncheck();
    await expect(menu.getByLabel('Drums')).not.toBeChecked();
    await expect(menu.locator('summary', { hasText: 'Role and players' })).toContainText(
        'no drums, bass',
    );
    await menu.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('.section-marks')).toHaveText('no drums, bass');
    // Only the section that sits players out says so.
    await expect(page.locator('.section-marks')).toHaveCount(1);

    // Ticking one back, and "None", return the section to the band's own say.
    menu = await openSectionMenu(page, 'Break');
    await openSectionBand(menu);
    await menu.getByLabel('Bass').check();
    await expect(page.locator('.section-marks')).toHaveText('no drums');
    await menu.getByLabel('Drums').check();
    await expect(page.locator('.section-marks')).toHaveCount(0);
    await menu.getByLabel('Section role').selectOption('');
    await expect(page.getByRole('dialog', { name: 'Section C menu', exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
});

test('a new section can be named, repeated and put in 6/8, and it plays', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await newSong(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    await leaveBar(page);

    let menu = await openSectionMenu(page, 'B');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('Bridge');
    await menu.getByLabel('Section name').press('Enter');
    menu = page.getByRole('dialog', { name: 'Section Bridge menu', exact: true });
    await expect(menu).toBeVisible();
    await menu.getByLabel('Section plays').fill('2');
    await menu.getByLabel('Section plays').press('Enter');
    await openSectionContext(menu);
    await menu.getByLabel('Section meter').selectOption('6/8');

    const bridge = page.getByRole('button', { name: 'Section Bridge', exact: true });
    await expect(bridge).toBeVisible();
    await expect(page.locator('.section-repeat')).toHaveText('Section ×2');
    // The section's first bar carries its meter mark; the song itself is still in 4/4.
    await expect(page.locator('.bar-context').last()).toContainText('6/8');
    await expect(page.locator('.song-subtitle')).toContainText('4/4');
    await expect(menu.getByLabel('Section meter')).toHaveValue('6/8');
    await expect(alert(page)).toHaveCount(0);
    await menu.press('Escape');
    await expect(menu).toBeHidden();

    await page.getByRole('button', { name: 'Start playback' }).click();
    await expect(page.getByRole('button', { name: 'Stop playback' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop playback' }).click();
    await expect(alert(page)).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

test('an empty section name is refused and the old name comes back', async ({ page }) => {
    await newSong(page);
    const menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('   ');
    await menu.getByLabel('Section name').press('Enter');

    await expect(alert(page)).toContainText('A section name needs 1 to 24 characters');
    await expect(menu.getByLabel('Section name')).toHaveValue('A');
});

test('a section name typed and left by a press elsewhere is kept, not lost (#1726)', async ({
    page,
}) => {
    await newSong(page);
    const menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('Verse');
    // A press outside closes the menu; the field's typing commits on the way out.
    await page.locator('.song-subtitle').click();
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Section Verse', exact: true })).toBeVisible();
    await expect(page.locator('.song-subtitle .unsaved')).toBeVisible();
});

test('the section letter opens its menu while a bar is open, and leaves the bar (#1726)', async ({
    page,
}) => {
    await newSong(page);
    await typeBar(page, 2, 'Dm7');
    // A real tap on a phone, where the bar's field is the dock: the press keeps the dock's focus
    // on its way down, so the letter is still under it for the click.
    const letter = page.getByRole('button', { name: 'Section A', exact: true });
    if (phoneWidth(page)) {
        await letter.tap();
    } else {
        await letter.click();
    }
    const menu = page.getByRole('dialog', { name: 'Section A menu', exact: true });
    await expect(menu).toBeVisible();
    // The bar was left, so what was typed in it applied.
    await expect(page.locator('.bar-input, .bar-dock')).toHaveCount(0);
    await expect(page.locator('.bar').nth(1).locator('.chord')).toHaveText(['Dm7']);
});

/** A press as the musician makes it: a real tap on a phone, a click on a laptop. */
async function press(page: Page, target: import('@playwright/test').Locator) {
    if (phoneWidth(page)) {
        await target.tap();
    } else {
        await target.click();
    }
}

test('a name still being typed goes in with the menu action pressed next (#1726 review)', async ({
    page,
}) => {
    await newSong(page);
    let menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('Verse');
    // On WebKit the press takes no focus, so the field is still focused when the action runs.
    await press(page, menu.getByRole('button', { name: 'Add section after', exact: true }));
    await expect(page.getByRole('button', { name: 'Section Verse', exact: true })).toBeVisible();
    await expect(page.locator('.bar')).toHaveCount(5);
    await expect(alert(page)).toHaveCount(0);
    await leaveBar(page);

    // The new section takes the first letter no section has: A, now that A is the Verse.
    menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('Bridge');
    await press(page, menu.getByRole('button', { name: 'Delete section', exact: true }));
    await expect(page.locator('.bar')).toHaveCount(4);
    await expect(page.locator('.section-letter')).toHaveCount(1);
    await expect(alert(page)).toHaveCount(0);
    // Focus goes to the section before the deleted one, not to the page.
    await expect(page.getByRole('button', { name: 'Section Verse', exact: true })).toBeFocused();
});

test('the letter that closes its menu keeps a name still being typed (#1726 review)', async ({
    page,
}) => {
    await newSong(page);
    const menu = await openSectionMenu(page, 'A');
    await openSectionNames(menu);
    await menu.getByLabel('Section name').fill('Intro');
    await press(page, page.getByRole('button', { name: 'Section A', exact: true }));
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Section Intro', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: /^Section .* menu$/ })).toHaveCount(0);
});

test('Enter commits a name and keeps focus in the menu, so Esc still closes it (#1726 review)', async ({
    page,
}) => {
    await newSong(page);
    await openSectionNames(await openSectionMenu(page, 'A'));
    await page.getByLabel('Section name').fill('Verse');
    await page.getByLabel('Section name').press('Enter');
    const menu = page.getByRole('dialog', { name: 'Section Verse menu', exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByLabel('Section name')).toBeFocused();
    await expect(menu.getByLabel('Section name')).toHaveValue('Verse');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'Section Verse', exact: true })).toBeFocused();
    // Space on the letter is the letter's, not Play.
    await expect(page.getByRole('button', { name: 'Start playback' })).toBeVisible();
});

test('deleting a middle section puts focus on the section before it (#1726 review)', async ({
    page,
}) => {
    await newSong(page);
    for (const after of ['A', 'B']) {
        await press(
            page,
            (await openSectionMenu(page, after)).getByRole('button', {
                name: 'Add section after',
                exact: true,
            }),
        );
        await leaveBar(page);
    }
    await expect(page.locator('.section-letter')).toHaveText(['A', 'B', 'C']);
    await press(
        page,
        (await openSectionMenu(page, 'B')).getByRole('button', {
            name: 'Delete section',
            exact: true,
        }),
    );
    await expect(page.locator('.section-letter')).toHaveText(['A', 'C']);
    await expect(page.getByRole('button', { name: 'Section A', exact: true })).toBeFocused();
});
