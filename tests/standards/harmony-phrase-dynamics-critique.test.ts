import { normalizeMidiVelocity } from '../../public/engine/midi-utils.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { fillBuffers } from '../../public/engine/worker-buffer-manager.js';
import { resetWorkerContext, workerContext } from '../../public/engine/worker-orchestrator.js';
import { renderCurrentSessionToWav } from '../../public/export/audio-export.js';
import * as stateModule from '../../public/state.js';
import type { EnsembleState } from '../../public/types.js';

const { scheduled } = vi.hoisted(() => ({ scheduled: vi.fn() }));
vi.mock('../../public/engine/engine.js', () => ({ initAudio: vi.fn() }));
vi.mock('../../public/engine/scheduler-core.js', () => ({ scheduleGlobalEvent: scheduled }));

import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import * as dynamics from '../../public/engine/harmony-styles.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { bootstrapEnsembleAudit } from '../../scripts/ensemble-analysis-utils.js';

async function scene(
    genre: string,
    meter = '4/4',
    value = 'C | Am | F | G | C | Am | F | G',
    intensity = 0.55,
    band = false,
) {
    const boot = await bootstrapEnsembleAudit({
        genre,
        bpm: 100,
        intensity,
        timeSignature: meter,
        seed: 'HARMONY_MOVING_VOICE',
        includeSoloist: band,
        includeChords: band,
        includeBass: band,
        includeDrums: false,
        harmonyStyle: 'smart',
        bassStyle: undefined,
        chordStyle: undefined,
        drumPreset: undefined,
        soloistStyle: undefined,
    });
    const detached = cloneStateForDetachedGeneration(boot.state);
    const state = {
        ...detached,
        arranger: { ...detached.arranger },
        harmony: { ...detached.harmony },
        groove: { ...detached.groove },
        soloist: { ...detached.soloist },
        chords: { ...detached.chords },
        bass: { ...detached.bass },
        playback: { ...detached.playback },
    };
    state.arranger.sections = [{ id: 'pad-verse', label: 'Verse', value, timeSignature: meter }];
    validateProgression(state);
    state.harmony.octave = 60;
    state.harmony.complexity = 0.55;
    state.groove.humanize = 0;
    return state;
}

function capture(initial: Awaited<ReturnType<typeof scene>>, baseline = false, loops = 2) {
    const state = cloneStateForDetachedGeneration(initial);
    resetHiddenGenerationMemory(state);
    const bypass = baseline ? vi.spyOn(dynamics, 'getPadPhraseGain').mockReturnValue(1) : null;
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const emissions = [];
    try {
        for (let step = 0; step < state.arranger.totalSteps * loops; step++) {
            const result = generateNotesForStep(state, step, cursors, {}, null);
            const notes = result.notes.filter((note) => note.module === 'harmony');
            if (notes.length) {
                emissions.push({ step, notes });
            }
        }
        return emissions;
    } finally {
        bypass?.mockRestore();
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    scheduled.mockReset();
});
const structure = (events: ReturnType<typeof capture>) =>
    events.map(({ step, notes }) => ({ step, notes: notes.map(({ velocity, ...note }) => note) }));

