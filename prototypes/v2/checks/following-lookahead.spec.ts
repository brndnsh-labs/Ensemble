import type { Page } from '@playwright/test';
import type {
    ChartDocumentV2,
    ScoreDirection,
    ScoreDuration,
    ScoreMeasure,
} from '../../../public/songbook/score-types';
import { appUrl, editorRevealed, expect, test } from './fixtures';

/**
 * Following's look-ahead scroll (#1458): a look-ahead row scroll, a next-bar cue that strengthens
 * on the playing bar's last FELT beat, and a jump-ahead scroll across a repeat/loop/practice-loop
 * wrap. `app/ensemble.tsx`'s Following effects, `app/chart-sheet.tsx`'s `data-next`, and
 * `app/use-chart-view.ts`'s `displayNext` are the surfaces under test; `lib/band-chart.ts`'s
 * `BandChart.bars` and `lib/runtime.ts`'s `inLastBeat()` are the engine reads behind it.
 */

/**
 * A v1 `?s=` share link (#1279) — the only way this suite can land a genuinely MEASURE-LESS
 * chart on the stand, since every v2-authored song is schemaVersion 2. Built the way v1's own
 * `compressSections` builds it (`checks/v1-share-link.spec.ts`'s own copy, duplicated locally per
 * this repo's norm rather than exported from a sibling spec file).
 */
function v1Link(sections: Array<Record<string, unknown>>, params: Record<string, string>): string {
    const search = new URLSearchParams({
        s: Buffer.from(JSON.stringify(sections), 'utf8').toString('base64'),
    });
    for (const [name, value] of Object.entries(params)) {
        search.set(name, value);
    }
    return appUrl(`?${search.toString()}`);
}

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

/** One written bar. `symbols` lets a bar hold more than one chord (#1458 patch review P1-1's
 * two-chord-bar coverage) — evenly split across the bar's 4 quarter notes. */
function chordBar(
    id: string,
    opts: { symbols?: string[]; start?: ScoreDirection[]; end?: ScoreDirection[] } = {},
): ScoreMeasure {
    const symbols = opts.symbols ?? ['C'];
    const duration: ScoreDuration = [4 / symbols.length, 1];
    return {
        id,
        content: {
            kind: 'events',
            events: symbols.map((symbol) => ({ kind: 'chord', symbol, duration })),
        },
        ...(opts.start ? { start: opts.start } : {}),
        ...(opts.end ? { end: opts.end } : {}),
    };
}

/**
 * A three- (or, with `sectionDBars`, four-) section chart, tall enough to overflow
 * `.chart-scroll` on both projects: section A repeats (a genuine `repeat-end`, no endings) and
 * its third bar (A3) holds TWO chords — the next-bar cue must skip past both of them to A4,
 * never landing on A3 itself. Section B is `sectionBBars` plain bars (the "longer than the
 * viewport" body; a small value plus a shrunk viewport keeps a full lap fast for a
 * timing-sensitive test). Section C is `sectionCBars` bars (3 by default, right before the form
 * wraps back to bar 1 — short so a test can reach the form's own end fast; a caller after
 * `scrollForJump`'s "keep both if they fit" branch instead wants it tall enough to scroll its own
 * start out of view, patch review P2-4). `sectionDBars`, when given, adds a trailing section AFTER
 * C — without it, C sits at the very BOTTOM of the whole document, and once deep enough into it
 * there is nothing further down left to scroll INTO: the anchor's desired position clamps at the
 * document's own max scrollTop, which (counterintuitively) leaves C's own early bars on screen
 * far longer than the top-third anchor alone would ever explain.
 */
async function buildLookaheadChart(
    page: Page,
    opts: {
        sectionBBars?: number;
        sectionCBars?: number;
        sectionDBars?: number;
        bpm?: number;
        /** False drops section A's repeat, for a test that only needs the form's own wrap and
         * would otherwise sit through A's second pass every lap. */
        repeatA?: boolean;
    } = {},
): Promise<void> {
    const sectionBBars = opts.sectionBBars ?? 40;
    const sectionCBars = opts.sectionCBars ?? 3;
    const sectionDBars = opts.sectionDBars ?? 0;
    const bpm = opts.bpm ?? 240;
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Lookahead study');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('C');
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('C');
    if (sectionDBars > 0) {
        await page.getByRole('button', { name: '＋ Section', exact: true }).click();
        await page.getByLabel('Chords in this bar').fill('C');
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    const document = await exportCurrent(page);
    const score = document.chart.score;
    const repeatA = opts.repeatA ?? true;
    score.sections[0].measures = [
        chordBar('A1', repeatA ? { start: [{ kind: 'repeat-start' }] } : {}),
        chordBar('A2'),
        chordBar('A3', { symbols: ['Dm7', 'G7'] }),
        chordBar('A4', repeatA ? { end: [{ kind: 'repeat-end', times: 2 }] } : {}),
    ];
    score.sections[1].measures = Array.from({ length: sectionBBars }, (_, i) =>
        chordBar(`B${i + 1}`),
    );
    score.sections[2].measures = Array.from({ length: sectionCBars }, (_, i) =>
        chordBar(`C${i + 1}`),
    );
    if (sectionDBars > 0) {
        score.sections[3].measures = Array.from({ length: sectionDBars }, (_, i) =>
            chordBar(`D${i + 1}`),
        );
    }
    document.title = 'Lookahead study (long)';

    await importFile(page, document);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.sheet .bar')).toHaveCount(
        4 + sectionBBars + sectionCBars + sectionDBars,
    );
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill(String(bpm));
    await tempo.press('Enter');
    await expect(tempo).toHaveValue(String(bpm));
}

