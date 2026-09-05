import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetBassState } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { generateDrumFills, generateDrumOrchestration } from '../../public/engine/drum-seeder.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { createPRNG } from '../../public/engine/hash-utils.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { resetSoloistState } from '../../public/engine/soloist-session.js';
import { applyWorkerTransition, generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { bootstrapEnsembleAudit } from '../../scripts/ensemble-analysis-utils.js';

const SEED = 'PRACTICE_RELIABILITY';
const SCENES = [
    {
        genre: 'Rock',
        bpm: 118,
        meter: '4/4',
        values: ['C | G', 'Am | F'],
        chords: ['C', 'G', 'Am', 'F'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Jazz',
        bpm: 138,
        meter: '4/4',
        values: ['Dm7 | G7', 'Cmaj7 | Cmaj7'],
        chords: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Blues',
        bpm: 120,
        meter: '6/8',
        values: ['G7 | C7', 'Eb7#9 D7alt | G7'],
        chords: ['G7', 'C7', 'Eb7#9', 'D7alt', 'G7'],
        lengths: [12, 12, 6, 6, 12],
    },
];

async function buildScene(scene: (typeof SCENES)[number], muted: boolean) {
    const boot = await bootstrapEnsembleAudit({
        genre: scene.genre,
        bpm: scene.bpm,
        intensity: 0.7,
        timeSignature: scene.meter,
        seed: SEED,
        bassStyle: undefined,
        chordStyle: undefined,
        drumPreset: undefined,
        harmonyStyle: undefined,
        soloistStyle: undefined,
    });
    const detached = cloneStateForDetachedGeneration(boot.state);
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        groove: { ...detached.groove },
        soloist: { ...detached.soloist, session: { ...detached.soloist.session } },
        harmony: { ...detached.harmony },
    };
    state.arranger.sections = scene.values.map((value, index) => ({
        id: `practice-${index}`,
        label: index === 0 ? 'Verse' : 'Chorus',
        value,
        key: 'C',
        timeSignature: scene.meter,
    }));
    state.arranger.seed = SEED;
    validateProgression(state);
    state.soloist.session.seed = generateSessionSeed(
        state,
        state.arranger,
        boot.seedStyle,
        0.7,
        SEED,
    );
    state.groove.sectionSeedMap = Object.fromEntries(
        state.arranger.sectionMap.map((section) => [
            section.id,
            createPRNG(`${SEED}:${section.id}`)(),
        ]),
    );
    state.groove.orchestrationMap = generateDrumOrchestration(
        state,
        state.arranger,
        scene.genre,
        0.7,
        SEED,
    );
    state.groove.fillMap = generateDrumFills(state, state.arranger, scene.genre, 0.7, SEED);
    state.soloist.enabled = !muted;
    state.harmony.enabled = !muted;
    return state;
}

function capture(initial: Awaited<ReturnType<typeof buildScene>>, ambientRandom: number) {
    const state = cloneStateForDetachedGeneration(initial);
    resetSoloistState(state);
    resetBassState(state);
    resetHiddenGenerationMemory(state);

    // Deliberately bracket ambient randomness AFTER explicit seed creation. This
    // must not be a seeded analysis wrapper that conceals live RNG dependencies.
    const random = vi.spyOn(Math, 'random').mockReturnValue(ambientRandom);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const carryover = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
    const conductor = { loopCount: 0, formIteration: 0, totalLoops: 2 };
    const chartCursor = { index: 0, sectionIndex: 0 };
    const trace = [];
    try {
        for (let step = 0; step < state.arranger.totalSteps * 2; step++) {
            applyWorkerTransition(state, step, conductor);
            const result = generateNotesForStep(
                state,
                step,
                cursors,
                {
                    includeBass: true,
                    includeChords: true,
                    includeDrums: true,
                    includeSoloist: true,
                    includeHarmony: true,
                },
                carryover,
            );
            carryover.lastActiveSoloistMidi = result.coordination.lastActiveSoloistMidi;
            carryover.lastActiveSoloistStep = result.coordination.lastActiveSoloistStep;
            const position = getChordAtStep(step, state.arranger, chartCursor);
            trace.push({
                step,
                chord: position?.chord.absName,
                sectionStart: position?.sectionStart,
                bpm: state.playback.bpm,
                notes: structuredClone(result.notes),
                drums: structuredClone(result.drumHits),
            });
        }
        const processor = new ExportProcessor(state, { loopMode: 'time', targetDuration: 0.5 });
        try {
            return {
                trace,
                totalSteps: state.arranger.totalSteps,
                times: [...processor.stepTimes],
            };
        } finally {
            processor.cleanup();
        }
    } finally {
        random.mockRestore();
    }
}

afterEach(() => vi.restoreAllMocks());

describe.each(SCENES)('$genre $meter practice reliability (#1134)', (scene) => {
    it('replays fresh seeded performances independently of ambient randomness', async () => {
        const initial = await buildScene(scene, false);
        const first = capture(initial, 0.05);
        const second = capture(initial, 0.95);
        for (const module of ['bass', 'chords', 'soloist', 'harmony']) {
            expect(
                first.trace.some((tick) =>
                    tick.notes.some(
                        (note) =>
                            note.module === module && (note.midi ?? 0) > 0 && note.muted !== true,
                    ),
                ),
                module,
            ).toBe(true);
        }
        expect(first.trace.some((tick) => tick.drums.length > 0)).toBe(true);
        expect(second.times).toEqual(first.times);
        expect(second.trace).toHaveLength(first.trace.length);
        first.trace.forEach((tick, index) => {
            expect(second.trace[index], `replay at step ${index}`).toEqual(tick);
        });
    });

    it('keeps chart ownership and elapsed time while leaving the practice lanes silent', async () => {
        const { trace, totalSteps, times } = capture(await buildScene(scene, true), 0.5);
        const expectedLength = scene.lengths.reduce((sum, length) => sum + length, 0);
        expect(totalSteps).toBe(expectedLength);
        expect(trace).toHaveLength(expectedLength * 2);
        for (let loop = 0; loop < 2; loop++) {
            let start = loop * expectedLength;
            scene.lengths.forEach((length, index) => {
                for (let step = start; step < start + length; step++) {
                    expect(trace[step].chord, `chord at ${step}`).toBe(scene.chords[index]);
                    expect(trace[step].sectionStart).toBe(
                        index < 2 ? 0 : scene.lengths[0] + scene.lengths[1],
                    );
                    expect(trace[step].bpm).toBe(scene.bpm);
                }
                // Boundaries preserve quarter-note BPM even when inner steps swing.
                expect(times[start + length] - times[start]).toBeCloseTo(
                    (length * 60) / scene.bpm / 4,
                    9,
                );
                start += length;
            });
        }
        expect(
            trace
                .flatMap((tick) => tick.notes)
                .filter((note) => note.module === 'soloist' || note.module === 'harmony'),
        ).toHaveLength(0);
        for (const module of ['bass', 'chords']) {
            expect(
                trace.some((tick) =>
                    tick.notes.some(
                        (note) =>
                            note.module === module && (note.midi ?? 0) > 0 && note.muted !== true,
                    ),
                ),
                module,
            ).toBe(true);
        }
        expect(trace.some((tick) => tick.drums.length > 0)).toBe(true);
        if (scene.genre === 'Jazz') {
            expect(times[2] - times[0]).toBeGreaterThan(times[4] - times[2]);
        }
    });
});
