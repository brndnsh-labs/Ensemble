/* eslint-disable */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Define OscillatorNode for instanceof checks
global.OscillatorNode = class OscillatorNode {
    constructor() {
        this.type = '';
        this.frequency = {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            value: 0
        };
        this.detune = { setValueAtTime: vi.fn() };
    }
    connect() {}
    start() {}
    stop() {}
};

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => new global.OscillatorNode()),
            createGain: vi.fn(() => ({
                gain: { 
                    value: 1, 
                    setValueAtTime: vi.fn(), 
                    exponentialRampToValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                    linearRampToValueAtTime: vi.fn()
                },
                connect: vi.fn()
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { 
                    value: 0, 
                    setValueAtTime: vi.fn(), 
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn()
                },
                Q: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn()
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn()
            }))
        },
        soloistGain: { connect: vi.fn() }
    };
    const mockSoloist = { 
        activeVoices: [],
        mode: 'monophonic'
    };
    const mockHarmony = { 
        activeVoices: []
    };

    const mockStateMap = {
        playback: mockPlayback,
        soloist: mockSoloist,
        harmony: mockHarmony
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        chords: {},
        bass: {},
        groove: {},
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn()
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    clampFreq: vi.fn((f) => Math.min(Math.max(0, f), 24000))
}));

import { playSoloNote } from '../../../public/engine/synth-soloist.js';
import { dispatch, getState, storage } from '../../../public/state.js';
const { arranger, playback, chords, bass, soloist, harmony, groove, vizState, midi } = getState();

describe('Soloist Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        soloist.activeVoices = [];
        soloist.mode = 'monophonic';
        soloist.preset = 'classic'; // Force classic for these tests
        playback.audio.currentTime = 10;
    });

    it('should enforce monophonic voice stealing by default', () => {
        playSoloNote(440, 10, 1.0);
        playSoloNote(880, 11, 1.0); // New note should kill previous

        // The first note's gain should have been told to ramp to 0
        const firstVoiceGain = soloist.activeVoices[0].gain.gain;
        // In the code, voices are shifted out of activeVoices.
        // We can check if the first created gain node was cancelled.
        const mockGains = playback.audio.createGain.mock.results;
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.01);
    });

    it('should allow two voices when mode is guitar', () => {
        soloist.mode = 'guitar';
        playSoloNote(440, 10, 1.0);
        playSoloNote(554, 10, 1.0); // Same time, double stop

        expect(soloist.activeVoices.length).toBe(2);
    });

    it('should apply pitch bends when bendStartInterval is provided', () => {
        playSoloNote(440, 10, 1.0, 0.4, 2); // 2 semitone bend

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(440, expect.any(Number));
    });

    it('should configure vibrato for the "blues" style', () => {
        playSoloNote(440, 10, 1.0, 0.4, 0, 'blues');

        // Vibrato is the 3rd oscillator created (osc1, osc2, vibrato)
        const vibratoOsc = playback.audio.createOscillator.mock.results[2].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];
        
        // Blues speed is 4.8 + random
        expect(vibSpeed).toBeGreaterThanOrEqual(4.8);
        expect(vibSpeed).toBeLessThanOrEqual(5.3);
    });

    it('should disable vibrato in piano mode', () => {
        soloist.mode = 'piano';
        playSoloNote(440, 10, 1.0, 0.4, 0, 'blues');

        // Should only create osc1 and osc2 (and maybe filter etc), but NO vibrato osc
        const oscs = playback.audio.createOscillator.mock.results.map(r => r.value);
        // Expect only 2 oscillators (sawtooth/triangle) + 0 for vibrato
        expect(oscs.length).toBe(2);
        expect(oscs[0].type).toBe('sawtooth');
        expect(oscs[1].type).toBe('triangle');
    });

    it('should use mixed sawtooth and triangle oscillators for rich tone', () => {
        playSoloNote(440, 10, 1.0);

        const osc1 = playback.audio.createOscillator.mock.results[0].value;
        const osc2 = playback.audio.createOscillator.mock.results[1].value;
        
        expect(osc1.type).toBe('sawtooth');
        expect(osc2.type).toBe('triangle');
    });

    it('should handle rapid note triggers (shredding) without exceeding voice limit', () => {
        soloist.mode = 'monophonic';
        // Trigger 10 notes very rapidly
        for(let i = 0; i < 10; i++) {
            playSoloNote(440 + i*10, 10 + (i * 0.05), 0.1);
        }

        // Only 1 voice should be active at the end since they are all new gestures
        expect(soloist.activeVoices.length).toBe(1);
        
        // Old voices should have been told to ramp down
        const mockGains = playback.audio.createGain.mock.results;
        // Each call creates ~2 gains (main + vibrato). Main is at 0, 2, 4...
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
        expect(mockGains[2].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.01);
    });
});
