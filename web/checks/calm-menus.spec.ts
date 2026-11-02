import type { Locator, Page, TestInfo } from '@playwright/test';
import { appUrl, expect, openSectionMenu, openSectionNames, phoneWidth, test } from './fixtures';

/**
 * #1758 — calmer bar and section menus. The ruler is the bar menu's one open group; every other
 * group starts folded; the menu offers one repeat path (the guide's dialog, which holds the
 * per-bar markers); Delete is last, after a divider. On a phone both sheets slide up over a light
 * backdrop that is drawn only, so a press still reaches the bar beneath.
 */

const phone = (testInfo: TestInfo) => testInfo.project.name === 'webkit-phone';

async function press(locator: Locator, testInfo: TestInfo) {
    if (phone(testInfo)) {
        await locator.tap();
    } else {
        await locator.click();
    }
}

async function editAutumnLeaves(page: Page, testInfo: TestInfo) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Browse all →' }).click();
    const row = page.locator('.standards-table .song-row', { hasText: 'Autumn Leaves' });
    await press(row.getByRole('button', { name: 'Open' }), testInfo);
    await expect(page.getByRole('heading', { name: 'Autumn Leaves', exact: true })).toBeVisible();
    await press(page.getByRole('button', { name: 'Edit chart', exact: true }), testInfo);
}

const field = (page: Page, bar: number) => page.getByLabel(`Chords in bar ${bar}`, { exact: true });

/** Bar `bar` opened with two chords typed, and its menu open by its ⋯. */
async function openBarMenu(page: Page, testInfo: TestInfo, bar: number): Promise<Locator> {
    const bars = page.locator('.bar');
    await press(bars.nth(bar - 1), testInfo);
    await expect(field(page, bar)).toBeFocused();
    await field(page, bar).fill('Gm7 C7');
    const trigger = phone(testInfo)
        ? page.locator('.bar-dock').getByRole('button', { name: 'Bar menu', exact: true })
        : bars.nth(bar - 1).getByRole('button', { name: 'Bar menu', exact: true });
    await press(trigger, testInfo);
    const menu = page.getByRole('dialog', { name: `Bar ${bar} menu`, exact: true });
    await expect(menu).toBeVisible();
    return menu;
}

/** The menu's own children, top to bottom: each a tag and its text. */
function children(menu: Locator) {
    return menu.evaluate((node) =>
        Array.from(node.children).map((child) => ({
            tag: child.tagName.toLowerCase(),
            text: (child.textContent ?? '').trim(),
        })),
    );
}

async function expectAllFolded(menu: Locator) {
    const open = await menu
        .locator('details')
        .evaluateAll((all) => all.map((node) => (node as HTMLDetailsElement).open));
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((isOpen) => !isOpen)).toBe(true);
}

async function settled(locator: Locator) {
    await locator.evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished)),
    );
}

test('the bar menu: the ruler open, every other group folded, one repeat path, Delete last', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const menu = await openBarMenu(page, testInfo, 7);

    // The ruler is the one open group: it is what the menu is for.
    await expect(menu.getByRole('slider', { name: 'Split between Gm7 and C7' })).toBeVisible();
    await expectAllFolded(menu);
    await expect(menu.getByLabel('Key from this bar')).toBeHidden();
    // One repeat path: the guide. The per-bar markers are inside its dialog, not in the menu.
    await expect(menu.getByRole('button', { name: /^Repeat or ending/ })).toBeVisible();
    await expect(menu.getByText(/Advanced|per-bar/i)).toHaveCount(0);
    await expect(menu.getByLabel('Start repeat here', { exact: true })).toHaveCount(0);

    // Delete bar is the last thing in it, after a divider.
    const items = await children(menu);
    expect(items.at(-1)).toEqual({ tag: 'button', text: 'Delete bar' });
    expect(items.at(-2)?.tag).toBe('hr');
    expect(items.at(-3)).toEqual({ tag: 'button', text: 'Insert bar after' });
    // On a phone the way back heads the sheet, out of the list.
    await expect(menu.locator('.bar-menu-top').getByRole('button')).toHaveCount(
        phone(testInfo) ? 1 : 0,
    );

    // The guide's dialog offers this bar's own markers, for the forms it leaves alone.
    await press(menu.getByRole('button', { name: /^Repeat or ending/ }), testInfo);
    const guide = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    await expect(guide).toBeVisible();
    await expect(guide.getByLabel('Start repeat here', { exact: true })).toHaveCount(0);
    await press(guide.getByRole('button', { name: 'Per-bar markers for A · bar 7…' }), testInfo);
    await expect(guide.getByLabel('Start repeat here', { exact: true })).toBeVisible();
    await press(guide.getByRole('button', { name: 'Done', exact: true }), testInfo);
    await expect(guide).toHaveCount(0);
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
});

