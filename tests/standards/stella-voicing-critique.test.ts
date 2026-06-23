// @ts-nocheck
/* eslint-disable */
/**
 * Stella by Starlight — comp VOICING-SELECTION characterization (#733).
 *
 * Stella is the project's stress test for voicing logic: wall-to-wall ii-V
 * motion through multiple keys, the signature half-diminished → dominant chains
 * (m7b5 → 7b9), and a lot of chromatic root motion. This file pins how the
 * Jazz comp lane (`getAccompanimentNotes`) *selects and places* voicings across
 * that progression, in several keys, so the upcoming voicing-pass refactors
 * (#715 single deterministic pass, #728 chooseHarmonyIntervals consolidation)
 * have a real safety net for the SELECTION paths — historically under-covered
 * versus the rhythm paths.
 *
 * Two kinds of assertion live here:
 *   1. DURABLE INVARIANTS — properties a correct comp must keep (b5/alt-color
 *      retention, no clusters, smooth centroid). These guard against regressions
 *      and must stay green through any refactor.
 *   2. KNOWN DEFECT (#733) — the maj7 hand-span splay Brandon flagged by ear
 *      (Stella m7, the IVmaj7, in C). Encoded with `it.fails` so it documents
 *      the bug WITHOUT locking it in: it is green while the bug exists and turns
 *      RED the moment the fix lands, forcing us to promote it to a real `it`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => {
    const mockState = {
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 440 }),
        chords: {
            enabled: true,
            style: 'smart',
            density: 'standard',
            octave: 60,
            currentCell: new Array(16).fill(0),
        },
        playback: {
            bandIntensity: 0.5,
            complexity: 0.5,
            audio: { currentTime: 0 },
            intent: { anticipation: 0, syncopation: 0, layBack: 0 },
        },
        arranger: {
            key: 'C',
            isMinor: false,
            progression: [],
            totalSteps: 0,
            stepMap: [],
            timeSignature: '4/4',
        },
        groove: { genreFeel: 'Jazz' },
        bass: { enabled: true, lastFreq: 65.41 },
        harmony: { enabled: false },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return { ...mockState, stateMap: mockState, getState: () => mockState };
});

vi.mock('../../public/config.js', async () => ({
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
    ROMAN_VALS: { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 },
    NNS_OFFSETS: [0, 2, 4, 5, 7, 9, 11],
    INTERVAL_TO_ROMAN: {
        0: 'I',
        1: 'bII',
        2: 'II',
        3: 'bIII',
        4: 'III',
        5: 'IV',
        6: '#IV',
        7: 'V',
        8: 'bVI',
        9: 'VI',
        10: 'bVII',
        11: 'VII',
    },
    INTERVAL_TO_NNS: {
        0: '1',
        1: 'b2',
        2: '2',
        3: 'b3',
        4: '3',
        5: '4',
        6: 'b5',
        7: '5',
        8: 'b6',
        9: '6',
        10: 'b7',
        11: '7',
    },
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' } },
}));

vi.mock('../../public/utils.js', () => ({
    normalizeKey: (k) => {
        if (!k) {
            return 'C';
        }
        return k.charAt(0).toUpperCase() + k.slice(1);
    },
    getFrequency: (m) => 440 * 2 ** ((m - 69) / 12),
    applyBluesBends: vi.fn(),
    getMidi: (f) => Math.round(12 * Math.log2(f / 440) + 69),
    calculateTimingOffset: vi.fn(() => 0),
}));

vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getState } from '../../public/state.js';

const { arranger, playback, chords, bass, soloist, groove } = getState();

// Stella's A-section in Nashville/roman form so it transposes to every key:
// #ivm7b5 | VII7b9 | iim7 | V7b9 | vm7 | I7 | IVmaj7 | bVII7
const STELLA_A = '#ivm7b5 | VII7b9 | iim7 | V7b9 | vm7 | I7 | IVmaj7 | bVII7';

// Keys deliberately spread around the circle so a key-specific octave-placement
// bug can't hide. Brandon listened in C; the rest prove robustness.
const KEYS = ['C', 'Bb', 'F', 'A', 'E'];

/** First produced comp voicing in a bar (sorted MIDIs), mirroring production. */
function firstVoicing(chordIdx) {
    for (let s = 0; s < 16; s++) {
        compingState.lockedUntil = 0;
        const notes = getAccompanimentNotes(
            getState(),
            arranger.progression[chordIdx],
            chordIdx * 16 + s,
            s,
            s,
            { isBeatStart: s % 4 === 0 },
        );
        const midis = (notes || [])
            .filter((n) => n.midi > 0)
            .map((n) => n.midi)
            .sort((a, b) => a - b);
        if (midis.length > 0) {
            return midis;
        }
    }
    return [];
}

