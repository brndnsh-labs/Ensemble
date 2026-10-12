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
        storage: {},
        dispatch: vi.fn(),
    };
});

// Mock the audio-graph helpers (they moved to engine/audio-graph-utils.js in #1176)
vi.mock('../../../public/engine/audio-graph-utils.js', async (importOriginal) => ({
    ...(await importOriginal<any>()),
    safeDisconnect: vi.fn(),
}));

import { playNote } from '../../../public/engine/synth-chords.js';
import { getState } from '../../../public/state.js';

const { playback } = getState();

describe('Chord Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10;
    });

    it('should use a PeriodicWave for the piano voice', () => {
        // The reworked Piano voice no longer drives its body through a single
        // PeriodicWave oscillator. The PeriodicWave now lives in the velocity
        // "bright" layer (createBrightWave): at this velocity the bright layer
        // blooms in, so a PeriodicWave is created and applied to one of the
        // voice's oscillators (additive-body partials use plain sines).
        playNote(getState(), 440, 10, 1.0);

        expect(playback.audio.createPeriodicWave).toHaveBeenCalled();
        const oscsWithWave = playback.audio.createOscillator.mock.results.filter(
            (r) => r.value.setPeriodicWave.mock.calls.length > 0,
        );
        expect(oscsWithWave.length).toBe(1);
    });

    it('should create a hammer strike noise layer for Piano', () => {
        playNote(getState(), 440, 10, 1.0);

        expect(playback.audio.createBufferSource).toHaveBeenCalled();
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
        playNote(getState(), 440, 10, 1.0);
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
});
