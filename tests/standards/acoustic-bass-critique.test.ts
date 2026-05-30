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

describe('Acoustic Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel: 'Acoustic',
                lastDrumPreset: 'Acoustic',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7], quality: 'maj', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'smart', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'smart',
                    0,
                    globalStep,
                    globalStep % 16,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: globalStep, loopStep: globalStep % 16, info, note });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should stay grounded in harmonic support (Roots and Fifths)', () => {
        const performance = simulatePerformance(16);

        let validHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (pc === 0 || pc === 7) {
                validHits++;
            }
        });

        const ratio = validHits / (performance.length || 1);
        console.log(`[Acoustic Critique] Root/Fifth Grounding: ${(ratio * 100).toFixed(1)}%`);
        // Acoustic pitch picker (bass-styles.ts:318-344) only ever returns root or
        // fifth (or octave, which is pc=0=root). Deterministic 100%.
        expect(ratio).toBe(1.0);
    });

    it('should use long sustains at low intensity (Half/Whole notes)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.5, bpm: 90 },
        });

        let longNotes = 0;
        performance.forEach((p) => {
            if (p.note.durationSteps >= 4) {
                longNotes++;
            }
        });

        const ratio = longNotes / (performance.length || 1);
        console.log(`[Acoustic Critique] Long Sustain Ratio: ${(ratio * 100).toFixed(1)}%`);
        // At intensity < 0.4 the engine hardcodes dur = stepsPerBeat * 1.8 = 7.2,
        // capped at 1.95 * stepsPerBeat = 7.8 in bass-engine.ts:367. Always >= 4.
        expect(ratio).toBe(1.0);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, {
            playback: { bandIntensity: 0.5, complexity: 0.5, bpm: 90 },
        });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / (performance.length || 1);

        console.log(`[Acoustic Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        // lag = 0.01 + intensity * 0.005 — always strictly positive. Deterministic.
        expect(ratio).toBe(1.0);
    });

    it('should switch from half-notes to quarter-notes around intensity 0.4', () => {
        // checkBassActiveStyle (bass-styles.ts:96-103) splits at intensity 0.4:
        //   below → stepInChord % (stepsPerBeat * 2) === 0 (half-notes, 2 hits/bar)
        //   at/above → isQuarter (4 hits/bar)
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.5, bpm: 90 },
        });
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 90 },
        });

        console.log(`[Acoustic Critique] Density scaling: low=${low.length} high=${high.length}`);
        expect(low.length).toBe(32); // 2 hits/bar × 16 bars
        expect(high.length).toBe(64); // 4 hits/bar × 16 bars
    });

    it('should boost velocity with intensity', () => {
        // velocity = 0.95 + intensity * 0.15 (bass-styles.ts:341)
        const low = simulatePerformance(16, {
            playback: { bandIntensity: 0.2, complexity: 0.5, bpm: 90 },
        });
        const high = simulatePerformance(16, {
            playback: { bandIntensity: 0.95, complexity: 0.5, bpm: 90 },
        });
        const avg = (perf) => perf.reduce((s, p) => s + p.note.velocity, 0) / perf.length;
        const lowVel = avg(low);
        const highVel = avg(high);
        console.log(
            `[Acoustic Critique] Velocity scaling: low=${lowVel.toFixed(2)} high=${highVel.toFixed(2)}`,
        );
        expect(highVel).toBeGreaterThan(lowVel * 1.1);
    });
});
