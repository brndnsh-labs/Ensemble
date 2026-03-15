/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioWatchdog } from '../../../public/engine/audio-recovery.js';
import { _resetChromiumCheck, getVisualTime, initAudio } from '../../../public/engine/engine.js';

// Mock state.js
vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: {
            audio: { currentTime: 10.0 },
            bandIntensity: 0.5,
            modals: {},
        },
        groove: { audioBuffers: {} },
        chords: { enabled: true, volume: 0.5, reverb: 0.5 },
        bass: { enabled: true, volume: 0.5, reverb: 0.5 },
        soloist: { enabled: true, volume: 0.5, reverb: 0.5 },
        harmony: { enabled: true, volume: 0.5, reverb: 0.5 },
        midi: { enabled: false },
    };
    return {
        getState: () => mockState,
        stateMap: mockState,
    };
});

import { getState } from '../../../public/state.js';

const { playback } = getState();

// Mock dependencies
vi.mock('../../../public/ui.js', () => ({
    ui: {
        masterVol: { value: '0.5' },
    },
}));

describe('Audio Engine & Cross-Browser Heuristics', () => {
    function getMockAudioContextClass(options = {}) {
        return class MockAudioContext {
            constructor() {
                this.state = options.state || 'running';
                this.sampleRate = options.sampleRate || 44100;
                this.baseLatency = options.baseLatency || 0.005;
                this.outputLatency = options.outputLatency || 0;
                this.currentTime = options.currentTime || 10.0;
                this.onstatechange = null;
                this.destination = {};
                this.createGain = vi.fn(() => ({
                    connect: vi.fn(),
                    gain: {
                        value: 1,
                        setValueAtTime: vi.fn(),
                        exponentialRampToValueAtTime: vi.fn(),
                        setTargetAtTime: vi.fn(),
                        cancelScheduledValues: vi.fn(),
                    },
                }));
                this.createWaveShaper = vi.fn(() => ({ connect: vi.fn(), curve: null }));
                this.createDynamicsCompressor = vi.fn(() => ({
                    connect: vi.fn(),
                    threshold: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                    knee: { setValueAtTime: vi.fn() },
                    ratio: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                    attack: { setValueAtTime: vi.fn() },
                    release: { setValueAtTime: vi.fn() },
                    reduction: { value: 0 },
                }));
                this.createConvolver = vi.fn(() => ({ connect: vi.fn(), buffer: null }));
                this.createBiquadFilter = vi.fn(() => ({
                    connect: vi.fn(),
                    frequency: { setValueAtTime: vi.fn() },
                    Q: { setValueAtTime: vi.fn() },
                    gain: { setValueAtTime: vi.fn() },
                    type: 'lowpass',
                }));
                this.createBuffer = vi.fn(() => ({
                    getChannelData: vi.fn(() => new Float32Array(1024)),
                }));
                this.resume = vi.fn().mockResolvedValue();
            }
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio = null;
        playback.isPlaying = false;
        if (_resetChromiumCheck) {
            _resetChromiumCheck();
        }
    });

    afterEach(() => {
        audioWatchdog.stop();
    });

    it('should correctly initialize with a 48kHz sample rate (Mac/iOS standard)', () => {
        global.window.AudioContext = getMockAudioContextClass({ sampleRate: 48000 });

        initAudio(getState());

        expect(playback.audio.sampleRate).toBe(48000);
        // Noise buffer should scale to sample rate (2 seconds = 96000 samples)
        expect(playback.audio.createBuffer).toHaveBeenCalledWith(1, 96000, 48000);
    });

    it('should automatically attempt to resume audio if suspended while playing (Safari fix)', async () => {
        global.window.AudioContext = getMockAudioContextClass({ state: 'suspended' });

        initAudio(getState());
        playback.isPlaying = true;

        // Trigger the state change handler manually
        playback.audio.onstatechange();

        expect(playback.audio.resume).toHaveBeenCalled();
    });

    it('should return 0 for visual time if audio context is missing', () => {
        playback.audio = null;
        expect(getVisualTime(getState())).toBe(0);
    });

    it('should compensate for hardware output latency in visualizer timing', () => {
        global.window.AudioContext = getMockAudioContextClass({ outputLatency: 0.08 }); // 80ms latency

        initAudio(getState());

        const visualTime = getVisualTime(getState());
        expect(visualTime).toBeLessThan(10.0);
        expect(visualTime).toBeCloseTo(9.92, 2);
    });

    it('should fallback to OS-specific defaults if outputLatency is not reported (Chrome/Chromium)', () => {
        let nowValue = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => nowValue);

        vi.stubGlobal('navigator', {
            userAgent: 'Chrome',
            vendor: 'Google Inc',
        });

        const MockClass = getMockAudioContextClass({ outputLatency: 0 });
        global.window.AudioContext = MockClass;
        initAudio(getState());

        // Baseline call to stabilize smoothing
        getVisualTime(getState());

        nowValue += 100;
        playback.audio.currentTime += 0.1;

        const visualTime = getVisualTime(getState());
        // audioTime (10.1) + smoothDelta (approx 0) - fallback (0.015)
        expect(visualTime).toBeCloseTo(10.085, 3);
    });

    it('should use higher fallback latency for Safari/Firefox', () => {
        let nowValue = 1000;
        vi.spyOn(performance, 'now').mockImplementation(() => nowValue);

        vi.stubGlobal('navigator', {
            userAgent: 'Safari',
            vendor: 'Apple',
        });

        const MockClass = getMockAudioContextClass({ outputLatency: 0 });
        global.window.AudioContext = MockClass;
        initAudio(getState());

        getVisualTime(getState());

        nowValue += 100;
        playback.audio.currentTime += 0.1;

        const visualTime = getVisualTime(getState());
        // audioTime (10.1) - fallback (0.045)
        expect(visualTime).toBeCloseTo(10.055, 3);
    });
});
