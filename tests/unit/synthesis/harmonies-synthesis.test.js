/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: 'sine',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    connect: vi.fn()
                },
                detune: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn()
                },
                Q: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createStereoPanner: vi.fn(() => ({
                pan: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createWaveShaper: vi.fn(() => ({
                curve: null,
                connect: vi.fn(),
            })),
        },
        harmoniesGain: { connect: vi.fn() },
        bandIntensity: 0.5,
    };
    const mockGroove = { genreFeel: 'Jazz' };
    const mockHarmony = { activeVoices: [] };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        getState: () => mockStateMap,
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
    safeDisconnect: vi.fn(),
    clampFreq: vi.fn((f) => f),
}));

import { playHarmonyNote, killHarmonyNote } from '../../../public/engine/synth-harmonies.js';
import { getState } from '../../../public/state.js';
import { safeDisconnect } from '../../../public/utils.js';

const { playback, harmony, groove } = getState();

describe('Harmony Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
        harmony.activeVoices = [];
        groove.genreFeel = 'Jazz';
        playback.bandIntensity = 0.5;
    });

    it('should play a basic harmony note', () => {
        playHarmonyNote(440, 10, 1.0);

        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createGain).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();

        // Should have 2 oscillators by default (osc1, osc2) + sub is used since 440 > 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);

        expect(harmony.activeVoices.length).toBe(1);
    });

    it('should use a sub-oscillator for frequencies above 250Hz', () => {
        playHarmonyNote(440, 10, 1.0); // 440 > 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3); // osc1, osc2, sub
    });

    it('should NOT use a sub-oscillator for frequencies below 250Hz', () => {
        playHarmonyNote(200, 10, 1.0); // 200 < 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(2); // osc1, osc2
    });

    describe('Style-specific synthesis', () => {
        it('should configure oscillators for "organ" style', () => {
            playHarmonyNote(440, 10, 1.0, 0.4, 'organ');

            // osc1, osc2, sub, lfo, tremoloLfo, fifthOsc, click
            expect(playback.audio.createOscillator).toHaveBeenCalledTimes(7);
            expect(playback.audio.createWaveShaper).toHaveBeenCalled();
        });

        it('should use sawtooth for "Rock" feel', () => {
            groove.genreFeel = 'Rock';
            playHarmonyNote(440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.type).toBe('sawtooth');
        });

        it('should use triangle for "Neo-Soul" feel', () => {
            groove.genreFeel = 'Neo-Soul';
            playHarmonyNote(440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.type).toBe('triangle');
        });
    });

    describe('Voice Management', () => {
        it('should filter out expired voices', () => {
            harmony.activeVoices = [
                { time: 5, duration: 1, midi: 60, gain: { gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } } }
            ];
            playback.audio.currentTime = 10;

            playHarmonyNote(440, 10, 1.0);

            // The old voice (time 5 + duration 1 + 0.1 = 6.1 < 10) should be filtered out
            expect(harmony.activeVoices.length).toBe(1);
            expect(harmony.activeVoices[0].midi).toBeNull();
        });

        it('should steal the same MIDI note if already playing', () => {
            const cancelSpy = vi.fn();
            const setTargetSpy = vi.fn();
            harmony.activeVoices = [
                {
                    time: 9,
                    duration: 2,
                    midi: 60,
                    gain: { gain: { cancelScheduledValues: cancelSpy, setTargetAtTime: setTargetSpy } }
                }
            ];

            playHarmonyNote(440, 10, 1.0, 0.4, 'stabs', 60);

            expect(cancelSpy).toHaveBeenCalledWith(10);
            expect(setTargetSpy).toHaveBeenCalledWith(0, 10, 0.005);
            expect(harmony.activeVoices.length).toBe(1);
        });

        it('should enforce polyphonic limit of 3', () => {
            const cancelSpy = vi.fn();
            const setTargetSpy = vi.fn();
            harmony.activeVoices = [
                { time: 9.7, duration: 1, midi: 60, gain: { gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } } },
                { time: 9.8, duration: 1, midi: 62, gain: { gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } } },
                { time: 9.9, duration: 1, midi: 64, gain: { gain: { cancelScheduledValues: cancelSpy, setTargetAtTime: setTargetSpy } } }
            ];

            playHarmonyNote(440, 10, 1.0);

            expect(harmony.activeVoices.length).toBe(3);
        });
    });

    describe('Articulations', () => {
        it('should apply stereo panning based on intensity', () => {
            playback.bandIntensity = 0.8;
            playHarmonyNote(440, 10, 1.0);

            expect(playback.audio.createStereoPanner).toHaveBeenCalled();
        });

        it('should apply vibrato if configured', () => {
            playHarmonyNote(440, 10, 1.0, 0.4, 'stabs', null, 0, 0, { rate: 5, depth: 10 });

            expect(playback.audio.createOscillator).toHaveBeenCalledTimes(4);
        });

        it('should apply frequency slides', () => {
            playHarmonyNote(440, 10, 1.0, 0.4, 'stabs', null, 2, 0.1);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(440, 10.1);
        });
    });

    describe('killHarmonyNote', () => {
        it('should kill all active voices', () => {
            const cancelSpy = vi.fn();
            const setTargetSpy = vi.fn();
            harmony.activeVoices = [
                { gain: { gain: { cancelScheduledValues: cancelSpy, setTargetAtTime: setTargetSpy } } },
                { gain: { gain: { cancelScheduledValues: cancelSpy, setTargetAtTime: setTargetSpy } } }
            ];

            killHarmonyNote(0.1);

            expect(cancelSpy).toHaveBeenCalledTimes(2);
            expect(setTargetSpy).toHaveBeenCalledTimes(2);
            expect(harmony.activeVoices.length).toBe(0);
        });
    });

    describe('Cleanup', () => {
        it('should call safeDisconnect when oscillator ends', () => {
            playHarmonyNote(440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.onended).toBeTypeOf('function');

            osc1.onended();
            expect(safeDisconnect).toHaveBeenCalled();
        });
    });
});
