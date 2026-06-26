// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    applyGrooveOverrides,
    calculateStepDuration,
    getDrumMotif,
} from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Blues Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Blues',
            lastDrumPreset: 'Blues',
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
    };

    it('should assign valid Blues Motifs', () => {
        const motifs = new Set();
        // At intensity 0.8 (HIGH), we expect driving motifs (1, 2, 3)
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Blues', 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
        expect(motifs.has(0)).toBe(false);
    });

    describe('Apply Groove Overrides - Blues Patterns', () => {
        const createParams = (step, instName, stepVal = 0, intensity = 0.5) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: { ...mockState.playback, bandIntensity: intensity },
                groove: mockState.groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
                stepsPerBar: 16,
            };
        };

        it('plays the straight-8th HiHat grid for Motif 0 (shuffle is swing, not step placement)', () => {
            // The Blues hat lane emits on the STRAIGHT 8th grid — `isBeatStart ||
            // isOffbeat` = steps 0,2,4,6,8,10,12,14 (blues.ts:76). The triplet
            // "shuffle" FEEL comes from the global swing transform in
            // calculateStepDuration, NOT from the engine emitting on the swung
            // 16ths 3/7/11/15. (The old test asserted [0,3,4,7,8,11,12,15] —
            // wrong — and never reached an assertion: it called getDrumMotif
            // with 0.5 as COMPLEXITY and the default intensity 1.0, at which the
            // Blues selector can never return motif 0, so barIndexMotif0 stayed
            // -1 and the test returned before any expect.)
            getState.mockReturnValue(mockState);

            // Reach a genuine motif-0 bar. Inside applyGrooveOverrides the motif
            // is getMotif(sectionSeed, drumComplexity=0.8, intensity=bandIntensity)
            // and sectionSeed for barIndex N is ((N*137+42)%256)/256
            // (groove-engine.ts). Predict with the SAME args the engine uses
            // (complexity 0.8, intensity 0.5) so the chosen bar is really motif 0
            // (seed<0.75 → 0) — which also keeps step 14 a plain HiHat, since the
            // turnaround Open-hat substitution needs motif >= 1.
            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                const seed = ((i * 137 + 42) % 256) / 256;
                if (getDrumMotif(seed, 'Blues', 0.8, 0.5) === 0 && i % 4 !== 3) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            expect(barIndexMotif0).toBeGreaterThanOrEqual(0);

            // The hat fires on every even 16th (the straight 8th grid)...
            const evenGrid = [0, 2, 4, 6, 8, 10, 12, 14];
            for (const local of evenGrid) {
                const step = barIndexMotif0 * 16 + local;
                const result = applyGrooveOverrides(
                    getState(),
                    createParams(step, 'HiHat', 0, 0.5),
                );
                expect(result.shouldPlay).toBe(true);
                expect(result.soundName).toBe('HiHat');
            }

            // ...and is SILENT on every odd 16th. A hat on the odd 16ths would
            // read as a busy straight-16th pattern, not a shuffle — this is what
            // distinguishes the real grid from "emits everywhere".
            const oddGrid = [1, 3, 5, 7, 9, 11, 13, 15];
            for (const local of oddGrid) {
                const step = barIndexMotif0 * 16 + local;
                const result = applyGrooveOverrides(
                    getState(),
                    createParams(step, 'HiHat', 0, 0.5),
                );
                expect(result.shouldPlay).toBe(false);
            }
        });

        it('shuffles the offbeat via the swing transform, not via step placement', () => {
            // The straight even-grid hat only becomes a SHUFFLE because the
            // global swing transform pushes the offbeat toward the 2/3 triplet
            // position. Blues' real config is swing 90 / swingSub '8th'
            // (smart-genres.ts). The onset of the "and" of beat 1 (step 2) is
            // duration(step0)+duration(step1); divided by one beat (4 steps) it
            // lands at ~0.65 of the beat — the triplet feel — NOT 0.5 (straight).
            const ts = TIME_SIGNATURES['4/4'];
            const bpm = 90;
            const swung = { swing: 90, swingSub: '8th' };
            const straight = { swing: 0 };

            const stepSec = calculateStepDuration(0, bpm, ts, straight);
            const beatSec = 4 * stepSec;
            const onsetOfAnd =
                calculateStepDuration(0, bpm, ts, swung) + calculateStepDuration(1, bpm, ts, swung);
            const swingRatio = onsetOfAnd / beatSec;

            console.log(
                `[Blues Shuffle] offbeat onset / beat = ${swingRatio.toFixed(3)} ` +
                    `(Target: 0.60–0.70; straight feel = 0.50)`,
            );

            // Measured 0.65, deterministic (no RNG in calculateStepDuration).
            // Band (0.60, 0.70) gives 0.05 headroom each side and a straight
            // (swing=0 → 0.50) engine fails the lower bound outright.
            expect(swingRatio).toBeGreaterThan(0.6);
            expect(swingRatio).toBeLessThan(0.7);
        });
    });
});
