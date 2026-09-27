import type { Page } from '@playwright/test';
import type {
    ChartDocumentV2,
    ScoreDirection,
    ScoreMeasure,
} from '../../../public/songbook/score-types';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * Following's look-ahead scroll (#1458): a look-ahead row scroll, a next-bar cue that strengthens
 * on the playing bar's last beat, and a jump-ahead scroll across a repeat/loop/practice-loop wrap.
 * `app/ensemble.tsx`'s Following effects, `app/chart-sheet.tsx`'s `data-next`/bar-span attributes,
 * and `app/use-chart-view.ts`'s `displayNext` are the surfaces under test.
 */

async function exportCurrent(page: Page): Promise<ChartDocumentV2> {
    await page.getByRole('button', { name: 'Song actions' }).click();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export file', exact: true }).click();
    const path = await (await downloaded).path();
    const { readFile } = await import('node:fs/promises');
    const document = JSON.parse(await readFile(path!, 'utf8'));
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    return document;
}

async function importFile(page: Page, document: ChartDocumentV2) {
    await page.getByLabel('Import Ensemble document').setInputFiles({
        name: 'lookahead.ensemble',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(document)),
    });
}

function chordBar(id: string, start?: ScoreDirection[], end?: ScoreDirection[]): ScoreMeasure {
    return {
        id,
        content: { kind: 'events', events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }] },
        ...(start ? { start } : {}),
        ...(end ? { end } : {}),
    };
}

/**
 * A three-section chart, tall enough to overflow `.chart-scroll` on both projects: section A
 * repeats (a genuine `repeat-end`, no endings — Touches #2's first scenario), section B is 40
 * plain bars (the "longer than the viewport" body), section C is 3 bars right before the form
 * wraps back to bar 1 (Touches #2's second and third scenarios, and the "bar 1 in view before
 * the band reaches it" acceptance item) — short on purpose, so a test can reach its last bar,
 * and the wrap past it, in a couple of seconds rather than a full 47-bar lap. Tempo 240 (the
 * app's max) keeps every wait in this file to a few seconds per bar.
 */
async function buildLookaheadChart(page: Page): Promise<void> {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Lookahead study');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('C');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('C');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    const document = await exportCurrent(page);
    const score = document.chart.score;
    score.sections[0].measures = [
        chordBar('A1', [{ kind: 'repeat-start' }]),
        chordBar('A2'),
        chordBar('A3'),
        chordBar('A4', undefined, [{ kind: 'repeat-end', times: 2 }]),
    ];
    score.sections[1].measures = Array.from({ length: 40 }, (_, i) => chordBar(`B${i + 1}`));
    score.sections[2].measures = Array.from({ length: 3 }, (_, i) => chordBar(`C${i + 1}`));
    document.title = 'Lookahead study (long)';

    await importFile(page, document);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.sheet .bar')).toHaveCount(47);
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
}

function sectionLetter(page: Page, label: string) {
    return page.getByRole('button', {
        name: `Section ${label} · hold to practice-loop`,
        exact: true,
    });
}

async function startHere(page: Page, sectionLabel: string) {
    await sectionLetter(page, sectionLabel).click();
    await page.getByRole('menuitem', { name: 'Start here', exact: true }).click();
}

/** Every `Element.scrollTo` call for the rest of the test, with the behavior it asked for. */
async function trackScrollCalls(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as {
            __scrollCalls: { cls: string; behavior?: string; top?: number }[];
        };
        w.__scrollCalls = [];
        const orig = Element.prototype.scrollTo;
        type Patchable = { scrollTo: (opts?: unknown) => void };
        (Element.prototype as unknown as Patchable).scrollTo = function (
            this: Element,
            opts?: unknown,
        ) {
            if (opts && typeof opts === 'object') {
                const o = opts as { behavior?: string; top?: number };
                w.__scrollCalls.push({
                    cls: (this as HTMLElement).className,
                    behavior: o.behavior,
                    top: o.top,
                });
            }
            return (orig as (opts?: unknown) => void).call(this, opts);
        };
    });
}

function scrollCalls(page: Page) {
    return page.evaluate(
        () =>
            (window as unknown as { __scrollCalls: { cls: string; behavior?: string }[] })
                .__scrollCalls,
    );
}

/** One playback sample: the active/next bars' measure ids, how many bars carry `data-next`, and
 * whether the bar right after the active one (in document order) is fully inside `.chart-scroll`. */
async function sampleChart(page: Page) {
    return page.evaluate(() => {
        const scrollEl = document.querySelector('.chart-scroll');
        const bars = Array.from(document.querySelectorAll('.bar'));
        const active = document.querySelector('.bar[data-active="true"]');
        const nextEls = document.querySelectorAll('.bar[data-next]');
        const activeId = active?.getAttribute('data-measure-id') ?? null;
        const nextId = nextEls[0]?.getAttribute('data-measure-id') ?? null;
        const fits = scrollEl ? scrollEl.scrollHeight <= scrollEl.clientHeight + 1 : true;
        let rowVisible = true;
        if (scrollEl && active) {
            const idx = bars.indexOf(active);
            const domNext = bars[idx + 1];
            if (domNext && !fits) {
                const sr = scrollEl.getBoundingClientRect();
                const nr = domNext.getBoundingClientRect();
                rowVisible = nr.top >= sr.top - 0.5 && nr.bottom <= sr.bottom + 0.5;
            }
        }
        return { activeId, nextId, nextCount: nextEls.length, fits, rowVisible };
    });
}

