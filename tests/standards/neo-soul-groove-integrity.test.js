import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Neo-Soul Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const mockState = {
        playback: { bandIntensity: 0.6, bpm: 90, songMode: false },
        groove: {
            genreFeel: 'Neo-Soul',
            creativity: true,
            lastDrumPreset: 'Neo-Soul',
            instruments: [],
            sectionSeedMap: { 1: 0.5 },
        },
        soloist: { enabled: false, busySteps: 0 },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ start: 0, end: 64 }],
            stepMap: [{ start: 0, end: 1000, chord: { sectionId: '1' } }],
        },
    };

    it('should assign valid Neo-Soul Motifs', () => {
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Neo-Soul', 0.8));
        }
        expect(motifs.has(0)).toBe(true);
        expect(motifs.has(1)).toBe(true);
    });

    describe('Apply Groove Overrides - Neo-Soul Patterns', () => {
        const createParams = (state, step, instName, stepVal = 0) => {
            const ts44 = TIME_SIGNATURES['4/4'];
            const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
            return {
                step,
                inst: { name: instName, muted: false, steps: [] },
                stepVal,
                playback: state.playback,
                groove: state.groove,
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

        it('should play structured ghost notes for Motif 1', () => {
            getState.mockReturnValue(mockState);
            let barIndexMotif1 = -1;
            for (let i = 0; i < 100; i++) {
                if (
                    getDrumMotif(((i * 137 + 42) % 256) / 256, 'Neo-Soul', 0.8) === 1 &&
                    i % 4 !== 3
                ) {
                    barIndexMotif1 = i;
                    break;
                }
            }
            if (barIndexMotif1 === -1) {
                return;
            }

            const ghostStep = barIndexMotif1 * 16 + 3; // 'e' of 1
            const result = applyGrooveOverrides(
                getState(),
                createParams(mockState, ghostStep, 'Snare'),
            );
            expect(result.shouldPlay).toBe(true);
            expect(result.velocity).toBeLessThan(0.5);
        });

        it('should drag Snare timing slightly', () => {
            getState.mockReturnValue(mockState);
            const backbeat = 4;
            const result = applyGrooveOverrides(
                getState(),
                createParams(mockState, backbeat, 'Snare'),
            );
            expect(result.instTimeOffset).toBeGreaterThan(0);
        });

        it('should route phrase-release open hats through the open lane without doubling', () => {
            const highIntensityState = {
                ...mockState,
                playback: { ...mockState.playback, bandIntensity: 0.85 },
            };
            getState.mockReturnValue(highIntensityState);

            const releaseStep = 14; // & of 4
            const closedLane = applyGrooveOverrides(
                getState(),
                createParams(highIntensityState, releaseStep, 'HiHat'),
            );
            const openLane = applyGrooveOverrides(
                getState(),
                createParams(highIntensityState, releaseStep, 'Open'),
            );

            expect(closedLane.shouldPlay).toBe(false);
            expect(openLane.shouldPlay).toBe(true);
            expect(openLane.soundName).toBe('Open');
        });
    });
});
