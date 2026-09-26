import { readFile } from 'node:fs/promises';
import { appUrl, expect, test } from './fixtures';

// Trading with the band (docs/design/band-engine.md, "Trading with the player"): the Trade
// button by the Soloist chip opens a sheet; the choice is saved with the chart.

async function exportedSoloist(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const saved = JSON.parse(await readFile((await (await download).path())!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return saved.chart.band.soloist;
}

test('trading with the soloist is chosen by the soloist, saved with the chart and reloaded', async ({
    page,
}) => {
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await expect(page.getByRole('button', { name: 'Soloist', exact: true })).toHaveAttribute(
        'aria-pressed',
        'false',
    );

    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Trade' });
    await expect(sheet).toBeVisible();
    // The blues drummer doesn't solo: only the soloist is offered.
    // (An <option>'s own `disabled` attribute: Playwright's enabled-state check reads the
    // select, not the option.)
    await expect(sheet.locator('option[value="drums"]')).toHaveAttribute('disabled', '');
    await expect(sheet.getByLabel('Turns')).toBeDisabled();
    await sheet.getByLabel('Trade with').selectOption('soloist');
    await sheet.getByLabel('Turns').selectOption('2');
    await sheet.getByRole('button', { name: 'Close trade' }).click();

    // Trading with the soloist turns it on; the button shows the turns.
    await expect(page.getByRole('button', { name: 'Soloist', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
    );
    const trade = page.getByRole('button', { name: 'Trade: 2 bars with the soloist' });
    await expect(trade).toHaveText('⇄ 2s');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).first().click();
    await expect(trade).toBeVisible();
    const soloist = await exportedSoloist(page);
    expect(soloist.tradeWith).toBe('soloist');
    expect(soloist.tradeBars).toBe(2);

    // Off again: the chart saves as it did before trading existed.
    await trade.click();
    await sheet.getByLabel('Trade with').selectOption('off');
    await sheet.getByRole('button', { name: 'Close trade' }).click();
    await expect(page.getByRole('button', { name: 'Trade', exact: true })).toHaveText('⇄');
    const off = await exportedSoloist(page);
    expect(off.tradeWith).toBeUndefined();
    expect(off.tradeBars).toBeUndefined();
});

test('a jazz band trades with the drummer and plays without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: 'Blue pocket Blues · Saved locally' }).click();
    await page.getByLabel('Feel', { exact: true }).selectOption('Jazz');
    await expect(page.getByLabel('Feel', { exact: true })).toBeEnabled();

    await page.getByRole('button', { name: 'Trade', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Trade' });
    await expect(sheet.locator('option[value="drums"]')).not.toHaveAttribute('disabled', '');
    await expect(sheet.locator('option[value="drums"]')).toHaveText('The drummer');
    await sheet.getByLabel('Trade with').selectOption('drums');
    await sheet.getByRole('button', { name: 'Close trade' }).click();
    await expect(page.getByRole('button', { name: 'Trade: 4 bars with the drummer' })).toHaveText(
        '⇄ 4s',
    );

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    expect(errors).toEqual([]);
});
