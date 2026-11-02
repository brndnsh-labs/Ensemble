import type { Page } from '@playwright/test';
import {
    appUrl,
    barField,
    editorRevealed,
    expect,
    leaveBar,
    openBar,
    openSectionMenu,
    phoneWidth,
    test,
} from './fixtures';

/**
 * Typing the tune (#2006): `Dm7 | G7 | Cmaj7` in one bar fills it and spills into the bars after,
 * over blank ones and as new bars otherwise; Tab on a typed-in last bar adds the next; the section
 * letter's menu duplicates a section. The pieces of the codec are pinned in `lib/documents.test.ts`.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');
const chords = (page: Page) => page.locator('.sheet .chord');

test('a line of bars typed in one bar spills into new bars after it', async ({ page }) => {
    await newSong(page);
    await (await openBar(page, 1)).fill('Dm7 | G7 | Cmaj7');
    await leaveBar(page);
    // The bars behind the typed line are music, so they move down rather than being typed over.
    await expect(chords(page)).toHaveText(['Dm7', 'G7', 'Cmaj7', 'G', 'Am', 'F']);
    await expect(alert(page)).toHaveCount(0);
});

test('a line of bars is typed over blank bars first, and Undo takes the whole line back', async ({
    page,
}) => {
    await newSong(page);
    await (await openBar(page, 2)).fill('N.C.');
    await (await openBar(page, 3)).fill('N.C.');
    await (await openBar(page, 1)).fill('Dm7 | G7 | Cmaj7');
    await leaveBar(page);
    await expect(chords(page)).toHaveText(['Dm7', 'G7', 'Cmaj7', 'F']);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    // The typing comes back with it, in the bar it was typed in.
    await expect(barField(page, 1)).toHaveValue('Dm7 | G7 | Cmaj7');
    await expect(chords(page)).toHaveText(['N.C.', 'N.C.', 'F']);
});

test('a bar of a typed line that is off the grid waits for its split, and Save refuses it', async ({
    page,
}) => {
    await newSong(page);
    await (await openBar(page, 1)).fill('Dm7 | G7 Cmaj7 Am7 | Dm7');
    await page.keyboard.press('Enter');
    // Three chords do not share four counts evenly (#1980): the bar is pending until chosen.
    await expect(barField(page, 2)).toBeFocused();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(alert(page)).toContainText('Choose how the 3 chords share the bar');
});

test('Tab on a typed-in last bar adds the next bar, an untouched one does not', async ({
    page,
}) => {
    test.skip(phoneWidth(page), 'Tab is the laptop keyboard; the dock has its own ›');
    await newSong(page);
    const last = await openBar(page, 4);
    await last.press('Tab');
    await expect(chords(page)).toHaveCount(4);
    await (await openBar(page, 4)).fill('Em7');
    await last.press('Tab');
    await expect(barField(page, 5)).toHaveValue('C');
    await expect(barField(page, 5)).toBeFocused();
});

test('Duplicate section copies the bars after it and numbers the label', async ({ page }) => {
    await newSong(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Duplicate section', exact: true })
        .click();
    await expect(page.getByRole('button', { name: 'Section A2', exact: true })).toBeVisible();
    await expect(chords(page)).toHaveText(['C', 'G', 'Am', 'F', 'C', 'G', 'Am', 'F']);
    await (await openSectionMenu(page, 'A2'))
        .getByRole('button', { name: 'Duplicate section', exact: true })
        .click();
    await expect(page.getByRole('button', { name: 'Section A3', exact: true })).toBeVisible();
});

test('a 32-bar AABA, A typed once and duplicated, takes under 40 actions', async ({ page }) => {
    let actions = 0;
    const act = async <T>(step: () => Promise<T>): Promise<T> => {
        actions++;
        return step();
    };
    const tune = 'Dm7 | G7 | Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | Cmaj7';
    const bridge = 'Em7 | A7 | Dm7 | G7 | Em7 | A7 | Dm7 | G7';
    await act(async () => {
        await page.goto(appUrl());
        await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    });
    await editorRevealed(page);

    // A: the line goes into bar 1 (one action to open it, one to type it) ...
    await act(() => openBar(page, 1));
    await act(() => barField(page, 1).fill(tune));
    // ... the new song's other three bars follow it, and are cleared (open, bar menu, Delete).
    // Moving on from bar 1 applies the line and lands on the first of them, bar 9.
    await act(() =>
        phoneWidth(page)
            ? page.getByRole('button', { name: 'Next bar', exact: true }).click()
            : page.keyboard.press('Tab'),
    );
    for (let n = 0; n < 3; n++) {
        await expect(barField(page, 9)).toBeFocused();
        await act(() => page.getByRole('button', { name: 'Bar menu', exact: true }).click());
        await act(() => page.getByRole('button', { name: 'Delete bar', exact: true }).click());
        if (n < 2) {
            await act(() => openBar(page, 9));
        }
    }
    await act(() => leaveBar(page));
    await expect(chords(page)).toHaveCount(8);

    // Duplicate A twice, then the bridge goes in after A2: A A2 B A3.
    for (const label of ['A', 'A2']) {
        await act(async () => {
            await (await openSectionMenu(page, label))
                .getByRole('button', { name: 'Duplicate section', exact: true })
                .click();
        });
    }
    await act(async () => {
        await (await openSectionMenu(page, 'A2'))
            .getByRole('button', { name: 'Add section after', exact: true })
            .click();
    });
    await act(() => barField(page, 17).fill(bridge));
    await act(() => leaveBar(page));

    const sections = page.getByRole('button', { name: /^Section (A|A2|A3|B)$/ });
    await expect(sections).toHaveText(['A', 'A2', 'B', 'A3']);
    await expect(chords(page)).toHaveCount(32);
    await expect(alert(page)).toHaveCount(0);
    await act(() => page.getByRole('button', { name: 'Save', exact: true }).click());
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    expect(actions).toBeLessThan(40);
    test.info().annotations.push({ type: 'actions', description: String(actions) });
});
