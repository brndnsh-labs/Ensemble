import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { ChartDocumentV2 } from '../../../public/songbook/score-types';
import { appUrl, editorRevealed, expect, test } from './fixtures';

async function exportCurrent(page: Page): Promise<ChartDocumentV2> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const path = await (await downloaded).path();
    const document = JSON.parse(await readFile(path!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return document;
}

async function importFile(page: Page, document: ChartDocumentV2) {
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'holds.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(document)),
    });
}

/**
 * A chart the old engine refused — a held bar, an N.C. bar, and a last bar of half-note
 * triplets whose final chord carries a fermata — opens, draws, plays and loops on the band.
 */
test('the band engine opens and plays holds, N.C., fermatas and off-grid lengths', async ({
    page,
}) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    // Author a plain four-bar song, then write the semantics the bar editor can't type.
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Held and free');
    for (const [i, text] of ['C', 'F', 'G7', 'C'].entries()) {
        await page.getByLabel('Chords in this bar').fill(text);
        if (i < 3) {
            await page.getByRole('button', { name: 'Next bar', exact: true }).click();
        }
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    const plain = await exportCurrent(page);
    const held = structuredClone(plain);
    const bars = held.chart.score.sections[0].measures;
    bars[1].content = { kind: 'events', events: [{ kind: 'hold', duration: [4, 1] }] };
    bars[2].content = { kind: 'events', events: [{ kind: 'no-chord', duration: [4, 1] }] };
    bars[3].content = {
        kind: 'events',
        events: [
            { kind: 'chord', symbol: 'Dm7', duration: [4, 3] },
            { kind: 'chord', symbol: 'G7', duration: [4, 3] },
            { kind: 'chord', symbol: 'C', duration: [4, 3], fermata: true },
        ],
    };
    held.title = 'Held and free (semantics)';
    const ids = bars.map((bar) => bar.id);

    // The band opens it and draws each event the way the chart reads.
    await importFile(page, held);
    await expect(page.locator('.song-title')).toHaveText('Held and free (semantics)');
    await expect(page.locator('.error-banner')).toHaveCount(0);
    const sheetBars = page.locator('.sheet .bar');
    await expect(sheetBars).toHaveCount(4);
    await expect(sheetBars.nth(0).locator('.chord')).toHaveText(['C']);
    await expect(sheetBars.nth(1).locator('.chord')).toHaveText(['/']);
    await expect(sheetBars.nth(1).locator('.chord')).toHaveAccessibleName('Hold the chord before');
    await expect(sheetBars.nth(2).locator('.chord')).toHaveText(['N.C.']);
    await expect(sheetBars.nth(3).locator('.chord')).toHaveText(['Dm7', 'G7', '𝄐C']);
    await expect(sheetBars.nth(3).locator('.chord').nth(2)).toHaveAccessibleName(
        'Audition C, with a fermata',
    );
    await expect(sheetBars.nth(3).locator('.fermata')).toHaveCount(1);

    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    // Practice-loop the section: on the band engine the loop window comes from the timeline.
    await page.locator('.section-letter').first().press('l');
    await expect(page.locator('.section-loop.active')).toBeVisible();

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    // Follow the highlighted bar until the loop has come back round to the top twice.
    const visits: string[] = [];
    await expect
        .poll(
            async () => {
                const id = await page
                    .locator('.sheet .bar[data-active="true"]')
                    .first()
                    .getAttribute('data-measure-id', { timeout: 100 })
                    .catch(() => null);
                if (id !== null && visits.at(-1) !== id) {
                    visits.push(id);
                }
                return visits.filter((v, i) => v === ids[0] && i > 0).length;
            },
            { timeout: 40_000, intervals: [50], message: `bar visits: ${visits.join(' ')}` },
        )
        .toBeGreaterThanOrEqual(2);
    // Every bar, the held and silent ones included, lit in written order on each lap.
    const laps = visits.slice(visits.indexOf(ids[0]), visits.lastIndexOf(ids[0]));
    expect(laps).toEqual([...ids, ...ids]);

    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await expect(page.locator('.chord[aria-current="true"]')).toHaveCount(0);
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // Editing is open to them too: type a hold into a bar, then save the chart.
    await page.getByRole('button', { name: 'Edit chart', exact: true }).click();
    await page.getByRole('button', { name: 'Edit bar 3', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Chords in this bar').fill('F /');
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await expect(sheetBars.nth(2).locator('.chord')).toHaveText(['F', '/']);

    // The last bar's own fermata (authored by the import, not the UI) is no longer read-only:
    // its chords stay editable text, and the toggle reflects and can clear the flag.
    await page.getByRole('button', { name: 'Edit bar 4', exact: true }).click();
    await editorRevealed(page);
    const fermataToggle = page.getByLabel('Fermata (hold the last chord)', { exact: true });
    await expect(fermataToggle).toBeChecked();
    await expect(page.getByLabel('Chords in this bar')).toBeEditable();
    await fermataToggle.uncheck();
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await expect(sheetBars.nth(3).locator('.chord')).toHaveText(['Dm7', 'G7', 'C']);
    await expect(sheetBars.nth(3).locator('.fermata')).toHaveCount(0);

    // Setting it again, through the toggle alone, puts the 𝄐 back without retyping the chords.
    await page.getByRole('button', { name: 'Edit bar 4', exact: true }).click();
    await editorRevealed(page);
    await expect(fermataToggle).not.toBeChecked();
    await fermataToggle.check();
    await page.getByRole('button', { name: 'Update chart', exact: true }).click();
    await expect(sheetBars.nth(3).locator('.chord')).toHaveText(['Dm7', 'G7', '𝄐C']);
    await expect(sheetBars.nth(3).locator('.fermata')).toHaveCount(1);

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.locator('.error-banner')).toHaveCount(0);
    expect(errors).toEqual([]);
});

/**
 * First and second endings on the stand while the band plays: the chart keeps its four written
 * bars (no unrolled copy, no sideways scroll), and the lit bar walks the performed route —
 * 1, 2, 3, then 1, 2, 4 — lap after lap.
 */
test('repeats and endings: the stand keeps its written bars while the band walks the route', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Two endings study');
    await page.getByRole('button', { name: 'Repeats and endings', exact: true }).click();
    const guide = page.getByRole('dialog', { name: 'Repeats and endings', exact: true });
    await guide.getByLabel('Repeated body end bar').selectOption({ value: '1' });
    await guide.getByRole('button', { name: 'Add first and second endings', exact: true }).click();
    await expect(guide.getByTestId('guided-playback-route')).toHaveText('1–2–3 → 1–2–4');
    await guide.getByRole('button', { name: 'Apply', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    const bars = page.locator('.sheet .bar');
    await expect(bars).toHaveCount(4);
    await expect(page.locator('.sheet .chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await expect(page.getByLabel('Ending passes 1', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ending passes 2', { exact: true })).toBeVisible();
    const written = await bars.evaluateAll((all) =>
        all.map((bar) => bar.getAttribute('data-measure-id') ?? ''),
    );

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    const visits: string[] = [];
    await expect
        .poll(
            async () => {
                const id = await page
                    .locator('.sheet .bar[data-active="true"]')
                    .first()
                    .getAttribute('data-measure-id', { timeout: 100 })
                    .catch(() => null);
                if (id !== null && visits.at(-1) !== id) {
                    visits.push(id);
                }
                // Two whole laps of the six-bar route after the first bar-1 visit.
                const first = visits.indexOf(written[0]);
                return first < 0 ? 0 : visits.length - first;
            },
            { timeout: 40_000, intervals: [50], message: `bar visits: ${visits.join(' ')}` },
        )
        .toBeGreaterThanOrEqual(13);
    // Still the four written bars, in place, with nothing scrolling sideways.
    await expect(bars).toHaveCount(4);
    expect(
        await bars.evaluateAll((all) => all.map((bar) => bar.getAttribute('data-measure-id'))),
    ).toEqual(written);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();

    // The route, from the first full lap on: 1 2 3, then 1 2 4.
    const [one, two, three, four] = written;
    const route = [one, two, three, one, two, four];
    const start = visits.indexOf(one);
    const lap = visits.slice(start, start + route.length * 2);
    expect(lap).toEqual([...route, ...route]);
    expect(errors).toEqual([]);
});
