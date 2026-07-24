// @ts-nocheck
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
                    connect: vi.fn(),
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
                    linearRampToValueAtTime: vi.fn(),
                },
                Q: { setValueAtTime: vi.fn() },
                // The synth harmony voice's formant "bell" is a peaking filter,
                // which drives a `gain` AudioParam.
                gain: { setValueAtTime: vi.fn() },
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
    const mockHarmony = { voice: 'synth', activeVoices: [] };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
    };
});

// Mock the audio-graph helpers (they moved to engine/audio-graph-utils.js in #1176)
vi.mock('../../../public/engine/audio-graph-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
    clampFreq: vi.fn((f) => f),
}));

import { safeDisconnect } from '../../../public/engine/audio-graph-utils.js';
import { killHarmonyNote, playHarmonyNote } from '../../../public/engine/synth-harmonies.js';
import { getState } from '../../../public/state.js';

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
        playHarmonyNote(getState(), 440, 10, 1.0);

        expect(playback.audio.createOscillator).toHaveBeenCalled();
        expect(playback.audio.createGain).toHaveBeenCalled();
        expect(playback.audio.createBiquadFilter).toHaveBeenCalled();

        // Should have 2 oscillators by default (osc1, osc2) + sub is used since 440 > 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);

        expect(harmony.activeVoices.length).toBe(1);
    });

    it('should use a sub-oscillator for frequencies above 250Hz', () => {
        playHarmonyNote(getState(), 440, 10, 1.0); // 440 > 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3); // osc1, osc2, sub
    });

    it('should NOT use a sub-oscillator for frequencies below 250Hz', () => {
        playHarmonyNote(getState(), 200, 10, 1.0); // 200 < 250
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(2); // osc1, osc2
    });

    describe('Style-specific synthesis', () => {
        it('should configure oscillators for "organ" style', () => {
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'organ');

            // osc1, osc2, sub, lfo, tremoloLfo, fifthOsc, click
            expect(playback.audio.createOscillator).toHaveBeenCalledTimes(7);
            expect(playback.audio.createWaveShaper).toHaveBeenCalled();
        });

        it('should use sawtooth for "Rock" feel', () => {
            groove.genreFeel = 'Rock';
            playHarmonyNote(getState(), 440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.type).toBe('sawtooth');
        });

        it('should use triangle for "Neo-Soul" feel', () => {
            groove.genreFeel = 'Neo-Soul';
            playHarmonyNote(getState(), 440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.type).toBe('triangle');
        });
    });

    describe('Voice Management', () => {
        it('should filter out expired voices', () => {
            harmony.activeVoices = [
                {
                    time: 5,
                    duration: 1,
                    midi: 60,
                    gain: { gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } },
                },
            ];
            playback.audio.currentTime = 10;

            playHarmonyNote(getState(), 440, 10, 1.0);

            // The old voice (time 5 + duration 1 + 0.1 = 6.1 < 10) should be filtered out
            expect(harmony.activeVoices.length).toBe(1);
            expect(harmony.activeVoices[0].midi).toBeNull();
        });

        // #601: same-MIDI retrigger now retires the prior voice with a
        // linear ramp to *true* zero (`killHarmonyVoice`), not the old
        // `killActiveVoices` exponential that hard-stops the nodes at ~3% gain
        // (the "suck" + click the #561 fingerpick exposed). The fade window is
        // the style's retrigger-profile `fadeTime`; the ramp lands at
        // `time + fadeTime`.
        const killVoiceMock = () => ({
            value: 0.4,
            cancelScheduledValues: vi.fn(),
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
        });

        it('should crossfade same-MIDI retriggers for sustained harmony styles', () => {
            const inner = killVoiceMock();
            harmony.activeVoices = [{ time: 9, duration: 2, midi: 60, gain: { gain: inner } }];

            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'strings', 60);

            // 'strings' (a sustained style) falls to the default retrigger
            // profile → 0.03 s fade. ('horns' now maps to the snappy 'stabs'
            // profile, asserted by the next test's 0.02 fade.)
            expect(inner.cancelScheduledValues).toHaveBeenCalledWith(10);
            expect(inner.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.03);
            expect(harmony.activeVoices.length).toBe(1);
        });

        it('should keep fast harmony retriggers musical without a hard 5ms choke', () => {
            const inner = killVoiceMock();
            harmony.activeVoices = [{ time: 9, duration: 2, midi: 60, gain: { gain: inner } }];

            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs', 60);

            // 'stabs' retrigger profile → 0.02 s fade.
            expect(inner.cancelScheduledValues).toHaveBeenCalledWith(10);
            expect(inner.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.02);
            expect(harmony.activeVoices.length).toBe(1);
        });

        it('should enforce polyphonic limit of 3', () => {
            const oldest = killVoiceMock();
            harmony.activeVoices = [
                { time: 9.7, duration: 1, midi: 60, gain: { gain: oldest } },
                { time: 9.8, duration: 1, midi: 62, gain: { gain: killVoiceMock() } },
                { time: 9.9, duration: 1, midi: 64, gain: { gain: killVoiceMock() } },
            ];

            playHarmonyNote(getState(), 440, 10, 1.0);

            expect(harmony.activeVoices.length).toBe(3);
            // The evicted oldest voice fades to true zero over HARMONY_VOICE_LIMIT_FADE (0.02).
            expect(oldest.cancelScheduledValues).toHaveBeenCalledWith(10);
            expect(oldest.linearRampToValueAtTime).toHaveBeenCalledWith(0, 10.02);
        });
    });

    describe('Articulations', () => {
        it('should apply stereo panning based on intensity', () => {
            playback.bandIntensity = 0.8;
            playHarmonyNote(getState(), 440, 10, 1.0);

            expect(playback.audio.createStereoPanner).toHaveBeenCalled();
        });

        it('should apply vibrato if configured', () => {
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs', null, 0, 0, {
                rate: 5,
                depth: 10,
            });

            expect(playback.audio.createOscillator).toHaveBeenCalledTimes(4);
        });

        it('should apply frequency slides', () => {
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs', null, 2, 0.1);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(440, 10.1);
        });
    });

    describe('killHarmonyNote', () => {
        it('should release all active voices click-free (#934)', () => {
            const cancelSpy = vi.fn();
            const setValueSpy = vi.fn();
            const rampSpy = vi.fn();
            const mkGain = () => ({
                gain: {
                    value: 0.5,
                    cancelScheduledValues: cancelSpy,
                    setValueAtTime: setValueSpy,
                    linearRampToValueAtTime: rampSpy,
                },
            });
            harmony.activeVoices = [
                { gain: mkGain(), nodes: [] },
                { gain: mkGain(), nodes: [] },
            ];

            killHarmonyNote(getState(), 0.1);

            expect(cancelSpy).toHaveBeenCalledTimes(2);
            // #934 — the blanket kill now delegates to the click-free per-voice
            // release: a linear ramp to EXACTLY 0, not the shared
            // `setTargetAtTime` (which stops at ~3% of level and clicks).
            expect(rampSpy).toHaveBeenCalledTimes(2);
            expect(rampSpy.mock.calls.every((c) => c[0] === 0)).toBe(true);
            expect(harmony.activeVoices.length).toBe(0);
        });
    });

    describe('Cleanup', () => {
        it('should call safeDisconnect when oscillator ends', () => {
            playHarmonyNote(getState(), 440, 10, 1.0);

            const osc1 = playback.audio.createOscillator.mock.results[0].value;
            expect(osc1.onended).toBeTypeOf('function');

            osc1.onended();
            expect(safeDisconnect).toHaveBeenCalled();
        });
    });

    // epic-harmony-polish S4 — gesture flags must produce a timbrally distinct
    // shape from a plain stab. These tests prove the synth side actually
    // consumes isBloom / isLatched. (#1100: the third gesture, isResponse,
    // was removed — its only trigger, coordination.soloistPhraseEnd, had no
    // production writer and was permanently dead.)
    describe('Gesture flags (S4)', () => {
        const ATTACK_TARGET_TIME = 'linearRampToValueAtTime';

        const getAttackTime = (gainGain: any, startTime: number): number => {
            // gain ramp call: linearRampToValueAtTime(finalVol, playTime + attack)
            const call = gainGain[ATTACK_TARGET_TIME].mock.calls.find(
                (c: any[]) => c[1] > startTime,
            );
            return call ? call[1] - startTime : 0;
        };

        const getReleaseTau = (gainGain: any): number => {
            // setTargetAtTime(0, startTime, releaseTau) — releaseTau is third arg
            const call = gainGain.setTargetAtTime.mock.calls[0];
            return call ? call[2] : 0;
        };

        it('bloom note has a longer attack than a plain stab', () => {
            // Plain stab
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs');
            const plainGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const plainAttack = getAttackTime(plainGain, 10);

            vi.clearAllMocks();
            harmony.activeVoices = [];

            // Bloom
            playHarmonyNote(
                getState(),
                440,
                10,
                1.0,
                0.4,
                'stabs',
                null,
                0,
                0,
                { rate: 0, depth: 0 },
                false, // isLegato
                true, // isBloom
                false, // isLatched
            );
            const bloomGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const bloomAttack = getAttackTime(bloomGain, 10);

            // Bloom should be ~20% longer attack
            expect(bloomAttack).toBeGreaterThan(plainAttack);
        });

        it('bloom note widens oscillator detune vs a plain stab', () => {
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs');
            const plainOsc1 = playback.audio.createOscillator.mock.results[0].value;
            const plainDetune = plainOsc1.detune.setValueAtTime.mock.calls[0][0];

            vi.clearAllMocks();
            harmony.activeVoices = [];

            playHarmonyNote(
                getState(),
                440,
                10,
                1.0,
                0.4,
                'stabs',
                null,
                0,
                0,
                { rate: 0, depth: 0 },
                false,
                true, // isBloom
                false,
            );
            const bloomOsc1 = playback.audio.createOscillator.mock.results[0].value;
            const bloomDetune = bloomOsc1.detune.setValueAtTime.mock.calls[0][0];

            // The plain detune range is ±2 (from (Math.random()-0.5)*4); bloom
            // adds an additional ±3 (from bloomDetune branch). Test the spread
            // is wider by running many samples — single-sample comparison
            // would be flaky.
            const samples = 40;
            const plain: number[] = [];
            const bloom: number[] = [];
            for (let i = 0; i < samples; i++) {
                vi.clearAllMocks();
                harmony.activeVoices = [];
                playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs');
                plain.push(
                    playback.audio.createOscillator.mock.results[0].value.detune.setValueAtTime.mock
                        .calls[0][0],
                );

                vi.clearAllMocks();
                harmony.activeVoices = [];
                playHarmonyNote(
                    getState(),
                    440,
                    10,
                    1.0,
                    0.4,
                    'stabs',
                    null,
                    0,
                    0,
                    { rate: 0, depth: 0 },
                    false,
                    true,
                    false,
                );
                bloom.push(
                    playback.audio.createOscillator.mock.results[0].value.detune.setValueAtTime.mock
                        .calls[0][0],
                );
            }
            const stddev = (xs: number[]): number => {
                const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
                return Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
            };
            // Bloom detune spread should be measurably wider than plain.
            expect(stddev(bloom)).toBeGreaterThan(stddev(plain));
            // Quiet the single-sample unused-locals warning.
            void plainDetune;
            void bloomDetune;
        });

        it('latched note has a longer release than a plain stab', () => {
            playHarmonyNote(getState(), 440, 10, 1.0, 0.4, 'stabs');
            const plainGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const plainRelease = getReleaseTau(plainGain);

            vi.clearAllMocks();
            harmony.activeVoices = [];

            playHarmonyNote(
                getState(),
                440,
                10,
                1.0,
                0.4,
                'stabs',
                null,
                0,
                0,
                { rate: 0, depth: 0 },
                false, // isLegato
                false, // isBloom
                true, // isLatched
            );
            const latchedGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const latchedRelease = getReleaseTau(latchedGain);

            // Latched release should be 1.6× the plain release. Here
            // duration=1 (well over the cap), plain release=0.1, so 0.1*1.6=0.16.
            expect(latchedRelease).toBeGreaterThan(plainRelease);
            expect(latchedRelease).toBeCloseTo(plainRelease * 1.6, 5);
        });

        // why: the engine typically emits latched hits with `durationSteps: 1`
        // (≈0.125 s at 120 BPM). The original `min(release*1.6, duration*0.5)`
        // cap shrank latched release BELOW the plain release at these
        // durations, inverting the gesture. This guards against re-introducing
        // a sub-plain-release cap.
        it('latched release never falls below plain at engine-realistic short durations', () => {
            const shortDuration = 0.125;

            playHarmonyNote(getState(), 440, 10, shortDuration, 0.4, 'stabs');
            const plainGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const plainRelease = getReleaseTau(plainGain);

            vi.clearAllMocks();
            harmony.activeVoices = [];

            playHarmonyNote(
                getState(),
                440,
                10,
                shortDuration,
                0.4,
                'stabs',
                null,
                0,
                0,
                { rate: 0, depth: 0 },
                false,
                false,
                true, // isLatched
            );
            const latchedGain =
                playback.audio.createGain.mock.results[
                    playback.audio.createGain.mock.results.length - 1
                ].value.gain;
            const latchedRelease = getReleaseTau(latchedGain);

            expect(latchedRelease).toBeGreaterThanOrEqual(plainRelease);
        });
    });
});
