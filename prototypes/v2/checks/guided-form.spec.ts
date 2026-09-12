import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import type { ChartDocument } from '../lib/documents';

async function start(page: Page, title = 'Guided study') {
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C');
    await page.getByLabel('Song title').fill(title);
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
}
async function openGuide(page: Page) {
    await page.getByRole('button', { name: 'Repeats and endings', exact: true }).click();
    return page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
}
async function exported(page: Page): Promise<ChartDocument> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const result = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return result;
}
async function createEndings(page: Page) {
    const dialog = await openGuide(page);
    await dialog.getByLabel('Repeated body end bar').selectOption({ value: '1' });
    await dialog.getByRole('button', { name: 'Add first and second endings', exact: true }).click();
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–4');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(dialog).not.toBeVisible();
}

test('keyboard range selection creates, edits and removes a repeat; cancel keeps pending chords', async ({
    page,
}) => {
    await start(page);
    await page.getByLabel('Chords in this bar').fill('Dm');
    let dialog = await openGuide(page);
    await dialog.getByRole('button', { name: 'Select bar 1', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(dialog.getByLabel('Repeated body end bar')).toHaveValue('2');
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–3–4');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('Dm');
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
    dialog = await openGuide(page);
    await dialog.getByLabel('Repeated body end bar').selectOption({ value: '1' });
    await dialog.getByLabel('Play times total').fill('3');
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2 → 1–2 → 1–2–3–4');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('.bar .chord')).toHaveText(['Dm', 'G', 'Am', 'F']);
    await expect(
        page.locator('.bar').nth(1).getByLabel('End repeat, 3 total passes', { exact: true }),
    ).toBeVisible();
    dialog = await openGuide(page);
    await dialog.getByRole('button', { name: 'Edit repeat · bars 1–2', exact: true }).click();
    await dialog.getByLabel('Repeated body start bar').selectOption({ value: '1' });
    await dialog.getByLabel('Repeated body end bar').selectOption({ value: '2' });
    await dialog.getByLabel('Play times total').fill('2');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(
        page.locator('.bar').nth(1).getByLabel('Start repeat', { exact: true }),
    ).toBeVisible();
    dialog = await openGuide(page);
    await dialog.getByRole('button', { name: 'Edit repeat · bars 2–3', exact: true }).click();
    await dialog.getByRole('button', { name: 'Remove form markers', exact: true }).click();
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3–4');
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(page.locator('.bar.repeat-start')).toHaveCount(0);
    await expect(page.locator('.bar .chord')).toHaveText(['Dm', 'G', 'Am', 'F']);
});

test('touch-sized ending ranges reject overlap and reverse order before Apply, including tablet layout', async ({
    page,
}, info) => {
    await start(page);
    const dialog = await openGuide(page);
    const choose = async (bar: number) => {
        const button = dialog.getByRole('button', { name: `Select bar ${bar}`, exact: true });
        const bounds = await button.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        if (info.project.name === 'webkit-phone') {
            await button.tap();
        } else {
            await button.click();
        }
    };
    await choose(1);
    await choose(2);
    await dialog.getByRole('button', { name: 'Add first and second endings', exact: true }).click();
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–4');
    await dialog.getByLabel('First ending start bar').selectOption({ value: '1' });
    await expect(dialog.getByRole('alert')).toContainText('no gaps or overlaps');
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await dialog.getByLabel('First ending start bar').selectOption({ value: '3' });
    await expect(dialog.getByRole('alert')).toContainText('written order');
    await dialog.getByRole('button', { name: 'Select first ending bars', exact: true }).click();
    await choose(3);
    await choose(3);
    await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–4');
    for (const button of await dialog.locator('.guided-ranges button').all()) {
        expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
            true,
        );
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.screenshot({ path: info.outputPath('guided-endings.png'), fullPage: true });
    await page.setViewportSize({ width: 820, height: 1180 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.setViewportSize({ width: 874, height: 402 });
    await dialog.getByRole('button', { name: 'Apply', exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeInViewport();
    await page.screenshot({
        path: info.outputPath('guided-landscape-actions.png'),
        fullPage: true,
    });
    await dialog.getByRole('button', { name: 'Apply', exact: true }).click();
    const next = await openGuide(page);
    await next.getByLabel('Repeated body end bar').selectOption({ value: '1' });
    await expect(next.getByRole('alert')).toContainText('overlap an existing repeat');
    await expect(next.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await next.getByRole('button', { name: 'Cancel', exact: true }).click();
});

test('guided endings survive save, copy, export, transpose, Revert and offline reopen', async ({
    page,
    context,
    browserName,
    request,
}) => {
    await start(page, 'Guided offline');
    await createEndings(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const source = await exported(page);
    if (source.schemaVersion !== 2) {
        throw new Error('Expected semantic chart');
    }
    const bars = source.chart.score.sections[0].measures;
    expect(bars).toHaveLength(4);
    expect(bars[2].start).toEqual([{ kind: 'ending-start', passes: [1] }]);
    expect(bars[3].end).toEqual([{ kind: 'ending-end' }]);
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Save a copy', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    const copy = await exported(page);
    expect(copy.id).not.toBe(source.id);
    expect(copy.chart).toEqual(source.chart);
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await expect(page.locator('.bar .chord')).toHaveText(['D', 'A', 'Bm', 'G']);
    await page.getByRole('button', { name: 'Song actions' }).click();
    await page.getByRole('button', { name: 'Revert to saved', exact: true }).click();
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await page.getByLabel('Key', { exact: true }).selectOption('D');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect
        .poll(() => page.evaluate(() => navigator.serviceWorker.controller?.scriptURL))
        .toContain('/v2/sw.js');
    try {
        if (browserName === 'webkit') {
            expect((await request.post('/__test/network?offline=1')).ok()).toBe(true);
            await expect(request.get('/v2/not-cached', { timeout: 3000 })).rejects.toThrow();
        } else {
            await context.setOffline(true);
        }
        await page.reload();
        await page
            .getByRole('button', {
                name: new RegExp(`^♪ ${copy.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} `),
            })
            .click();
        await expect(page.locator('.bar .chord')).toHaveText(['D', 'A', 'Bm', 'G']);
        await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
        const dialog = await openGuide(page);
        await dialog.getByRole('button', { name: 'Edit endings · bars 1–4', exact: true }).click();
        await expect(dialog.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–4');
    } finally {
        if (browserName === 'webkit') {
            await request.post('/__test/network?offline=0');
        }
    }
});

test('opening the guide preserves complex forms and failed validation retains pending chord text', async ({
    page,
}) => {
    await start(page);
    const source = await exported(page);
    if (source.schemaVersion !== 2) {
        throw new Error('Expected semantic chart');
    }
    const bars = source.chart.score.sections[0].measures;
    bars[0].start = [{ kind: 'repeat-start' }];
    bars[1].start = [{ kind: 'repeat-start' }];
    bars[2].end = [{ kind: 'repeat-end', times: 2 }];
    bars[3].end = [{ kind: 'repeat-end', times: 2 }];
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'nested.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(source)),
    });
    await expect(page.getByRole('button', { name: 'Song actions' })).toBeEnabled();
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    const dialog = await openGuide(page);
    await expect(dialog.getByRole('alert')).toContainText('nested or nonstandard');
    await expect(dialog.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByText('Advanced · per-bar repeat and ending markers', { exact: true }).click();
    await expect(page.getByLabel('Start repeat here', { exact: true })).toBeChecked();
    expect((await exported(page)).chart).toEqual(source.chart);
    await start(page, 'Pending validation');
    await page.getByLabel('Chords in this bar').fill('C Dm G7');
    const invalid = await openGuide(page);
    await expect(invalid.getByRole('alert')).toContainText(/grid|step|duration/i);
    await expect(invalid.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
    await invalid.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByLabel('Chords in this bar')).toHaveValue('C Dm G7');
    await expect(page.locator('.bar .chord')).toHaveText(['C', 'G', 'Am', 'F']);
});
