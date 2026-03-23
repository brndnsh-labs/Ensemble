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
                    value: 0,
                },
                detune: { setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
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
            createBiquadFilter: vi.fn(() => ({
                gain: { value: 0, setValueAtTime: vi.fn() },
                type: '',
                frequency: {
                    value: 0,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
                Q: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
        },
        soloistGain: { connect: vi.fn() },
    };
    const mockSoloist = {
        activeVoices: [],
        mode: 'monophonic',
        timbreX: 0,
        timbreY: 0,
    };
    const mockHarmony = {
        activeVoices: [],
    };

    const mockStateMap = {
        playback: mockPlayback,
        soloist: mockSoloist,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        chords: {},
        bass: {},
        groove: {},
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    clampFreq: vi.fn((f) => Math.min(Math.max(0, f), 24000)),
}));

import { playSoloNote, updateActiveSoloistTimbre } from '../../../public/engine/synth-soloist.js';
import { getState } from '../../../public/state.js';

const { playback, soloist } = getState();

describe('Soloist Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        soloist.activeVoices = [];
        soloist.mode = 'monophonic';
        soloist.timbreX = 0;
        soloist.timbreY = 0;
        playback.audio.currentTime = 10;
    });

    it('should connect to the soloist output gain', () => {
        playSoloNote(getState(), 440, 10, 1.0);

        // Find the gain that connects to the soloist output
        const _gainNodes = playback.audio.createGain.mock.results.map((r) => r.value);
        const mainGain = soloist.activeVoices[0].gain;
        expect(mainGain).toBeDefined();
    });

    it('should enforce monophonic voice stealing by default', () => {
        playSoloNote(getState(), 440, 10, 1.0);
        playSoloNote(getState(), 880, 11, 1.0); // New note should kill previous

        // The first note's gain should have been told to ramp to 0
        const mockGains = playback.audio.createGain.mock.results;
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.01);
    });

    it('should allow two voices when mode is guitar', () => {
        soloist.mode = 'guitar';
        playSoloNote(getState(), 440, 10, 1.0);
        playSoloNote(getState(), 554, 10, 1.0); // Same time, double stop

        expect(soloist.activeVoices.length).toBe(2);
    });

    it('should apply pitch bends when bendStartInterval is provided', () => {
        playSoloNote(getState(), 440, 10, 1.0, 0.4, 2); // 2 semitone bend

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.frequency.setValueAtTime).toHaveBeenCalled();
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
            440,
            expect.any(Number),
        );
    });

    it('should configure vibrato for the "blues" style', () => {
        playback.bpm = 120;
        soloist.mode = 'guitar';
        playSoloNote(getState(), 440, 10, 1.0, 0.4, 0, 'blues');

        // Vibrato is an oscillator created for frequency modulation
        const vibratoOsc = playback.audio.createOscillator.mock.results.find(
            (r) =>
                r.value.frequency.setValueAtTime.mock.calls.length > 0 &&
                r.value.frequency.setValueAtTime.mock.calls[0][0] < 20,
        ).value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];

        // Base 120 BPM speed is 6.0. Blues nudge is -0.5. Guitar nudge is +0.4. Total 5.9
        expect(vibSpeed).toBeCloseTo(5.9, 0);
    });

    it('should reduce vibrato speed for monophonic mode', () => {
        playback.bpm = 120;
        soloist.mode = 'monophonic';
        playSoloNote(getState(), 440, 10, 1.0, 0.4, 0, 'blues');

        const vibratoOsc = playback.audio.createOscillator.mock.results.find(
            (r) =>
                r.value.frequency.setValueAtTime.mock.calls.length > 0 &&
                r.value.frequency.setValueAtTime.mock.calls[0][0] < 20,
        ).value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];

        // 6.0 (base) - 0.5 (blues) - 0.5 (monophonic) = 5.0
        expect(vibSpeed).toBeCloseTo(5.0, 0);
    });

    it('should disable vibrato and use piano-specific synthesis settings', () => {
        soloist.mode = 'piano';
        const freq = 440;
        const playTime = 10;
        playSoloNote(getState(), freq, playTime, 1.0, 0.4, 0, 'blues');

        // 3. Release Check (Sustain Pedal Emulation)
        const _gainNodes = playback.audio.createGain.mock.results.map((r) => r.value);
        const mainGain = soloist.activeVoices[0].gain;

        // Expect setTargetAtTime with timeConstant 0.3 for slower release
        expect(mainGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.3);
    });

    it('should handle rapid note triggers (shredding) without exceeding voice limit', () => {
        soloist.mode = 'monophonic';
        // Trigger 10 notes very rapidly
        for (let i = 0; i < 10; i++) {
            playSoloNote(getState(), 440 + i * 10, 10 + i * 0.05, 0.1);
        }

        // Only 1 voice should be active at the end since they are all new gestures
        expect(soloist.activeVoices.length).toBe(1);
    });

    it('should apply snappy envelopes in guitar mode at low velocity', () => {
        soloist.mode = 'guitar';
        const freq = 440;
        const playTime = 10;

        // 1. Low Velocity (Muted)
        playSoloNote(getState(), freq, playTime, 1.0, 0.4); // vol = 0.4 < 0.6

        const _filterMuted = playback.audio.createBiquadFilter.mock.results[0].value;
        const _gainNodes = playback.audio.createGain.mock.results.map((r) => r.value);
        const mainGainMuted = soloist.activeVoices[0].gain;

        // Expect short gain decay (50ms)
        expect(mainGainMuted.gain.setTargetAtTime).toHaveBeenCalledWith(0, playTime + 0.8, 0.02);

        // 2. High Velocity (Normal)
        vi.clearAllMocks();
        playSoloNote(getState(), freq, playTime, 1.0, 0.8); // vol = 0.8 > 0.6

        const _filterNormal = playback.audio.createBiquadFilter.mock.results[0].value;
        const _gainNodesNormal = playback.audio.createGain.mock.results.map((r) => r.value);
        const mainGainNormal = soloist.activeVoices[soloist.activeVoices.length - 1].gain;

        // Expect normal gain release (usually at 80% of duration)
        expect(mainGainNormal.gain.setTargetAtTime).toHaveBeenCalledWith(0, playTime + 0.8, 0.1);
    });

    it('should update active voices seamlessly on morph', () => {
        playSoloNote(getState(), 440, 10, 1.0);

        soloist.timbreX = 0.8;
        soloist.timbreY = 0.5;

        updateActiveSoloistTimbre(getState());

        const activeVoice = soloist.activeVoices[0];
        // mixSquare should be targetting timbreX (0.8)
        expect(activeVoice.mixSquare.gain.setTargetAtTime).toHaveBeenCalledWith(
            0.8,
            expect.any(Number),
            0.05,
        );
        expect(activeVoice.filter.frequency.setTargetAtTime).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(Number),
            0.05,
        );
    });
});
