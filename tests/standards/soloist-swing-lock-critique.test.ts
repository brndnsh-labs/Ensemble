// @ts-nocheck
/**
 * Critique (#1066): the soloist locks to the band's swing, no residual
 * straightening.
 *
 * Before this fix, `scheduleGlobalEvent` (scheduler-core.ts) blended the
 * soloist's onset time back toward the UNSWUNG grid clock
 * (`playback.unswungNextNoteTime`) via a `straightness` factor as high as
 * 0.75 (Bossa) / 0.65 (the generic default — Jazz wasn't even a named case,
 * despite being the most swing-critical genre). At the default 0.65 the lead
 * received only 35% of the band's swing displacement, floating ahead of a
 * shuffled ride instead of locking with it — musically backwards: in a
 * swing/shuffle idiom the melody should be the MOST swung element.
 *
 * The fix deletes the blend entirely. The soloist now takes the exact same
 * swung grid time (`swungTime`) as every other lane (matching bass's S5
 * migration off the shared jittered `t`), with only its own lane pocket
 * (`getBandPocket`, #1005/#1025) layered on top via the note's
 * `timingOffset` — exactly like bass/comp/harmony.
 *
 * This guard drives the REAL `scheduleGlobalEvent` (not a re-derivation of
 * its math) with a genuinely swung grid time (swing:60, matching the Jazz
 * idiom's `expectedSub` from swing-ratio-audit.test.ts) and asserts the time
 * actually handed to the audio voice (`playSoloNote`) is exactly
 * `swungTime + timingOffset` — no other term, regardless of genre or
 * soloist.style (the deleted formula special-cased `neo`/`blues`/`bossa`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBandPocket } from '../../public/engine/coordination-engine.js';
import { calculateStepDuration } from '../../public/engine/groove-engine.js';
import { scheduleGlobalEvent } from '../../public/engine/scheduler-core.js';

vi.mock('../../public/worker-client.js', () => ({
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    requestBuffer: vi.fn(),
    requestResolution: vi.fn(),
}));

vi.mock('../../public/platform.js', () => ({
    lockAudio: vi.fn(),
    unlockAudio: vi.fn(),
    deactivateWakeLock: vi.fn(),
    activateWakeLock: vi.fn(),
    initPlatform: vi.fn(),
}));

vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    killAllNotes: vi.fn(),
    restoreGains: vi.fn(),
    playNote: vi.fn(),
    playSoloNote: vi.fn(),
    playBassNote: vi.fn(),
    playDrumSound: vi.fn(),
    updateSustain: vi.fn(),
    killHarmonyNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
}));

vi.mock('../../public/controllers/midi-controller.js', () => ({
    panic: vi.fn(),
    sendMIDITransport: vi.fn(),
    sendMIDINote: vi.fn(),
    sendMIDICC: vi.fn(),
    sendMIDIDrum: vi.fn(),
    normalizeMidiVelocity: vi.fn((v: number) => Math.floor(v * 127)),
}));

vi.mock('../../public/engine/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

vi.mock('../../public/controllers/instrument-controller.js', () => ({
    flushBuffers: vi.fn(),
    loadDrumPreset: vi.fn(),
}));

vi.mock('../../public/ui.js', () => ({
    triggerFlash: vi.fn(),
}));

// Real swing math (groove-engine.ts) — a genuinely swung grid time at
// swing:60, on Jazz's idiomatic 8th-note grid (swing-ratio-audit.test.ts).
// Step 2 is the 3rd 16th of beat 1 (subIndex 2 on the 8th-swing weighting),
// distinctly displaced from the straight `step * stepSec` grid.
function swungTimeAt(step: number, bpm: number, groove: { swing: number; swingSub: string }) {
    const ts = { stepsPerBeat: 4 };
    let t = 0;
    for (let s = 0; s < step; s++) {
        t += calculateStepDuration(s, bpm, ts, groove);
    }
    return t;
}

function makeState({
    genre,
    soloistStyle,
    timingOffset,
    swing,
    swingSub,
}: {
    genre: string;
    soloistStyle: string;
    timingOffset: number;
    swing: number;
    swingSub: string;
}) {
    const bpm = 120;
    const step = 2;
    const buffer = new Map();
    buffer.set(step, [
        {
            freq: 440,
            midi: 69,
            durationSteps: 4,
            velocity: 1,
            timingOffset,
            style: soloistStyle,
            vibrato: null,
            expression: null,
            bendStartInterval: 0,
        },
    ]);

    const state = {
        playback: {
            isPlaying: true,
            autoIntensity: false,
            drawQueue: [],
            bandIntensity: 0.6,
            bpm,
            audio: { currentTime: 0, state: 'running' },
            metronome: false,
            countIn: false,
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: 32,
            measureMap: [],
            stepMap: [
                { start: 0, end: 16, chord: { sectionId: 's1', freqs: [440, 554, 659], beats: 4 } },
                {
                    start: 16,
                    end: 32,
                    chord: { sectionId: 's2', freqs: [440, 554, 659], beats: 4 },
                },
            ],
        },
        chords: { buffer: new Map(), scheduledChordIndex: 0 },
        groove: {
            instruments: [{ name: 'Snare', steps: Array(16).fill(0) }],
            measures: 1,
            humanize: 0,
            genreFeel: genre,
            swing,
            swingSub,
        },
        soloist: {
            enabled: true,
            style: soloistStyle,
            mode: 'mono',
            session: { tension: 0.5 },
            audio: { buffer, lastFreq: null, lastNoteEnd: -1 },
        },
        bass: { buffer: new Map() },
        harmony: { buffer: new Map() },
        midi: { enabled: false },
        vizState: { enabled: false },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
    } as any;

    return { state, step, bpm };
}

describe('Soloist swing lock (#1066) — no residual straightening blend', () => {
    let playSoloNoteMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const engine = await import('../../public/engine/engine.js');
        playSoloNoteMock = engine.playSoloNote as ReturnType<typeof vi.fn>;
        playSoloNoteMock.mockClear();
    });

    it('at swing:60, the soloist onset equals swungTime + the band pocket lane offset — exactly, no straightening term', () => {
        const genre = 'Jazz';
        const timingOffset = getBandPocket(genre, null); // #1005/#1025 lane pocket, e.g. +8ms for Jazz
        const { state, step, bpm } = makeState({
            genre,
            soloistStyle: 'smart',
            timingOffset,
            swing: 60,
            swingSub: '8th',
        });
        const swungTime = swungTimeAt(step, bpm, state.groove);

        // Sanity: swing:60 genuinely displaces this step off the straight grid —
        // otherwise the assertion below would pass vacuously even with the old
        // blend reinstated (both formulas agree at swing:0).
        const stepSec = 60 / bpm / 4;
        expect(Math.abs(swungTime - step * stepSec)).toBeGreaterThan(0.001);

        scheduleGlobalEvent(state, step, swungTime, undefined);

        expect(playSoloNoteMock).toHaveBeenCalledTimes(1);
        const [, , finalTime] = playSoloNoteMock.mock.calls[0];
        expect(finalTime).toBeCloseTo(swungTime + timingOffset, 10);

        // Regression pin: the deleted formula would have pulled this onset back
        // toward the UNSWUNG grid time (`step * stepSec`) by 35% (the generic
        // 0.65 straightness). Confirm we're nowhere near that stale value.
        const oldStraightness = 0.65;
        const unswungTime = step * stepSec;
        const oldBlendTime =
            unswungTime * oldStraightness + swungTime * (1.0 - oldStraightness) + timingOffset;
        expect(Math.abs(finalTime - oldBlendTime)).toBeGreaterThan(0.005);
    });

    it('holds across every genre/style the deleted formula used to special-case (neo/blues/bossa) plus a plain default', () => {
        const cases: Array<{ genre: string; style: string }> = [
            { genre: 'Jazz', style: 'smart' },
            { genre: 'Neo-Soul', style: 'neo' },
            { genre: 'Blues', style: 'blues' },
            { genre: 'Bossa Nova', style: 'bossa' },
            { genre: 'Reggae', style: 'smart' },
        ];
        const report: string[] = [];

        for (const { genre, style } of cases) {
            const timingOffset = getBandPocket(genre, null);
            const { state, step, bpm } = makeState({
                genre,
                soloistStyle: style,
                timingOffset,
                swing: 60,
                swingSub: '8th',
            });
            const swungTime = swungTimeAt(step, bpm, state.groove);

            scheduleGlobalEvent(state, step, swungTime, undefined);

            const calls = playSoloNoteMock.mock.calls;
            const [, , finalTime] = calls[calls.length - 1];
            expect(finalTime, `${genre}/${style} onset`).toBeCloseTo(swungTime + timingOffset, 10);
            report.push(
                `  ${genre.padEnd(10)} style=${style.padEnd(6)} swungTime=${swungTime.toFixed(4)}s ` +
                    `pocket=${(timingOffset * 1000).toFixed(1)}ms onset=${finalTime.toFixed(4)}s`,
            );
        }

        console.log('\n=== Soloist Swing Lock (#1066) — onset = swungTime + lane pocket ===');
        console.log(report.join('\n'));
        console.log('=====================================================================\n');
    });
});