test('the section menu: its groups folded, Delete section last after a divider', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const menu = await openSectionMenu(page, 'B');
    await expectAllFolded(menu);
    await expect(menu.getByLabel('Section name')).toBeHidden();
    await expect(menu.getByLabel('Section meter')).toBeHidden();
    await expect(menu.getByText('Name and plays')).toBeVisible();

    const items = await children(menu);
    expect(items.at(-1)).toEqual({ tag: 'button', text: 'Delete section' });
    expect(items.at(-2)?.tag).toBe('hr');
    expect(items.at(-3)).toEqual({ tag: 'button', text: 'Duplicate section' });
    expect(items.at(-4)).toEqual({ tag: 'button', text: 'Add section after' });

    // Unfolded, the name is there to type, as before.
    await openSectionNames(menu);
    await expect(menu.getByLabel('Section name')).toHaveValue('B');
});

test('on a laptop the menus are popovers, with no backdrop', async ({ page }, testInfo) => {
    test.skip(phone(testInfo), 'the laptop popover');
    await editAutumnLeaves(page, testInfo);
    await openBarMenu(page, testInfo, 7);
    await expect(page.locator('.bar-menu.popover')).toBeVisible();
    await expect(page.locator('.menu-backdrop')).toHaveCount(0);
});

test('on a phone the bar menu slides up over a light backdrop, and a press through it opens another bar', async ({
    page,
}, testInfo) => {
    test.skip(!phone(testInfo), 'the phone sheet');
    await editAutumnLeaves(page, testInfo);
    const menu = await openBarMenu(page, testInfo, 7);
    const sheet = page.locator('.bar-menu-sheet');
    expect(await sheet.evaluate((node) => getComputedStyle(node).animationName)).toBe(
        'menu-slide-up',
    );
    const backdrop = page.locator('.bar-menu-backdrop');
    await expect(backdrop).toBeVisible();
    // Light: a tint, not opaque, and drawn only — it takes no press.
    const look = await backdrop.evaluate((node) => {
        const style = getComputedStyle(node);
        return { events: style.pointerEvents, background: style.backgroundColor };
    });
    expect(look.events).toBe('none');
    expect(look.background).not.toBe('rgba(0, 0, 0, 0)');
    await settled(sheet);
    const viewport = page.viewportSize();
    const box = await sheet.boundingBox();
    expect(viewport && box && Math.round(box.y + box.height)).toBe(viewport?.height);

    // A bar on screen above the sheet, under the backdrop: a press on it opens that bar.
    const sheetTop = box?.y ?? 0;
    const bars = page.locator('.sheet .bar');
    let target = -1;
    for (let index = 0; index < 32; index++) {
        if (index === 6) {
            continue;
        }
        const at = await bars.nth(index).boundingBox();
        if (at && at.y > 0 && at.y + at.height < sheetTop - 4) {
            target = index;
            break;
        }
    }
    expect(target).toBeGreaterThanOrEqual(0);
    await bars.nth(target).tap();
    await expect(menu).toHaveCount(0);
    await expect(backdrop).toHaveCount(0);
    await expect(field(page, target + 1)).toBeFocused();
    // Bar 7 was left, so what was typed in it applied.
    await expect(bars.nth(6).locator('.chord')).toHaveText(['Gm7', 'C7']);
});

test('on a phone the section menu slides up over the backdrop, Close in its heading', async ({
    page,
}, testInfo) => {
    test.skip(!phone(testInfo), 'the phone sheet');
    await editAutumnLeaves(page, testInfo);
    const menu = await openSectionMenu(page, 'B');
    expect(await menu.evaluate((node) => getComputedStyle(node).animationName)).toBe(
        'menu-slide-up',
    );
    await expect(page.locator('.bar-menu-backdrop')).toBeVisible();
    await menu.locator('.bar-menu-top').getByRole('button', { name: 'Close' }).tap();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('.bar-menu-backdrop')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Section B', exact: true })).toBeFocused();
    expect(phoneWidth(page)).toBe(true);
});
