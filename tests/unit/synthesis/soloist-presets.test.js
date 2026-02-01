/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockAudio = {
        sampleRate: 44100,
        currentTime: 10,
        createOscillator: vi.fn(() => ({
            type: '',
            frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), value: 0 },
            detune: { setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null
        })),
        createGain: vi.fn(() => ({
            gain: { value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn(), linearRampToValueAtTime: vi.fn() },
            connect: vi.fn()
        })),
        createBiquadFilter: vi.fn(() => ({
            type: '',
            frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            Q: { value: 0 },
            connect: vi.fn()
        })),
        createBufferSource: vi.fn(() => ({
            buffer: null,
            playbackRate: { value: 1, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null
        })),
        createDelay: vi.fn(() => ({
            delayTime: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn()
        })),
        createBuffer: vi.fn(() => ({
            getChannelData: vi.fn(() => new Float32Array(44100 * 4)),
            duration: 4
        })),
        createStereoPanner: vi.fn(() => ({
            pan: { setValueAtTime: vi.fn(), value: 0 },
            connect: vi.fn()
        }))
    };

    const mockPlayback = {
        audio: mockAudio,
        soloistGain: { connect: vi.fn() },
        bandIntensity: 0.5
    };

    // We mock soloist state and will mutate it in tests
    const mockSoloist = {
        activeVoices: [],
        doubleStops: false,
        preset: 'classic'
    };

    const mockStateMap = {
        playback: mockPlayback,
        soloist: mockSoloist,
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn()
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    clampFreq: vi.fn((f) => f)
}));

import { playSoloNote, killSoloistNote } from '../../../public/engine/synth-soloist.js';
import { getState } from '../../../public/state.js';

describe('Soloist Presets', () => {
    const { playback, soloist } = getState();

    beforeEach(() => {
        vi.clearAllMocks();
        soloist.activeVoices = [];
        soloist.preset = 'classic';
        soloist.doubleStops = false;
        playback.audio.currentTime = 10;
    });

    it('should play Classic preset (Osc + Filter)', () => {
        soloist.preset = 'classic';
        playSoloNote(440, 10, 1.0);

        // Classic uses 2 oscs (saw + tri) + 1 osc (vibrato) = 3 oscillators
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        expect(playback.audio.createBiquadFilter).toHaveBeenCalledTimes(1);
        expect(soloist.activeVoices.length).toBe(1);
    });

    it('should play Acoustic Hybrid (Noise Buffer + Delay)', () => {
        soloist.preset = 'acoustic';
        playSoloNote(440, 10, 1.0);

        // Noise source
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        // Delay line
        expect(playback.audio.createDelay).toHaveBeenCalledTimes(1);
        // Sine body
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(1);

        expect(soloist.activeVoices.length).toBe(1);
    });

    it('should play Granular Texture (Many BufferSources)', () => {
        soloist.preset = 'granular';
        playSoloNote(440, 10, 1.0);

        // With 1.0s duration and 0.04s interval, expect ~30 grains
        expect(playback.audio.createBufferSource.mock.calls.length).toBeGreaterThan(10);
        expect(soloist.activeVoices.length).toBe(1);
    });

    it('should play Neo-Juno (Dual Saw + 2 LFOs)', () => {
        soloist.preset = 'neo';
        playSoloNote(440, 10, 1.0);

        // 2 Oscs + 2 LFOs = 4 oscillators
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(4);
        expect(soloist.activeVoices.length).toBe(1);
    });

    it('should play Vowel Lead (Parallel Filters)', () => {
        soloist.preset = 'vowel';
        playSoloNote(440, 10, 1.0);

        // 1 Osc
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(1);
        // 3 Formant filters
        expect(playback.audio.createBiquadFilter).toHaveBeenCalledTimes(3);

        const filters = playback.audio.createBiquadFilter.mock.results.map(r => r.value);
        expect(filters[0].frequency.value).toBe(600);
        expect(filters[1].frequency.value).toBe(1000);
        expect(filters[2].frequency.value).toBe(2500);
    });

    it('should kill active voices properly', () => {
        soloist.preset = 'neo';
        playSoloNote(440, 10, 1.0);

        const voice = soloist.activeVoices[0];
        const gainNode = voice.gain;
        const oscillators = voice.nodes.filter(n => n.frequency); // Filter for things with frequency params

        killSoloistNote();

        expect(gainNode.gain.cancelScheduledValues).toHaveBeenCalled();
        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10, 0.01);

        oscillators.forEach(osc => {
             expect(osc.stop).toHaveBeenCalled();
        });

        expect(soloist.activeVoices.length).toBe(0);
    });

    it('should manage voice stealing with complex nodes', () => {
        soloist.preset = 'acoustic';
        playSoloNote(440, 10, 1.0);

        const firstVoice = soloist.activeVoices[0];

        // Play another note immediately (stealing the first)
        playSoloNote(880, 10.1, 1.0);

        expect(firstVoice.gain.gain.setTargetAtTime).toHaveBeenCalled();
        expect(firstVoice.nodes[0].stop).toHaveBeenCalled(); // Noise source stop
    });
});