/** Walk Stella A once in `key`, returning per-bar {chord, midis, pcs, span, centroid}. */
function walkStella(key) {
    arranger.key = key;
    arranger.isMinor = false;
    arranger.sections = [{ id: 'A', label: 'A', value: STELLA_A }];
    validateProgression(getState());
    compingState.lastVoicingMidis = [];
    compingState.lastChordIndex = -1;

    return arranger.progression.map((chord) => {
        const midis = firstVoicing(arranger.progression.indexOf(chord));
        const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12));
        const span = midis.length ? midis[midis.length - 1] - midis[0] : 0;
        const centroid = midis.length ? midis.reduce((a, b) => a + b, 0) / midis.length : NaN;
        return { chord, midis, pcs, span, centroid, rootPc: ((chord.rootMidi % 12) + 12) % 12 };
    });
}

describe('Stella voicing — durable invariants (safety net for #715/#728)', () => {
    beforeEach(() => {
        groove.genreFeel = 'Jazz';
        chords.style = 'smart';
        playback.bandIntensity = 0.5;
        soloist.session.phrasing.busySteps = 0;
        bass.enabled = true;
        bass.lastFreq = 65.41;
        compingState.lockedUntil = 0;
        compingState.lastChordIndex = -1;
        compingState.soloistActivity = 0;
        compingState.lastVoicingMidis = [];
    });

    for (const key of KEYS) {
        describe(`in ${key}`, () => {
            it('retains the b5 on every half-diminished chord (#717)', () => {
                for (const bar of walkStella(key)) {
                    if (/m7b5|halfdim/.test(bar.chord.quality || bar.chord.absName)) {
                        const b5pc = (bar.rootPc + 6) % 12;
                        expect(
                            bar.pcs.has(b5pc),
                            `${bar.chord.absName} voicing [${bar.midis}] must contain its b5 (pc ${b5pc})`,
                        ).toBe(true);
                    }
                }
            });

            it('voices the b9 color on every 7b9 dominant', () => {
                for (const bar of walkStella(key)) {
                    if (/7b9/.test(bar.chord.absName)) {
                        const b9pc = (bar.rootPc + 1) % 12;
                        expect(
                            bar.pcs.has(b9pc),
                            `${bar.chord.absName} voicing [${bar.midis}] must voice its b9 (pc ${b9pc})`,
                        ).toBe(true);
                    }
                }
            });

            it('never stacks an internal minor-2nd cluster or doubles a MIDI', () => {
                for (const bar of walkStella(key)) {
                    for (let i = 1; i < bar.midis.length; i++) {
                        const gap = bar.midis[i] - bar.midis[i - 1];
                        expect(
                            gap,
                            `${bar.chord.absName} voicing [${bar.midis}] has an internal m2/unison`,
                        ).toBeGreaterThanOrEqual(2);
                    }
                }
            });

            it('keeps comp centroid motion smooth across the ii-V chains (no snapping)', () => {
                const bars = walkStella(key);
                for (let i = 1; i < bars.length; i++) {
                    const drift = Math.abs(bars[i].centroid - bars[i - 1].centroid);
                    // Observed max across these keys is ~7.7 (A: m7b5→7b9). Pin with
                    // headroom — a refactor that snaps the register will exceed this.
                    expect(
                        drift,
                        `${bars[i - 1].chord.absName}→${bars[i].chord.absName} centroid jumped ${drift.toFixed(1)} st`,
                    ).toBeLessThan(9);
                }
            });
        });
    }
});

describe('Stella voicing — maj7 hand-span continuity (#733, fixed)', () => {
    beforeEach(() => {
        groove.genreFeel = 'Jazz';
        chords.style = 'smart';
        playback.bandIntensity = 0.5;
        soloist.session.phrasing.busySteps = 0;
        bass.enabled = true;
        bass.lastFreq = 65.41;
        compingState.lockedUntil = 0;
        compingState.lastChordIndex = -1;
        compingState.soloistActivity = 0;
        compingState.lastVoicingMidis = [];
    });

    // Brandon flagged Stella m7 (IVmaj7) by ear: the comp used to splay to a
    // ~15-17 semitone open voicing while every neighboring ii-V shell stayed
    // ~7-9 st — a hand-span discontinuity no pianist would play. The cause was
    // a maj7-ONLY "open voicing" gesture (accompaniment.ts) that raised the
    // middle voice an octave. Removed in this change; the maj7 now keeps the
    // section's hand-width. This test guards against the splay returning.
    for (const key of KEYS) {
        it(`in ${key}, the maj7 voicing span is no wider than the section's shells`, () => {
            const bars = walkStella(key);
            const spans = bars.map((b) => b.span).sort((a, b) => a - b);
            const median = spans[Math.floor(spans.length / 2)];
            for (const bar of bars) {
                if (/maj7/.test(bar.chord.absName)) {
                    expect(
                        bar.span,
                        `${bar.chord.absName} span ${bar.span} vs section median ${median}`,
                    ).toBeLessThanOrEqual(median + 4);
                }
            }
        });
    }
});
