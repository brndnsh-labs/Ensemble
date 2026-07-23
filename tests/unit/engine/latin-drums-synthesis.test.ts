// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

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
                loop: false,
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
        soloist: makeSoloistMock({}),
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock the audio-graph helpers (they moved to engine/synth-utils.js in #1176)
vi.mock('../../../public/engine/synth-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
}));

import { playDrumSound } from '../../../public/engine/synth-drums.js';
import { getState } from '../../../public/state.js';

const { playback, groove } = getState();

describe('Latin Drum Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
        groove.audioBuffers = { noise: {} };
    });

    it('should synthesize Clave using a single sine oscillator', () => {
        playDrumSound(getState(), 'Clave', 10, 1.0);
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(1);
        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('sine');
    });

    it('should synthesize Congas with both tone and noise components', () => {
        playDrumSound(getState(), 'CongaHigh', 10, 1.0);
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(1);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('should use a triangle wave for Conga Slaps for more harmonic content', () => {
        playDrumSound(getState(), 'CongaHighSlap', 10, 1.0);
        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('triangle');
    });

    it('should synthesize Agogo bells using a multi-oscillator stack', () => {
        playDrumSound(getState(), 'AgogoHigh', 10, 1.0);
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        const osc1 = playback.audio.createOscillator.mock.results[0].value;
        const osc2 = playback.audio.createOscillator.mock.results[1].value;
        const body = playback.audio.createOscillator.mock.results[2].value;
        expect(osc1.type).toBe('sine');
        expect(osc2.type).toBe('triangle');
        expect(body.type).toBe('sine');
    });

    it('should use pulsed noise for the Guiro scrape effect', () => {
        playDrumSound(getState(), 'Guiro', 10, 1.0);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        // The first Gain (results[0]) is the panner. The second (results[1]) is the effect gain.
        const gain = playback.audio.createGain.mock.results[1].value;
        // Should have multiple setTargetAtTime calls for the scrape pulses
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(8); // 4 pulses * 2 (up/down)
    });

    it('should synthesize Shaker using high-pass filtered noise', () => {
        playDrumSound(getState(), 'Shaker', 10, 1.0);
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();
        const filter = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(filter.type).toBe('highpass');
    });
});
