// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Disco Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.7, bpm: 120, songMode: false },
        groove: {
            genreFeel: 'Disco',
            creativity: true,
            lastDrumPreset: 'Disco',
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: { timeSignature: '4/4', sectionMap: [{ start: 0, end: 64 }] }, // 4 measures
    };

    it('should assign valid Disco Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Disco', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Disco Patterns', () => {
        const createParams = (step, instName, stepVal = 0) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: mockState.playback,
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
            };
        };

        it('should maintain Four-on-the-Floor Kick', () => {
            getState.mockReturnValue(mockState);
            const kickSteps = [0, 4, 8, 12];
            for (const step of kickSteps) {
                const result = applyGrooveOverrides(getState(), createParams(step, 'Kick'));
                expect(result.shouldPlay).toBe(true);
            }
        });

        it('should route the characteristic offbeat open hats to the open lane only', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif0 = -1;
            for (let i = 0; i < 100; i++) {
                if (getDrumMotif(((i * 137 + 42) % 256) / 256, 'Disco', 0.8) === 0 && i % 4 !== 3) {
                    barIndexMotif0 = i;
                    break;
                }
            }
            if (barIndexMotif0 === -1) {
                return;
            }

            // Offbeats are 2, 6, 10, 14
            const offbeats = [2, 6, 10, 14].map((s) => barIndexMotif0 * 16 + s);
            for (const step of offbeats) {
                const closedLane = applyGrooveOverrides(getState(), createParams(step, 'HiHat'));
                const openLane = applyGrooveOverrides(getState(), createParams(step, 'Open'));
                expect(closedLane.shouldPlay).toBe(false);
                expect(openLane.shouldPlay).toBe(true);
                expect(openLane.soundName).toBe('Open');
            }
        });

        it('should keep supportive closed hats on the beat without sending them to the open lane', () => {
            getState.mockReturnValue(mockState);

            const downbeat = 0;
            const closedLane = applyGrooveOverrides(getState(), createParams(downbeat, 'HiHat'));
            const openLane = applyGrooveOverrides(getState(), createParams(downbeat, 'Open'));

            expect(closedLane.shouldPlay).toBe(true);
            expect(closedLane.soundName).toBe('HiHat');
            expect(openLane.shouldPlay).toBe(false);
        });

        it('should trigger snare fills on turnarounds', () => {
            getState.mockReturnValue(mockState);
            const turnaroundBarIndex = 3;
            const step15 = turnaroundBarIndex * 16 + 15;

            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.1);
            const result = applyGrooveOverrides(getState(), createParams(step15, 'Snare'));
            expect(result.shouldPlay).toBe(true);
            expect(result.velocity).toBeGreaterThan(0.3);
            mockMath.mockRestore();
        });
    });
});
