import { afterEach, describe, expect, it, vi } from 'vitest';
import { GENRE_NAMES, SMART_GENRES } from '../../public/data/smart-genres.js';
import * as bassEngine from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import { ExportProcessor } from '../../public/engine/midi-worker-logic.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const SEEDS = ['BASS_OUTPUT_A', 'BASS_OUTPUT_B'];
const CARRYOVER = { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 };
const BASS_ONLY = {
    includeBass: true,
    includeChords: false,
    includeDrums: false,
    includeSoloist: false,
    includeHarmony: false,
    noLiveConductor: true,
};

function scene(genre: string, seed: string, energy: number, chart?: string) {
    dispatch(ACTIONS.RESET_STATE);
    // Apply the actual picker payload, so aliases such as Bossa Nova/Ska and
    // native bass styles come from the same authority as genre selection.
    dispatch(ACTIONS.SET_GENRE_FEEL, { genreName: genre, ...SMART_GENRES[genre] });
    const detached = cloneStateForDetachedGeneration(getState());
    const state = {
        ...detached,
        arranger: {
            ...detached.arranger,
            seed,
            timeSignature: '4/4',
            sections: [
                {
                    id: 'verse',
                    label: 'Verse',
                    key: 'C',
                    timeSignature: '4/4',
                    value: chart ?? 'C7 | F7 | Dm7 | G7 | C/E | G/B',
                },
            ],
        },
        playback: {
            ...detached.playback,
            bpm: 115,
            bandIntensity: energy,
            complexity: energy,
        },
        bass: { ...detached.bass, enabled: true, octave: 38 },
        chords: { ...detached.chords, enabled: false },
        soloist: { ...detached.soloist, enabled: false },
        harmony: { ...detached.harmony, enabled: false },
        groove: { ...detached.groove, sectionSeedMap: { verse: 0.37 } },
        midi: { ...detached.midi, bassOctave: 0 },
    };
    validateProgression(state);
    resetHiddenGenerationMemory(state);
    return state;
}

