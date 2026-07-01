import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPowerChordVoicing } from '../../public/engine/accompaniment.js';
import { isPowerChordChordsVoice } from '../../public/engine/instrument-registry.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getState } from '../../public/state.js';
import type { InstrumentVoice } from '../../public/types.js';
import { getFrequency } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Power-chord voicing critique (#698) — the crunch rhythm-guitar chords pack.
 *
 * The musical claim under test is a hard fact, not a statistical tendency: a
 * distorted electric guitar plays POWER CHORDS because major/minor *thirds*
 * clash under drive (the third beats against the root/fifth and turns to mud).
 * So when the crunch rhythm-guitar is the chords voice, the comper's voicing
 * must reduce to root + perfect-fifth (+ octaves) with **no third surviving** —
 * every chord tone snapped to pitch-class `{root, root+7}`, by the smallest move
 * (so the voicing keeps its register and rough shape).
 *
 * These are exact assertions rather than ranges: "no third under distortion" is
 * absolute. Swept over all 12 roots × the qualities the comper emits.
 */

const pc = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;

// The chord shapes the comper can hand us (root position, close voicing).
const QUALITIES: Record<string, number[]> = {
    major: [0, 4, 7],
    minor: [0, 3, 7],
    dom7: [0, 4, 7, 10],
    maj7: [0, 4, 7, 11],
    min7: [0, 3, 7, 10],
    // A rootless/extended jazz shape — 3rd, 5th, 7th, 9th — the hardest case:
    // it has NO root and a third + extension, all of which must collapse cleanly.
    rootless9: [4, 7, 11, 14],
};

// Anchor voicings mid-register (E3 area) so the ≤6-semitone snap stays in range.
const ROOT_MIDIS = Array.from({ length: 12 }, (_, i) => 52 + i);

describe('Power-chord voicing critique (#698)', () => {
    it('drops the third: every reduced tone is root or perfect-fifth, no third survives', () => {
        let thirdsSeen = 0;
        let thirdsAfter = 0;
        for (const rootMidi of ROOT_MIDIS) {
            const rootPc = pc(rootMidi);
            const fifthPc = (rootPc + 7) % 12;
            const thirdPcs = new Set([(rootPc + 3) % 12, (rootPc + 4) % 12]);

            for (const [name, intervals] of Object.entries(QUALITIES)) {
                const notes = intervals.map((iv) => ({ midi: rootMidi + iv }));
                thirdsSeen += notes.filter((n) => thirdPcs.has(pc(n.midi))).length;

                const out = applyPowerChordVoicing(notes, rootMidi);

                // Count preserved — pitch-only reduction, rhythm/strum untouched.
                expect(out.length, `${name}@${rootMidi}: note count changed`).toBe(
                    intervals.length,
                );
                for (const n of out) {
                    const p = pc(n.midi);
                    // The load-bearing assertion: only root or fifth remain.
                    expect(
                        p === rootPc || p === fifthPc,
                        `${name}@${rootMidi}: tone pc ${p} is neither root ${rootPc} nor fifth ${fifthPc}`,
                    ).toBe(true);
                    if (thirdPcs.has(p)) {
                        thirdsAfter++;
                    }
                }
            }
        }

        // Critique Report
        console.log('\n=== Power-Chord Voicing Critique ===');
        console.log(`roots swept:        ${ROOT_MIDIS.length}`);
        console.log(`qualities:          ${Object.keys(QUALITIES).join(', ')}`);
        console.log(`thirds in source:   ${thirdsSeen}`);
        console.log(`thirds after drive: ${thirdsAfter}  (must be 0)`);

        expect(thirdsSeen, 'sanity: the source voicings should contain thirds').toBeGreaterThan(0);
        expect(thirdsAfter, 'a third survived the power-chord reduction').toBe(0);
    });

    it('keeps each tone in its register — snaps by at most 6 semitones', () => {
        for (const rootMidi of ROOT_MIDIS) {
            for (const intervals of Object.values(QUALITIES)) {
                const src = intervals.map((iv) => rootMidi + iv);
                const out = applyPowerChordVoicing(
                    src.map((midi) => ({ midi })),
                    rootMidi,
                );
                out.forEach((n, i) => {
                    expect(
                        Math.abs(n.midi - src[i]),
                        `moved >6 semitones (${src[i]} → ${n.midi})`,
                    ).toBeLessThanOrEqual(6);
                });
            }
        }
    });

    it('is idempotent: a power chord passes through unchanged', () => {
        const rootMidi = 55; // G3
        const power = [rootMidi, rootMidi + 7, rootMidi + 12].map((midi) => ({ midi }));
        const out = applyPowerChordVoicing(
            power.map((n) => ({ ...n })),
            rootMidi,
        );
        expect(out.map((n) => n.midi)).toEqual(power.map((n) => n.midi));
    });

    it('leaves an empty / rootless-degenerate voicing untouched', () => {
        expect(applyPowerChordVoicing([], 60)).toEqual([]);
        // Non-finite root → no-op (guards the worker against a malformed chord).
        const notes = [{ midi: 60 }, { midi: 64 }];
        expect(applyPowerChordVoicing(notes, Number.NaN)).toEqual([{ midi: 60 }, { midi: 64 }]);
    });

    it('gate fires only for the crunch rhythm-guitar chords voice', () => {
        expect(isPowerChordChordsVoice('pack:electric-guitar-rhythm' as InstrumentVoice)).toBe(
            true,
        );
        // The synth fallback and every OTHER voice keep full triads.
        expect(isPowerChordChordsVoice('synth' as InstrumentVoice)).toBe(false);
        expect(isPowerChordChordsVoice('pack:grand' as InstrumentVoice)).toBe(false);
        expect(isPowerChordChordsVoice('pack:electric-guitar-driven' as InstrumentVoice)).toBe(
            false,
        );
    });
});

// The scheduler plays each note by its `freq`, not its `midi` (pack pitch =
// round(69 + 12·log2(freq/440))). The reduction mutates `midi`, so tick-logic
// must recompute `freq` from the snapped midi — the FINAL-CADENCE lane preloads
// `freq: getFrequency(midi)`, and a stale-freq guard would sound the un-reduced
// triad on the exposed resolution chord. These tests exercise the REAL path
// (`generateNotesForStep`) and assert on the PLAYED freq, so they catch that
// bug where the pure-`midi` tests above structurally cannot.
const STEPS_PER_BAR = 16;
const FORM_STEPS = 64; // 4 bars in 4/4
const FINAL_DOWNBEAT = FORM_STEPS - STEPS_PER_BAR; // 48

// Cmaj7 chords-register fixture — a THIRD (E, pc 4) and maj7 (B, pc 11) that
// must both collapse to root/fifth under the crunch guitar.
const CHORD_CMAJ7 = {
    romanName: 'I',
    absName: 'Cmaj7',
    nnsName: '1',
    rootMidi: 60,
    quality: 'maj7',
    is7th: true,
    isMinor: false,
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'sec-outro',
};

function makeGuitarChordsTickState(voice: InstrumentVoice) {
    return {
        arranger: {
            totalSteps: FORM_STEPS,
            timeSignature: '4/4',
            measureMap: Array.from({ length: 4 }, (_, i) => ({
                start: i * STEPS_PER_BAR,
                end: (i + 1) * STEPS_PER_BAR,
            })),
            sectionMap: [{ id: 'sec-outro', start: 0, end: FORM_STEPS, label: 'Outro' }],
            stepMap: [
                {
                    start: 0,
                    end: FORM_STEPS,
                    chord: CHORD_CMAJ7,
                    sectionStart: 0,
                    sectionEnd: FORM_STEPS,
                },
            ],
            progression: [CHORD_CMAJ7],
            key: 'C',
            isMinor: false,
        },
        // The crunch rhythm guitar on the chords lane — the gate reads `voice`.
        chords: {
            enabled: true,
            style: 'smart',
            density: 'standard',
            octave: 60,
            volume: 0.5,
            voice,
        },
        bass: { enabled: false, style: 'smart', volume: 0.5, lastFreq: null, octave: 0 },
        soloist: makeSoloistMock({
            enabled: false,
            style: 'smart',
            busySteps: 0,
            notesInPhrase: 0,
        }),
        harmony: { enabled: false, style: 'smart', complexity: 0.5, lastMidis: [] },
        groove: {
            enabled: false,
            measures: 1,
            instruments: [],
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            songMode: true,
            isEndingPending: true, // arm the final-bar cadence
            intent: {},
        },
    } as any;
}

const freqToPc = (freq: number) => ((Math.round(69 + 12 * Math.log2(freq / 440)) % 12) + 12) % 12;

describe('Power-chord voicing — played freq through generateNotesForStep (#698)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('the exposed final-cadence chord is a power chord in the PLAYED freq (no third)', () => {
        const state = makeGuitarChordsTickState('pack:electric-guitar-rhythm' as InstrumentVoice);
        getState.mockReturnValue(state);
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const { notes } = generateNotesForStep(state, FINAL_DOWNBEAT, cursors, {
            includeSoloist: false,
            includeBass: false,
            includeChords: true,
            includeHarmony: false,
            includeDrums: false,
        });

        const chordNotes = notes.filter(
            (n: any) => n.module === 'chords' && !n.muted && Number.isFinite(n.freq) && n.freq > 0,
        );
        expect(chordNotes.length, 'cadence must emit a chord voicing').toBeGreaterThanOrEqual(2);

        for (const n of chordNotes) {
            const playedPc = freqToPc(n.freq);
            // The money assertion: the PLAYED pitch has no third and is only
            // root/fifth. A stale cadence freq would land pc 4 (E) here.
            expect(
                playedPc === 0 || playedPc === 7,
                `played pc ${playedPc} is not root(0)/fifth(7) — freq=${n.freq.toFixed(1)}`,
            ).toBe(true);
            // Direct stale-freq sentinel: the played freq must agree with the
            // snapped midi (they diverge exactly when the freq recompute is skipped).
            const midiPc = (((Math.round(n.midi) % 12) + 12) % 12) as number;
            expect(playedPc, 'freq/midi disagree → stale freq').toBe(midiPc);
            // And it must round-trip cleanly to the canonical getFrequency grid.
            expect(n.freq).toBeCloseTo(getFrequency(Math.round(n.midi)), 2);
        }
    });

    it('leaves the cadence as a full maj7 when the voice is NOT the crunch guitar', () => {
        // Negative control — the synth/piano fallback keeps the third; the
        // reduction must be voice-gated, not applied to every chord.
        const state = makeGuitarChordsTickState('pack:grand' as InstrumentVoice);
        getState.mockReturnValue(state);
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const { notes } = generateNotesForStep(state, FINAL_DOWNBEAT, cursors, {
            includeSoloist: false,
            includeBass: false,
            includeChords: true,
            includeHarmony: false,
            includeDrums: false,
        });

        const playedPcs = new Set(
            notes
                .filter((n: any) => n.module === 'chords' && !n.muted && n.freq > 0)
                .map((n: any) => freqToPc(n.freq)),
        );
        // A grand-piano Cmaj7 cadence keeps its third (E, pc 4) — proof the
        // power-chord reduction did NOT fire for a non-guitar voice.
        expect(playedPcs.has(4), 'grand cadence should retain the major third').toBe(true);
    });
});
