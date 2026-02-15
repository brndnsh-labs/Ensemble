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
        soloist.mode = 'guitar';
        playSoloNote(440, 10, 1.0, 0.4, 0, 'blues');

        // Vibrato is the 3rd oscillator created (osc1, osc2, vibrato)
        const vibratoOsc = playback.audio.createOscillator.mock.results[2].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];
        
        // Blues speed (baseline) is 4.8
        expect(vibSpeed).toBeGreaterThanOrEqual(4.8);
    });

    it('should reduce vibrato speed for monophonic mode', () => {
        soloist.mode = 'monophonic';
        playSoloNote(440, 10, 1.0, 0.4, 0, 'blues');

        const vibratoOsc = playback.audio.createOscillator.mock.results[2].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];
        
        // Monophonic reduces speed by 0.5 (4.8 -> 4.3)
        expect(vibSpeed).toBeLessThan(4.5);
        expect(vibSpeed).toBeGreaterThanOrEqual(4.0);
    });

    it('should disable vibrato and use piano-specific synthesis settings', () => {
        soloist.mode = 'piano';
        const freq = 440;
        const playTime = 10;
        playSoloNote(freq, playTime, 1.0, 0.4, 0, 'blues'); // low velocity

        // 1. Vibrato Check
        const oscs = playback.audio.createOscillator.mock.results.map(r => r.value);
        expect(oscs.length).toBe(2); // No vibrato osc

        // 2. Filter Q Check
        const filter = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(filter.Q.value).toBe(0.7);

        // 3. Release Check (Sustain Pedal Emulation)
        const gainNode = playback.audio.createGain.mock.results[0].value;
        // Expect setTargetAtTime with timeConstant 0.2 for slower release
        expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.2);
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

    it('should apply snappy palm-mute envelopes in guitar mode at low velocity', () => {
        soloist.mode = 'guitar';
        const freq = 440;
        const playTime = 10;
        
        // 1. Low Velocity (Muted)
        playSoloNote(freq, playTime, 1.0, 0.4); // vol = 0.4 < 0.6
        
        const filterMuted = playback.audio.createBiquadFilter.mock.results[0].value;
        const gainMuted = playback.audio.createGain.mock.results[0].value;
        
        // Expect snappy filter decay (80ms)
        expect(filterMuted.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(freq * 1.5, playTime + 0.08);
        expect(filterMuted.Q.value).toBe(4);
        
        // Expect short gain decay (50ms)
        expect(gainMuted.gain.setTargetAtTime).toHaveBeenCalledWith(0, playTime + 0.05, 0.02);

        // 2. High Velocity (Normal)
        vi.clearAllMocks();
        playSoloNote(freq, playTime, 1.0, 0.8); // vol = 0.8 > 0.6
        
        const filterNormal = playback.audio.createBiquadFilter.mock.results[0].value;
        const gainNormal = playback.audio.createGain.mock.results[0].value;
        
        // Expect normal filter decay (over full duration)
        expect(filterNormal.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(expect.any(Number), playTime + 1.0);
        // Expect normal gain release (usually at 80% of duration)
        expect(gainNormal.gain.setTargetAtTime).toHaveBeenCalledWith(0, playTime + 0.8, 0.1);
    });
});
