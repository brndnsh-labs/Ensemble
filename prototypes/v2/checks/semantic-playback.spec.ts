import type { Page } from '@playwright/test';
import type { WorkerRequest, WorkerResponse } from '../../../public/worker-types.js';
import { editorRevealed, expect, test } from './fixtures';

interface PlaybackEvidence {
    armed: boolean;
    workerURLs: string[];
    sourceLeaks: string[];
    errors: string[];
    snapshots: {
        type: string;
        totalSteps: number | undefined;
        chords: { start: number; end: number; name: string; key: string | undefined }[];
        measures: { start: number; end: number; ts: string; grouping: number[] | undefined }[];
    }[];
    notes: { step: number; module: string }[];
    highlights: { start: number; end: number; name: string }[];
    nonzeroAudioSamples: number;
    secondLapAudioSamples: number;
}

declare global {
    interface Window {
        __semanticPlaybackEvidence: PlaybackEvidence;
    }
}

type ChartVisit = { start: number; end: number; name: string };

const visitKey = (visit: ChartVisit) => `${visit.name}@${visit.start}-${visit.end}`;

/**
 * Assert the stand's painted chord pointer followed `lap`, repeated, in order.
 *
 * What the DOM shows is a SAMPLE of the performance, not every frame of it: the
 * stand reads `chords.lastActiveChordIndex` off a 60ms interval and React paints
 * the result, so a main-thread stall longer than a chord drops that chord from
 * the chart even though the audio — scheduled ahead on the audio thread — is
 * unaffected. Under CI contention (three WebKit workers on a four-core runner)
 * that happens at the lap wrap, where the turnaround does the most work: an
 * instrumented run caught F@44-60 followed directly by Dm@8-12, with C@0-8's
 * ~500ms window painted in neither the mutation records nor an independent
 * requestAnimationFrame sampler.
 *
 * So assert the musical claim rather than the frame-rate one. Every visit the
 * stand DID paint must be the next one the form calls for, the form must wrap,
 * and every chord in it must be reached. A wrong chord, a wrong step span, an
 * out-of-order visit, a skipped wrap or a chord that never appears at all still
 * fails; only a bounded number of dropped SAMPLES is forgiven.
 */
function expectVisitsFollowForm(
    observed: ChartVisit[],
    lap: ChartVisit[],
    { laps = 2, maxDroppedSamples = 2 } = {},
) {
    // Walk the form as an endless repetition rather than a fixed window: a
    // dropped sample pushes the run into a later lap, and cutting at a fixed
    // number of visits would then compare a shifted slice and fail for the very
    // reason this matcher exists to forgive.
    const trail = () =>
        `painted: ${observed.map(visitKey).join(' -> ')}\nform:    ${lap.map(visitKey).join(' -> ')}`;
    const dropped: string[] = [];
    let cursor = 0;
    for (const visit of observed) {
        const resume = cursor;
        while (
            visitKey(lap[cursor % lap.length]) !== visitKey(visit) &&
            cursor - resume < lap.length
        ) {
            dropped.push(visitKey(lap[cursor % lap.length]));
            cursor += 1;
        }
        expect(
            visitKey(lap[cursor % lap.length]),
            `the chart painted ${visitKey(visit)}, which the form never calls for here.\n${trail()}`,
        ).toBe(visitKey(visit));
        cursor += 1;
    }
    expect(
        cursor,
        `the chart should get through ${laps} laps and start another.\n${trail()}`,
    ).toBeGreaterThanOrEqual(laps * lap.length + 1);
    expect(
        dropped,
        `the chart skipped more than ${maxDroppedSamples} visits, which is a stalled main ` +
            `thread rather than a sampling hiccup.\n${trail()}`,
    ).toHaveLength(Math.min(dropped.length, maxDroppedSamples));

    // Drop-tolerant coverage: a sample lost in one lap is covered by the next,
    // but a chord the form never reaches at all is absent from every lap.
    expect(
        [...new Set(observed.map(visitKey))].sort(),
        `every chord in the form should be reached.\n${trail()}`,
    ).toEqual([...new Set(lap.map(visitKey))].sort());
}

