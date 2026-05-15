// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock state and global modules
vi.mock('../../../public/state.js', () => {
    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: vi.fn(() => ({
                type: '',
                frequency: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
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
        chordsGain: { connect: vi.fn() },
        sustainActive: false,
        heldNotes: new Set(),
    };
    const mockGroove = { audioBuffers: { noise: {} } };
    const mockChords = { activeTab: 'smart' };
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
        soloist: {},
        vizState: {},
        storage: {},
        midi: {},
        dispatch: vi.fn(),
    };
});

// Mock utils
vi.mock('../../../public/utils.js', () => ({
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
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        const osc = playback.audio.createOscillator.mock.results[0].value;
        expect(osc.setPeriodicWave).toHaveBeenCalled();
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
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        expect(playback.heldNotes.size).toBe(1);

        updateSustain(getState(), false, 11);

        expect(playback.sustainActive).toBe(false);
        expect(playback.heldNotes.size).toBe(0);
    });

    it('should kill all piano notes immediately', () => {
        playback.sustainActive = true;
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });

        killAllPianoNotes(getState());

        expect(playback.sustainActive).toBe(false);
        expect(playback.heldNotes.size).toBe(0);
    });

    it('should always apply wave shaping on non-muted notes', () => {
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });
        expect(playback.audio.createWaveShaper).toHaveBeenCalledTimes(1);

        playback.bandIntensity = 0.9;
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano' });
        expect(playback.audio.createWaveShaper).toHaveBeenCalledTimes(2);

        // Muted notes skip the shaper
        playNote(getState(), 440, 10, 1.0, { instrument: 'Piano', muted: true });
        expect(playback.audio.createWaveShaper).toHaveBeenCalledTimes(2);
    });
});
