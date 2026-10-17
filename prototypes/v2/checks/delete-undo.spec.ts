import type { Locator, Page, TestInfo } from '@playwright/test';
import {
    appUrl,
    editorRevealed,
    expect,
    leaveBar,
    openBar,
    openSectionMenu,
    test,
} from './fixtures';

/**
 * #1758 — Delete bar and Delete section take effect at once and offer Undo in a toast for a few
 * seconds. Undo puts back the chart exactly as it was, the bar's unapplied typing included, and
 * opens the bar again. It is one snapshot, not a history: a later edit or Save retires it, and
 * so does time.
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
const undoToast = (page: Page) => page.getByTestId('stand-undo');
/** Well inside the six seconds Undo is offered for, so "gone" cannot be the toast timing out. */
const SOON = { timeout: 2000 };
const undoButton = (page: Page) =>
    undoToast(page).getByRole('button', { name: 'Undo', exact: true });

/** Every bar's chords, as the chart shows them. */
function chart(page: Page) {
    return page.locator('.sheet .bar').evaluateAll((bars) =>
        bars.map((bar) =>
            Array.from(bar.querySelectorAll('.chord'))
                .map((chord) => chord.textContent)
                .join(' '),
        ),
    );
}

/** Bar `bar` opened with `text` typed (not yet applied), then its menu's Delete bar. */
async function deleteTypedBar(page: Page, testInfo: TestInfo, bar: number, text: string) {
    const bars = page.locator('.sheet .bar');
    await press(bars.nth(bar - 1), testInfo);
    await expect(field(page, bar)).toBeFocused();
    await field(page, bar).fill(text);
    const trigger = phone(testInfo)
        ? page.locator('.bar-dock').getByRole('button', { name: 'Bar menu', exact: true })
        : bars.nth(bar - 1).getByRole('button', { name: 'Bar menu', exact: true });
    await press(trigger, testInfo);
    const menu = page.getByRole('dialog', { name: `Bar ${bar} menu`, exact: true });
    await press(menu.getByRole('button', { name: 'Delete bar', exact: true }), testInfo);
    await expect(menu).toHaveCount(0);
}

test('Undo after Delete bar puts back the chart, the bar’s typing, and the open bar', async ({
    page,
}, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const bars = page.locator('.sheet .bar');
    const before = await chart(page);
    expect(before).toHaveLength(32);
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true');

    await deleteTypedBar(page, testInfo, 7, 'Gm7 C7');
    await expect(bars).toHaveCount(31);
    // The bar before opens, as a delete always did; the toast offers Undo.
    await expect(field(page, 6)).toBeFocused();
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'false');
    await expect(undoToast(page)).toContainText('Bar 7 deleted');

    await press(undoButton(page), testInfo);
    await expect(bars).toHaveCount(32);
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    // Bar 7 is open again with what was typed in it, still pending — not applied, not lost.
    await expect(field(page, 7)).toBeFocused();
    await expect(field(page, 7)).toHaveValue('Gm7 C7');
    await expect(bars.nth(6)).toHaveClass(/\bpending\b/);
    // Esc puts back the bar's applied text: the chart under the typing is exactly as it was.
    await page.keyboard.press('Escape');
    await expect(field(page, 7)).toHaveCount(0);
    expect(await chart(page)).toEqual(before);
});

test('Undo after Delete section puts the section back', async ({ page }, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    const letters = page.locator('.section-letter');
    const sections = await letters.allTextContents();
    const before = await chart(page);
    expect(sections).toContain('B');

    const menu = await openSectionMenu(page, 'B');
    await press(menu.getByRole('button', { name: 'Delete section', exact: true }), testInfo);
    await expect(letters).toHaveCount(sections.length - 1);
    await expect(undoToast(page)).toContainText('Section B deleted');

    // From the keyboard on a laptop, so the focused Undo button itself goes away under focus.
    if (phone(testInfo)) {
        await undoButton(page).tap();
    } else {
        await undoButton(page).focus();
        await page.keyboard.press('Enter');
    }
    await expect(letters).toHaveText(sections);
    expect(await chart(page)).toEqual(before);
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    // Focus lands on the section that came back, not on the page.
    await expect(page.getByRole('button', { name: 'Section B', exact: true })).toBeFocused();
});

test('Undo on a new song survives its first-change keep, and puts the song back', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    // The delete is the song's first change, which keeps it (#1707) after a short pause.
    await openBar(page, 2);
    await page.getByRole('button', { name: 'Bar menu', exact: true }).click();
    await page.getByRole('button', { name: 'Delete bar', exact: true }).click();
    await expect(page.locator('.bar')).toHaveCount(3);
    await expect(page.locator('.song-subtitle')).toContainText('Unsaved changes');
    await expect
        .poll(() =>
            page.evaluate(
                () =>
                    new Promise<number>((resolve) => {
                        const request = indexedDB.open('ensemble-v2-preview', 1);
                        request.onsuccess = () => {
                            const db = request.result;
                            const store = db.transaction('documents').objectStore('documents');
                            const count = store.count();
                            count.onsuccess = () => {
                                db.close();
                                resolve(count.result);
                            };
                        };
                    }),
            ),
        )
        .toBe(1);
    // The keep lands on the stand just after its write (a new revision on the chart).
    await page.waitForTimeout(500);
    // Kept is not an edit: the offer is still up.
    await expect(undoToast(page)).toContainText('Bar 2 deleted');
    await undoButton(page).click();
    await expect(page.locator('.bar')).toHaveCount(4);
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    // Back to the song as kept: its four bars, nothing unsaved.
    await leaveBar(page);
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await expect(page.locator('.song-subtitle')).not.toContainText('Unsaved changes');
});

test('Undo goes after a few seconds', async ({ page }, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    await deleteTypedBar(page, testInfo, 7, 'Gm7 C7');
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'false');
    // Offered for six seconds (`DELETE_UNDO_MS`), then gone.
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', { timeout: 9000 });
    await expect(page.locator('.sheet .bar')).toHaveCount(31);
});

test('a later edit retires Undo, even one taken back', async ({ page }, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    await deleteTypedBar(page, testInfo, 7, 'Gm7 C7');
    await expect(field(page, 6)).toBeFocused();
    await expect(undoButton(page)).toBeVisible();

    // Typing in the bar that opened is an edit: Undo would throw it away, so it is gone.
    await page.keyboard.type(' C7');
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    // Taking the typing back does not bring it back: the snapshot is spent. (The chart is what
    // the delete left again, so only the retired snapshot keeps the toast empty.)
    await page.keyboard.press('Escape');
    await expect(field(page, 6)).toHaveCount(0);
    await expect(page.locator('.sheet .bar').nth(5)).not.toHaveClass(/\bpending\b/);
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    await expect(page.locator('.sheet .bar')).toHaveCount(31);
});

test('Save retires Undo', async ({ page }, testInfo) => {
    await editAutumnLeaves(page, testInfo);
    await deleteTypedBar(page, testInfo, 7, 'Gm7 C7');
    await expect(undoButton(page)).toBeVisible();
    // A standard is kept with "Keep a copy": its Save.
    await press(page.getByRole('button', { name: 'Keep a copy', exact: true }), testInfo);
    await expect(page.locator('.song-subtitle')).toContainText('Saved on this device');
    await expect(undoToast(page)).toHaveAttribute('data-empty', 'true', SOON);
    await expect(page.locator('.sheet .bar')).toHaveCount(31);
});