async function observePlayback(page: Page) {
    await page.addInitScript(() => {
        const evidence: PlaybackEvidence = {
            armed: false,
            workerURLs: [],
            sourceLeaks: [],
            errors: [],
            snapshots: [],
            notes: [],
            highlights: [],
            nonzeroAudioSamples: 0,
            secondLapAudioSamples: 0,
        };
        window.__semanticPlaybackEvidence = evidence;

        // Observe the browser boundary, not a test-only application bridge. Every
        // original message reaches the real module worker unchanged, and every
        // response is produced by that worker's actual accompaniment engine.
        const NativeWorker = window.Worker;
        window.Worker = class extends NativeWorker {
            constructor(url: string | URL, options?: WorkerOptions) {
                super(url, options);
                evidence.workerURLs.push(String(url));
                this.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
                    if (event.data.type === 'error') {
                        evidence.errors.push(event.data.data);
                    }
                    if (evidence.armed && event.data.type === 'notes') {
                        for (const note of event.data.notes) {
                            evidence.notes.push({ step: note.step, module: note.module });
                        }
                    }
                });
                this.addEventListener('error', (event) => evidence.errors.push(event.message));
            }

            postMessage(message: unknown, options?: Transferable[] | StructuredSerializeOptions) {
                const packet = message as WorkerRequest;
                const sync =
                    packet.type === 'flush'
                        ? packet.data.syncData
                        : packet.type === 'syncState'
                          ? packet.data
                          : null;
                const arranger = sync?.arranger;
                if (arranger) {
                    for (const key of ['scorePlan', 'score']) {
                        if (Object.hasOwn(arranger, key)) {
                            evidence.sourceLeaks.push(`${packet.type}:arranger.${key}`);
                        }
                    }
                    if (arranger.stepMap && arranger.measureMap) {
                        evidence.snapshots.push({
                            type: packet.type,
                            totalSteps: arranger.totalSteps,
                            chords: arranger.stepMap.map(({ start, end, chord }) => ({
                                start,
                                end,
                                name: chord.absName,
                                key: chord.key,
                            })),
                            measures: arranger.measureMap.map(({ start, end, ts, config }) => ({
                                start,
                                end,
                                ts,
                                grouping: config ? [...config.grouping] : undefined,
                            })),
                        });
                    }
                }
                if (Array.isArray(options)) {
                    super.postMessage(message, options);
                } else {
                    super.postMessage(message, options);
                }
            }
        };

        // Capture the visible active-chord sequence at DOM mutation time rather
        // than polling from Node and potentially missing a quarter-note chord.
        //
        // Read the RECORDS, not the DOM: an observer callback runs once per
        // microtask checkpoint with every mutation since the last one, so when
        // the tab is starved (three CI workers on four cores, #1223) two chord
        // transitions can land in one batch and `querySelector` would only ever
        // see the last of them — the middle chord was highlighted, just never
        // observed. The stand sets `aria-current="true"` and otherwise removes
        // the attribute, so a record whose `oldValue` is not "true" is a chord
        // becoming current, in commit order; a removal record is ignored (using
        // it would put the lap wrap out of order, because the first chord is set
        // before the last one is cleared). A `data-start-step` change on the current chord
        // (a repeat visit re-labelling the same element) still counts as a move.
        const highlight = (chord: Element) => {
            const next = {
                start: Number(chord.getAttribute('data-start-step')),
                end: Number(chord.getAttribute('data-end-step')),
                name: chord.textContent?.trim() ?? '',
            };
            if (evidence.highlights.at(-1)?.start !== next.start) {
                evidence.highlights.push(next);
            }
        };
        new MutationObserver((records) => {
            if (!evidence.armed) {
                return;
            }
            for (const record of records) {
                const target = record.target as Element;
                if (!target.classList?.contains('chord')) {
                    continue;
                }
                if (record.attributeName === 'aria-current' && record.oldValue !== 'true') {
                    highlight(target);
                } else if (
                    record.attributeName === 'data-start-step' &&
                    target.getAttribute('aria-current') === 'true'
                ) {
                    highlight(target);
                }
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['aria-current', 'data-start-step'],
        });

        // Branch an analyser from the existing final output connection. The
        // audible route stays intact; no oscillator/source is fabricated here.
        const probes: { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> }[] = [];
        const contexts = new WeakSet<BaseAudioContext>();
        const connect = AudioNode.prototype.connect;
        AudioNode.prototype.connect = function (
            this: AudioNode,
            destination: AudioNode | AudioParam,
            ...rest: number[]
        ) {
            const result = Reflect.apply(connect, this, [destination, ...rest]);
            if (destination === this.context.destination && !contexts.has(this.context)) {
                contexts.add(this.context);
                const analyser = this.context.createAnalyser();
                analyser.fftSize = 256;
                Reflect.apply(connect, this, [analyser]);
                probes.push({ analyser, samples: new Float32Array(analyser.fftSize) });
            }
            return result;
        } as AudioNode['connect'];
        window.setInterval(() => {
            if (!evidence.armed) {
                return;
            }
            for (const { analyser, samples } of probes) {
                analyser.getFloatTimeDomainData(samples);
                if (samples.some((sample) => Math.abs(sample) > 0.00001)) {
                    evidence.nonzeroAudioSamples++;
                    if (evidence.highlights.filter((chord) => chord.start === 0).length >= 2) {
                        evidence.secondLapAudioSamples++;
                    }
                }
            }
        }, 20);
    });
}