describe('Smart pad phrase-dynamics critique (#1147)', () => {
    it.each(
        ['Rock', 'Acoustic'].flatMap((genre) =>
            ['4/4', '3/4', '6/8', '12/8', '5/4', '7/8'].flatMap((meter) =>
                [0.2, 0.55, 0.95].map((intensity) => ({ genre, meter, intensity })),
            ),
        ),
    )(
        '$genre $meter at $intensity preserves presence and a bounded non-clipped swell',
        async ({ genre, meter, intensity }) => {
            const state = await scene(genre, meter, undefined, intensity);
            const before = capture(state, true);
            const after = capture(state);
            expect(structure(after)).toEqual(structure(before));
            expect(after).toHaveLength(16); // one authored pad emission per bar, two full laps
            const ratios = after.map(
                (event, i) => event.notes[0].velocity! / before[i].notes[0].velocity!,
            );
            for (let i = 0; i < after.length; i++) {
                const expected = [1, 1.04, 1.08, 1][i % 4];
                after[i].notes.forEach((note, voice) => {
                    expect(note.velocity! / before[i].notes[voice].velocity!).toBeCloseTo(
                        expected,
                        8,
                    );
                    expect(note.velocity).toBeGreaterThan(0);
                });
            }
            console.log(
                `Critique Report: ${genre} ${meter} energy ${intensity}: ${after.length} sustained onsets; gain ${Math.min(...ratios)}–${Math.max(...ratios)}; target baseline–1.08.`,
            );
        },
    );

    it.each(['Rock', 'Acoustic'])(
        '%s keeps eligibility with the full band, soloist muted, and section overrides',
        async (genre) => {
            const state = await scene(genre, '4/4', undefined, 0.65, true);
            for (const instruments of [
                undefined,
                { soloist: false },
                { soloist: false, chords: false },
                { harmony: false },
            ]) {
                state.arranger.sections[0].instruments = instruments;
                validateProgression(state);
                const before = capture(state, true);
                const after = capture(state);
                expect(structure(after)).toEqual(structure(before));
                if (instruments?.harmony === false) {
                    expect(after).toHaveLength(0);
                } else {
                    expect(after.length).toBeGreaterThan(0);
                }
            }
        },
    );

    it('returns to the same baseline for the final phrase of a 256-bar run', async () => {
        const state = await scene('Acoustic');
        const before = capture(state, true, 32);
        const after = capture(state, false, 32);
        expect(structure(after)).toEqual(structure(before));
        expect(after).toHaveLength(256);
        const ratios = after.map(
            (event, i) => event.notes[0].velocity! / before[i].notes[0].velocity!,
        );
        expect(ratios.slice(-4)).toEqual(ratios.slice(0, 4));
        expect(Math.min(...ratios)).toBe(1);
        expect(Math.max(...ratios)).toBeCloseTo(1.08, 8);
    });

    it('leaves explicit styles and other genres unchanged', async () => {
        for (const genre of ['Rock', 'Acoustic', 'Country', 'Jazz']) {
            const state = await scene(genre);
            if (genre === 'Rock' || genre === 'Acoustic') {
                state.harmony.style = 'strings';
            }
            expect(capture(state)).toEqual(capture(state, true));
        }
    });
    it('repeats the contour through live section-practice buffers after a mixed-meter lead-in', async () => {
        const state = await scene('Acoustic');
        state.arranger.sections.unshift({
            id: 'lead-in',
            label: 'Lead-in',
            value: 'C | C | C',
            timeSignature: '3/4',
        });
        validateProgression(state);
        const section = state.arranger.sectionMap[1];
        state.playback.loopStartStep = section.start;
        state.playback.loopEndStep = section.end;
        const width = section.end - section.start;
        resetHiddenGenerationMemory(state);
        resetWorkerContext(section.start);
        const post = vi.fn();
        vi.stubGlobal('postMessage', post);
        const previousLookahead = workerContext.LOOKAHEAD;
        try {
            workerContext.LOOKAHEAD = width * 2;
            fillBuffers(state, section.start);
        } finally {
            workerContext.LOOKAHEAD = previousLookahead;
            resetWorkerContext(0);
        }
        const notes = post.mock.calls
            .flatMap(([message]) => message.notes || [])
            .filter((note) => note.module === 'harmony');
        const first = notes
            .filter((note) => note.step < section.end)
            .map(({ step, midi, velocity }) => ({ step: step - section.start, midi, velocity }));
        const second = notes
            .filter((note) => note.step >= section.end)
            .map(({ step, midi, velocity }) => ({ step: step - section.end, midi, velocity }));
        expect(first.length).toBeGreaterThan(0);
        expect(second).toEqual(first);
        const gains = state.arranger.measureMap
            .filter((m) => m.start >= section.start)
            .map((m) => dynamics.getPadPhraseGain(state, m.start));
        expect(gains).toEqual([1, 1.04, 1.08, 1, 1, 1.04, 1.08, 1]);
    });

    it('delivers equivalent per-emission dynamics through MIDI export and WAV scheduling', async () => {
        const initial = await scene('Acoustic');
        const expected = capture(initial)
            .filter((event) => event.step < initial.arranger.totalSteps)
            .flatMap((event) =>
                event.notes.map((note) => ({
                    step: event.step,
                    midi: note.midi,
                    velocity: note.velocity!,
                    midiVelocity: normalizeMidiVelocity(
                        note.velocity! / Math.sqrt(event.notes.length),
                    ),
                })),
            );
        const midiState = cloneStateForDetachedGeneration(initial);
        const processor = new ExportProcessor(midiState, {
            includedTracks: ['harmonies'],
            loopMode: 'once',
        });
        const midi = [];
        try {
            for (let step = 0; step < initial.arranger.totalSteps; step++) {
                const before = processor.harmonyTrack.events.length;
                processor.processStep(step);
                midi.push(
                    ...processor.harmonyTrack.events
                        .slice(before)
                        .filter((event) => (event.data[0] & 0xf0) === 0x90)
                        .map((event) => ({ step, midi: event.data[1], velocity: event.data[2] })),
                );
            }
        } finally {
            processor.cleanup();
        }
        expect(midi).toEqual(
            expected.map(({ step, midi, midiVelocity }) => ({
                step,
                midi,
                velocity: midiVelocity,
            })),
        );
        expect(new Set(midi.map((n) => n.velocity)).size).toBeGreaterThan(2);

        const wav: { step: number; midi: number; velocity: number }[] = [];
        scheduled.mockImplementation((state: EnsembleState, step: number) => {
            wav.push(
                ...(state.harmony.buffer.get(step) || []).map(
                    (note: { midi: number; velocity: number }) => ({
                        step,
                        midi: note.midi,
                        velocity: note.velocity,
                    }),
                ),
            );
        });
        vi.spyOn(stateModule, 'getState').mockReturnValue(initial);
        vi.stubGlobal(
            'OfflineAudioContext',
            class {
                channels: number;
                length: number;
                sampleRate: number;
                constructor(channels: number, length: number, sampleRate: number) {
                    this.channels = channels;
                    this.length = length;
                    this.sampleRate = sampleRate;
                }
                async startRendering() {
                    return {
                        numberOfChannels: this.channels,
                        sampleRate: this.sampleRate,
                        getChannelData: () => new Float32Array(this.length),
                    };
                }
            },
        );
        await renderCurrentSessionToWav({ loops: 1, sampleRate: 100 });
        expect(wav).toEqual(expected.map(({ midiVelocity, ...event }) => event));
    });
});
