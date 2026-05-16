// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Country Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 115 },
            groove: {
                genreFeel: 'Country',
                creativity: true,
                lastDrumPreset: 'Country (Two-Step)',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const chordC = { rootMidi: 48, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(
                getState(),
                'country',
                globalStep,
                globalStep % 16,
                info,
                {},
            );

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'country',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({
                        step: globalStep,
                        loopStep: globalStep % 16,
                        info,
                        note,
                        chord: chordC,
                    });
                    prevFreq = note.freq || 0;
                }
            }
        }
        return performance;
    };

    it('should play the Two-Step half-note pattern: Root on beats 1 and 3', () => {
        // Engine reality: `style === 'country'` in checkBassActiveStyle returns
        // `step % (stepsPerBeat * 2) === 0`, so only beats 0 and 2 (musical 1 and 3) fire.
        // The Two-Step is a half-note bass pattern, not a quarter-note Root-Fifth alternation.
        const performance = simulatePerformance(16);

        const beats = performance.map((p) => p.info.beatIndex);
        expect(performance.length).toBe(32); // 16 bars × 2 hits/bar
        expect(beats.every((b) => b === 0 || b === 2)).toBe(true);

        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            expect(pc).toBe(p.chord.rootMidi % 12); // Root on every fired beat
        });
    });

    it('should keep the root in the deep register (below C2)', () => {
        const performance = simulatePerformance(16);
        const rootMidi = 48; // C2

        performance.forEach((p) => {
            // safeCenterMidi shifts via registerShift = floor(intensity*7) but country
            // doesn't get the extended-range carve-out, so notes should clamp <= rootMidi.
            expect(p.note.midi).toBeLessThanOrEqual(rootMidi);
        });
    });

    it('should simplify to Downbeat-Only at very low intensity', () => {
        // bass-styles.ts:255-257 returns null on `intensity < 0.2 && !isDownbeat`,
        // dropping the beat-3 half-note. Expect exactly 16 fired hits, all on bar 1.
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.1, complexity: 0.3, bpm: 115 },
        });
        const totalBars = 16;
        const allOnDownbeat = performance.every((p) => p.info.isMeasureStart);

        console.log(`[Country Critique] Low-intensity hits: ${performance.length}/${totalBars}`);
        expect(performance.length).toBe(totalBars);
        expect(allOnDownbeat).toBe(true);
    });

    it('should boost velocity with intensity', () => {
        // pluckVel = 0.95 + intensity * 0.3 (bass-styles.ts:285) — the engine's
        // intensity axis is loudness, not density. Verify scaling.
        const low = simulatePerformance(8, {
            playback: { bandIntensity: 0.3, complexity: 0.5, bpm: 115 },
        });
        const high = simulatePerformance(8, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 115 },
        });

        const avg = (perf) => perf.reduce((s, p) => s + p.note.velocity, 0) / perf.length;
        const lowVel = avg(low);
        const highVel = avg(high);
        console.log(
            `[Country Critique] Velocity scaling: low=${lowVel.toFixed(2)} high=${highVel.toFixed(2)}`,
        );

        // Expected: 0.95 + 0.3*0.3 = 1.04 vs 0.95 + 0.95*0.3 = 1.235 — both clamped
        // by the velocity ceiling at 1.25 (bass-engine.ts:361).
        expect(highVel).toBeGreaterThan(lowVel * 1.1);
    });
});