// The form matcher below is the only thing standing between a real ordering bug
// and a green suite, so prove it still rejects one. Uses no page fixture, so it
// starts no browser and no preview server.
test('the chart-visit matcher forgives a dropped sample but not a wrong form', () => {
    const lap = [
        { start: 0, end: 8, name: 'C' },
        { start: 8, end: 12, name: 'Dm' },
        { start: 12, end: 16, name: 'G7' },
    ];
    const twoLaps = [...lap, ...lap, lap[0]];
    expect(() => expectVisitsFollowForm(twoLaps, lap)).not.toThrow();
    // A sample dropped at the wrap — the exact shape that made this flaky. The
    // poll waits for three tops of the form, so the run reaches into a later lap.
    expect(() =>
        expectVisitsFollowForm([...lap, lap[1], lap[2], ...lap, lap[0]], lap),
    ).not.toThrow();
    // A chord the form never reaches (Dm missing from every lap).
    expect(() =>
        expectVisitsFollowForm([lap[0], lap[2], lap[0], lap[2], lap[0], lap[2]], lap),
    ).toThrow();
    // Out of order.
    expect(() => expectVisitsFollowForm([lap[0], lap[2], lap[1], ...lap, lap[0]], lap)).toThrow();
    // Right names, wrong step span (a meter bug).
    expect(() =>
        expectVisitsFollowForm([...lap, lap[0], { ...lap[1], end: 13 }, lap[2], lap[0]], lap),
    ).toThrow();
    // Stops short of the laps it claims to have played.
    expect(() => expectVisitsFollowForm([...lap, lap[0]], lap)).toThrow();
});

