import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides, getDrumMotif } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Funk Groove Integrity', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('should assign valid Funk Motifs based on seed and complexity', () => {
        expect(getDrumMotif(((0 * 137 + 0) % 256) / 256, 'Funk', 0.2)).toBe(0); // Low complexity = Standard

        // At high complexity, we expect non-zero motifs depending on the barIndex seed
        const motifs = new Set();
        for (let i = 0; i < 20; i++) {
            motifs.add(getDrumMotif(((i * 137 + 42) % 256) / 256, 'Funk', 0.8));
        }
        expect(motifs.has(1)).toBe(true);
        expect(motifs.has(2)).toBe(true);
        expect(motifs.has(3)).toBe(true);
    });

    describe('Apply Groove Overrides - Funk Motifs', () => {
        const mockState = {
            playback: { bandIntensity: 0.8, bpm: 110, songMode: false },
            groove: {
                genreFeel: 'Funk',
                creativity: true,
                lastDrumPreset: 'Funk',
                sectionSeedMap: { 1: 0.5 }, // Consistent seed for tests
            },
            soloist: { enabled: false, busySteps: 0 },
            arranger: {
                timeSignature: '4/4',
                stepMap: [{ start: 0, end: 1000, chord: { sectionId: '1' } }],
            },
        };

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
                isPulse: info.isPulse,
                isBackbeat: info.isBackbeat,
                isGroupStart: info.isGroupStart,
                beatIndex: info.beatIndex,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                tsConfig: info.tsConfig,
            };
        };

        it('should play structured ghost notes for Motif 1 (The Funky Drummer)', () => {
            getState.mockReturnValue(mockState);

            // Force a seed that maps to Motif 1 (0.2 - 0.5)
            mockState.groove.sectionSeedMap['1'] = 0.3;

            // Force math.random to ensure the 'roll' succeeds
            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.01);

            const stepGhost = 6; // step 6 is an offbeat (non-beatStart)
            const resultSnare = applyGrooveOverrides(getState(), createParams(stepGhost, 'Snare'));

            // The ghost note should play, but with low velocity
            expect(resultSnare.shouldPlay).toBe(true);
            expect(resultSnare.velocity).toBeLessThan(0.5);

            mockMath.mockRestore();
        });

        it('should displace the backbeat for Motif 2 (Cold Sweat Style)', () => {
            getState.mockReturnValue(mockState);

            // Force a seed that maps to Motif 2
            mockState.groove.sectionSeedMap['1'] = 0.5;

            // Motif 2 often moves the later snare backbeat to an offbeat
            // Early backbeat (e.g. beat 2 in 4/4) should play normally
            // Late backbeat (e.g. beat 4 in 4/4) should be silent
            // The following offbeat (e.g. "and" of 4) should play strong

            const ts44 = TIME_SIGNATURES['4/4'];
            let earlyBackbeatPlayed = false;
            let lateBackbeatPlayed = false;
            let offbeatDisplacedPlayed = false;

            let callCount = 0;
            const mockMath = vi.spyOn(Math, 'random').mockImplementation(() => {
                callCount++;
                // Return 0.1 for the first roll() call to pass the first backbeat.
                // For any subsequent calls, return 0.9 to fail the roll() check.
                if (callCount === 1) {
                    return 0.1;
                }
                return 0.9;
            });

            for (let step = 0; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);

                if (info.isBackbeat || (info.isOffbeat && step >= 8)) {
                    const params = createParams(step, 'Snare');
                    const result = applyGrooveOverrides(getState(), params);

                    if (info.isBackbeat) {
                        if (step < 8 && result.shouldPlay && result.velocity > 0.8) {
                            earlyBackbeatPlayed = true;
                        } else if (step >= 8 && result.shouldPlay && result.velocity > 0.8) {
                            lateBackbeatPlayed = true;
                        }
                    }
                }
            }

            // We run a second loop resetting Math.random just for the offbeat displacement,
            // otherwise multiple `roll()` calls per step evaluation drain our mock unexpectedly.
            mockMath.mockRestore();
            const _mockMath2 = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            for (let step = 8; step < 16; step++) {
                const info = getStepInfo(step, ts44, [], TIME_SIGNATURES);
                if (info.isOffbeat && !info.isBackbeat) {
                    const params = createParams(step, 'Snare');
                    const result = applyGrooveOverrides(getState(), params);
                    if (result.shouldPlay && result.velocity > 0.85) {
                        offbeatDisplacedPlayed = true;
                    }
                }
            }

            mockMath.mockRestore();

            expect(earlyBackbeatPlayed).toBe(true);
            expect(lateBackbeatPlayed).toBe(false);
            expect(offbeatDisplacedPlayed).toBe(true);
        });

        it('should trigger anticipatory hi-hat barks on phrase turnarounds', () => {
            getState.mockReturnValue(mockState);
            mockState.groove.sectionSeedMap['1'] = 0.5;

            // Set up a turnaround
            mockState.arranger.sectionMap = [{ start: 0, end: 64 }]; // 4 bar section
            const beat4And = 62; // Step 62 is "and" of 4 in bar 4 (3*16 + 14)

            // Force math.random to trigger the turnaround
            const mockMath = vi.spyOn(Math, 'random').mockReturnValue(0.1);

            const closedLane = applyGrooveOverrides(getState(), createParams(beat4And, 'HiHat'));
            const openLane = applyGrooveOverrides(getState(), createParams(beat4And, 'Open'));

            // Should resolve to the Open lane as a short turnaround bark
            expect(closedLane.shouldPlay).toBe(false);
            expect(openLane.shouldPlay).toBe(true);
            expect(openLane.soundName).toBe('Open');
            expect(openLane.velocity).toBeGreaterThan(0.9);
            expect(openLane.instTimeOffset).toBeLessThan(0);

            mockMath.mockRestore();
        });

        it('should route phrase-release barks to the open lane without doubling the 16th stream', () => {
            getState.mockReturnValue(mockState);
            mockState.groove.sectionSeedMap['1'] = 0.8;

            const releaseStep = 14; // & of 4
            const closedLane = applyGrooveOverrides(getState(), createParams(releaseStep, 'HiHat'));
            const openLane = applyGrooveOverrides(getState(), createParams(releaseStep, 'Open'));

            expect(closedLane.shouldPlay).toBe(false);
            expect(openLane.shouldPlay).toBe(true);
            expect(openLane.soundName).toBe('Open');
        });
    });
});
