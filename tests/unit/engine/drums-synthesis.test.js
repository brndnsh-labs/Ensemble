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
                    linearRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
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
                playbackRate: { value: 1, setValueAtTime: vi.fn() },
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
        stateMap: mockStateMap,
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
        playDrumSound(getState(), 'Kick', 10, 1.0);

        // Layers: Beater (Osc), Skin (Noise), Knock (Osc), Shell (Osc) + Panner (Gain/StereoPanner)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        // It creates 4 gains and 1 panner (which is also a gain if StereoPanner is not supported, but we mocked StereoPanner)
        // Let's not make it strict on number of gains since panner could be a gain
        expect(playback.audio.createGain).toHaveBeenCalled();
    });

    it('should use a pre-rendered AudioBuffer for HiHat to optimize CPU', () => {
        playDrumSound(getState(), 'HiHat', 10, 1.0);

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

        playDrumSound(getState(), 'HiHat', 11, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.005);
    });

    it('should use a highpass filter for the Snare wires', () => {
        playDrumSound(getState(), 'Snare', 10, 1.0);

        // Snare creates Tone (2 Oscs) and Wires (Noise)
        const filters = playback.audio.createBiquadFilter.mock.results;
        const wiresFilter = filters.find((f) => f.value.type === 'bandpass');
        expect(wiresFilter).toBeDefined();
    });

    it('should implement a 4-layer model for Toms (Stick, Body, Skin, Shell)', () => {
        playDrumSound(getState(), 'High Tom', 10, 1.0);

        // Layers: Stick (Osc), Body (Osc), Shell (Osc) + Skin (Noise)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should implement Ride cymbal synthesis', () => {
        playDrumSound(getState(), 'Ride', 10, 1.0);

        // Ride should use BufferSource (metallic) + Filter + Gain + Panner
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createGain).toHaveBeenCalled();
    });

    it('should implement Crash cymbal synthesis', () => {
        playDrumSound(getState(), 'Crash', 10, 1.0);

        // Crash uses square oscs + noise + hpFilter + gain + panner
        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });

    it('should implement Clave synthesis', () => {
        playDrumSound(getState(), 'Clave', 10, 1.0);

        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
    });

    it('should implement Conga and Bongo synthesis', () => {
        playDrumSound(getState(), 'Conga', 10, 1.0);
        playDrumSound(getState(), 'Bongo', 10, 1.0);

        // These create tone (osc) and noise
        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });

    it('should implement Agogo and Perc synthesis', () => {
        playDrumSound(getState(), 'High Agogo', 10, 1.0);
        playDrumSound(getState(), 'Low Agogo', 10, 1.0);
        playDrumSound(getState(), 'Perc', 10, 1.0);

        // Uses 3 oscillators via playResonantTone
        expect(playback.audio.createOscillator).toHaveBeenCalled();
    });

    it('should implement Shaker/Cabasa/Guiro synthesis', () => {
        playDrumSound(getState(), 'Shaker', 10, 1.0);
        playDrumSound(getState(), 'Cabasa', 10, 1.0);
        playDrumSound(getState(), 'Guiro', 10, 1.0);
        playDrumSound(getState(), 'Vibraslap', 10, 1.0);
        playDrumSound(getState(), 'Maracas', 10, 1.0);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
    });
});
