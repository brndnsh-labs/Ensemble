import { expect, type Page, test } from '@playwright/test';
import type { WorkerRequest, WorkerResponse } from '../../../public/worker-types.js';

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
        new MutationObserver(() => {
            if (!evidence.armed) {
                return;
            }
            const chord = document.querySelector('.chord[aria-current="true"]');
            if (!chord) {
                return;
            }
            const next = {
                start: Number(chord.getAttribute('data-start-step')),
                end: Number(chord.getAttribute('data-end-step')),
                name: chord.textContent?.trim() ?? '',
            };
            if (evidence.highlights.at(-1)?.start !== next.start) {
                evidence.highlights.push(next);
            }
        }).observe(document, {
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-current'],
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
    expect(evidence.highlights.slice(0, lap.length * 2 + 1)).toEqual([...lap, ...lap, lap[0]]);
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