function cursors() {
    return {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
}

function soundingMidi(freq: number) {
    return 69 + 12 * Math.log2(freq / 440);
}

function observeGenerator() {
    const generate = bassEngine.getBassNote;
    const authored: Array<{ midi?: number; freq: number } | null> = [];
    const spy = vi.spyOn(bassEngine, 'getBassNote').mockImplementation((...args) => {
        const note = generate(...args);
        // Capture before returning to tick: a mutation of the generator's
        // object must not silently rewrite the test's expected pitch.
        authored.push(note ? { midi: note.midi, freq: note.freq } : null);
        return note;
    });
    return { spy, authored };
}

function expectCoherentPitch(midi: number, freq: number) {
    expect(Number.isFinite(freq)).toBe(true);
    expect(freq).toBeGreaterThan(0);
    expect(midi).toBeGreaterThanOrEqual(23);
    expect(midi).toBeLessThanOrEqual(57);
    // Production uses a Float32 frequency table, so tolerate its rounding,
    // while even a fractional semitone discrepancy remains clearly visible.
    expect(soundingMidi(freq)).toBeCloseTo(midi, 5);
}

afterEach(() => vi.restoreAllMocks());

describe.each(GENRE_NAMES)('%s bass output pitch (#1158)', (genre) => {
    it.each([0.3, 0.7, 0.95])('preserves authored pitches at energy %s', (energy) => {
        const generator = observeGenerator();
        for (const seed of SEEDS) {
            const state = scene(genre, seed, energy);
            const position = cursors();
            let emitted = 0;
            let inRange = 0;
            for (let step = 0; step < state.arranger.totalSteps; step++) {
                generator.spy.mockClear();
                const tick = generateNotesForStep(state, step, position, BASS_ONLY, CARRYOVER);
                for (const note of tick.notes.filter((event) => event.module === 'bass')) {
                    expect(generator.spy).toHaveBeenCalledTimes(1);
                    const authored = generator.authored.at(-1)!;
                    const midi = authored.midi ?? Math.round(soundingMidi(authored.freq));
                    expectCoherentPitch(note.midi!, note.freq!);
                    expect(note).not.toHaveProperty('pitchPlanned');
                    expect(tick.coordination.bassMidi).toBe(note.midi);
                    expect(state.bass.lastFreq).toBe(note.freq);
                    // This is an observation of the real generator result, not
                    // a second implementation of its octave-selection policy.
                    if (midi >= 23 && midi <= 57) {
                        expect(note.midi, `${seed}, step ${step}`).toBe(midi);
                        expect(soundingMidi(note.freq!)).toBeCloseTo(
                            soundingMidi(authored.freq),
                            5,
                        );
                        inRange++;
                    }
                    emitted++;
                }
            }
            expect(emitted, `${seed}: must exercise sounding bass`).toBeGreaterThan(4);
            expect(inRange, `${seed}: must exercise authored register`).toBeGreaterThan(4);
        }
    });
});

it('retains the upward Disco octave pump in final tick notes', () => {
    const state = scene('Disco', SEEDS[0], 0.95, 'C | C | C | C');
    const position = cursors();
    const pitches = new Map<number, number>();
    for (let step = 0; step < state.arranger.totalSteps; step++) {
        const tick = generateNotesForStep(state, step, position, BASS_ONLY, CARRYOVER);
        for (const note of tick.notes) {
            if (note.module === 'bass' && !note.muted) {
                pitches.set(step, note.midi!);
            }
        }
    }
    let upwardOctaves = 0;
    for (let beat = 0; beat < 48; beat += 4) {
        if (pitches.get(beat + 2)! - pitches.get(beat)! === 12) {
            upwardOctaves++;
        }
    }
    // Positive control: a pitch-preservation test must retain the idiom that
    // nearest-previous-note revoicing erased, not merely produce valid notes.
    expect(upwardOctaves).toBeGreaterThanOrEqual(6);
});

it.each([
    [22, 34],
    [58, 46],
])('folds out-of-range MIDI %s to %s for both audio and MIDI', (authoredMidi, expectedMidi) => {
    const state = scene('Rock', SEEDS[0], 0.7);
    vi.spyOn(bassEngine, 'getBassNote').mockReturnValue({
        midi: authoredMidi,
        freq: 440 * 2 ** ((authoredMidi - 69) / 12),
        velocity: 0.8,
        durationSteps: 2,
    });
    const tick = generateNotesForStep(state, 0, cursors(), BASS_ONLY, CARRYOVER);
    const bass = tick.notes.find((note) => note.module === 'bass')!;
    expect(bass).toBeDefined();
    expect(bass.midi).toBe(expectedMidi);
    expectCoherentPitch(bass.midi!, bass.freq!);
    expect(bass).not.toHaveProperty('pitchPlanned');
    expect(state.bass.lastFreq).toBe(bass.freq);
    expect(tick.coordination.bassMidi).toBe(expectedMidi);
});

it.each(SEEDS)('exports the sounding Disco octave to MIDI (%s)', (seed) => {
    const state = scene('Disco', seed, 0.95, 'C | C | F | G');
    const processor = new ExportProcessor(state, { loopMode: 'once', includedTracks: ['bass'] });
    const generator = observeGenerator();
    let soundingNotes = 0;
    try {
        for (let step = 0; step < state.arranger.totalSteps; step++) {
            generator.spy.mockClear();
            const before = processor.bassTrack.events.length;
            processor.processStep(step);
            const noteOns = processor.bassTrack.events
                .slice(before)
                .filter((event) => (event.data[0] & 0xf0) === 0x90 && event.data[2] > 0);
            for (const noteOn of noteOns) {
                expect(generator.spy).toHaveBeenCalledTimes(1);
                const authored = generator.authored.at(-1)!;
                expectCoherentPitch(noteOn.data[1], state.bass.lastFreq!);
                expect(noteOn.data[1]).toBeCloseTo(soundingMidi(authored.freq), 5);
                soundingNotes++;
            }
        }
        expect(soundingNotes).toBeGreaterThan(8);
    } finally {
        processor.cleanup();
    }
});

it.each(GENRE_NAMES)(
    '%s keeps chord and harmony support with the corrected bass register',
    (genre) => {
        for (const seed of SEEDS) {
            for (const energy of [0.3, 0.7, 0.95]) {
                const state = scene(genre, seed, energy);
                state.chords.enabled = true;
                state.harmony.enabled = true;
                const position = cursors();
                const heard = new Set<string>();
                for (let step = 0; step < state.arranger.totalSteps; step++) {
                    const tick = generateNotesForStep(
                        state,
                        step,
                        position,
                        { ...BASS_ONLY, includeChords: true, includeHarmony: true },
                        CARRYOVER,
                    );
                    for (const note of tick.notes) {
                        if ((note.midi ?? 0) <= 0 || note.muted === true) {
                            continue; // control markers and deliberately muted events are not support
                        }
                        expect(Number.isFinite(note.midi)).toBe(true);
                        expect(note.midi).toBeLessThanOrEqual(127);
                        expect(Number.isFinite(note.velocity)).toBe(true);
                        expect(note.velocity).toBeGreaterThan(0);
                        heard.add(note.module);
                    }
                }
                // A phrase-wide support check allows the genre's own attack/rest
                // pattern while catching infeasible voicings after bass spacing.
                expect(heard, `${genre}, ${seed}, energy ${energy}`).toEqual(
                    new Set(['bass', 'chords', 'harmony']),
                );
            }
        }
    },
);
