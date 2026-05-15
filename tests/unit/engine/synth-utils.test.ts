// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createSimplePanner,
    killActiveVoices,
    rampGain,
    updateDensityDucking,
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
});
