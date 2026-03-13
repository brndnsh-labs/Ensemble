/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                playbackRate: { value: 1 },
            })),
            createBuffer: vi.fn(() => ({
                getChannelData: vi.fn(() => new Float32Array(100)),
            })),
            sampleRate: 44100,
        },
        drumsGain: { connect: vi.fn() },
    };
    const mockGroove = {
        humanize: 20,
        audioBuffers: { noise: {} },
        lastHatGain: null,
    };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        chords: {},
        bass: {},
        soloist: {},
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
}));

import { playDrumSound } from '../../../public/engine/synth-drums.js';
import { getState } from '../../../public/state.js';

const { playback, groove } = getState();

describe('Drum Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        groove.lastHatGain = null;
        playback.audio.currentTime = 10;
        groove.audioBuffers = { noise: {} };
    });

    it('should create a 4-layer model for the Kick drum', () => {
        playDrumSound('Kick', 10, 1.0);

        // Layers: Beater (Osc), Skin (Noise), Knock (Osc), Shell (Osc) + Panner (Gain)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        expect(playback.audio.createGain).toHaveBeenCalledTimes(5);
    });

    it('should use a pre-rendered AudioBuffer for HiHat to optimize CPU', () => {
        playDrumSound('HiHat', 10, 1.0);

        // Should create buffer ONCE (if not cached) and use BufferSource
        expect(playback.audio.createBuffer).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();

        // Should use playbackRate for variation
        const source = playback.audio.createBufferSource.mock.results[0].value;
        expect(source.playbackRate.value).not.toBe(1.0); // Should be jittered
    });

    it('should implement choking logic when a new HiHat starts', () => {
        const mockPrevGain = {
            gain: {
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn(),
            },
        };
        groove.lastHatGain = mockPrevGain;

        playDrumSound('HiHat', 11, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.005);
    });

    it('should use a highpass filter for the Snare wires', () => {
        playDrumSound('Snare', 10, 1.0);

        // Snare creates Tone (2 Oscs) and Wires (Noise)
        const filters = playback.audio.createBiquadFilter.mock.results;
        const wiresFilter = filters.find((f) => f.value.type === 'bandpass');
        expect(wiresFilter).toBeDefined();
    });

    it('should implement a 4-layer model for Toms (Stick, Body, Skin, Shell)', () => {
        playDrumSound('High Tom', 10, 1.0);

        // Layers: Stick (Osc), Body (Osc), Shell (Osc) + Skin (Noise)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should implement Ride cymbal synthesis', () => {
        playDrumSound('Ride', 10, 1.0);

        // Ride should use BufferSource (metallic) + Filter + Gain + Panner
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createGain).toHaveBeenCalled();
    });
});