/**
 * A one-bar `||: F7 :|| x4` repeat (R1) followed by a plain bar (R2) — the exact regression
 * probe from patch review P2-1: a written-bar-KEYED next-bar walk (rather than a
 * performed-bar-keyed one) reads `R1|R2` as "the same bar" for its whole 4-pass repeat, so a
 * pointer test built on written measure identity alone would never have caught it — the fix has
 * to be proven against a chart where the SAME written bar is visited more than once.
 */
async function buildOneBarRepeatChart(page: Page): Promise<void> {
    await page.goto(appUrl());
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('One-bar repeat study');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();

    const document = await exportCurrent(page);
    const score = document.chart.score;
    score.sections[0].measures = [
        chordBar('R1', {
            symbols: ['F7'],
            start: [{ kind: 'repeat-start' }],
            end: [{ kind: 'repeat-end', times: 4 }],
        }),
        chordBar('R2'),
    ];
    document.title = 'One-bar repeat study';

    await importFile(page, document);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.sheet .bar')).toHaveCount(2);
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

type ScrollCall = {
    cls: string;
    behavior?: string;
    top?: number;
    time: number;
    /** `data-measure-id` of whatever bar was `[data-active="true"]` at the INSTANT this call
     * fired (patch review P2-3) — direct evidence a scroll happened while a specific bar was
     * still playing, rather than inferring it from the target position (`top`) alone, which a
     * coincidental match (e.g. bar 1's own ordinary row-scroll landing near `top: 0` too) can
     * satisfy even when the jump-ahead never actually fired. */
    activeId: string | null;
};

/** Every `Element.scrollTo` call for the rest of the test, with the behavior it asked for and
 * which bar was active at the moment it fired. */
async function trackScrollCalls(page: Page): Promise<void> {
    await page.addInitScript(() => {
        const w = window as unknown as { __scrollCalls: ScrollCall[] };
        w.__scrollCalls = [];
        const orig = Element.prototype.scrollTo;
        type Patchable = { scrollTo: (opts?: unknown) => void };
        (Element.prototype as unknown as Patchable).scrollTo = function (
            this: Element,
            opts?: unknown,
        ) {
            if (opts && typeof opts === 'object') {
                const o = opts as { behavior?: string; top?: number };
                const active = document.querySelector('.bar[data-active="true"]');
                w.__scrollCalls.push({
                    cls: (this as HTMLElement).className,
                    behavior: o.behavior,
                    top: o.top,
                    time: Date.now(),
                    activeId: active?.getAttribute('data-measure-id') ?? null,
                });
            }
            return (orig as (opts?: unknown) => void).call(this, opts);
        };
        // Every change of the playing bar, timestamped IN the page (#1460 CI flake): a timing
        // assertion measured from the test's own poll loses the poll interval plus an `evaluate`
        // round trip on CI WebKit, which once shrank a ~400ms delay under a 250ms floor.
        const v = window as unknown as {
            __activeChanges: { time: number; activeId: string | null }[];
        };
        v.__activeChanges = [];
        const watch = () => {
            new MutationObserver((records) => {
                for (const r of records) {
                    const el = r.target as HTMLElement;
                    if (el.getAttribute('data-active') === 'true') {
                        v.__activeChanges.push({
                            time: Date.now(),
                            activeId: el.getAttribute('data-measure-id'),
                        });
                    }
                }
            }).observe(document.documentElement, {
                subtree: true,
                attributes: true,
                attributeFilter: ['data-active'],
            });
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', watch);
        } else {
            watch();
        }
    });
}

/**
 * The in-page times the playing bar became `activeId` (the last such change at or before
 * `before`, ms epoch) and then became the NEXT bar (the first change after it to a different
 * id, or null if none has landed yet).
 */
async function activatedAround(
    page: Page,
    activeId: string,
    before: number,
): Promise<{ at: number; next: number | null } | null> {
    const changes = await page.evaluate(
        () =>
            (window as unknown as { __activeChanges: { time: number; activeId: string | null }[] })
                .__activeChanges,
    );
    let index = -1;
    changes.forEach((c, i) => {
        if (c.activeId === activeId && c.time <= before) {
            index = i;
        }
    });
    if (index < 0) {
        return null;
    }
    const next = changes.slice(index + 1).find((c) => c.activeId !== activeId);
    return { at: changes[index].time, next: next?.time ?? null };
}

function scrollCalls(page: Page): Promise<ScrollCall[]> {
    return page.evaluate(
        () => (window as unknown as { __scrollCalls: ScrollCall[] }).__scrollCalls,
    );
}

/**
 * One playback sample: the active/next bars' measure ids, the next bar's `data-next` value
 * (`'true'` or `'soon'`), how many bars carry `data-next`, and whether the first bar in a
 * genuinely DIFFERENT row from the active one (not merely the next bar in document order, which
 * can share a row on a 4-per-row desktop layout) is fully inside `.chart-scroll`.
 */
async function sampleChart(page: Page) {
    return page.evaluate(() => {
        const scrollEl = document.querySelector('.chart-scroll');
        const bars = Array.from(document.querySelectorAll('.bar'));
        const active = document.querySelector('.bar[data-active="true"]');
        const nextEls = document.querySelectorAll('.bar[data-next]');
        const nextEl = nextEls[0] ?? null;
        const activeId = active?.getAttribute('data-measure-id') ?? null;
        const nextId = nextEl?.getAttribute('data-measure-id') ?? null;
        const nextValue = nextEl?.getAttribute('data-next') ?? null;
        const fits = scrollEl ? scrollEl.scrollHeight <= scrollEl.clientHeight + 1 : true;
        let rowVisible = true;
        if (scrollEl && active && !fits) {
            const activeTop = active.getBoundingClientRect().top;
            const nextRowEl = bars
                .slice(bars.indexOf(active))
                .find((bar) => bar.getBoundingClientRect().top > activeTop + 1);
            if (nextRowEl) {
                const sr = scrollEl.getBoundingClientRect();
                const nr = nextRowEl.getBoundingClientRect();
                rowVisible = nr.top >= sr.top - 0.5 && nr.bottom <= sr.bottom + 0.5;
            }
        }
        return { activeId, nextId, nextValue, nextCount: nextEls.length, fits, rowVisible };
    });
}

type ChartSample = Awaited<ReturnType<typeof sampleChart>>;

function inView(page: Page, measureId: string): Promise<boolean> {
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

/**
 * Poll `sampleChart` until `until` returns true, calling `check` (a caller-supplied invariant
 * assertion) once for every DISTINCT sample along the way — not every 40ms tick, so an assertion
 * that only makes sense once per bar isn't re-run dozens of times for the same state.
 */
async function pollSamples(
    page: Page,
    until: (sample: ChartSample) => boolean,
    opts: { check?: (sample: ChartSample) => void; timeoutMs?: number; intervalMs?: number } = {},
): Promise<ChartSample> {
    const { check, timeoutMs = 20_000, intervalMs = 40 } = opts;
    const deadline = Date.now() + timeoutMs;
    let lastKey = '';
    let last: ChartSample | null = null;
    while (Date.now() < deadline) {
        const sample = await sampleChart(page);
        last = sample;
        const key = `${sample.activeId}|${sample.nextId}|${sample.nextValue}`;
        // Skip the transient "nothing is playing yet" sample between the click and the engine's
        // first tick — `nextCount === 0` is correct there, not a violation of anything.
        if (key !== lastKey && sample.activeId !== null) {
            lastKey = key;
            check?.(sample);
        }
        if (until(sample)) {
            return sample;
        }
        await page.waitForTimeout(intervalMs);
    }
    throw new Error(`condition never met; last sample was ${JSON.stringify(last)}`);
}

/** Poll until `active`/`next` match, or fail after `timeoutMs`. */
function waitForActiveNext(
    page: Page,
    activeId: string,
    nextId: string,
    timeoutMs = 15_000,
): Promise<ChartSample> {
    return pollSamples(page, (s) => s.activeId === activeId && s.nextId === nextId, { timeoutMs });
}

test('the row after the playing row stays fully visible on every bar change, and the cue never marks the playing bar', async ({
    page,
}) => {
    test.setTimeout(50_000);
    await buildLookaheadChart(page);
    const scrollEl = page.locator('.chart-scroll');
    expect(
        await scrollEl.evaluate((el) => el.scrollHeight > el.clientHeight + 1),
        'the fixture should actually overflow for this to be a meaningful check',
    ).toBe(true);
    await startHere(page, 'B');
    const violations: string[] = [];
    // Section B is 40 plain bars, so the chart overflows well past B18 and the scroll is never
    // clamped at the document's end while this samples. B1→B18 is 17 bar changes: four row
    // changes on the laptop's 4-per-row layout, eight on the phone's 2-per-row one. Every sample
    // costs a real second at 240bpm (the tempo ceiling), so this stops there (#1463).
    await pollSamples(page, (s) => s.activeId === 'B18', {
        timeoutMs: 30_000,
        check: (s) => {
            expect(s.nextCount, 'exactly one bar should carry data-next').toBe(1);
            expect(s.nextId, 'the cue must never mark the bar that is currently playing').not.toBe(
                s.activeId,
            );
            if (!s.rowVisible) {
                violations.push(s.activeId ?? '(null)');
            }
        },
    });
    expect(violations, 'the next row should stay fully visible at every bar change').toEqual([]);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next skips both chords of a two-chord bar, resolves across the repeat, then moves on', async ({
    page,
}) => {
    // The setup alone is ~14s on a CPU-starved WebKit, and eight bars there run at a third of
    // real time: measured 30s for a run that was on track throughout (#1485).
    test.setTimeout(45_000);
    await buildLookaheadChart(page);
    await startHere(page, 'A');
    // A3 holds two chords (Dm7, G7); the cue must point past BOTH to A4, never at A3 itself —
    // whichever of its two chords is sounding (#1458 patch review P1-1).
    const firstPass = await pollSamples(page, (s) => s.activeId === 'A4' && s.nextId === 'A1', {
        check: (s) => {
            if (s.activeId === 'A3') {
                expect(s.nextId, 'the cue must skip past every chord still in the same bar').toBe(
                    'A4',
                );
            }
        },
    });
    expect(firstPass.nextCount).toBe(1);
    const secondPass = await waitForActiveNext(page, 'A4', 'B1');
    expect(secondPass.nextCount).toBe(1);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('a one-bar written repeat points at the SAME bar through pass 3, and the FOLLOWING bar on pass 4', async ({
    page,
}) => {
    // Two laps of a five-bar form plus the setup; on a CPU-starved WebKit the band's clock runs
    // at a third of real time, so this is real work rather than a hang (#1485).
    test.setTimeout(75_000);
    // #1458 patch review P2-1: a written-measure-keyed next-bar walk skips every later pass of a
    // one-bar `||: :||` repeat as "the same bar as before", pointing the cue at whatever follows
    // the WHOLE repeat for its entire 4-pass run rather than only its final pass. R1 is one
    // written bar performed four times, so `activeId` can't tell the passes apart. The cue can:
    // it reads `soon` in each pass's last beat and goes back to `true` on the next downbeat.
    // So the page records every state the cue takes, and this asserts on that record (#1485):
    // sampling at fixed offsets from the first R1 read the wrong pass whenever CI WebKit ran
    // behind the wall clock. The SECOND lap is the one asserted: on a loaded WebKit the stand can
    // go unpainted while audio comes up, so the first lap's opening passes may never show.
    await buildOneBarRepeatChart(page);
    await page.evaluate(() => {
        const w = window as unknown as { cues: string[] };
        w.cues = [];
        new MutationObserver(() => {
            const active = document.querySelector('.bar[data-active="true"]');
            const next = document.querySelectorAll('.bar[data-next]');
            const cue = `${active?.getAttribute('data-measure-id') ?? '-'} next ${Array.from(
                next,
                (bar) => `${bar.getAttribute('data-measure-id')}:${bar.getAttribute('data-next')}`,
            ).join(',')}`;
            if (w.cues.at(-1) !== cue) {
                w.cues.push(cue);
            }
        }).observe(document.querySelector('.sheet')!, {
            subtree: true,
            attributes: true,
            attributeFilter: ['data-active', 'data-next'],
        });
    });
    const cues = () => page.evaluate(() => (window as unknown as { cues: string[] }).cues);
    // From the first R1 after lap 1's R2 up to lap 2's R2: the whole of lap 2's repeat.
    const lapTwoRepeat = (recorded: string[]) => {
        const lapOneEnd = recorded.findIndex((cue) => cue.startsWith('R2 '));
        const from =
            lapOneEnd < 0
                ? -1
                : recorded.findIndex((cue, i) => i > lapOneEnd && cue.startsWith('R1 '));
        const to =
            from < 0 ? -1 : recorded.findIndex((cue, i) => i > from && cue.startsWith('R2 '));
        return to < 0 ? null : recorded.slice(from, to);
    };
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect
        .poll(async () => lapTwoRepeat(await cues()) !== null, { timeout: 45_000 })
        .toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    const repeat = lapTwoRepeat(await cues());
    expect(
        repeat,
        'passes 1-3 point at the SAME one-bar repeat; only pass 4 moves on to R2',
    ).toEqual([
        'R1 next R1:true',
        'R1 next R1:soon',
        'R1 next R1:true',
        'R1 next R1:soon',
        'R1 next R1:true',
        'R1 next R1:soon',
        'R1 next R2:true',
        'R1 next R2:soon',
    ]);
});

test('a repeat’s second pass strengthens the cue only in its OWN last beat, not for the whole bar', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'A');
    await waitForActiveNext(page, 'A4', 'A1'); // pass 1 reached
    // The moment `nextId` becomes 'B1' is pass 2's downbeat (advancing past the repeat is a plain
    // slot step, independent of beat timing) — the earliest possible false-positive window for
    // #1458 patch review P1-3 (a stale first-performance `start`/`end` would show "soon" for this
    // whole second visit, not just its last beat).
    const atSecondPassDownbeat = await waitForActiveNext(page, 'A4', 'B1');
    expect(
        atSecondPassDownbeat.nextValue,
        'must not already be "soon" at the second pass’s downbeat',
    ).toBe('true');
    await pollSamples(page, (s) => s.activeId === 'A4' && s.nextValue === 'soon', {
        timeoutMs: 2_000,
    });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('the next-bar cue strengthens only in the last felt beat, not at the downbeat', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page, { sectionBBars: 4 });
    await startHere(page, 'B');
    const atDownbeat = await pollSamples(page, (s) => s.activeId === 'B2');
    expect(atDownbeat.nextValue, 'must not already be "soon" right at the downbeat').toBe('true');
    await pollSamples(page, (s) => s.activeId === 'B2' && s.nextValue === 'soon', {
        timeoutMs: 2_000,
    });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('a measure-less (v1) chart gets the next-bar cue and "soon" too', async ({ page }) => {
    test.setTimeout(20_000);
    // #1458 patch review P2-2: `runtime.inLastBeat()` used to gate on `bandChartView()`, which is
    // built only for a schemaVersion-2 chart — but `runtime.ts`'s `scoreForBand` converts a v1
    // chart to the SAME timeline shape before it ever reaches the band host, so a v1 chart plays
    // through the identical engine timeline and deserves the identical cue. A v1 chart carries no
    // `data-measure-id` at all (`writtenBars` is schemaVersion-2-only in `use-chart-view.ts`), so
    // this identifies bars by their (distinct) chord text instead of `sampleChart`'s usual id.
    await page.goto(
        v1Link([{ l: 'A', v: 'C7 | D7 | E7 | F7' }], {
            key: 'C',
            ts: '4/4',
            bpm: '240',
            genre: 'Jazz',
            style: 'jazz',
            int: '0.40',
            comp: '0.55',
            notation: 'name',
            accounts: 'off',
        }),
    );
    await expect(page.locator('.bar').first().locator('.chord')).toHaveText(['C7']);

    async function sampleV1() {
        return page.evaluate(() => {
            const active = document.querySelector('.bar[data-active="true"]');
            const nextEls = document.querySelectorAll('.bar[data-next]');
            const nextEl = nextEls[0] ?? null;
            const chordText = (bar: Element | null) =>
                bar?.querySelector('.chord')?.textContent ?? null;
            return {
                activeChord: chordText(active),
                nextChord: chordText(nextEl),
                nextValue: nextEl?.getAttribute('data-next') ?? null,
                nextCount: nextEls.length,
            };
        });
    }

    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    const deadline1 = Date.now() + 15_000;
    let atDownbeat: Awaited<ReturnType<typeof sampleV1>> | null = null;
    while (Date.now() < deadline1) {
        const sample = await sampleV1();
        if (sample.activeChord === 'D7') {
            atDownbeat = sample;
            break;
        }
        await page.waitForTimeout(40);
    }
    expect(atDownbeat, 'the second bar (D7) should become active').not.toBeNull();
    expect(atDownbeat?.nextCount, 'a v1 chart should get the next-bar cue too').toBe(1);
    expect(atDownbeat?.nextChord).toBe('E7');
    expect(atDownbeat?.nextValue, 'must not already be "soon" right at the downbeat').toBe('true');

    const deadline2 = Date.now() + 2_000;
    let sawSoon = false;
    while (Date.now() < deadline2) {
        const sample = await sampleV1();
        if (sample.activeChord === 'D7' && sample.nextValue === 'soon') {
            sawSoon = true;
            break;
        }
        await page.waitForTimeout(40);
    }
    expect(sawSoon, 'a v1 chart should get "soon" too, not just the plain cue').toBe(true);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

/** One bar at 240bpm in 4/4, in ms. */
const BAR_MS = 1000;

test('the jump-ahead fires in the last felt beat (not the downbeat), and fires again on the next lap', async ({
    page,
}) => {
    test.setTimeout(45_000);
    await trackScrollCalls(page);
    // A short viewport forces this small chart to overflow anyway, so a full lap stays fast.
    await page.setViewportSize({ width: 1300, height: 350 });
    // No repeat on A: a lap is then 8 bars, not 12, and A's second pass is nowhere near the
    // C3 → A1 jump this measures (#1463).
    await buildLookaheadChart(page, { sectionBBars: 1, repeatA: false });
    const scrollEl = page.locator('.chart-scroll');
    expect(await scrollEl.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
    await startHere(page, 'C');

    /**
     * When did the jump-ahead's OWN `scrollForJump` call fire for the NEXT time C3 becomes
     * active (relative to when this is called)? Each call starts counting fresh from the current
     * moment, so calling this twice in a row measures two SUCCESSIVE occurrences (lap 1, then
     * lap 2) — not "wait for two more after this point", which a call keyed on an absolute
     * occurrence number would.
     *
     * Reads the scroll call's own timestamp rather than polling `getBoundingClientRect()` for
     * "is bar 1 visible yet": a `behavior: 'smooth'` scroll (this test isn't under reduced
     * motion) takes the browser's own animation duration to visually complete, which on a 1s bar
     * with a ~250ms last-beat window can straddle the very moment `active` flips to bar 1 —
     * racing the animation's completion against the bar boundary, not testing when the app
     * actually asked to scroll. The call is identified by TWO independent signals (patch review
     * P2-3): it fired while `activeId` was STILL `'C3'` (the definitive one — a scroll that
     * merely coincides with landing near the top of the document, e.g. bar 1's own ordinary
     * row-scroll on ITS OWN downbeat, would never satisfy this), and its destination is near the
     * very TOP of the document (bar 1 is first; the row-scroll effect's own calls for C3 itself
     * land near the BOTTOM, on an 8-bar chart) — either alone could accidentally match something
     * else; together they can't.
     *
     * Returns two delays, both wall-clock ms to the jump's own `scrollTo`:
     *  - `sincePaint`: from the render that marked C3 active. The app publishes `active` off a 60ms
     *    poll and React paints it, so that render lags the engine's real barline by the poll plus
     *    any main-thread stall (a CI WebKit worker sharing a runner stalls for 100ms+). It can only
     *    UNDER-state how far into the bar the jump fired.
     *  - `sinceBarline`: from the tightest bound the two paints give on C3's real barline. C3's own
     *    paint is at or after its barline, and the NEXT bar's paint is at or after C3's END, one
     *    bar length later — so `min(C3 paint, next paint - BAR_MS)` is at or after the true
     *    barline, and a delay from it is at or under the true one. Both paints must stall by the
     *    floor's margin for it to read low; a jump firing at the downbeat reads ~0 from either.
     */
    async function nextJumpCallDelay(): Promise<{ sincePaint: number; sinceBarline: number }> {
        let lastId: string | null = null;
        let t0 = 0;
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
            const sample = await sampleChart(page);
            if (sample.activeId !== lastId) {
                lastId = sample.activeId;
                if (sample.activeId === 'C3' && !t0) {
                    t0 = Date.now();
                } else if (t0 && sample.activeId !== 'C3') {
                    break; // left C3 for the occurrence being measured
                }
            }
            await page.waitForTimeout(30);
        }
        if (!t0) {
            throw new Error('C3 never became active');
        }
        // The poll saw C3 up to one interval plus a round trip late; measure from the page's
        // own record of the change instead.
        const around = await activatedAround(page, 'C3', t0);
        const paintedAt = around?.at ?? t0;
        const jump = (await scrollCalls(page)).find(
            (c) =>
                c.cls === 'chart-scroll' &&
                c.time >= paintedAt &&
                c.activeId === 'C3' &&
                (c.top ?? 999) < 50,
        );
        if (!jump) {
            throw new Error('no jump-to-bar-1 scroll call found for this occurrence');
        }
        const barlineBound =
            around?.next != null ? Math.min(paintedAt, around.next - BAR_MS) : paintedAt;
        return { sincePaint: jump.time - paintedAt, sinceBarline: jump.time - barlineBound };
    }

    // A 1s bar (240bpm, 4/4): `runtime.inLastBeat()` now fires at the EARLIER of the last felt
    // pulse (750ms in) and a fixed ~600ms real-time lead before the barline (400ms in, patch
    // review P3-1) — so ~400ms is the actual expected trigger point at this tempo, not ~750ms.
    // The window below is deliberately wide (patch review P3-4, after an earlier ~210ms margin
    // proved thin under CI WebKit): comfortably below both possible trigger points at its floor,
    // comfortably inside the bar at its ceiling, so it stays meaningful without chasing the exact
    // millisecond either constant produces. Both ends are measured in the page, to the jump's own
    // `scrollTo`. The regression this guards (the jump in the SAME render as the new bar, patch
    // review P1-2) measures ~0ms from the barline; the floor sits well clear of both that and the
    // ~400ms trigger. The floor is measured from the barline bound `nextJumpCallDelay` derives,
    // not from C3's paint alone: that paint lags the engine by the 60ms poll plus any main-thread
    // stall, and a stalled CI worker once read 199 here for a jump that fired on time (#1463
    // follow-up). The ceiling can only be tightened by that lag, never broken, so it keeps the
    // paint.
    const lap1 = await nextJumpCallDelay();
    expect(
        lap1.sinceBarline,
        'the jump should not fire at (or near) the downbeat',
    ).toBeGreaterThanOrEqual(200);
    expect(
        lap1.sincePaint,
        'the jump should fire within the SAME bar it is for',
    ).toBeLessThanOrEqual(900);

    const lap2 = await nextJumpCallDelay();
    expect(
        lap2.sinceBarline,
        'the jump should fire again on lap 2, not stay spent after lap 1',
    ).toBeGreaterThanOrEqual(200);
    expect(lap2.sincePaint).toBeLessThanOrEqual(900);

    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next wraps inside an active practice loop, keeping both bars visible since they fit together', async ({
    page,
}) => {
    test.setTimeout(40_000);
    // A 3-bar loop (the section's earlier size) never scrolls its own start out of view in the
    // first place, so `scrollForJump`'s "keep both if they fit" branch was never actually
    // exercised — the loop start was already on screen and the effect returned early before ever
    // calling it (patch review P2-4). 16 bars (4 rows on a 4-per-row desktop layout) is enough to
    // scroll C1 out of view by the time playback reaches the far end, while the whole section
    // stays short enough that C1 and C16 can still share one screenful once the loop wraps.
    //
    // `sectionDBars` matters here specifically: without a section AFTER the loop, C sits at the
    // very bottom of the whole document, and the anchor's desired scrollTop clamps at the
    // document's own max the moment there is nothing further down left to reveal — which leaves
    // C1 on screen far longer than the top-third anchor alone would, since the page simply can't
    // scroll any further to honor it. A trailing section gives the scroll room it needs.
    await buildLookaheadChart(page, { sectionCBars: 16, sectionDBars: 8 });
    await startHere(page, 'C');
    await pollSamples(page, (s) => s.activeId === 'C1');
    // "Start here" on a section this far into a much longer chart triggers a real (SMOOTH, not
    // instant) scroll of its own to bring C1 into view — give it time to settle before a
    // long-press, whose synthetic pointerdown/pointerup land at FIXED coordinates: a still-moving
    // page under a 600ms hold can carry the section letter out from under them.
    await page.waitForTimeout(500);
    // Arm the loop on C while already inside it (long-press, the same gesture as #1211/#1422).
    await sectionLetter(page, 'C').click({ delay: 600 });
    await expect(sectionLetter(page, 'C')).toHaveAttribute('aria-pressed', 'true');
    // Confirm the precondition: three rows into the section, its own start has actually scrolled
    // out of view — otherwise this test would not be exercising anything P2-4 didn't.
    await pollSamples(page, (s) => s.activeId === 'C13');
    expect(
        await inView(page, 'C1'),
        'the loop start should have scrolled out of view three rows into a 16-bar section',
    ).toBe(false);
    const resolved = await waitForActiveNext(page, 'C16', 'C1');
    expect(resolved.nextCount).toBe(1);
    // Whether the geometry can even show both at once (2-per-row phone makes 16 bars 8 tall
    // rows, not 4 — "laptop, and phone if the geometry allows", patch review P2-4). The relative
    // distance between two elements is scroll-position-independent (scrolling shifts both
    // identically), so this can be measured any time, without regard to what's currently in view.
    const bothCouldFit = await page.evaluate(() => {
        const scrollEl = document.querySelector('.chart-scroll');
        const c1 = document.querySelector('.bar[data-measure-id="C1"]');
        const c16 = document.querySelector('.bar[data-measure-id="C16"]');
        if (!scrollEl || !c1 || !c16) {
            return false;
        }
        const a = c1.getBoundingClientRect();
        const b = c16.getBoundingClientRect();
        return Math.max(a.bottom, b.bottom) - Math.min(a.top, b.top) <= scrollEl.clientHeight;
    });
    // The jump-ahead should show BOTH the playing bar and the loop's start once it fires
    // (Touches #3's "keeping the playing bar visible where both fit"), not just the target —
    // unlike the far-apart form-loop wrap (last bar to bar 1) below, where showing both would
    // require the WHOLE many-row chart to already fit the viewport (i.e. never need to scroll at
    // all), a short loop's own two ends are close enough to co-exist in one screenful WHEN the
    // geometry allows it.
    const deadline = Date.now() + 15_000;
    let sawC1 = false;
    let bothVisible = false;
    while (Date.now() < deadline) {
        if (await inView(page, 'C1')) {
            sawC1 = true;
            bothVisible = await inView(page, 'C16');
            break;
        }
        await page.waitForTimeout(40);
    }
    if (bothCouldFit) {
        expect(
            bothVisible,
            'both the playing bar and the loop start should be visible together',
        ).toBe(true);
    } else {
        // Touches #3's own tie-break when they can't both fit: the target (the loop start) wins.
        expect(sawC1, 'the loop start should still win when both cannot fit together').toBe(true);
    }
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

// Both a fast and a normal tempo (patch review P3-1): at 240bpm the last felt pulse alone
// (250ms) is shorter than a `behavior: 'smooth'` scroll typically needs to finish before the
// barline, which `runtime.inLastBeat()`'s fixed ~600ms real-time lead now compensates for; at
// 120bpm the last pulse (500ms) is closer to that lead already, so this is also evidence the fix
// does not regress the normal-tempo case it left alone.
for (const bpm of [120, 240]) {
    test(`data-next wraps to bar 1 at the form loop, and bar 1 is fully visible before the band reaches it (${bpm}bpm)`, async ({
        page,
    }) => {
        test.setTimeout(30_000);
        await buildLookaheadChart(page, { bpm });
        await startHere(page, 'C');
        const atFormEnd = await waitForActiveNext(page, 'C3', 'A1');
        expect(atFormEnd.nextCount).toBe(1);
        // No 600ms WALL-CLOCK grace window (patch review P3-1's own test ask: that one was
        // compensating for a genuinely-late trigger, back when only ~250ms of real time separated
        // it from the barline). It DOES check `inView` before checking whether `active` has
        // already moved on, on every tick — a same-tick ordering fix, not a grace period: our own
        // poll granularity can land its FIRST sample of the new bar a poll interval late, and
        // checking the exit condition first would silently throw away a truthful "yes, it was
        // visible" observation made on that very same round trip. A SMALL (150ms) catch-up beyond
        // that tolerates this suite's OWN documented 3-worker CI contention
        // (`playwright.config.ts`) slowing an animation already given 600ms of real headroom by
        // the fix — not the app firing late, the test runner's shared CPU being busy.
        const deadline = Date.now() + 10_000;
        let sawA1InView = false;
        let leftC3At: number | null = null;
        for (;;) {
            if (await inView(page, 'A1')) {
                sawA1InView = true;
                break;
            }
            const sample = await sampleChart(page);
            if (sample.activeId !== 'C3') {
                leftC3At ??= Date.now();
            }
            if ((leftC3At !== null && Date.now() - leftC3At > 150) || Date.now() > deadline) {
                break;
            }
            await page.waitForTimeout(40);
        }
        expect(sawA1InView, 'bar 1 should be fully visible before playback reaches it').toBe(true);
        await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    });
}

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
    const scrollEl = page.locator('.chart-scroll');
    // The declarative side of the fix (#1458 patch review P1-5): `.chart-scroll`'s base
    // `scroll-behavior: smooth` (a class selector) outranks `* { scroll-behavior: auto }`'s
    // reduced-motion override on specificity regardless of the media query, so the override has
    // to repeat the SAME selector to win on source order instead.
    expect(await scrollEl.evaluate((el) => getComputedStyle(el).scrollBehavior)).toBe('auto');
    await startHere(page, 'B');
    await page.waitForTimeout(6_000); // several row changes on both projects' column counts
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    const rowScrolls = (await scrollCalls(page)).filter((c) => c.cls === 'chart-scroll');
    expect(rowScrolls.length, 'the look-ahead should have scrolled at least once').toBeGreaterThan(
        0,
    );
    for (const call of rowScrolls) {
        // The imperative side: an explicit 'instant' the CSS `scroll-behavior` property cannot
        // override, unlike 'auto' (which defers to it — the bug this call's own value once was).
        expect(call.behavior).toBe('instant');
    }
});

test('the next-bar cue reads distinctly in both themes (screenshots for review)', async ({
    page,
}, testInfo) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'A');
    // A2 → A3 is a chart with a two-chord bar (A3: Dm7, G7) right next in line.
    await waitForActiveNext(page, 'A2', 'A3');
    await expect(page.locator('.bar[data-next]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath('next-cue-day.png') });
    await page.getByRole('button', { name: 'Stage', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'stage');
    await page.screenshot({ path: testInfo.outputPath('next-cue-stage.png') });
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});
