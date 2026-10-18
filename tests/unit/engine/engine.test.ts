// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { audioWatchdog } from '../../../core/engine/audio-recovery.js';
import { initAudio } from '../../../core/engine/engine.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state.js
vi.mock('../../../core/state.js', () => {
    const mockState = {
        playback: {
            audio: { currentTime: 10.0 },
            bandIntensity: 0.5,
        },
        groove: { audioBuffers: {} },
        chords: { enabled: true, volume: 0.5, reverb: 0.5 },
        bass: { enabled: true, volume: 0.5, reverb: 0.5 },
        soloist: makeSoloistMock({ enabled: true, volume: 0.5, reverb: 0.5 }),
        harmony: { enabled: true, volume: 0.5, reverb: 0.5 },
    };
    return {
        getState: () => mockState,
        stateMap: mockState,
    };
});

import { getState } from '../../../core/state.js';

const { playback } = getState();

// Mock dependencies
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
                this.createDelay = vi.fn(() => ({
                    connect: vi.fn(),
                    delayTime: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                }));
                this.createOscillator = vi.fn(() => ({
                    connect: vi.fn(),
                    frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                    start: vi.fn(),
                    stop: vi.fn(),
                }));
                this.createStereoPanner = vi.fn(() => ({
                    connect: vi.fn(),
                    pan: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                }));
                this.createBiquadFilter = vi.fn(() => ({
                    connect: vi.fn(),
                    frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                    Q: { setValueAtTime: vi.fn() },
                    gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                    type: 'lowpass',
                }));
                this.createBuffer = vi.fn(() => ({
                    getChannelData: vi.fn(() => new Float32Array(1024)),
                }));
                this.createChannelMerger = vi.fn(() => ({ connect: vi.fn() }));
                this.createChannelSplitter = vi.fn(() => ({ connect: vi.fn() }));
                this.resume = vi.fn().mockResolvedValue();
            }
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio = null;
        playback.isPlaying = false;
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
});
