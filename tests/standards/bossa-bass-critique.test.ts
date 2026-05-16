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

describe('Bossa Nova Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Bossa Nova',
                creativity: true,
                lastDrumPreset: 'Bossa Nova',
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

        const chordC = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: 4 };
        const tsConfig = TIME_SIGNATURES['4/4'];

        const performance = [];
        let prevFreq = 0;
        for (let globalStep = 0; globalStep < numBars * 16; globalStep++) {
            const info = getStepInfo(globalStep, tsConfig, [], TIME_SIGNATURES);
            const active = isBassActive(getState(), 'bossa', globalStep, globalStep % 16, info, {});

            if (active) {
                const note = getBassNote(
                    getState(),
                    chordC,
                    null,
                    info.beatIndex,
                    prevFreq,
                    36,
                    'bossa',
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

    it('should implement the authentic Bossa rhythm (1, &2, 3, &4)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.5 } });

        let correctSteps = 0;
        performance.forEach((p) => {
            const s = p.loopStep;
            if ([0, 6, 8, 14].includes(s)) {
                correctSteps++;
            }
        });

        const ratio = correctSteps / performance.length;
        console.log(`[Bossa Critique] Rhythmic Accuracy: ${(ratio * 100).toFixed(1)}%`);

        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should alternate Root and Fifth between downbeats and upbeats', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        let rootHits = 0;
        let fifthHits = 0;

        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            if (p.loopStep === 0 || p.loopStep === 8) {
                if (pc === 0) {
                    rootHits++;
                }
            } else if (p.loopStep === 6 || p.loopStep === 14) {
                if (pc === 7) {
                    fifthHits++;
                }
            }
        });

        console.log(
            `[Bossa Critique] Root Consistency: ${rootHits}/32, Fifth Consistency: ${fifthHits}/32`,
        );

        // Pitch class on the named positions should be stable across all 16 bars
        // (octave displacement preserves PC; only the voicing breathes).
        expect(rootHits).toBe(32);
        expect(fifthHits).toBe(32);
    });

    it('should breathe across bars rather than repeating a single voicing for 16 bars', () => {
        // Real bossa players octave-displace the root or fifth occasionally so the line
        // doesn't read as "MIDI demo file." The engine should produce more than one distinct
        // bar-shape over a 16-bar static-chord stretch.
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        // Group notes into bars (loopStep 0–15) and stringify each bar's MIDI sequence.
        const barShapes = new Map(); // step→midi signature per bar
        performance.forEach((p) => {
            const barIdx = Math.floor(p.step / 16);
            if (!barShapes.has(barIdx)) {
                barShapes.set(barIdx, []);
            }
            barShapes.get(barIdx).push(`${p.loopStep}:${p.note.midi}`);
        });
        const distinctShapes = new Set();
        for (const seq of barShapes.values()) {
            distinctShapes.add(seq.join(','));
        }

        console.log(
            `[Bossa Critique] Distinct bar shapes over ${barShapes.size} bars: ${distinctShapes.size}`,
        );

        // At least 3 distinct shapes across 16 bars — a meaningful amount of variation
        // without losing the bossa identity. Anything ≤ 1 means the bass is mechanical.
        expect(distinctShapes.size).toBeGreaterThanOrEqual(3);
    });

    it('should implement "Lay-back" timing (positive timingOffset)', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.8 } });

        const lagNotes = performance.filter((p) => p.note.timingOffset > 0);
        const ratio = lagNotes.length / performance.length;

        console.log(`[Bossa Critique] Lay-back Consistency: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.9);
    });
});