test('semantic timing reaches the real worker, audio output and chart for two complete laps', async ({
    page,
}) => {
    // Two full mixed-meter laps are real elapsed playback, not a clock advance or
    // a lookahead-buffer proxy. Allow setup plus those laps on the phone project.
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePlayback(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Two lap timing study');
    await page.getByLabel('Chords in this bar').fill('C Dm G7');
    await page.getByLabel('Length of chord 1 (C)', { exact: true }).selectOption('2');
    await page.getByLabel('Length of chord 2 (Dm)', { exact: true }).selectOption('1');
    await page.getByLabel('Length of chord 3 (G7)', { exact: true }).selectOption('1');

    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByText('Key or meter change', { exact: true }).click();
    await page.getByLabel('Key from this bar').selectOption('G');
    await page.getByLabel('Meter from this bar').selectOption('3/4');
    await page.getByLabel('Chords in this bar').fill('I V');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByLabel('Meter from this bar').selectOption('4/4');
    await page.getByLabel('Chords in this bar').fill('I');
    await page.getByRole('button', { name: 'Next bar', exact: true }).click();
    await page.getByLabel('Key from this bar').selectOption('C');
    await page.getByLabel('Chords in this bar').fill('F');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    await page.getByLabel('Feel', { exact: true }).selectOption('Rock');
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    await expect(page.locator('.error-banner')).toHaveCount(0);

    const expectedChords = [
        { start: 0, end: 8, name: 'C', key: 'C' },
        { start: 8, end: 12, name: 'Dm', key: 'C' },
        { start: 12, end: 16, name: 'G7', key: 'C' },
        { start: 16, end: 22, name: 'G', key: 'G' },
        { start: 22, end: 28, name: 'D', key: 'G' },
        { start: 28, end: 44, name: 'G', key: 'G' },
        { start: 44, end: 60, name: 'F', key: 'C' },
    ];
    await expect(page.locator('.chord')).toHaveText(expectedChords.map((chord) => chord.name));
    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.notes = [];
        evidence.highlights = [];
        evidence.snapshots = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (chord) => chord.start === 0,
                        ).length,
                ),
            {
                timeout: 25_000,
                message: 'Chart should finish two complete laps and start its third',
            },
        )
        .toBeGreaterThanOrEqual(3);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    const evidence = await page.evaluate(() => {
        window.__semanticPlaybackEvidence.armed = false;
        return window.__semanticPlaybackEvidence;
    });

    expect(evidence.workerURLs.length).toBeGreaterThan(0);
    expect(evidence.sourceLeaks).toEqual([]);
    expect(evidence.errors).toEqual([]);
    expect(pageErrors).toEqual([]);
    const playbackSnapshots = evidence.snapshots.filter((snapshot) => snapshot.totalSteps === 60);
    expect(playbackSnapshots.length).toBeGreaterThan(0);
    expect(playbackSnapshots.some((snapshot) => snapshot.type === 'flush')).toBe(true);
    for (const snapshot of playbackSnapshots) {
        expect(snapshot.chords).toEqual(expectedChords);
        expect(snapshot.measures).toEqual([
            { start: 0, end: 16, ts: '4/4', grouping: [2, 2] },
            { start: 16, end: 28, ts: '3/4', grouping: [3] },
            { start: 28, end: 44, ts: '4/4', grouping: [2, 2] },
            { start: 44, end: 60, ts: '4/4', grouping: [2, 2] },
        ]);
    }
    const lap = expectedChords.map(({ start, end, name }) => ({ start, end, name }));
    expectVisitsFollowForm(evidence.highlights, lap);
    for (const [start, end] of [
        [0, 60],
        [60, 120],
        [120, 180],
    ]) {
        expect(evidence.notes.some((note) => note.step >= start && note.step < end)).toBe(true);
    }
    expect(evidence.nonzeroAudioSamples).toBeGreaterThan(0);
    expect(evidence.secondLapAudioSamples).toBeGreaterThan(0);
});

test('repeat visits follow the real band while the music stand keeps four written bars', async ({
    page,
}, info) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await observePlayback(page);
    await page.goto('/v2/');
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
    await expect(page.locator('.bar')).toHaveCount(4);
    await expect(page.locator('.chord')).toHaveText(['C', 'G', 'Am', 'F']);
    await expect(page.getByLabel('Ending passes 1', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Ending passes 2', { exact: true })).toBeVisible();
    const written = await page
        .locator('.bar')
        .evaluateAll((bars) => bars.map((bar) => bar.getAttribute('data-measure-id')));
    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.snapshots = [];
        evidence.highlights = [];
        evidence.notes = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (event) => event.start === 0,
                        ).length,
                ),
            { timeout: 25_000 },
        )
        .toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: info.outputPath('repeat-stand.png') });
    await expect(page.locator('.bar')).toHaveCount(4);
    expect(
        await page
            .locator('.bar')
            .evaluateAll((bars) => bars.map((bar) => bar.getAttribute('data-measure-id'))),
    ).toEqual(written);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
    );
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    const evidence = await page.evaluate(() => {
        window.__semanticPlaybackEvidence.armed = false;
        return window.__semanticPlaybackEvidence;
    });
    const names = ['C', 'G', 'Am', 'C', 'G', 'F'];
    const lap = names.map((name, index) => ({ name, start: index * 16, end: (index + 1) * 16 }));
    expectVisitsFollowForm(evidence.highlights, lap);
    const snapshots = evidence.snapshots.filter((snapshot) => snapshot.totalSteps === 96);
    expect(snapshots.some((snapshot) => snapshot.type === 'flush')).toBe(true);
    for (const snapshot of snapshots) {
        expect(snapshot.chords).toEqual(lap.map((chord) => ({ ...chord, key: 'C' })));
        expect(snapshot.measures).toEqual(
            lap.map(({ start, end }) => ({ start, end, ts: '4/4', grouping: [2, 2] })),
        );
    }
    expect(evidence.sourceLeaks).toEqual([]);
    expect(evidence.errors).toEqual([]);
    expect(errors).toEqual([]);
    expect(evidence.notes.some((note) => note.step >= 96 && note.step < 192)).toBe(true);
    expect(evidence.nonzeroAudioSamples).toBeGreaterThan(0);
    expect(evidence.secondLapAudioSamples).toBeGreaterThan(0);
});

