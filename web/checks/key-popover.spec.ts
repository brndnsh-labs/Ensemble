import type { Page } from '@playwright/test';
import {
    expect,
    keyButton,
    keyPopover,
    openKeyPopover,
    phoneWidth,
    seedStarters,
    songLink,
    test,
} from './fixtures';

/**
 * The transport's Key popover (#1757): Key, Mode, Meter and Chord notation in one small dialog at
 * the Key button — the one place each is changed. `song-meter.spec.ts` drives the meter's re-fit
 * and refusal, `semantic-chart.spec.ts` the mode, `band-sheet.spec.ts` notation's save and revert.
 */

async function openBlue(page: Page) {
    await seedStarters(page);
    await songLink(page, 'Blue pocket', 'Blues').click();
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
}

test('the Key button opens Key, Mode, Meter and Chord notation, and each changes the song live', async ({
    page,
}) => {
    await openBlue(page);
    const button = keyButton(page);
    await expect(button).toHaveAccessibleName('Key: C');
    await expect(button).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(button).toHaveAttribute('aria-expanded', 'false');

    const popover = await openKeyPopover(page);
    await expect(button).toHaveAttribute('aria-expanded', 'true');
    await expect(popover.getByLabel('Key', { exact: true })).toBeFocused();
    for (const label of ['Key', 'Mode', 'Meter', 'Chord notation']) {
        await expect(popover.getByLabel(label, { exact: true })).toBeVisible();
    }
    // Nothing else lives here: no Choruses (the footer's), and one line of hint at most.
    await expect(popover.getByLabel('Choruses')).toHaveCount(0);
    await expect(popover.locator('p:not(.menu-title)')).toHaveCount(1);

    // Each select changes the song as it is picked, with the popover still open.
    await popover.getByLabel('Key', { exact: true }).selectOption('Bb');
    await expect(button).toHaveAccessibleName('Key: B♭');
    await expect(page.locator('.chord-button').first()).toHaveText('Bb7');
    await popover.getByLabel('Mode', { exact: true }).selectOption('minor');
    await expect(button).toHaveAccessibleName('Key: B♭m');
    await popover.getByLabel('Meter', { exact: true }).selectOption('3/4');
    await expect(page.locator('.song-subtitle')).toContainText('3/4');
    await popover.getByLabel('Chord notation', { exact: true }).selectOption('roman');
    await expect(page.locator('.chord-button').first()).not.toHaveText('Bb7');
    await expect(popover).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();

    // Esc closes it onto the Key button.
    await page.keyboard.press('Escape');
    await expect(popover).toHaveCount(0);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-expanded', 'false');
});

test('the Key button toggles the popover, and Tab past its last field leaves it', async ({
    page,
}) => {
    await openBlue(page);
    const popover = await openKeyPopover(page);
    if (!phoneWidth(page)) {
        // On a phone the sheet's backdrop lies over the button; there the backdrop closes it.
        await keyButton(page).click();
        await expect(popover).toHaveCount(0);
        await openKeyPopover(page);
    }
    await popover.getByLabel('Chord notation', { exact: true }).focus();
    if (phoneWidth(page)) {
        // The sheet ends with Done.
        await page.keyboard.press('Tab');
        await expect(popover.getByRole('button', { name: 'Done' })).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(popover).toHaveCount(0);
});

test('Back with the Key popover open closes it and keeps the song', async ({ page }) => {
    await openBlue(page);
    const popover = await openKeyPopover(page);
    await page.goBack();
    await expect(popover).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Blue pocket', exact: true })).toBeVisible();
});

test('on a laptop it sits under the Key button and a press outside closes it', async ({ page }) => {
    test.skip(phoneWidth(page), 'the laptop popover');
    await openBlue(page);
    const popover = await openKeyPopover(page);
    const button = await keyButton(page).boundingBox();
    const box = await popover.boundingBox();
    if (!button || !box) {
        throw new Error('no boxes');
    }
    expect(box.y).toBeGreaterThan(button.y + button.height - 1);
    expect(Math.abs(box.x - button.x)).toBeLessThan(2);
    await page.locator('.song-title').click();
    await expect(popover).toHaveCount(0);
    await expect(keyButton(page)).toBeFocused();
});

test('on a phone it is a sheet from the foot of the screen, closed by its backdrop or Done', async ({
    page,
}) => {
    test.skip(!phoneWidth(page), 'the phone sheet');
    await openBlue(page);
    const popover = await openKeyPopover(page);
    const viewport = page.viewportSize();
    await expect
        .poll(async () => {
            const box = await popover.boundingBox();
            return box && viewport ? Math.round(box.y + box.height) : null;
        })
        .toBe(viewport?.height);
    const box = await popover.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(viewport?.width);
    await expect(page.locator('.menu-backdrop')).toBeVisible();

    await page.mouse.click((viewport?.width ?? 0) / 2, 20);
    await expect(keyPopover(page)).toHaveCount(0);
    await expect(page.locator('.menu-backdrop')).toHaveCount(0);
    await expect(keyButton(page)).toBeFocused();

    await openKeyPopover(page);
    await popover.getByRole('button', { name: 'Done' }).click();
    await expect(popover).toHaveCount(0);
    await expect(keyButton(page)).toBeFocused();
});

test('focus moving elsewhere on the page closes it; focus going nowhere does not', async ({
    page,
}) => {
    await openBlue(page);
    const popover = await openKeyPopover(page);
    // A blur to nothing (WebKit mid-tap, a select disabled for its change) keeps it open.
    await popover.getByLabel('Mode', { exact: true }).evaluate((field) => {
        (field as HTMLElement).focus();
        (field as HTMLElement).blur();
    });
    await expect(popover).toBeVisible();
    // Focus carried out of it to another field (iOS's ‹ › arrows do this) leaves it.
    await popover.getByLabel('Mode', { exact: true }).focus();
    await page.getByLabel('Tempo', { exact: true }).focus();
    await expect(popover).toHaveCount(0);
    await expect(page.getByLabel('Tempo', { exact: true })).toBeFocused();
});

test('the picker names each key by its mode: F♯, C♯ and G♯ minor, F♯ major, and spells chords in sharps', async ({
    page,
}) => {
    await openBlue(page);
    const popover = await openKeyPopover(page);
    const key = popover.getByLabel('Key', { exact: true });
    const labels = () => key.locator('option').allTextContents();

    expect(await labels()).toContain('F♯');
    expect(await labels()).not.toContain('G♭');
    await popover.getByLabel('Mode', { exact: true }).selectOption('minor');
    const minor = await labels();
    for (const name of ['C♯', 'F♯', 'G♯']) {
        expect(minor).toContain(name);
    }
    for (const name of ['D♭', 'G♭', 'A♭']) {
        expect(minor).not.toContain(name);
    }

    await key.selectOption('F#');
    await expect(keyButton(page)).toHaveAccessibleName('Key: F♯m');
    await expect(page.locator('.chord-button').first()).toHaveText('F#7');
    await expect(key).toHaveValue('F#');
});
