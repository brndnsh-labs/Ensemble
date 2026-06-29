// @ts-nocheck
// tests/standards/accompaniment-unison-avoidance.test.ts
//
// Critique test for `coordination-contract/S5` — the harmony voicing density pass
// reads the already-published `coordination.accompanimentMidis` so it doesn't
// stack the same pitch-class as the chord stab that's currently ringing.
//
// HISTORY (epic #10, #863): this file once had a SECOND sub-test driving the
// retired legacy `getSoloistNote` — its `selectPitchAndDevices` picker applied an
// accompaniment-unison multiplier. The LIVE engine (getSoloistNotePhraseFirst)
// is theme-driven and IGNORES `coordination` entirely (the param is vestigial),
// so the soloist never reads `accompanimentMidis` and that sub-test guarded
// dead-on-the-live-engine behavior — it was deleted. Restoring soloist↔comper
// PC-unison avoidance on the phrase-first engine is a real coordination feature
// lost in the migration; tracked as a port candidate (see #863 PR notes).
//
// Harmony PC-overlap avoidance (UNCHANGED, engine-independent of the soloist):
// drive `getHarmonyNotes` with `accompanimentHit = true` and
// `accompanimentMidis = [60, 64, 67]`. Compare against control where
// `accompanimentMidis = []` (PC-overlap pass dormant). Acceptance: ≥30pt drop in
// the rate of harmony-voice PCs ∈ {0, 4, 7}. Harmony is deterministic given the
// inputs so absolute-pp is hit cleanly (50pp).
//
// Source: docs/audit/epic-coordination-contract.md S5;
//         harmony-coordination.md P0 #4, chords.md P2 #14.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

// Mock state.js — the harmony engine reads through getState().
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));

// Mock config.js — the engines read TIME_SIGNATURES.
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

// Cmaj — MIDI root 60. Accompaniment voicing [60, 64, 67] has PCs {0, 4, 7}.
const C_TRIAD_PCS = new Set([0, 4, 7]);
const C_CHORD = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };

describe('Accompaniment unison avoidance (harmony)', () => {
    describe('Harmony: PC-overlap drop on chord-stab crowding', () => {
        let mockState;

        beforeEach(() => {
            vi.restoreAllMocks();
            mockState = {
                playback: { bandIntensity: 0.6, complexity: 0.5 },
                groove: {
                    genreFeel: 'Jazz',
                    pocket: {
                        globalDrive: 0,
                        tightness: 1,
                        bassGravity: 1,
                        chordGravity: 1,
                        soloistGravity: 1,
                    },
                },
                // why: makeSoloistMock with isResting:true, notesInPhrase:0 satisfies any
                // private-state fallback reads; the actual rest/notes signal flows through
                // coordination.soloistResting / soloistNotesInPhrase per S4.
                soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
                harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
                arranger: { timeSignature: '4/4' },
            };
            getState.mockReturnValue(mockState);
        });

        const measureHarmonyOverlap = (accompMidis, numBars) => {
            const stepsPerBar = 16;
            let overlapVoices = 0;
            let totalVoices = 0;

            for (let bar = 0; bar < numBars; bar++) {
                for (let step = 0; step < stepsPerBar; step++) {
                    const absStep = bar * stepsPerBar + step;
                    // Drive the accompanimentCrowding branch: hit=true forces the harmony
                    // engine into its crowded-comping path where the density cap shrinks
                    // and (after S5) the PC-overlap reorder runs.
                    const coordination = {
                        step: absStep,
                        soloistMidi: 0,
                        soloistActive: false,
                        soloistResting: true,
                        soloistNotesInPhrase: 0,
                        accompanimentHit: accompMidis.length > 0,
                        accompanimentMidis: accompMidis,
                        avgChordMidi: accompMidis.length
                            ? accompMidis.reduce((a, b) => a + b, 0) / accompMidis.length
                            : 0,
                        bassMidi: 0,
                        kickHit: false,
                        snareHit: false,
                    };

                    const notes = getHarmonyNotes(
                        getState(),
                        C_CHORD,
                        null,
                        absStep,
                        64,
                        'smart',
                        step,
                        null,
                        coordination,
                        { isBeatStart: step % 4 === 0, mStep: step },
                    );

                    if (notes && notes.length > 0) {
                        for (let i = 0; i < notes.length; i++) {
                            const pc = ((notes[i].midi % 12) + 12) % 12;
                            if (C_TRIAD_PCS.has(pc)) {
                                overlapVoices++;
                            }
                            totalVoices++;
                        }
                    }
                }
            }
            return {
                overlapRate: totalVoices > 0 ? overlapVoices / totalVoices : 0,
                totalVoices,
            };
        };

        it('drops harmony PC-overlap rate by ≥30pt when accompanimentMidis is populated', () => {
            const TRIALS = 30;
            const BARS_PER_BLOCK = 64;
            let passing = 0;
            const gaps: number[] = [];

            for (let trial = 0; trial < TRIALS; trial++) {
                // Control: no accompaniment voicing published. accompanimentCrowding is
                // false (gate `coordination.accompanimentHit`) so the reorder pass is
                // dormant and harmony picks whatever density/inversion the rest of the
                // pipeline produces.
                const control = measureHarmonyOverlap([], BARS_PER_BLOCK);
                // Comping: Cmaj voicing [60, 64, 67] published; accompanimentHit=true.
                // PC-overlap reorder should push {0, 4, 7}-PC intervals to the back of
                // the density-cap window.
                const comping = measureHarmonyOverlap([60, 64, 67], BARS_PER_BLOCK);

                const gap = control.overlapRate - comping.overlapRate;
                gaps.push(gap);

                // why ≥0.30: story acceptance criterion. On a C maj7 chord the natural
                // intervals [0, 4, 7, 11] would otherwise produce ~75% PCs in {0, 4, 7}
                // (only the 11/maj7 sits outside). After the reorder + density cap of 1-2
                // voices, the cap preferentially keeps the maj7 (PC 11) and 9th-type
                // extensions, dropping overlap rate substantially.
                if (gap >= 0.3) {
                    passing++;
                }
            }

            const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
            const minGap = Math.min(...gaps);
            const maxGap = Math.max(...gaps);

            // eslint-disable-next-line no-console
            console.log(
                `[accompaniment-unison harmony] mean gap ${(meanGap * 100).toFixed(1)}pt; ` +
                    `range ${(minGap * 100).toFixed(1)}pt..${(maxGap * 100).toFixed(1)}pt; ` +
                    `${passing}/${TRIALS} trials ≥ 30pt`,
            );

            // why threshold = TRIALS - 2: matches the soloist sub-test stochastic floor.
            // The harmony engine has motif/voicing randomness across steps; two miss
            // budget over 30 trials catches the rare voicing-cell that absorbs the reorder.
            expect(passing).toBeGreaterThanOrEqual(TRIALS - 2);
            expect(meanGap).toBeGreaterThanOrEqual(0.3);
        });
    });
});