test('section practice loop (#1211) confines playback and clears on release, Escape and Stop', async ({
    page,
}) => {
    test.setTimeout(60_000);
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await observePlayback(page);
    await page.goto('/v2/');
    await page.getByRole('button', { name: '＋ New song', exact: true }).click();
    await editorRevealed(page);
    await page.getByLabel('Song title').fill('Section loop study');
    // The new-song default already gives section A four distinct bars
    // (C, G, Am, F) — no bar editing needed there. Add a second section with a
    // chord name ('Dm7') that never appears in A, so the highlight sequence
    // alone proves whether playback ever crossed the section boundary.
    await page.getByRole('button', { name: '＋ Section', exact: true }).click();
    await page.getByLabel('Chords in this bar').fill('Dm7');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
    const tempo = page.getByLabel('Tempo', { exact: true });
    await tempo.fill('240');
    await tempo.press('Enter');
    await expect(tempo).toHaveValue('240');
    await expect(page.locator('.error-banner')).toHaveCount(0);

    const sectionA = page.getByRole('button', {
        name: 'Section A · hold to practice-loop',
        exact: true,
    });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // Long-press (simulated as a held click) arms the loop on section A.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.section-loop.active')).toHaveCount(1);

    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.highlights = [];
        evidence.snapshots = [];
        evidence.notes = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop playback', exact: true })).toBeEnabled();

    // Two-plus laps of the looped section (the fourth 'C' visit) must land
    // with zero 'Dm7' visits: the loop fold never lets the form cross into B.
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (chord) => chord.name === 'C',
                        ).length,
                ),
            {
                timeout: 25_000,
                message: 'Section A should loop at least twice while armed',
            },
        )
        .toBeGreaterThanOrEqual(3);
    const confinedHighlights = await page.evaluate(
        () => window.__semanticPlaybackEvidence.highlights,
    );
    expect(confinedHighlights.every((chord) => chord.name !== 'Dm7')).toBe(true);

    // Long-press again releases the loop; the form then resumes into section B.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);
    await expect
        .poll(
            () =>
                page.evaluate(() =>
                    window.__semanticPlaybackEvidence.highlights.some(
                        (chord) => chord.name === 'Dm7',
                    ),
                ),
            {
                timeout: 20_000,
                message: 'Form should resume into section B once the loop is released',
            },
        )
        .toBe(true);

    // Stop clears an armed/live loop (#1211 acceptance): re-arm on A, start again,
    // confirm the fold, then Stop and verify the loop drops immediately.
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Start playback', exact: true })).toBeEnabled();
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => {
        const evidence = window.__semanticPlaybackEvidence;
        evidence.highlights = [];
        evidence.armed = true;
    });
    await page.getByRole('button', { name: 'Start playback', exact: true }).click();
    await expect
        .poll(
            () =>
                page.evaluate(
                    () =>
                        window.__semanticPlaybackEvidence.highlights.filter(
                            (chord) => chord.name === 'C',
                        ).length,
                ),
            { timeout: 20_000 },
        )
        .toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Stop playback', exact: true }).click();
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // Escape clears an armed (not-yet-playing) loop too.
    await sectionA.click({ delay: 600 });
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.section-loop.active')).toHaveCount(0);

    // The keyboard path to the same toggle: a long-press has no keyboard
    // equivalent, so 'L' on the focused label is the accessible route in.
    // Enter must stay inert — that gesture is banked for #937.
    await sectionA.focus();
    await page.keyboard.press('Enter');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('l');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.section-loop.active')).toHaveCount(1);
    await page.keyboard.press('l');
    await expect(sectionA).toHaveAttribute('aria-pressed', 'false');

    const evidence = await page.evaluate(() => {
        window.__semanticPlaybackEvidence.armed = false;
        return window.__semanticPlaybackEvidence;
    });
    expect(evidence.sourceLeaks).toEqual([]);
    expect(evidence.errors).toEqual([]);
    expect(pageErrors).toEqual([]);
});
