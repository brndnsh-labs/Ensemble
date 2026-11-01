import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { appUrl, expect, test } from './fixtures';

async function fixtureLink(slug: string): Promise<string> {
    const path = resolve(__dirname, '../../tests/fixtures/ireal');
    return (await readFile(`${path}/${slug}.txt`, 'utf8')).trim();
}

async function review(page: Page, link: string) {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Import chart', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^(Import a chart|Review import)$/ });
    await dialog.getByText('Or paste an iReal link', { exact: true }).click();
    await dialog.getByLabel('iReal link', { exact: true }).fill(link);
    await dialog.getByRole('button', { name: 'Review link', exact: true }).click();
    return dialog;
}

test('a chart with signs the band will not take says so first, and the stand greys them (#2005)', async ({
    page,
}) => {
    const dialog = await review(page, await fixtureLink('round-midnight'));
    const sentence = dialog.getByTestId('import-ignored-signs');
    await expect(sentence).toHaveText(
        "The band plays straight through and loops; it won't take the D.S. al 2nd ending.",
    );
    // It is the first thing under the song's title, ahead of the bar count.
    const summary = dialog.getByRole('region', { name: 'Import preview' });
    await expect(summary.locator('> *').nth(1)).toHaveAttribute(
        'data-testid',
        'import-ignored-signs',
    );
    await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
    await expect(dialog).not.toBeVisible();

    const ignored = page.locator('.sign-ignored');
    await expect(ignored).toHaveCount(3);
    await expect(ignored.first()).toHaveAttribute('title', /doesn't take this sign/);
    await expect(ignored.first().locator('.sr-only')).toHaveText(/band does not take this sign/);
});

test('a chart without such signs gets no sentence', async ({ page }) => {
    const dialog = await review(page, await fixtureLink('autumn-leaves'));
    await expect(dialog.getByRole('region', { name: 'Import preview' })).toBeVisible();
    await expect(dialog.getByTestId('import-ignored-signs')).toHaveCount(0);
});
