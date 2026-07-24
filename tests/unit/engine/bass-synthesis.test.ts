// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state and global modules.
//
// This suite tests the reworked ("New") synth bass voice — the only bass voice
// since #649 retired the Current/New A/B and deleted `playBassNoteCurrent`.
// `playBassNote` now always routes to `playBassNoteNew` in
// `public/engine/synth-bass.ts`. The mock node graph below mirrors exactly what
// that voice creates (3 oscillators, the saw + sub low-passes, the saturator
// wave-shaper, the body/saw/sub/drive/amp gains) plus the buffer-source +
// band-pass filter that `playPercussiveStrike` allocates for the impact click.
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
                onended: null,
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
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
                gain: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createWaveShaper: vi.fn(() => ({
                curve: null,
                oversample: '',
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                loop: false,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
        },
        // The reworked voice writes to `playback.audioGraph.bass.gain` — the
        // shared bass bus that `amp` and the impact strike connect into.
        audioGraph: { bass: { gain: { connect: vi.fn() } } },
    };
    const mockBass = { lastBassGain: null, voice: 'synth', style: 'rock' };
    const mockGroove = { audioBuffers: { noise: {} } };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        playback: mockPlayback,
        bass: mockBass,
        groove: mockGroove,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        chords: {},
        soloist: makeSoloistMock({}),
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock the audio-graph helpers (they moved to engine/audio-graph-utils.js in #1176)
vi.mock('../../../public/engine/audio-graph-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
    createSoftClipCurve: vi.fn(() => new Float32Array(1024)),
}));

import { playBassNote } from '../../../public/engine/synth-bass.js';
import { getState } from '../../../public/state.js';

const { playback, bass } = getState();

