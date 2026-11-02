import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';
import { appUrl, expect, exportAs, test } from './fixtures';

/** A decoded export from `tests/fixtures/ireal/`: Ladies In Mercedes, Bossa Nova, marks A-D. */
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

test('the import preview proposes the tune’s style, tempo and sections, all editable (#2004)', async ({
    page,
}) => {
    const dialog = await review(page, await fixtureLink('ladies-in-mercedes'));
    // Sections come from the rehearsal marks, not one "Chart" blob.
    await expect(dialog.getByTestId('import-sections')).toHaveText(
        'Sections: A (8) · B (8) · C (8) · D (12)',
    );
    await expect(dialog.getByLabel('Import style', { exact: true })).toHaveValue('Bossa');
    await expect(dialog.getByLabel('Import tempo', { exact: true })).toHaveValue('130');
    await expect(dialog.getByTestId('import-style-note')).toContainText(
        'iReal style “Bossa Nova”: plays as Bossa.',
    );
    // Both can be changed before adding.
    await dialog.getByLabel('Import tempo', { exact: true }).fill('112');
    await dialog.getByLabel('Import style', { exact: true }).selectOption('Jazz');
    await dialog.getByRole('button', { name: 'Add to songbook', exact: true }).click();
    await expect(dialog).not.toBeVisible();

    const downloaded = page.waitForEvent('download');
    await exportAs(page, 'Song file');
    const document = JSON.parse(
        await readFile((await (await downloaded).path())!, 'utf8'),
    ) as ChartDocument;
    expect(document.chart.band.groove.genre).toBe('Jazz');
    expect(document.chart.performance.bpm).toBe(112);
    expect(document.chart.score.sections.map((section) => section.label)).toEqual([
        'A',
        'B',
        'C',
        'D',
    ]);
});

test('a mark inside a repeat stays in its section, and the preview says why (#2004)', async ({
    page,
}) => {
    const dialog = await review(page, await fixtureLink('one-for-my-baby'));
    await expect(dialog.getByTestId('import-sections')).toHaveText('Sections: A (16) · B (31)');
    await expect(dialog.getByLabel('Import style', { exact: true })).toHaveValue('Jazz');
    await expect(dialog.getByLabel('Import tempo', { exact: true })).toHaveValue('66');
    await expect(dialog.getByLabel('Import explanations')).toContainText(
        'Rehearsal mark C at bar 33 sits inside a repeat or ending',
    );
});
