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
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                detune: { setValueAtTime: vi.fn() },
                setPeriodicWave: vi.fn(),
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
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
                connect: vi.fn(),
            })),
            createBiquadFilter: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn() },
                gain: { setValueAtTime: vi.fn() },
                connect: vi.fn(),
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
            createPeriodicWave: vi.fn(() => ({})),
            createWaveShaper: vi.fn(() => ({
                connect: vi.fn(),
            })),
        },
        audioGraph: { chords: { gain: { connect: vi.fn() } } },
        bandIntensity: 0.5,
        sustainActive: false,
        heldNotes: new Set(),
    };
    const mockGroove = { audioBuffers: { noise: {} } };
    // voice: 'synth' — the reworked synth voice is the only chord voice since
    // #649 retired the Current/New A/B. `playNote` resolves this through the
    // instrument-registry seam → the (additive-body) synth path.
    const mockChords = { activeTab: 'smart', voice: 'synth' };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        chords: mockChords,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        arranger: {},
        bass: {},
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
}));

import {
    killAllPianoNotes,
    playChordScratch,
    playNote,
    updateSustain,
} from '../../../public/engine/synth-chords.js';
import { getState } from '../../../public/state.js';

const { playback } = getState();

describe('Chord Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
        playback.sustainActive = false;
        playback.heldNotes.clear();
    });

    it('should use a PeriodicWave for the "Piano" instrument', () => {
        // The reworked Piano voice no longer drives its body through a single
        // PeriodicWave oscillator. The PeriodicWave now lives in the velocity
        // "bright" layer (createBrightWave): at this velocity the bright layer
        // blooms in, so a PeriodicWave is created and applied to one of the
        // voice's oscillators (additive-body partials use plain sines).
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        expect(playback.audio.createPeriodicWave).toHaveBeenCalled();
        const oscsWithWave = playback.audio.createOscillator.mock.results.filter(
            (r) => r.value.setPeriodicWave.mock.calls.length > 0,
        );
        expect(oscsWithWave.length).toBe(1);
    });

    it('should apply a randomized strum offset based on index', () => {
        playNote(getState(), 440, 10, 1.0, { index: 2, instrument: 'Piano' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        const startTime = osc.frequency.setValueAtTime.mock.calls[0][1];

        // Base time is 10. Index 2 should add approx 0.01 - 0.03s
        expect(startTime).toBeGreaterThan(10.005);
        expect(startTime).toBeLessThan(10.05);
    });

    it('should create a hammer strike noise layer for Piano', () => {
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
    });

    it('should use a simple triangle wave for the "Warm" instrument', () => {
        playNote(getState(), 440, 10, 1.0, { instrument: 'Warm' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.type).toBe('triangle');
    });

    it('should implement chord scratch synthesis', () => {
        playChordScratch(getState(), 10, 0.5);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
        const filter = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(filter.type).toBe('bandpass');
    });

    it('should hold notes when sustain is active', () => {
        playback.sustainActive = true;
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        expect(playback.heldNotes.size).toBe(1);
    });

    it('should pop the oldest note when heldNotes exceeds 64 limit', () => {
        playback.sustainActive = true;
        for (let i = 0; i < 65; i++) {
            playNote(getState(), 440 + i, 10 + i * 0.1, 1.0, { instrument: 'Piano' });
        }
        expect(playback.heldNotes.size).toBe(64);
    });

    it('should release held notes when sustain is deactivated', () => {
        playback.sustainActive = true;
        for (let i = 0; i < 3; i++) {
            playNote(getState(), 440 + i, 10, 1.0, { instrument: 'Piano' });
        }

        expect(playback.heldNotes.size).toBe(3);

        updateSustain(getState(), false, 11);

        expect(playback.sustainActive).toBe(false);
        expect(playback.heldNotes.size).toBe(0);
        const releasedBodies = playback.audio.createGain.mock.results.filter(({ value: gain }) =>
            gain.gain.setTargetAtTime.mock.calls.some(
                ([target, time, damping]) => target === 0 && time === 11 && damping === 0.12,
            ),
        );
        expect(releasedBodies).toHaveLength(3);
    });

    it('should kill all piano notes immediately', () => {
        playback.sustainActive = true;
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        killAllPianoNotes(getState());

        expect(playback.sustainActive).toBe(false);
        expect(playback.heldNotes.size).toBe(0);
    });

    it('releases + clears tracked sampled chord voices on kill (#691)', () => {
        // Sampled chord voices live in `activeChordVoices` (not `heldNotes`);
        // killAllPianoNotes must release them too — previously they had no kill
        // path and rang out their full duration on stop/pause/voice-switch.
        const release = vi.fn();
        playback.activeChordVoices = [{ release }, { release }];
        playback.lastChordKey = 'C7';

        killAllPianoNotes(getState());

        expect(release).toHaveBeenCalledTimes(2);
        expect(playback.activeChordVoices).toHaveLength(0);
        expect(playback.lastChordKey).toBeNull();
    });

    // RETIRED (#649): the reworked Piano voice has no WaveShaper analog. The
    // legacy `current` voice ran its body through a per-note WaveShaper; the new
    // additive-body voice (playAdditiveBody) replaces the single-oscillator +
    // shaper body with per-partial sine synthesis and never creates a
    // WaveShaper. The intent ("non-muted Piano notes get the body voice; muted
    // notes take a stripped path") is now covered by the additive-body
    // partial-oscillator assertion below.
    it('should build a per-partial additive body on non-muted Piano notes', () => {
        // No WaveShaper in the reworked voice at all.
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });
        expect(playback.audio.createWaveShaper).not.toHaveBeenCalled();

        // The additive body builds several sine partial oscillators. Beyond the
        // pitched-click + bright layer (2 oscillators), the body adds its
        // partial bank — so a non-muted Piano note creates more oscillators than
        // those two onset layers alone.
        const sinePartials = playback.audio.createOscillator.mock.results.filter(
            (r) => r.value.type === 'sine',
        );
        expect(sinePartials.length).toBeGreaterThan(1);
    });

    // #707 B1 — the synth chord voice used to return null, so the scheduler's
    // chord-change release (#691) only ever cut sampled voices and a synth
    // voicing rang across the change. It now returns a release handle, exactly
    // like the sampled path, so the scheduler can track + cut it.
    describe('#707 B1 — synth chord voice release handle', () => {
        it('returns a handle with release() for the (no-pedal) synth Piano voice', () => {
            playback.sustainActive = false;
            const handle = playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });
            expect(handle).not.toBeNull();
            expect(typeof handle.release).toBe('function');
        });

        it('release() eases the body to silence and pulls in the oscillator stop', () => {
            playback.sustainActive = false;
            const handle = playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });
            const oscs = playback.audio.createOscillator.mock.results.map((r) => r.value);
            const gains = playback.audio.createGain.mock.results.map((r) => r.value);
            const stopsBefore = oscs.reduce((s, o) => s + o.stop.mock.calls.length, 0);
            const cancelsBefore = gains.reduce(
                (s, g) => s + g.gain.cancelScheduledValues.mock.calls.length,
                0,
            );

            // A chord change at t=11 releases the prior voicing.
            handle.release(11, 0.05);

            const stopsAfter = oscs.reduce((s, o) => s + o.stop.mock.calls.length, 0);
            const cancelsAfter = gains.reduce(
                (s, g) => s + g.gain.cancelScheduledValues.mock.calls.length,
                0,
            );
            // Release schedules an earlier stop on the partials and cancels the
            // pending body envelope before easing it to 0 — both observable here.
            expect(stopsAfter).toBeGreaterThan(stopsBefore);
            expect(cancelsAfter).toBeGreaterThan(cancelsBefore);
        });

        it('returns a release handle for the legacy Warm voice too', () => {
            playback.sustainActive = false;
            const handle = playNote(getState(), 440, 10, 1.0, { instrument: 'Warm' });
            expect(handle).not.toBeNull();
            expect(typeof handle.release).toBe('function');
        });
    });
});
