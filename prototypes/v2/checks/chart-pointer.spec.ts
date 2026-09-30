import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * #1240 — the chart pointer is painted from the playhead every animation frame, so even a chord
 * one sixteenth long at the fastest tempo (62.5ms at 240 bpm) is lit. When the pointer was a
 * 60ms sample of a 50ms sample, a chord that short could fall between two samples and never show.
 */
test('a sixteenth-note chord at 240 bpm is painted', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Sixteenths');
    // Sixteen chords share the first 4/4 bar equally: one step each.
    const names = 'C Db D Eb E F Gb G Ab A Bb B C7 D7 E7 F7'.split(' ');
    await page.getByLabel('Chords in this bar').fill(names.join(' '));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await expect(page.locator('.chord').first()).toHaveText('C');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');

    await page.evaluate(() => {
        const painted: number[] = [];
        (window as unknown as { painted: number[] }).painted = painted;
        new MutationObserver(() => {
            const start = document
                .querySelector('.chord[aria-current="true"]')
                ?.getAttribute('data-start-step');
            if (start !== null && start !== undefined && painted.at(-1) !== Number(start)) {
                painted.push(Number(start));
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-current', 'data-start-step'],
        });
    });
    const painted = () => page.evaluate(() => (window as unknown as { painted: number[] }).painted);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    // The second lap's first bar: past playback's start-up, which on a loaded WebKit can stall
    // outside any script while audio comes up (`expectVisitsFollowForm`'s `firstLapDrops`).
    const secondLap = (trail: number[]) => {
        const lapOneBarTwo = trail.indexOf(16);
        const from = lapOneBarTwo < 0 ? -1 : trail.indexOf(0, lapOneBarTwo);
        const to = from < 0 ? -1 : trail.indexOf(16, from);
        return to < 0 ? null : trail.slice(from, to);
    };
    await expect
        .poll(async () => secondLap(await painted()) !== null, { timeout: 30_000 })
        .toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();

    expect(secondLap(await painted())).toEqual(names.map((_, step) => step));
});
