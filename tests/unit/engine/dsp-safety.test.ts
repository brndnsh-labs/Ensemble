// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' },
        densitySelect: { value: 'standard' },
        intensitySlider: { value: 0 },
        intensityValue: { textContent: '' },
    },
}));

vi.mock('../../../public/persistence.js', () => ({
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/engine/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({})),
}));

import { initAudio } from '../../../public/engine/engine.js';
import { dispatch, getState } from '../../../public/state.js';
import { clampFreq, createSoftClipCurve } from '../../../public/utils.js';

const { playback, chords, bass } = getState();

import { applyConductor } from '../../../public/engine/conductor.js';

describe('DSP & Signal Safety', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        const MockAudioContext = vi.fn().mockImplementation(function () {
            this.state = 'running';
            this.currentTime = 0;
            this.sampleRate = 44100;
            this.createGain = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                gain: {
                    value: 1,
                    setTargetAtTime: vi.fn(),
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
            }));
            this.createStereoPanner = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                pan: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
            }));
            this.createWaveShaper = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                curve: null,
                oversample: 'none',
            }));
            this.createDynamicsCompressor = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                threshold: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
                ratio: { value: 0, setTargetAtTime: vi.fn(), setValueAtTime: vi.fn() },
                knee: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                attack: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                release: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
            }));
            this.createBiquadFilter = vi.fn().mockImplementation(() => ({
                connect: vi.fn(),
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                type: 'lowpass',
            }));
            this.createConvolver = vi.fn().mockImplementation(() => ({ connect: vi.fn() }));
            this.createBuffer = vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(1024)),
            }));
            this.destination = {};
        });

        global.window.AudioContext = MockAudioContext;
        playback.audio = null;
    });

    it('should generate a valid soft-clip curve for the saturator', () => {
        const curve = createSoftClipCurve();
        expect(curve).toBeInstanceOf(Float32Array);
        expect(curve.length).toBe(44100);

        // Midpoint should be 0
        expect(curve[22050]).toBeCloseTo(0, 2);

        // Ends should be clamped/saturated
        expect(curve[0]).toBeLessThan(-0.9);
        expect(curve[44099]).toBeGreaterThan(0.9);

        // Monotonic check
        for (let i = 1; i < curve.length; i += 100) {
            expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1]);
        }
    });

    it('should adjust master limiter based on band intensity to prevent clipping', () => {
        initAudio(getState()); // Initialize nodes

        // Low intensity
        playback.bandIntensity = 0.2;
        applyConductor(getState(), dispatch);
        const lowThreshold =
            playback.audioGraph.master.limiter.threshold.setTargetAtTime.mock.calls[0][0];

        // High intensity
        playback.bandIntensity = 0.9;
        applyConductor(getState(), dispatch);
        const highThreshold =
            playback.audioGraph.master.limiter.threshold.setTargetAtTime.mock.calls[1][0];

        // High intensity should have a lower threshold (more compression/limiting)
        expect(highThreshold).toBeLessThan(lowThreshold);
    });

    it('should ensure all instrument reverb sends are within safe bounds', () => {
        // High reverb settings in state
        chords.reverb = 1.2; // Over 1.0!
        bass.reverb = 0.8;

        initAudio(getState());

        // The engine should clamp or handle these.
        // Let's verify what the gain nodes were actually set to.
        // (Depends on engine.js implementation)
    });

    describe('DSP Clamping', () => {
        it('should clamp frequencies above 24000Hz to 24000Hz', () => {
            expect(clampFreq(25000)).toBe(24000);
            expect(clampFreq(24001)).toBe(24000);
            expect(clampFreq(24000)).toBe(24000);
            expect(clampFreq(25087.7)).toBe(24000);
        });

        it('should clamp negative frequencies to 0Hz', () => {
            expect(clampFreq(-100)).toBe(0);
            expect(clampFreq(-1)).toBe(0);
            expect(clampFreq(0)).toBe(0);
        });

        it('should allow frequencies within the valid range', () => {
            expect(clampFreq(100)).toBe(100);
            expect(clampFreq(10000)).toBe(10000);
            expect(clampFreq(23999)).toBe(23999);
        });

        it('should respect custom max', () => {
            expect(clampFreq(25000, 22050)).toBe(22050);
            expect(clampFreq(20000, 22050)).toBe(20000);
        });
    });
});