function inView(page: Page, measureId: string) {
    return page.evaluate((id) => {
        const scrollEl = document.querySelector('.chart-scroll');
        const el = document.querySelector(`.bar[data-measure-id="${id}"]`);
        if (!scrollEl || !el) {
            return false;
        }
        const sr = scrollEl.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        return er.top >= sr.top - 0.5 && er.bottom <= sr.bottom + 0.5;
    }, measureId);
}

/** Poll until `active`/`next` match, or fail after `timeoutMs`. */
async function waitForActiveNext(
    page: Page,
    activeId: string,
    nextId: string,
    timeoutMs = 15_000,
): Promise<{ nextCount: number }> {
    const deadline = Date.now() + timeoutMs;
    let last: Awaited<ReturnType<typeof sampleChart>> | null = null;
    while (Date.now() < deadline) {
        const sample = await sampleChart(page);
        last = sample;
        if (sample.activeId === activeId && sample.nextId === nextId) {
            return { nextCount: sample.nextCount };
        }
        await page.waitForTimeout(60);
    }
    throw new Error(
        `never saw active=${activeId} next=${nextId}; last sample was ${JSON.stringify(last)}`,
    );
}

test('the row after the playing row stays fully visible on every bar change', async ({ page }) => {
    test.setTimeout(75_000);
    await buildLookaheadChart(page);
    await startHere(page, 'B');
    const violations: string[] = [];
    let lastId: string | null = null;
    // Section B is 40 bars — enough to sample many row changes without waiting for a full lap.
    const deadline = Date.now() + 42_000;
    while (Date.now() < deadline) {
        const sample = await sampleChart(page);
        if (sample.activeId !== lastId) {
            lastId = sample.activeId;
            if (!sample.rowVisible) {
                violations.push(sample.activeId ?? '(null)');
            }
            expect(sample.nextCount, `exactly one bar should carry data-next`).toBeLessThanOrEqual(
                1,
            );
        }
        if (sample.activeId === 'B38') {
            break; // Enough of section B sampled; stop short of the C hand-off's own jump rule.
        }
        await page.waitForTimeout(80);
    }
    expect(violations, 'the next row should stay fully visible at every bar change').toEqual([]);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next resolves across a repeat, then moves on once the repeat is done', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'A');
    const firstPass = await waitForActiveNext(page, 'A4', 'A1');
    expect(firstPass.nextCount).toBe(1);
    const secondPass = await waitForActiveNext(page, 'A4', 'B1');
    expect(secondPass.nextCount).toBe(1);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next wraps to bar 1 at the form loop, and bar 1 is in view before the band reaches it', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'C');
    const atFormEnd = await waitForActiveNext(page, 'C3', 'A1');
    expect(atFormEnd.nextCount).toBe(1);
    // The jump-ahead fires on C3's last beat, before the band actually reaches A1 — poll until
    // either A1 comes into view (success) or playback has already moved past C3 (too late).
    const deadline = Date.now() + 10_000;
    let sawA1InView = false;
    for (;;) {
        if (await inView(page, 'A1')) {
            sawA1InView = true;
            break;
        }
        const sample = await sampleChart(page);
        if (sample.activeId !== 'C3' || Date.now() > deadline) {
            break;
        }
        await page.waitForTimeout(60);
    }
    expect(sawA1InView, 'bar 1 should be visible before playback reaches it').toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next wraps inside an active practice loop instead of the form loop', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'C');
    // Arm the loop on C while already inside it (long-press, the same gesture as #1211/#1422).
    // No need to wait for a specific bar first: "Start here" already positions playback inside
    // C, and the long-press itself takes 600ms, plenty of settling time.
    await sectionLetter(page, 'C').click({ delay: 600 });
    await expect(sectionLetter(page, 'C')).toHaveAttribute('aria-pressed', 'true');
    const looped = await waitForActiveNext(page, 'C3', 'C1');
    expect(looped.nextCount).toBe(1);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('a chart that fits never scrolls', async ({ page }) => {
    await trackScrollCalls(page);
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    // The default new song is already saveable state with nothing dirty, so Save starts
    // disabled — go straight to the chart.
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const scrollEl = page.locator('.chart-scroll');
    expect(
        await scrollEl.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
        'the fixture should actually fit for this to be a meaningful check',
    ).toBe(true);
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await page.waitForTimeout(3_000);
    expect(await scrollEl.evaluate((el) => el.scrollTop)).toBe(0);
    expect((await scrollCalls(page)).filter((c) => c.cls === 'chart-scroll')).toEqual([]);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('reduced motion scrolls instantly, not smoothly', async ({ page }) => {
    await trackScrollCalls(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await buildLookaheadChart(page);
    await startHere(page, 'B');
    await page.waitForTimeout(6_000); // several row changes on both projects' column counts
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    const rowScrolls = (await scrollCalls(page)).filter((c) => c.cls === 'chart-scroll');
    expect(rowScrolls.length, 'the look-ahead should have scrolled at least once').toBeGreaterThan(
        0,
    );
    for (const call of rowScrolls) {
        expect(call.behavior).toBe('auto');
    }
});

test('the next-bar cue reads distinctly in both themes (screenshots for review)', async ({
    page,
}, testInfo) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'A');
    // A2/A3 are close together and both stay on screen without any scrolling ambiguity.
    await waitForActiveNext(page, 'A2', 'A3');
    await expect(page.locator('.bar[data-next]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('next-cue-day.png') });
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stage');
    await page.screenshot({ path: testInfo.outputPath('next-cue-stage.png') });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
