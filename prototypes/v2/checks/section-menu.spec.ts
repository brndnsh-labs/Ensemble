import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * The section tap menu (#1422): a tap on the section letter opens "Start here". The section
 * practice loop that shared this menu was retired in #1528.
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

test('tapping a section letter opens a menu with Start here, and nothing that loops', async ({
    page,
}) => {
    await newTwoSectionSong(page);
    const sectionA = page.getByRole('button', {
        name: 'Section A',
        exact: true,
    });
    await expect(sectionA).toHaveAttribute('aria-expanded', 'false');
    await sectionA.click();
    await expect(sectionA).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('menu', { name: 'Section A' });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem')).toHaveText(['Start here']);
    // No shortcut starts a loop either (#1528): 'L' on the letter does nothing.
    await page.keyboard.press('Escape');
    await sectionA.press('l');
    await expect(sectionA).not.toHaveAttribute('aria-pressed');
    await expect(page.getByText('Looping', { exact: true })).toHaveCount(0);
    await sectionA.click();

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

test('Start here starts a stopped song from that section', async ({ page }) => {
    await newTwoSectionSong(page);
    const sectionB = page.getByRole('button', {
        name: 'Section B',
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
        name: 'Section B',
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

/**
 * #1460 re-review P3 — `startHereSection` re-engages Following, the same reasoning as
 * `startPlayback`: this is another way of starting playback, and a scroll while stopped (which
 * already turns Following off today) must not leave it starting unfollowed with the
 * Resume-follow pill already showing before anything has moved.
 */
test('Start here re-engages Following, even after a scroll while stopped turned it off', async ({
    page,
}) => {
    await newTwoSectionSong(page);
    await page.locator('.chart-scroll').press('PageDown');

    const sectionB = page.getByRole('button', {
        name: 'Section B',
        exact: true,
    });
    await sectionB.click();
    await page.getByRole('menuitem', { name: 'Start here', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeVisible();
    await expect(page.getByTestId('resume-follow')).toHaveCount(0);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
