// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSimplePanner,
    HUMANIZE_PROFILES,
    humanizeNote,
    humanizeSeed,
    killActiveVoices,
    rampGain,
    updateDensityDucking,
    velocityTimbre,
} from '../../../public/engine/synth-utils.js';

describe('Synthesis Utilities', () => {
    let mockParam;

    beforeEach(() => {
        vi.clearAllMocks();
        mockParam = {
            cancelScheduledValues: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            setValueAtTime: vi.fn(),
        };
    });

    describe('rampGain', () => {
        it('should use setTargetAtTime by default', () => {
            rampGain(mockParam, 0.5, 10.0, 0.1);
            expect(mockParam.cancelScheduledValues).toHaveBeenCalledWith(10.0);
            expect(mockParam.setTargetAtTime).toHaveBeenCalledWith(0.5, 10.0, 0.1);
        });

        it('should use exponentialRampToValueAtTime when requested and target > 0.0001', () => {
            rampGain(mockParam, 0.5, 10.0, 0.1, true);
            expect(mockParam.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.5, 10.1);
        });

        it('should fallback to setTargetAtTime if exponential is requested but target is too low', () => {
            rampGain(mockParam, 0, 10.0, 0.1, true);
            expect(mockParam.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.1);
        });

        it('should ignore errors during automation', () => {
            mockParam.cancelScheduledValues.mockImplementation(() => {
                throw new Error('Audio error');
            });
            // Should not throw
            expect(() => rampGain(mockParam, 0.5, 10.0)).not.toThrow();
        });
    });

    describe('killActiveVoices', () => {
        it('should stop and fade all voices', () => {
            const mockOsc = { stop: vi.fn() };
            const voices = [
                {
                    gain: mockParam,
                    nodes: [mockOsc],
                },
            ];

            killActiveVoices(voices, 10.0, 0.05);

            expect(mockParam.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.05);
            expect(mockOsc.stop).toHaveBeenCalledWith(10.0 + 0.05 + 0.05);
            expect(voices.length).toBe(0);
        });

        it('should handle voices with .gain.gain structure', () => {
            const voices = [
                {
                    gain: { gain: mockParam },
                    nodes: [],
                },
            ];
            killActiveVoices(voices, 10.0);
            expect(mockParam.setTargetAtTime).toHaveBeenCalled();
        });

        it('should ignore errors during stop', () => {
            const mockOsc = {
                stop: vi.fn(() => {
                    throw new Error('Already stopped');
                }),
            };
            const voices = [{ gain: mockParam, nodes: [mockOsc] }];
            expect(() => killActiveVoices(voices, 10.0)).not.toThrow();
        });

        it('should return early if no voices provided', () => {
            expect(() => killActiveVoices(null, 10.0)).not.toThrow();
            expect(() => killActiveVoices([], 10.0)).not.toThrow();
        });
    });

    describe('updateDensityDucking', () => {
        it('should track hits and calculate ducking factor', () => {
            const mixState = { recentHits: 0, lastTick: 0, densityDuck: 1.0 };

            // First hit at time 10.0
            updateDensityDucking(mixState, 10.0, 2, 0.1);
            expect(mixState.recentHits).toBe(1);
            expect(mixState.densityDuck).toBe(1.0); // Not past threshold (2)

            // Second hit
            updateDensityDucking(mixState, 10.1, 2, 0.1);
            expect(mixState.recentHits).toBe(2);
            expect(mixState.densityDuck).toBe(1.0);

            // Third hit (past threshold of 2)
            updateDensityDucking(mixState, 10.2, 2, 0.1);
            expect(mixState.recentHits).toBe(3);
            expect(mixState.densityDuck).toBe(0.9); // 1.0 - (3-2)*0.1

            // Many hits should be capped
            mixState.recentHits = 50;
            updateDensityDucking(mixState, 10.3, 2, 0.1);
            expect(mixState.densityDuck).toBe(0.75); // Min cap
        });

        it('should decay hits over time', () => {
            const mixState = { recentHits: 10, lastTick: 10.0, densityDuck: 0.5 };
            // Move forward 1 second (> 0.5 decay threshold)
            updateDensityDucking(mixState, 11.1);
            // 10 * 0.5 (decay) + 1 (new hit) = 6
            expect(mixState.recentHits).toBe(6);
            expect(mixState.lastTick).toBe(11.1);
        });
    });

    describe('createSimplePanner', () => {
        it('should create and configure a StereoPanner', () => {
            const mockPanner = { pan: { setValueAtTime: vi.fn() } };
            const mockCtx = {
                createStereoPanner: vi.fn(() => mockPanner),
            };

            const result = createSimplePanner(mockCtx, 0.5, 10.0);
            expect(result).toBe(mockPanner);
            expect(mockPanner.pan.setValueAtTime).toHaveBeenCalledWith(0.5, 10.0);
        });

        it('should fallback to GainNode if StereoPanner is unavailable', () => {
            const mockGain = { connect: vi.fn() };
            const mockCtx = {
                createGain: vi.fn(() => mockGain),
                // no createStereoPanner
            };

            const result = createSimplePanner(mockCtx, 0.5, 10.0);
            expect(result).toBe(mockGain);
        });
    });

    describe('humanizeNote (Epic 0 S6)', () => {
        const drums = HUMANIZE_PROFILES.drums;

        it('is deterministic — same seed reproduces the same offsets', () => {
            const seed = humanizeSeed(12, 'drums', 7);
            const a = humanizeNote(seed, drums);
            const b = humanizeNote(seed, drums);
            expect(a).toEqual(b);
        });

        it('draws independently per instrument and per voice', () => {
            // Same step, different instrument → different timing.
            const drumHit = humanizeNote(humanizeSeed(4, 'drums', 0), drums);
            const bassHit = humanizeNote(humanizeSeed(4, 'bass', 0), drums);
            expect(drumHit.timeOffset).not.toBe(bassHit.timeOffset);

            // Same instrument, different voice → different timing.
            const voiceA = humanizeNote(humanizeSeed(4, 'drums', 0), drums);
            const voiceB = humanizeNote(humanizeSeed(4, 'drums', 1), drums);
            expect(voiceA.timeOffset).not.toBe(voiceB.timeOffset);
        });

        it('keeps timing/velocity/detune independent within one note', () => {
            // The three draws come off distinct XOR constants — they must not
            // collapse onto the same underlying random value.
            const n = humanizeNote(humanizeSeed(9, 'soloist', 2), HUMANIZE_PROFILES.soloist);
            const timeFrac = n.timeOffset / HUMANIZE_PROFILES.soloist.timeSpread;
            const velFrac = (n.velocityMult - 1) / HUMANIZE_PROFILES.soloist.velSpread;
            expect(timeFrac).not.toBeCloseTo(velFrac, 5);
        });

        it('is a no-op at scale 0 (humanize knob off)', () => {
            const n = humanizeNote(humanizeSeed(3, 'drums', 0), drums, 0);
            expect(n.timeOffset).toBeCloseTo(0, 10); // may be -0
            expect(n.velocityMult).toBe(1);
            expect(n.detuneCents).toBeCloseTo(0, 10); // may be -0
        });

        it('stays within the profile spread (± at full strength)', () => {
            for (let step = 0; step < 200; step++) {
                const n = humanizeNote(humanizeSeed(step, 'drums', step % 5), drums, 1);
                expect(Math.abs(n.timeOffset)).toBeLessThanOrEqual(drums.timeSpread);
                expect(Math.abs(n.velocityMult - 1)).toBeLessThanOrEqual(drums.velSpread);
            }
        });
    });

    describe('velocityTimbre (Epic 0 S7)', () => {
        it('maps a harder note to a brighter, more driven timbre', () => {
            const soft = velocityTimbre(0.2);
            const hard = velocityTimbre(0.9);
            expect(hard.brightness).toBeGreaterThan(soft.brightness);
            expect(hard.cutoffMult).toBeGreaterThan(soft.cutoffMult);
            expect(hard.drive).toBeGreaterThan(soft.drive);
        });

        it('clamps velocity to 0..1 at both ends', () => {
            expect(velocityTimbre(-5)).toEqual(velocityTimbre(0));
            expect(velocityTimbre(99)).toEqual(velocityTimbre(1));
        });

        it('maps the endpoints onto the configured ranges', () => {
            const opts = { cutoffRange: [0.3, 1.8] as const, driveRange: [0.1, 0.7] as const };
            const lo = velocityTimbre(0, opts);
            const hi = velocityTimbre(1, opts);
            expect(lo.cutoffMult).toBeCloseTo(0.3);
            expect(lo.drive).toBeCloseTo(0.1);
            expect(hi.cutoffMult).toBeCloseTo(1.8);
            expect(hi.drive).toBeCloseTo(0.7);
        });

        it('respects the curve: convex (>1) stays darker at mid-velocity than linear', () => {
            const linear = velocityTimbre(0.5, { curve: 1 });
            const convex = velocityTimbre(0.5, { curve: 2 });
            expect(convex.brightness).toBeLessThan(linear.brightness);
            expect(linear.brightness).toBeCloseTo(0.5);
            expect(convex.brightness).toBeCloseTo(0.25);
        });
    });
});
