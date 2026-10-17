import type { Page } from '@playwright/test';
import { expect, phoneWidth, seedStarters, test } from './fixtures';

/**
 * The anchored `<Menu>` (#1755), through the song row's ⋯ on the All songs page: a compact list
 * at the ⋯ on a laptop, a slide-up sheet over a light backdrop on a phone — never a modal with a
 * blurred page and a Close button. Delete… is last, after a divider. Esc and a press outside
 * close it, and focus goes back to the ⋯. The form-length and section-letter menus are the same
 * component; `form-length.spec.ts` and `section-menu.spec.ts` drive those.
 */

async function openRowMenu(page: Page) {
    await seedStarters(page);
    await page.getByTestId('all-songs-link').click();
    const trigger = page
        .locator('.all-songs-table .song-row', { hasText: 'Blue pocket' })
        .getByRole('button', { name: 'More actions for Blue pocket' });
    await expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.click();
    const menu = page.getByRole('menu', { name: 'Actions for Blue pocket' });
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    return { trigger, menu };
}

test('the row ⋯ opens a list of rows with Delete… last, after a divider, and no modal', async ({
    page,
}) => {
    const { menu } = await openRowMenu(page);
    await expect(menu.getByRole('menuitem')).toHaveText([
        '★ Star',
        'Add to collection…',
        'Rename…',
        'Duplicate',
        'Export file',
        'Delete…',
    ]);
    await expect(menu.getByRole('separator')).toHaveCount(1);
    // The divider sits right before Delete….
    expect(
        await menu.evaluate((list) => {
            const children = Array.from(list.children);
            return children.at(-2)?.getAttribute('role') === 'separator';
        }),
    ).toBe(true);
    // Nothing modal: no open dialog, no Close button.
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
});

test('on a laptop the menu sits at its ⋯, and Esc or a press outside closes it onto the ⋯', async ({
    page,
}) => {
    test.skip(phoneWidth(page), 'the laptop popover');
    const { trigger, menu } = await openRowMenu(page);
    const box = page.locator('.menu-anchored');
    const at = await trigger.boundingBox();
    const placed = await box.boundingBox();
    const viewport = page.viewportSize();
    if (!at || !placed || !viewport) {
        throw new Error('no boxes');
    }
    // Under the ⋯ (or over it, where there is no room below), lined up with its right edge.
    expect(placed.y >= at.y + at.height || placed.y + placed.height <= at.y).toBe(true);
    expect(Math.abs(placed.x + placed.width - (at.x + at.width))).toBeLessThan(2);
    expect(placed.x).toBeGreaterThanOrEqual(0);
    expect(placed.x + placed.width).toBeLessThanOrEqual(viewport.width);
    await expect(page.locator('.menu-backdrop')).toHaveCount(0);

    // The first row has focus; the arrows, Home and End move through the rows, wrapping.
    const rows = menu.getByRole('menuitem');
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(rows.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(rows.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(rows.first()).toBeFocused();

    // Esc closes it, and focus is back on the ⋯.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    // The ⋯ toggles it.
    await trigger.click();
    await expect(menu).toBeVisible();
    await trigger.click();
    await expect(menu).toHaveCount(0);

    // A press outside, on the empty page, closes it onto the ⋯ again.
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(viewport.width - 4, viewport.height - 4);
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
    // A press on something that takes focus closes it and leaves focus there.
    await trigger.click();
    await expect(menu).toBeVisible();
    const search = page.getByLabel('Search your songs', { exact: true });
    await search.click();
    await expect(menu).toHaveCount(0);
    await expect(search).toBeFocused();
});

test('on a phone the menu is a sheet from the foot of the screen, closed by its backdrop', async ({
    page,
}) => {
    test.skip(!phoneWidth(page), 'the phone sheet');
    const { trigger, menu } = await openRowMenu(page);
    const sheet = page.locator('.menu-sheet');
    const viewport = page.viewportSize();
    // Settled: the slide up has finished.
    await expect
        .poll(async () => {
            const box = await sheet.boundingBox();
            return box && viewport ? Math.round(box.y + box.height) : null;
        })
        .toBe(viewport?.height);
    const box = await sheet.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(viewport?.width);
    // It names the song it is about, since it is away from the row.
    await expect(sheet.locator('.menu-title')).toHaveText('Blue pocket');
    await expect(page.locator('.menu-backdrop')).toBeVisible();

    // A tap on the backdrop closes it — and only it: the row under the tap is not opened.
    await page.mouse.click(10, 10);
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.menu-backdrop')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /All songs/ })).toBeVisible();
    await expect(trigger).toBeFocused();

    // Esc closes the sheet too.
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(trigger).toBeFocused();
});

test('a choice closes the menu and runs; Delete… still asks first', async ({ page }) => {
    const { trigger, menu } = await openRowMenu(page);
    await menu.getByRole('menuitem', { name: 'Delete…' }).click();
    await expect(menu).toHaveCount(0);
    const confirm = page.getByTestId('delete-guest-song-confirm');
    await expect(confirm).toBeVisible();
    // Cancelling the confirm leaves the song where it was.
    await page.keyboard.press('Escape');
    await expect(confirm).toBeHidden();
    await expect(
        page.locator('.all-songs-table .song-row', { hasText: 'Blue pocket' }),
    ).toHaveCount(1);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
});

test('with reduced motion the menu appears without moving', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openRowMenu(page);
    const durations = await page
        .locator('.menu')
        .evaluate((box) => getComputedStyle(box).animationDuration);
    expect(durations).toBe('0s');
});
