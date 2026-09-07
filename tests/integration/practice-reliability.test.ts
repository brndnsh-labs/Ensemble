import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENRE_NAMES, SMART_GENRES } from '../../public/data/smart-genres.js';
import { SOUND_PACKS } from '../../public/data/sound-packs.js';
import { resetBassState } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { compingState } from '../../public/engine/comping-state.js';
import {
    generateDrumFills,
    generateDrumOrchestration,
    generateSoloistAccents,
} from '../../public/engine/drum-seeder.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { createPRNG } from '../../public/engine/hash-utils.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../public/engine/instrument-registry.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { resetSoloistState } from '../../public/engine/soloist-session.js';
import * as tickLogic from '../../public/engine/tick-logic.js';
import {
    applyWorkerTransition,
    generateNotesForStep,
    type NoteResult,
} from '../../public/engine/tick-logic.js';
import { fillBuffers } from '../../public/engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from '../../public/engine/worker-orchestrator.js';
import { getChordAtStep } from '../../public/engine/worker-utils.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { handleEffects } from '../../public/state/state-effects.js';
import { dispatch } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import type { WorkerResponse } from '../../public/worker-types.js';
import { enterGenre } from '../utils/genre-entry.js';

const SEEDS = ['PRACTICE_RELIABILITY', 'GENRE_RETURN_1159'];
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
        genre: 'Acoustic',
        bpm: 100,
        meter: '3/4',
        values: ['C | Am', 'F | G'],
        chords: ['C', 'Am', 'F', 'G'],
        lengths: [12, 12, 12, 12],
    },
    {
        genre: 'Blues',
        bpm: 120,
        meter: '6/8',
        values: ['G7 | C7', 'Eb7#9 D7alt | G7'],
        chords: ['G7', 'C7', 'Eb7#9', 'D7alt', 'G7'],
        lengths: [12, 12, 6, 6, 12],
    },
    {
        genre: 'Funk',
        bpm: 105,
        meter: '4/4',
        values: ['Dm7 | G7', 'Dm7 | Dm7'],
        chords: ['Dm7', 'G7', 'Dm7', 'Dm7'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Disco',
        bpm: 118,
        meter: '4/4',
        values: ['Am7 | Dm7', 'G7 | Cmaj7'],
        chords: ['Am7', 'Dm7', 'G7', 'Cmaj7'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Hip Hop',
        bpm: 85,
        meter: '4/4',
        values: ['Cm7 | Fm7', 'Abmaj7 | G7'],
        chords: ['Cm7', 'Fm7', 'Abmaj7', 'G7'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Neo-Soul',
        bpm: 88,
        meter: '4/4',
        values: ['Dm9 | G13', 'Cmaj9 | Am9'],
        chords: ['Dm9', 'G13', 'Cmaj9', 'Am9'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Reggae',
        bpm: 78,
        meter: '4/4',
        values: ['C | F', 'G | C'],
        chords: ['C', 'F', 'G', 'C'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Bossa',
        bpm: 130,
        meter: '4/4',
        values: ['Dm7 | G7', 'Cmaj7 | Am7'],
        chords: ['Dm7', 'G7', 'Cmaj7', 'Am7'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Country',
        bpm: 110,
        meter: '4/4',
        values: ['C | F', 'G7 | C'],
        chords: ['C', 'F', 'G7', 'C'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Metal',
        bpm: 150,
        meter: '4/4',
        values: ['Em | C', 'D | Em'],
        chords: ['Em', 'C', 'D', 'Em'],
        lengths: [16, 16, 16, 16],
    },
    {
        genre: 'Ska-Punk',
        bpm: 160,
        meter: '4/4',
        values: ['C | F', 'G | C'],
        chords: ['C', 'F', 'G', 'C'],
        lengths: [16, 16, 16, 16],
    },
];

async function buildScene(
    scene: (typeof SCENES)[number],
    seed = SEEDS[0],
    intensity = 0.55,
    options: { player?: string; leadInMeter?: string } = {},
) {
    const live = await enterGenre(scene.genre, scene.meter);
    if (options.player) {
        const payload = { module: 'chords', style: options.player };
        dispatch(ACTIONS.SET_STYLE, payload);
        handleEffects({ type: ACTIONS.SET_STYLE, payload }, live, { dispatch });
    }
    const detached = cloneStateForDetachedGeneration(live);
    const state = {
        ...detached,
        playback: {
            ...detached.playback,
            bpm: scene.bpm,
            bandIntensity: intensity,
            complexity: intensity,
            autoIntensity: false,
        },
        arranger: { ...detached.arranger, timeSignature: scene.meter },
        groove: { ...detached.groove },
        soloist: { ...detached.soloist, session: { ...detached.soloist.session } },
        harmony: { ...detached.harmony },
    };
    state.arranger.sections = [...scene.values, scene.values[0]].map((value, index) => ({
        id: `practice-${index}`,
        label: index === 1 ? 'Chorus' : 'Verse',
        value,
        key: 'C',
        timeSignature: index === 0 ? (options.leadInMeter ?? scene.meter) : scene.meter,
    }));
    // Enable the two optional lanes for this explicitly full-band scene; keep
    // the genre's chosen styles/sounds untouched (Acoustic remains strings).
    state.soloist.enabled = true;
    state.harmony.enabled = true;
    state.arranger.seed = seed;
    validateProgression(state);
    state.soloist.session.seed = generateSessionSeed(
        state,
        state.arranger,
        state.soloist.style!,
        intensity,
        seed,
    );
    state.groove.sectionSeedMap = Object.fromEntries(
        state.arranger.sectionMap.map((section) => [
            section.id,
            createPRNG(`${seed}:${section.id}`)(),
        ]),
    );
    state.groove.orchestrationMap = generateDrumOrchestration(
        state,
        state.arranger,
        state.groove.genreFeel!,
        intensity,
        seed,
    );
    state.groove.fillMap = generateDrumFills(
        state,
        state.arranger,
        state.groove.genreFeel!,
        intensity,
        seed,
        state.soloist.session.seed,
    );
    state.groove.accentMap = generateSoloistAccents(
        state,
        state.arranger,
        state.soloist.session.seed,
        state.groove.genreFeel!,
        intensity,
        seed,
    );
    return state;
}

function withPracticeMute(
    initial: Awaited<ReturnType<typeof buildScene>>,
    muted: 'soloist' | 'harmony' | null,
) {
    const detached = cloneStateForDetachedGeneration(initial);
    return {
        ...detached,
        soloist: { ...detached.soloist, enabled: muted !== 'soloist' && detached.soloist.enabled },
        harmony: { ...detached.harmony, enabled: muted !== 'harmony' && detached.harmony.enabled },
    };
}

function capture(initial: Awaited<ReturnType<typeof buildScene>>, ambientRandom: number) {
    const detached = cloneStateForDetachedGeneration(initial);
    const state = { ...detached, playback: { ...detached.playback } };
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
            state.playback.currentLoopCount = Math.floor(step / state.arranger.totalSteps);
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
                    noLiveConductor: true,
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

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    __resetPackCacheForTest();
});

it('covers exactly the user-facing genre canon', () => {
    expect(SCENES.map((scene) => scene.genre).sort()).toEqual([...GENRE_NAMES].sort());
});

function isAudibleAttack(note: Pick<NoteResult, 'midi' | 'velocity' | 'muted'>) {
    return (
        Number.isFinite(note.midi) &&
        (note.midi ?? 0) > 0 &&
        note.muted !== true &&
        Number.isFinite(note.velocity) &&
        (note.velocity ?? 0) > 0
    );
}

function assertBacking(trace: ReturnType<typeof capture>['trace'], width: number) {
    // Require support across each six-bar form phrase, allowing the deliberate
    // offbeats, syncopation and rests in the established genre players.
    for (let start = 0; start < trace.length; start += width) {
        const phrase = trace.slice(start, start + width);
        for (const module of ['bass', 'chords']) {
            expect(
                phrase.some((tick) =>
                    tick.notes.some((note) => note.module === module && isAudibleAttack(note)),
                ),
                `${module} support in phrase ${start}`,
            ).toBe(true);
        }
        expect(
            phrase.some((tick) => tick.drums.length > 0),
            `drums in phrase ${start}`,
        ).toBe(true);
    }
}

function chartTrace(performance: ReturnType<typeof capture>) {
    return performance.trace.map(({ notes: _notes, drums: _drums, ...tick }) => tick);
}

describe.each(SCENES)('$genre $meter real-preset practice reliability (#1159)', (scene) => {
    it.each(SEEDS)(
        'preserves seeded replay, chart and backing at three energies: %s',
        async (seed) => {
            for (const intensity of [0.2, 0.55, 0.9]) {
                const initial = await buildScene(scene, seed, intensity);
                const profile = SMART_GENRES[scene.genre];
                expect(initial.groove.genreFeel).toBe(profile.feel);
                expect(initial.groove.lastDrumPreset).toBe(profile.drum);
                expect([
                    initial.bass.style,
                    initial.chords.style,
                    initial.soloist.style,
                    initial.harmony.style,
                ]).toEqual([profile.bass, profile.chord, profile.soloist, profile.harmony]);
                const first = capture(initial, 0.05);
                const second = capture(initial, 0.95);
                expect(second).toEqual(first);
                if (scene.genre === 'Jazz') {
                    expect(first.times[2] - first.times[0]).toBeGreaterThan(
                        first.times[4] - first.times[2],
                    );
                }
                const lengths = [...scene.lengths, ...scene.lengths.slice(0, 2)];
                const chords = [...scene.chords, ...scene.chords.slice(0, 2)];
                const expectedLength = lengths.reduce((sum, length) => sum + length, 0);
                expect(first.totalSteps).toBe(expectedLength);
                expect(first.trace).toHaveLength(expectedLength * 2);
                for (let loop = 0; loop < 2; loop++) {
                    let start = loop * expectedLength;
                    lengths.forEach((length, index) => {
                        const sectionStart =
                            index < 2
                                ? 0
                                : index < scene.lengths.length
                                  ? scene.lengths[0] + scene.lengths[1]
                                  : scene.lengths.reduce((sum, count) => sum + count, 0);
                        for (let step = start; step < start + length; step++) {
                            expect(first.trace[step].chord, `chord at ${step}`).toBe(chords[index]);
                            expect(first.trace[step].sectionStart).toBe(sectionStart);
                            expect(first.trace[step].bpm).toBe(scene.bpm);
                        }
                        expect(first.times[start + length] - first.times[start]).toBeCloseTo(
                            (length * 60) / scene.bpm / 4,
                            9,
                        );
                        start += length;
                    });
                }
                const phraseWidth = initial.arranger.totalSteps;
                assertBacking(first.trace, phraseWidth);
                for (const module of ['soloist', 'harmony'] as const) {
                    expect(
                        first.trace.some((tick) =>
                            tick.notes.some(
                                (note) => note.module === module && isAudibleAttack(note),
                            ),
                        ),
                        `${module} active before mute`,
                    ).toBe(true);
                    const muted = withPracticeMute(initial, module);
                    const silent = capture(muted, 0.05);
                    expect(
                        silent.trace
                            .flatMap((tick) => tick.notes)
                            .filter((note) => note.module === module),
                    ).toHaveLength(0);
                    expect(chartTrace(silent)).toEqual(chartTrace(first));
                    expect(silent.times).toEqual(first.times);
                    assertBacking(silent.trace, phraseWidth);
                }
            }
        },
    );
});

function capturePractice(
    initial: Awaited<ReturnType<typeof buildScene>>,
    ambientRandom: number,
    expectChordBacking = true,
) {
    const detached = cloneStateForDetachedGeneration(initial);
    const state = { ...detached, playback: { ...detached.playback } };
    const section = state.arranger.sectionMap[1];
    const width = section.end - section.start;
    state.playback.loopStartStep = section.start;
    state.playback.loopEndStep = section.end;
    resetSoloistState(state);
    resetBassState(state);
    resetHiddenGenerationMemory(state);
    resetWorkerContext(section.start);
    const random = vi.spyOn(Math, 'random').mockReturnValue(ambientRandom);
    const generated = vi.spyOn(tickLogic, 'generateNotesForStep');
    const messages: WorkerResponse[] = [];
    vi.stubGlobal('postMessage', (message: WorkerResponse) => messages.push(message));
    const previousLookahead = workerContext.LOOKAHEAD;
    try {
        workerContext.LOOKAHEAD = width * 3;
        fillBuffers(state, section.start);
        // Observe the real generator boundary: the buffer stays monotonic but
        // music must return to this section, never proceed into the next Verse.
        expect(generated.mock.calls.map((call) => call[1])).toEqual(
            Array.from({ length: width * 3 }, (_, index) => section.start + (index % width)),
        );
        const notes = messages.flatMap((message) => ('notes' in message ? message.notes : []));
        expect(notes.length).toBeGreaterThan(0);
        expect(
            notes.every(
                (note) => note.step >= section.start && note.step < section.start + width * 3,
            ),
        ).toBe(true);
        for (let lap = 0; lap < 3; lap++) {
            expect(
                notes.some(
                    (note) =>
                        note.module === 'bass' &&
                        isAudibleAttack(note) &&
                        note.step >= section.start + lap * width &&
                        note.step < section.start + (lap + 1) * width,
                ),
                `bass supports practice return ${lap}`,
            ).toBe(true);
        }
        expect(
            notes.some((note) => note.module === 'chords' && isAudibleAttack(note)),
            `${state.groove.genreFeel} chords support at ${state.playback.bandIntensity}, soloist=${state.soloist.enabled}, harmony=${state.harmony.enabled}`,
        ).toBe(expectChordBacking);
        return notes;
    } finally {
        random.mockRestore();
        generated.mockRestore();
        workerContext.LOOKAHEAD = previousLookahead;
        resetWorkerContext(0);
        vi.unstubAllGlobals();
    }
}

describe.each(SCENES)('$genre nonzero section-practice returns', (scene) => {
    it.each(SEEDS)(
        'replays the real worker buffer with each practice lane muted: %s',
        async (seed) => {
            for (const intensity of [0.2, 0.55, 0.9]) {
                const initial = await buildScene(
                    scene,
                    seed,
                    intensity,
                    scene.genre === 'Acoustic' ? { leadInMeter: '4/4' } : {},
                );
                const section = initial.arranger.sectionMap[1];
                expect(section.start).toBeGreaterThan(0);
                if (scene.genre === 'Acoustic') {
                    expect(section.start).toBe(32);
                    expect(section.end - section.start).toBe(24);
                }
                for (const muted of [null, 'soloist', 'harmony'] as const) {
                    const state = withPracticeMute(initial, muted);
                    const first = capturePractice(state, 0.05);
                    expect(capturePractice(state, 0.95)).toEqual(first);
                    if (muted) {
                        expect(first.filter((note) => note.module === muted)).toHaveLength(0);
                    }
                }
            }
        },
    );
});

it.each([
    ['Jazz', 'jazz'],
    ['Jazz', 'modern-piano'],
    ['Jazz', 'open-modal'],
    ['Acoustic', 'arp'],
    ['Acoustic', 'acoustic-strum'],
    ['Acoustic', 'modern-piano'],
    ['Acoustic', 'open-modal'],
])('%s exposed %s player reaches generated backing', async (genre, player) => {
    const scene = SCENES.find((candidate) => candidate.genre === genre)!;
    const state = await buildScene(scene, SEEDS[0], 0.55, { player });
    expect(state.chords.style).toBe(player);
    const performance = capture(state, 0.05);
    const notes = performance.trace
        .flatMap((tick) => tick.notes)
        .filter((note) => note.module === 'chords' && isAudibleAttack(note));
    expect(notes.length).toBeGreaterThan(0);
    assertBacking(performance.trace, state.arranger.totalSteps);
    if (['modern-piano', 'open-modal', 'acoustic-strum'].includes(player)) {
        expect(new Set(notes.map((note) => note.chordPerformance?.player))).toEqual(
            new Set([player === 'acoustic-strum' ? 'acoustic-guitar' : player]),
        );
    }
});

it.each(SCENES)('$genre installed Auto sources reach positive generated output', async (scene) => {
    for (const pack of SOUND_PACKS) {
        markPackInstalled(pack.id, true);
    }
    const initial = await buildScene(scene);
    expect(initial.chords.voice).toMatch(/^pack:/);
    const performance = capture(initial, 0.05);
    for (const module of ['bass', 'chords', 'soloist', 'harmony']) {
        const notes = performance.trace
            .flatMap((tick) => tick.notes)
            .filter(
                (note) => note.module === module && (note.midi ?? 0) > 0 && note.muted !== true,
            );
        expect(notes.length, module).toBeGreaterThan(0);
        expect(
            notes.every((note) => Number.isFinite(note.velocity) && note.velocity! > 0),
            module,
        ).toBe(true);
    }
    assertBacking(performance.trace, initial.arranger.totalSteps);
});

describe('Hip Hop support reset and mute precedence (#1165)', () => {
    const scene = SCENES.find((candidate) => candidate.genre === 'Hip Hop')!;

    it.each(['global', 'section'] as const)(
        'retains explicit %s chord mutes on practice returns',
        async (mute) => {
            const state = await buildScene(scene, SEEDS[0], 0.55);
            expect(
                capturePractice(state, 0.05).some(
                    (note) => note.module === 'chords' && isAudibleAttack(note),
                ),
            ).toBe(true);
            const mutedState =
                mute === 'global'
                    ? { ...state, chords: { ...state.chords, enabled: false } }
                    : state;
            if (mute === 'section') {
                state.arranger.sections[1].instruments = { chords: false };
                validateProgression(state);
            }
            expect(
                capturePractice(mutedState, 0.05, false).filter(
                    (note) => note.module === 'chords' && isAudibleAttack(note),
                ),
            ).toHaveLength(0);
        },
    );

    it.each(SEEDS)(
        'writes the same real MIDI attacks after dirty hidden memory: %s',
        async (seed) => {
            const initial = await buildScene(scene, seed, 0.55);
            const render = () => {
                const state = cloneStateForDetachedGeneration(initial);
                const processor = new ExportProcessor(state, {
                    includedTracks: ['chords', 'bass'],
                    loopMode: 'time',
                    targetDuration: 1,
                });
                const attacks = [];
                try {
                    for (let step = 0; step < state.arranger.totalSteps * 2; step++) {
                        const before = processor.chordTrack.events.length;
                        processor.processStep(step);
                        const events = processor.chordTrack.events
                            .slice(before)
                            .filter(
                                (event) =>
                                    (event.data[0] & 0xf0) === 0x90 &&
                                    event.data[1] > 0 &&
                                    event.data[2] > 0,
                            );
                        if (events.length > 0) {
                            attacks.push({ step, events });
                        }
                    }
                    return attacks;
                } finally {
                    processor.cleanup();
                }
            };
            const first = render();
            compingState.hipHopLastStep = 38;
            compingState.hipHopBarHadStab = true;
            expect(render()).toEqual(first);
            expect(first.length).toBeGreaterThan(0);
            expect(first.every(({ step }) => step % 4 !== 0)).toBe(true);
            for (let loop = 0; loop < 2; loop++) {
                const section = initial.arranger.sectionMap[1];
                const start = section.start + loop * initial.arranger.totalSteps;
                const end = section.end + loop * initial.arranger.totalSteps;
                expect(first.some(({ step }) => step >= start && step < end)).toBe(true);
            }
        },
    );
});
