import type { Page } from '@playwright/test';
import {
    appUrl,
    barField,
    editorRevealed,
    expect,
    leaveBar,
    openSectionMenu,
    test,
} from './fixtures';

/**
 * Removing a section (#1373): the section letter's Delete section (#1726). The rules — context
 * hand-off and the refusals — are pinned in `lib/documents.test.ts`; this proves the menu reaches
 * them. The bar menu's Delete bar is exercised in `delete-undo.spec.ts`.
 */
async function newSong(page: Page) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
}

const alert = (page: Page) => page.locator('.error-banner[role="alert"]');

test('removing the only section is refused with a message and changes nothing', async ({
    page,
}, testInfo) => {
    test.skip(
        testInfo.project.name !== 'laptop',
        "the refusal is browser-independent; WebKit covers the section menu's Delete section in 'deleting a middle section puts focus on the section before it'",
    );
    await newSong(page);

    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Delete section', exact: true })
        .click();

    await expect(alert(page)).toContainText(
        'A chart needs at least one section. Change its bars instead.',
    );
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
});

test('a removed section goes with its bars', async ({ page }, testInfo) => {
    test.skip(
        testInfo.project.name !== 'laptop',
        "the section's removal is browser-independent; WebKit covers the section menu's Delete section in 'deleting a middle section puts focus on the section before it'",
    );
    await newSong(page);
    await (await openSectionMenu(page, 'A'))
        .getByRole('button', { name: 'Add section after', exact: true })
        .click();
    // The new section's one bar opens for typing, its tonic selected.
    await expect(barField(page, 5)).toHaveValue('C');
    await leaveBar(page);
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F', 'C']);

    await (await openSectionMenu(page, 'B'))
        .getByRole('button', { name: 'Delete section', exact: true })
        .click();

    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
    // The bar before the removed section is the one selected.
    await expect(page.locator('.bar').nth(3)).toHaveClass(/\bselected\b/);
    await expect(alert(page)).toHaveCount(0);
});
