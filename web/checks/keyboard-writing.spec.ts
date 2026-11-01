import type { Page } from '@playwright/test';
import { editorRevealed, expect, seedStarters, test, typeBar } from './fixtures';

/**
 * #1984 — the stand takes a writer's keys: Ctrl/⌘+S saves, Save keeps the focus it was pressed
 * with, the tempo field steps on ↑/↓ (Shift takes ten), and "Skip to chart" is the first Tab stop.
 */

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });

async function newSong(page: Page) {
    await seedStarters(page);
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

test('Ctrl+S saves from a bar field and focus stays in it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    await typeBar(page, 1, 'Dm7');
    await expect(save(page)).toBeEnabled();
    await page.keyboard.press('Control+s');
    await expect(page.locator('.song-subtitle > span').first()).toHaveText('Saved on this device');
    await expect(save(page)).toBeDisabled();
    await expect(page.getByLabel('Chords in bar 1', { exact: true })).toBeFocused();
});

test('⌘+S saves from the tempo field and focus stays there', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    await page.getByLabel('Tempo').focus();
    await page.keyboard.press('ArrowUp');
    await expect(save(page)).toBeEnabled();
    await page.keyboard.press('Meta+s');
    await expect(save(page)).toBeDisabled();
    await expect(page.getByLabel('Tempo')).toBeFocused();
});

test('Ctrl+S in the tempo field commits the typed tempo, then saves', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    const tempo = page.getByLabel('Tempo');
    await tempo.fill('123');
    await page.keyboard.press('Control+s');
    await expect(save(page)).toBeDisabled();
    await expect(tempo).toHaveValue('123');
    await expect(tempo).toBeFocused();
});

test('Ctrl+S with nothing to save does nothing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    await expect(save(page)).toBeDisabled();
    await page.keyboard.press('Control+s');
    await expect(save(page)).toBeDisabled();
});

test('Ctrl+S on a bar with an unchosen split is refused like Save (#1980)', async ({
    page,
}, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    await typeBar(page, 1, 'Dm7 G7 C');
    await expect(page.getByRole('radiogroup', { name: 'Split the bar' })).toBeVisible();
    await page.keyboard.press('Control+s');
    await expect(save(page)).toBeEnabled();
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved');
    await expect(page.getByLabel('Chords in bar 1', { exact: true })).toBeFocused();
});

test('clicking Save keeps the focus on Save', async ({ page }) => {
    await newSong(page);
    await page.getByRole('button', { name: 'Faster' }).click();
    await expect(save(page)).toBeEnabled();
    await save(page).focus();
    await save(page).click();
    await expect(save(page)).toBeDisabled();
    await expect(save(page)).toBeFocused();
});

test('the tempo field steps on arrows, Shift by ten, inside 40–240', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    const tempo = page.getByLabel('Tempo');
    await tempo.fill('100');
    await tempo.press('Enter');
    await tempo.press('ArrowUp');
    await expect(tempo).toHaveValue('101');
    await tempo.press('ArrowDown');
    await tempo.press('ArrowDown');
    await expect(tempo).toHaveValue('99');
    await tempo.press('Shift+ArrowUp');
    await expect(tempo).toHaveValue('109');
    await tempo.press('Shift+ArrowDown');
    await tempo.press('Shift+ArrowDown');
    await expect(tempo).toHaveValue('89');
    await tempo.fill('235');
    await tempo.press('Shift+ArrowUp');
    await expect(tempo).toHaveValue('240');
    await tempo.fill('45');
    await tempo.press('Shift+ArrowDown');
    await expect(tempo).toHaveValue('40');
    // The band follows: the change is a real, committed one.
    await expect(save(page)).toBeEnabled();
});

test('Skip to chart is the first Tab stop and lands on the chart', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'laptop', 'a hardware keyboard');
    await newSong(page);
    // Focus back at the top of the page, as a fresh load or a click on the margin leaves it.
    await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
    });
    await page.keyboard.press('Tab');
    const skip = page.getByRole('button', { name: 'Skip to chart' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport({ ratio: 1 });
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Chord chart')).toBeFocused();
});
