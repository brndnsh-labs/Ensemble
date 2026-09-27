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
 * A three-section chart, tall enough to overflow `.chart-scroll` on both projects: section A
 * repeats (a genuine `repeat-end`, no endings) and its third bar (A3) holds TWO chords — the
 * next-bar cue must skip past both of them to A4, never landing on A3 itself. Section B is
 * `sectionBBars` plain bars (the "longer than the viewport" body; a small value plus a shrunk
 * viewport keeps a full lap fast for a timing-sensitive test). Section C is 3 bars right before
 * the form wraps back to bar 1.
 */
async function buildLookaheadChart(
    page: Page,
    opts: { sectionBBars?: number } = {},
): Promise<void> {
    const sectionBBars = opts.sectionBBars ?? 40;
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
        chordBar('A1', { start: [{ kind: 'repeat-start' }] }),
        chordBar('A2'),
        chordBar('A3', { symbols: ['Dm7', 'G7'] }),
        chordBar('A4', { end: [{ kind: 'repeat-end', times: 2 }] }),
    ];
    score.sections[1].measures = Array.from({ length: sectionBBars }, (_, i) =>
        chordBar(`B${i + 1}`),
    );
    score.sections[2].measures = Array.from({ length: 3 }, (_, i) => chordBar(`C${i + 1}`));
    document.title = 'Lookahead study (long)';

    await importFile(page, document);
    await expect(page.locator('.error-banner')).toHaveCount(0);
    await expect(page.locator('.sheet .bar')).toHaveCount(4 + sectionBBars + 3);
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
            __scrollCalls: { cls: string; behavior?: string; top?: number; time: number }[];
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
                    time: Date.now(),
                });
            }
            return (orig as (opts?: unknown) => void).call(this, opts);
        };
    });
}

function scrollCalls(page: Page) {
    return page.evaluate(
        () =>
            (
                window as unknown as {
                    __scrollCalls: { cls: string; behavior?: string; top?: number; time: number }[];
                }
            ).__scrollCalls,
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
    test.setTimeout(75_000);
    await buildLookaheadChart(page);
    const scrollEl = page.locator('.chart-scroll');
    expect(
        await scrollEl.evaluate((el) => el.scrollHeight > el.clientHeight + 1),
        'the fixture should actually overflow for this to be a meaningful check',
    ).toBe(true);
    await startHere(page, 'B');
    const violations: string[] = [];
    // Section B is 40 plain bars — enough to sample many row changes without a full 47-bar lap.
    await pollSamples(page, (s) => s.activeId === 'B38', {
        timeoutMs: 45_000,
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
    test.setTimeout(30_000);
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

test('the jump-ahead fires in the last felt beat (not the downbeat), and fires again on the next lap', async ({
    page,
}) => {
    test.setTimeout(45_000);
    await trackScrollCalls(page);
    // A short viewport forces this small chart to overflow anyway, so a full lap stays fast.
    await page.setViewportSize({ width: 1300, height: 350 });
    await buildLookaheadChart(page, { sectionBBars: 1 });
    const scrollEl = page.locator('.chart-scroll');
    expect(await scrollEl.evaluate((el) => el.scrollHeight > el.clientHeight + 1)).toBe(true);
    await startHere(page, 'C');

    /**
     * When did the jump-ahead's OWN `scrollForJump` call fire for the NEXT time C3 becomes
     * active (relative to when this is called) — measured as wall-clock time since that
     * occurrence's downbeat. Each call starts counting fresh from the current moment, so calling
     * this twice in a row measures two SUCCESSIVE occurrences (lap 1, then lap 2) — not "wait for
     * two more after this point", which a call keyed on an absolute occurrence number would.
     *
     * Reads the scroll call's own timestamp rather than polling `getBoundingClientRect()` for
     * "is bar 1 visible yet": a `behavior: 'smooth'` scroll (this test isn't under reduced
     * motion) takes the browser's own animation duration to visually complete, which on a 1s bar
     * with a ~250ms last-beat window can straddle the very moment `active` flips to bar 1 —
     * racing the animation's completion against the bar boundary, not testing when the app
     * actually asked to scroll. The call itself, identified by scrolling close to the very TOP of
     * the document (bar 1 is first; the row-scroll effect's own calls for C3 land near the
     * BOTTOM, on an 8-bar chart), has no such ambiguity.
     */
    async function nextJumpCallDelay(): Promise<number> {
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
        const jump = (await scrollCalls(page)).find(
            (c) => c.cls === 'chart-scroll' && c.time >= t0 && (c.top ?? 999) < 50,
        );
        if (!jump) {
            throw new Error('no jump-to-bar-1 scroll call found for this occurrence');
        }
        return jump.time - t0;
    }

    const lap1 = await nextJumpCallDelay();
    expect(
        lap1,
        'the jump should fire near the last felt beat (~750ms into a 1s bar at 240bpm), not the downbeat',
    ).toBeGreaterThanOrEqual(500);

    const lap2 = await nextJumpCallDelay();
    expect(
        lap2,
        'the jump should fire again on lap 2, not stay spent after lap 1',
    ).toBeGreaterThanOrEqual(500);

    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
});

test('data-next wraps inside an active practice loop, keeping both bars visible since they fit together', async ({
    page,
}) => {
    test.setTimeout(30_000);
    await buildLookaheadChart(page);
    await startHere(page, 'C');
    // Arm the loop on C while already inside it (long-press, the same gesture as #1211/#1422).
    await sectionLetter(page, 'C').click({ delay: 600 });
    await expect(sectionLetter(page, 'C')).toHaveAttribute('aria-pressed', 'true');
    const resolved = await waitForActiveNext(page, 'C3', 'C1');
    expect(resolved.nextCount).toBe(1);
    // C1–C3 is a 3-bar section — one row on a 4-per-row desktop layout, two short rows on a
    // 2-per-row phone one — comfortably within one screenful on both projects, unlike the
    // far-apart form-loop wrap (last bar to bar 1) above. The jump-ahead should show BOTH the
    // playing bar and the loop's start here (Touches #3's "keeping the playing bar visible where
    // both fit"), not just the target.
    const deadline = Date.now() + 15_000;
    let bothVisible = false;
    while (Date.now() < deadline) {
        if ((await inView(page, 'C1')) && (await sampleChart(page)).activeId === 'C3') {
            bothVisible = (await inView(page, 'C1')) && (await inView(page, 'C3'));
            break;
        }
        await page.waitForTimeout(40);
    }
    expect(bothVisible, 'both the playing bar and the loop start should be visible together').toBe(
        true,
    );
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
    // The jump-ahead fires near C3's last felt beat and scrolls SMOOTHLY (not reduced motion
    // here), so the animation can still be in flight for a short moment after playback has
    // already moved on to A1 — give it a brief grace window rather than cutting off the instant
    // `activeId` changes, which would otherwise race a still-completing scroll.
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
        if ((leftC3At !== null && Date.now() - leftC3At > 600) || Date.now() > deadline) {
            break;
        }
        await page.waitForTimeout(60);
    }
    expect(sawA1InView, 'bar 1 should be visible before playback reaches it').toBe(true);
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
