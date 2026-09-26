import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * The section tap menu (#1417): the section letter's plain tap, which used to be a no-op,
 * now opens "Loop this section" / "Start here". Long-press and the 'L' key still go straight
 * to the loop toggle, unchanged — `semantic-playback.spec.ts`'s long-press test is the proof
 * that gesture still confines playback; this file is about the MENU wiring, not re-proving that.
 */
async function newTwoSectionSong(page: import('@playwright/test').Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Section menu study');
    // A second section with a chord name that never appears in A, so landing on it is
    // unambiguous from the chart's own active-chord highlight.
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('Dm7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
}

test('tapping a section letter opens a menu with Loop this section and Start here', async ({
    page,
}) => {
    await newTwoSectionSong(page);
    const sectionA = page.getByRole('button', {
        name: 'Section A · hold to practice-loop',
        exact: true,
    });
    await expect(sectionA).toHaveAttribute('aria-expanded', 'false');
    await sectionA.click();
    await expect(sectionA).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('menu', { name: 'Section A' });
    await expect(menu).toBeVisible();
    const loopItem = menu.getByRole('menuitem', { name: 'Loop this section', exact: true });
    const startItem = menu.getByRole('menuitem', { name: 'Start here', exact: true });
    await expect(loopItem).toBeVisible();
    await expect(startItem).toBeVisible();

    // Keyboard accessible: Escape closes it and gives focus back to the section letter.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(sectionA).toBeFocused();

    // Clicking outside also closes it.
    await sectionA.click();
    await expect(menu).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(menu).toHaveCount(0);
});

test('Loop this section arms the same loop the long-press gesture does, and toggles off as Stop looping', async ({
    page,
}) => {
    await newTwoSectionSong(page);
    const sectionA = page.getByRole('button', {
        name: 'Section A · hold to practice-loop',
        exact: true,
    });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');

    await sectionA.click();
    await page.getByRole('menuitem', { name: 'Loop this section', exact: true }).click();
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.section-loop.active')).toHaveCount(1);

    // Reopening the menu on an already-looping section offers to stop it instead.
    await sectionA.click();
    const menu = page.getByRole('menu', { name: 'Section A' });
    await expect(menu.getByRole('menuitem', { name: 'Loop this section' })).toHaveCount(0);
    const stopItem = menu.getByRole('menuitem', { name: 'Stop looping', exact: true });
    await expect(stopItem).toBeVisible();
    await stopItem.click();
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // The long-press gesture still works too, unchanged by any of the above.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
});

test('Start here starts a stopped song from that section', async ({ page }) => {
    await newTwoSectionSong(page);
    const sectionB = page.getByRole('button', {
        name: 'Section B · hold to practice-loop',
        exact: true,
    });
    await sectionB.click();
    await page.getByRole('menuitem', { name: 'Start here', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveText('Dm7', {
        timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('Start here jumps a playing song into that section immediately, without stopping it', async ({
    page,
}) => {
    await newTwoSectionSong(page);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();

    const sectionB = page.getByRole('button', {
        name: 'Section B · hold to practice-loop',
        exact: true,
    });
    await sectionB.click();
    await page.getByRole('menuitem', { name: 'Start here', exact: true }).click();

    // Never dropped out of playback for the jump.
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveText('Dm7', {
        timeout: 10_000,
    });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
