// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unified mock for state.js to ensure internal synthesis logic sees consistent state
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                setPeriodicWave: vi.fn(),
                onended: null,
                type: '',
                frequency: {
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                },
                detune: { setValueAtTime: vi.fn() },
            })),
            createGain: vi.fn(() => ({
                connect: vi.fn(),
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn(),
                    exponentialRampToValueAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
            })),
            createBiquadFilter: vi.fn(() => ({
                connect: vi.fn(),
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
                Q: { setValueAtTime: vi.fn() },
                gain: { setValueAtTime: vi.fn() },
                type: 'lowpass',
            })),
            createPeriodicWave: vi.fn(() => ({})),
            createWaveShaper: vi.fn(() => ({ connect: vi.fn() })),
            createBufferSource: vi.fn(() => ({
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
                buffer: null,
            })),
        },
        bandIntensity: 0.5,
        sustainActive: true,
        // The reworked additive-body voice registers held notes only when
        // `playback.audioGraph.chords.gain` exists — without it playAdditiveBody
        // early-returns before touching heldNotes. Mirror the real graph shape.
        audioGraph: { chords: { gain: { connect: vi.fn() } } },
        heldNotes: new Set(),
        audioBuffers: { noise: {} },
    };
    const mockGroove = { audioBuffers: { noise: {} } };
    // voice: 'synth' — the only chord voice since #649; routes to the additive
    // synth path through the instrument-registry seam.
    const mockChords = { voice: 'synth' };

    const mockStateMap = {
        playback: mockPlayback,
        groove: mockGroove,
        chords: mockChords,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

import { playNote, updateSustain } from '../../../public/engine/synth-chords.js';
import { getState } from '../../../public/state.js';

const { playback } = getState();

describe('Voice Exhaustion & Stealing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        playback.audio.currentTime = 10.0;
        playback.sustainActive = true;
        if (!playback.heldNotes) {
            playback.heldNotes = new Set();
        }
        playback.heldNotes.clear();
    });

    it('should limit total active voices to 64 when sustain is active', () => {
        // Ensure theft logic triggers
        for (let i = 0; i < 70; i++) {
            playback.audio.currentTime = 10.0 + i * 0.1;
            playNote(getState(), 440, playback.audio.currentTime, 1.0, { instrument: 'Piano' });
        }

        // The Set should never exceed 64
        expect(playback.heldNotes.size).toBe(64);
    });

    it('should release all held voices when sustain pedal is lifted', () => {
        const gains = [];
        vi.mocked(playback.audio.createGain).mockImplementation(() => {
            const g = {
                connect: vi.fn(),
                gain: {
                    value: 0,
                    setValueAtTime: vi.fn(),
                    setTargetAtTime: vi.fn(),
                    cancelScheduledValues: vi.fn(),
                },
            };
            gains.push(g);
            return g;
        });

        // Schedule 10 held notes
        for (let i = 0; i < 10; i++) {
            playNote(getState(), 440, 10.0, 1.0);
        }

        // Lift pedal at time 11.0
        updateSustain(getState(), false, 11.0);

        // Released notes use 0.12 damping constant for long notes
        const releasedGains = gains.filter((g) =>
            g.gain.setTargetAtTime.mock.calls.some((call) => call[1] === 11.0 && call[2] === 0.12),
        );

        expect(releasedGains.length).toBe(10);
    });

    it('should not throw even under extreme rapid synthesis calls', () => {
        const stressTest = () => {
            for (let i = 0; i < 500; i++) {
                playNote(getState(), 220 + i, 10.0 + i, 0.1);
            }
        };
        expect(stressTest).not.toThrow();
    });
});