// All values asserted below are derived from `playBassNoteNew` in
// `public/engine/synth-bass.ts` for the given inputs (verified by hand). The
// canonical test note is open low E (41.2 Hz) at full velocity.
describe('Reworked Synth Bass Voice', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bass.lastBassGain = null;
        bass.voice = 'synth';
        bass.style = 'rock';
        playback.audio.currentTime = 10;
    });

    it('creates and connects the reworked voice node graph', () => {
        // Signature: (state, freq, time, duration, velocity, muteAmount, bend).
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        // Oscillators: sub sine, sawtooth grit, sub-octave sine.
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        // Filters: saw lowpass (lp), sub-octave lowpass (subLp), plus the
        // band-pass impact filter inside playPercussiveStrike.
        expect(playback.audio.createBiquadFilter).toHaveBeenCalledTimes(3);
        // Gains: sawGain, bodyMix, subGain, driveGain, amp, plus the impact
        // strike's own gain (6 total).
        expect(playback.audio.createGain).toHaveBeenCalledTimes(6);
        // The saturator wave-shaper colors the sine body.
        expect(playback.audio.createWaveShaper).toHaveBeenCalledTimes(1);
        // The finger-thud impact transient is a band-pass'd noise buffer source.
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
    });

    it('sets oscillator types: sine sub, sawtooth grit, sine sub-octave', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const oscs = playback.audio.createOscillator.mock.results.map((r) => r.value);
        expect(oscs[0].type).toBe('sine'); // sub (fundamental sine body)
        expect(oscs[1].type).toBe('sawtooth'); // grit layer
        expect(oscs[2].type).toBe('sine'); // sub-octave sine
    });

    it('opens the saw low-pass above its settled target then sweeps to it', () => {
        // Rebased from the retired "cascaded vintage roll-off" test. The
        // reworked voice has a single velocity-brightened saw lowpass with a
        // pluck-settle motion: it starts open (lpStart) and sweeps down to
        // lpTarget. For 41.2 Hz at full velocity (brightness 1, cutoffMult 1.5):
        // baseCutoff ≈ 953.97, lpTarget ≈ 1430.96, lpStart ≈ 2432.63.
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const lp = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(lp.type).toBe('lowpass');
        const startCall = lp.frequency.setValueAtTime.mock.calls[0];
        expect(startCall[0]).toBeCloseTo(2432.63, 1);
        expect(startCall[1]).toBe(10);
        const settleCall = lp.frequency.setTargetAtTime.mock.calls[0];
        expect(settleCall[0]).toBeCloseTo(1430.96, 1);
        expect(settleCall[1]).toBe(10);
        // lpStart sits above lpTarget — the filter mellows as the pluck decays.
        expect(startCall[0]).toBeGreaterThan(settleCall[0]);
    });

    it('low-passes the sub-octave layer to ~140 Hz so it stays pure sub', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const subLp = playback.audio.createBiquadFilter.mock.results[1].value;
        expect(subLp.type).toBe('lowpass');
        expect(subLp.frequency.setValueAtTime).toHaveBeenCalledWith(140, 10);
        expect(subLp.Q.setValueAtTime).toHaveBeenCalledWith(0.7, 10);
    });

    it('gates the sub-octave layer OFF for non-sub-bass styles', () => {
        // rock is not in SUB_BASS_STYLES, so subBlend = 0 and the sub-oct gain
        // is silent. (subGain is the 3rd gain created.)
        bass.style = 'rock';
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const subGain = playback.audio.createGain.mock.results[2].value;
        expect(subGain.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
    });

    it('opens the sub-octave layer for sub-bass styles on low notes', () => {
        // hiphop IS in SUB_BASS_STYLES; for freq ≤ 85 Hz subBlend = 1, so the
        // sub-oct gain is full strength: 0.34 * 1 = 0.34.
        bass.style = 'hiphop';
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const subGain = playback.audio.createGain.mock.results[2].value;
        expect(subGain.gain.setValueAtTime).toHaveBeenCalledWith(0.34, 10);
    });

    it('drives the sine body harder into the saturator on hard notes', () => {
        // The saturation pre-gain (driveGain, the 4th gain) is convex in
        // velocity: 1 + (brightness^2) * 1.6. At full velocity brightness = 1,
        // so driveGain = 2.6.
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const driveGain = playback.audio.createGain.mock.results[3].value;
        expect(driveGain.gain.setValueAtTime).toHaveBeenCalledWith(2.6, 10);
    });

    it('keeps soft notes near unity drive (clean, round sine body)', () => {
        // brightness = 0.3^1.6 ≈ 0.1474; driveGain = 1 + 0.1474^2 * 1.6 ≈ 1.0348.
        playBassNote(getState(), 41.2, 10, 1.0, 0.3);

        const driveGain = playback.audio.createGain.mock.results[3].value;
        const driveVal = driveGain.gain.setValueAtTime.mock.calls[0][0];
        expect(driveVal).toBeCloseTo(1.034, 2);
        expect(driveVal).toBeLessThan(1.1);
    });

    it('applies the saturator soft-clip curve to the body', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const shaper = playback.audio.createWaveShaper.mock.results[0].value;
        expect(shaper.curve).toBeInstanceOf(Float32Array);
        expect(shaper.oversample).toBe('4x');
    });

    it('shapes the amp envelope: attack ramp, decay to sustain, release', () => {
        // The amp gain is the 5th gain created. Envelope (vol = 1 at full vel):
        //   setValueAtTime(0, 10)            — start silent
        //   setTargetAtTime(vol, 10, 0.006)  — fast attack
        //   setTargetAtTime(vol*0.45, 10.04, 0.12) — decay to sustain
        //   setTargetAtTime(0, 10 + releaseTime, 0.08) — release (releaseTime=1)
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const amp = playback.audio.createGain.mock.results[4].value;
        expect(amp.gain.setValueAtTime).toHaveBeenCalledWith(0, 10);
        expect(amp.gain.setTargetAtTime).toHaveBeenCalledWith(1, 10, 0.006);
        expect(amp.gain.setTargetAtTime).toHaveBeenCalledWith(0.45, 10.04, 0.12);
        expect(amp.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.08);
    });

    it('shortens the release for muted notes', () => {
        // Fully muted (muteAmount = 1): vol = 0.15, releaseTime floors at 0.06,
        // so the release fires at startTime + 0.06 = 10.06.
        playBassNote(getState(), 41.2, 10, 1.0, 1.0, 1);

        const amp = playback.audio.createGain.mock.results[4].value;
        expect(amp.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.06, 0.08);
        // Muted notes also roll the saw lowpass down (baseCutoff halved): the
        // settled target is well below the open-note value (~715 vs ~1431 Hz).
        const lp = playback.audio.createBiquadFilter.mock.results[0].value;
        const settle = lp.frequency.setTargetAtTime.mock.calls[0][0];
        expect(settle).toBeCloseTo(715.48, 1);
    });

    it('emits a velocity-brightened band-pass finger-thud transient', () => {
        // The impact strike (the 3rd filter, inside playPercussiveStrike) is a
        // band-pass. For 41.2 Hz at full velocity impactFreq clamps to its 200 Hz
        // floor and impactQ = 1.2 + brightness*2.2 = 3.4.
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const impactFilter = playback.audio.createBiquadFilter.mock.results[2].value;
        expect(impactFilter.type).toBe('bandpass');
        expect(impactFilter.frequency.setValueAtTime).toHaveBeenCalledWith(200, 10);
        const qCall = impactFilter.Q.setValueAtTime.mock.calls[0];
        expect(qCall[0]).toBeCloseTo(3.4, 5);
        expect(qCall[1]).toBe(10);
    });

    it('ramps the previous note down for monophonic note-off (5ms)', () => {
        // Rebased from "5ms exponential ramp for monophonic cutoff": the
        // reworked voice rampGain()s the prior note's amp to 0 over 5ms, which
        // cancels scheduled values then setTargetAtTime(0, startTime, 0.005).
        const mockPrevGain = {
            gain: {
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn(),
            },
        };
        bass.lastBassGain = mockPrevGain;

        playBassNote(getState(), 41.2, 11, 1.0, 1.0);

        expect(mockPrevGain.gain.cancelScheduledValues).toHaveBeenCalledWith(11);
        expect(mockPrevGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 11, 0.005);
    });
});

// RETIRED (asserted the deleted `current` voice's DSP, with no analog in the
// reworked voice):
//   - "woody finger thud via band-pass noise" at a current-voice-specific
//     freq/order — replaced by the reworked impact-transient test above.
//   - "Jamerson punch via 120Hz body EQ" — the reworked voice has no dedicated
//     120 Hz body-EQ peaking filter.
//   - "punchy Motown decay" two-stage timings (0.06 / 0.6 time-constants) —
//     the reworked amp envelope uses different decay/sustain math (covered by
//     the envelope test above).
