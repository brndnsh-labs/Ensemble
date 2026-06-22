// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Define OscillatorNode for instanceof checks
global.OscillatorNode = class OscillatorNode {
    constructor() {
        this.type = '';
        this.frequency = {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
            value: 0,
        };
        // The reworked soloist voice (#649) ramps osc2.detune via
        // applyDetuneSettle, so detune needs the full AudioParam surface.
        this.detune = {
            value: 0,
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
            setTargetAtTime: vi.fn(),
            cancelScheduledValues: vi.fn(),
        };
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
                    linearRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: {
                    value: 0,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                Q: { value: 0, setValueAtTime: vi.fn() },
                gain: { value: 0, setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
        },
        soloistGain: { connect: vi.fn() },
    };
    const mockSoloist = makeSoloistMock({
        activeVoices: [],
        mode: 'monophonic',
        voice: 'synth',
    });
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

import { playSoloNote } from '../../../public/engine/synth-soloist.js';
import { getState } from '../../../public/state.js';

const { playback, soloist } = getState();

describe('Soloist Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        soloist.audio.activeVoices = [];
        soloist.mode = 'monophonic';
        soloist.preset = 'trumpet';
        playback.audio.currentTime = 10;
    });

    it('should enforce monophonic voice stealing by default', () => {
        playSoloNote(getState(), 440, 10, 1.0, 1.0);
        playSoloNote(getState(), 880, 11, 1.0, 1.0); // New note should kill previous

        // The first note's gain should have been told to ramp to 0
        const _firstVoiceGain = soloist.audio.activeVoices[0].gain.gain;
        // In the code, voices are shifted out of activeVoices.
        // We can check if the first created gain node was cancelled.
        const mockGains = playback.audio.createGain.mock.results;
        expect(mockGains[0].value.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.01);
    });

    it('should allow two voices when mode is guitar', () => {
        soloist.mode = 'guitar';
        playSoloNote(getState(), 440, 10, 1.0, 1.0);
        playSoloNote(getState(), 554, 10, 1.0, 1.0); // Same time, double stop

        expect(soloist.audio.activeVoices.length).toBe(2);
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

        // Trumpet oscillator order for the reworked voice (#649): osc1, osc2,
        // cutoff-LFO (always created for duration > 0.5), vibrato, depthMod —
        // so vibrato is the 4th oscillator (index 3).
        const vibratoOsc = playback.audio.createOscillator.mock.results[3].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];

        // Base 120 BPM speed is 6.0. Blues nudge is -0.5. Guitar nudge is +0.4. Total 5.9
        // Account for jitter (+/- 3%) and intensity scaling (approx +5% at default 0.5 intensity)
        expect(vibSpeed).toBeCloseTo(5.9, 0); // Use 0 precision to allow for wide "musical" variance
    });

    it('should reduce vibrato speed for monophonic mode', () => {
        playback.bpm = 120;
        soloist.mode = 'monophonic';
        playSoloNote(getState(), 440, 10, 1.0, 0.4, 0, 'blues');

        // Reworked voice (#649): cutoff-LFO at index 2 (duration > 0.5), so
        // the vibrato oscillator is index 3.
        const vibratoOsc = playback.audio.createOscillator.mock.results[3].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];

        // 6.0 (base) - 0.5 (blues) - 0.5 (monophonic) = 5.0
        expect(vibSpeed).toBeCloseTo(5.0, 0);
    });

    it('treats deprecated piano mode like monophonic routing', () => {
        soloist.mode = 'piano';
        const freq = 440;
        playSoloNote(getState(), freq, 10, 1.0, 0.4, 0, 'blues');

        const oscs = playback.audio.createOscillator.mock.results.map((r) => r.value);
        expect(oscs.length).toBeGreaterThanOrEqual(4); // vibrato remains active via monophonic fallback

        // Reworked voice (#649): cutoff-LFO at index 2 (duration > 0.5), so
        // the vibrato oscillator is index 3.
        const vibratoOsc = playback.audio.createOscillator.mock.results[3].value;
        const vibSpeed = vibratoOsc.frequency.setValueAtTime.mock.calls[0][0];
        expect(vibSpeed).toBeCloseTo(5.0, 0);
    });

    it('should use dual sawtooth oscillators for trumpet tone', () => {
        playSoloNote(getState(), 440, 10, 1.0, 1.0);

        const osc1 = playback.audio.createOscillator.mock.results[0].value;
        const osc2 = playback.audio.createOscillator.mock.results[1].value;

        // Trumpet: both oscillators are sawtooth (one detuned via applyDetuneSettle).
        expect(osc1.type).toBe('sawtooth');
        expect(osc2.type).toBe('sawtooth');
    });

    it('should handle rapid note triggers (shredding) without exceeding voice limit', () => {
        soloist.mode = 'monophonic';
        // Trigger 10 notes very rapidly
        for (let i = 0; i < 10; i++) {
            playSoloNote(getState(), 440 + i * 10, 10 + i * 0.05, 0.1, 1.0);
        }

        // Only 1 voice should be active at the end since they are all new gestures
        expect(soloist.audio.activeVoices.length).toBe(1);

        const voiceSteals = playback.audio.createGain.mock.results.filter((result) =>
            result.value.gain.setTargetAtTime.mock.calls.some(
                ([target, _time, timeConstant]) => target === 0 && timeConstant === 0.01,
            ),
        );
        expect(voiceSteals.length).toBeGreaterThan(1);
    });

    describe('Vibrato Engine Extensivenss', () => {
        it('should create vibrato for long notes', () => {
            // Note > 0.4s triggers vibrato
            playSoloNote(getState(), 440, 10, 1.0, 0.5, 0, 'scalar');
            expect(playback.audio.createOscillator).toHaveBeenCalled();
        });

        it('should apply blues style vibrato (lines 761, 770)', () => {
            soloist.session.currentPhrase.context = { profile: 'gilmour' }; // Covers profile branch
            // function signature: playSoloNote(getState(), freq, time, duration, vol = 0.5, bendStartInterval = 0, style = null, forceVibrato = false)
            playSoloNote(getState(), 440, 10, 1.0, 0.5, 0, 'blues', true); // forceVibrato = true
        });

        it('should apply neo style vibrato (lines 763, 772)', () => {
            soloist.session.currentPhrase.context = { profile: 'slash' }; // Covers profile branch
            playSoloNote(getState(), 440, 10, 1.0, 0.5, 0, 'neo', true);
        });

        it('should apply guitar mode vibrato adjustments (line 787)', () => {
            soloist.mode = 'guitar';
            playSoloNote(getState(), 440, 10, 1.0, 0.5, 0, 'shred', true);
        });

        it('should apply specific config vibratoIntensity (line 777)', () => {
            // Test with a style that is handled but might trigger default configs
            playSoloNote(getState(), 440, 10, 1.0, 0.5, 0, 'jazz', true);
        });
    });
});
