import { describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';
import { installSeededRandom } from '../utils/seeded-random.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

/**
 * Epic 10 S2 (c) — Picker-output-only chromatism metric.
 *
 * The legacy `soloist-jazz-critique.test.ts` "Bird-profile chromatism ratio"
 * test measured the COMBINED picker + device chromatic output and asserted a
 * 29-30.5% floor. `generateMelodicDevice` (runs, enclosures, approach licks)
 * already emits chromatic content independent of the picker, so the combined
 * metric had only ~0.5pt headroom over the un-patched ceiling — it could not
 * cleanly isolate the Epic 4 S1 fix (chromatic-neighbor admission in the
 * picker's candidate-pool gate at `soloist-pitch-engine.ts` ~line 614).
 *
 * This test isolates the picker. With `debugSoloist: true` the engine tags
 * each emitted note with `source: 'picker' | 'device'`; we measure the
 * chromatic-neighbor share of picker-sourced attacks ONLY.
 *
 * Engine reality (measured, Bird profile, 512-bar ii-V-I):
 *   - post-fix picker chromatism:  24.8 - 29.2% (15-run free-RNG sweep)
 *   - pre-fix  picker chromatism:  18.2 - 21.0% (5-run free-RNG sweep, gate
 *                                   reverted by forcing isChromaticNeighbor=false)
 * The two distributions do not overlap. Random baseline: of the 7 non-Ionian
 * pitch classes out of 12, an unbiased picker would land ~58% chromatic — the
 * engine is well BELOW random because chord-tone/scale-tone biases dominate
 * (chromatic neighbors are a seasoning), so the meaningful comparison is
 * post-fix vs pre-fix, not vs uniform-random.
 *
 * Determinism: `installSeededRandom` pins `Math.random` to a mulberry32 stream
 * (Epic 10 S2.d), so the picker chromatism is a single deterministic value per
 * seed rather than a 24.8-29.2% band — the assertion bound can sit much closer
 * to the pre-fix ceiling without flaking.
 */
function buildSoloistState() {
    return makeSoloistMock({
        enabled: true,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        srdcState: 'Statement',
        qaState: 'Question',
        isResting: true,
        motifBuffer: [],
        thematicSeed: [],
        thematicSeedRoot: 0,
        isReplayingMotif: false,
        isReplayingSeed: false,
        busySteps: 0,
        pitchHistory: [],
        lastInterval: 0,
        stagnationCount: 0,
        deviceBuffer: [],
        lastFreq: 0,
        currentCell: null,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
        },
    });
}

const Dm7 = { rootMidi: 62, quality: 'm7', intervals: [0, 3, 7, 10], beats: 4 };
const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
const Cmaj7 = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
const PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];
const IONIAN_REL_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);

describe('Soloist Bird-profile picker chromatism (Epic 10 S2.c)', () => {
    // mulberry32-seeded Math.random — picker chromatism becomes deterministic.
    installSeededRandom(0xb1_2d_50_10);

    it('picker-emitted chromatic-neighbor share stays above the pre-fix ceiling', () => {
        const soloistState = buildSoloistState();
        getState.mockReturnValue({
            playback: {
                bandIntensity: 0.7,
                bpm: 140,
                complexity: 0.7,
                intent: {},
                lyricalBias: 0.1,
                currentLoopCount: 4,
                debugSoloist: true, // surfaces note.source
            },
            groove: { genreFeel: 'Jazz', pocket: 0 },
            soloist: soloistState,
            harmony: { enabled: false },
            arranger: { timeSignature: '4/4' },
        });

        const numBars = 512;
        let lastFreq = 0;
        let pickerAttacks = 0;
        let pickerChromatic = 0;
        let deviceAttacks = 0;
        let deviceChromatic = 0;
        let untaggedAttacks = 0;

        for (let bar = 0; bar < numBars; bar++) {
            const chord = PROGRESSION[bar % 4];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'bird',
                    step,
                );
                if (note) {
                    // engine tags res[res.length-1]; match that for multi-note emissions
                    const primary = Array.isArray(note) ? note[note.length - 1] : note;
                    if (typeof primary.midi === 'number') {
                        const relPC = (((primary.midi - chord.rootMidi) % 12) + 12) % 12;
                        const isChromatic = !IONIAN_REL_PCS.has(relPC);
                        if (primary.source === 'picker') {
                            pickerAttacks++;
                            if (isChromatic) {
                                pickerChromatic++;
                            }
                        } else if (primary.source === 'device') {
                            deviceAttacks++;
                            if (isChromatic) {
                                deviceChromatic++;
                            }
                        } else {
                            untaggedAttacks++;
                        }
                        lastFreq = primary.frequency || 0;
                    }
                }
                soloistState.session.sessionSteps++;
            }
        }

        const pickerRatio = pickerChromatic / Math.max(pickerAttacks, 1);
        const deviceRatio = deviceChromatic / Math.max(deviceAttacks, 1);

        console.log(
            '\n--- BIRD PICKER CHROMATISM (S2.c) ---\n' +
                `[Picker attacks]      ${pickerAttacks}\n` +
                `[Picker chromatic]    ${pickerChromatic} (${(pickerRatio * 100).toFixed(1)}%)\n` +
                `[Device attacks]      ${deviceAttacks}\n` +
                `[Device chromatic]    ${deviceChromatic} (${(deviceRatio * 100).toFixed(1)}%)\n` +
                `[Untagged attacks]    ${untaggedAttacks}\n` +
                '[Target]              picker chromatism > 23.0%\n' +
                '-------------------------------------\n',
        );

        // Sanity: the test-mode `source` tag must actually be populated.
        expect(untaggedAttacks).toBe(0);
        // Need a non-trivial picker sample. 512 bars yields ~1600 picker
        // attacks; if the tag plumbing broke this would collapse to 0.
        expect(pickerAttacks).toBeGreaterThan(800);

        // Threshold 23.0%. The S1 chromatic-neighbor admission gate makes the
        // picker emit b3/b5/b9-type approach tones it previously dropped.
        //   - pre-fix picker chromatism ceiling: 21.0% (gate reverted)
        //   - post-fix picker chromatism floor:  24.8% (free-RNG), and with the
        //     pinned mulberry32 seed it lands deterministically well inside the
        //     post-fix band.
        // 23.0% sits ~2pt above the pre-fix ceiling and ~1.8pt below the
        // worst-observed post-fix free-RNG run — it rejects the un-patched
        // distribution outright while leaving headroom for future picker
        // tuning. This is a PICKER-ONLY metric: device-emitted chromatic
        // content (which the legacy combined test conflated) is reported
        // separately and not asserted here.
        expect(pickerRatio).toBeGreaterThan(0.23);
    });
});
