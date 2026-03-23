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
                },
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
            })),
            createGain: vi.fn(() => ({
                gain: {
                    value: 1,
                    setValueAtTime: vi.fn(),
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
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn(),
                onended: null,
            })),
        },
        bassGain: { connect: vi.fn() },
    };
    const mockBass = { lastBassGain: null };
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
    createSoftClipCurve: vi.fn(() => new Float32Array(1024)),
}));

import { playBassNote } from '../../../public/engine/synth-bass.js';
import { getState } from '../../../public/state.js';

const { playback, bass } = getState();

describe('Motown P-Bass Synthesis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        bass.lastBassGain = null;
        playback.audio.currentTime = 10;
    });

    it('should create and connect correct nodes for a Motown standard note', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        // Verify oscillators: Sine, Triangle, Growl(Sawtooth)
        expect(playback.audio.createOscillator).toHaveBeenCalledTimes(3);
        // Impact is now a buffer source (noise)
        expect(playback.audio.createBufferSource).toHaveBeenCalledTimes(1);
        expect(playback.audio.createWaveShaper).toHaveBeenCalled(); // Saturator
        // Filters: lp1, lp2, impactFilter, bodyEQ
        expect(playback.audio.createBiquadFilter).toHaveBeenCalledTimes(4);
    });

    it('should apply vintage roll-off via cascaded low-pass filters', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const filters = playback.audio.createBiquadFilter.mock.results;
        const lp1 = filters[0].value;
        const lp2 = filters[1].value;

        // We set types internally in playBassNote
        // Testing that they were both called to set frequency
        expect(lp1.frequency.setValueAtTime).toHaveBeenCalled();
        expect(lp2.frequency.setValueAtTime).toHaveBeenCalled();
    });

    it('should implement a woody finger thud via band-pass noise', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const filters = playback.audio.createBiquadFilter.mock.results;
        const impactFilter = filters[2].value;

        // Impact filter is the 3rd filter (index 2)
        expect(impactFilter.frequency.setValueAtTime).toHaveBeenCalledWith(600, 10);
    });

    it('should add a Jamerson punch via 120Hz body EQ', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.2);

        const filters = playback.audio.createBiquadFilter.mock.results;
        const bodyEQ = filters[3].value;

        // Body EQ is the 4th filter (index 3)
        expect(bodyEQ.frequency.setValueAtTime).toHaveBeenCalledWith(120, 10);
        expect(bodyEQ.gain.setValueAtTime).toHaveBeenCalledWith(4, 10);
    });

    it('should implement punchy Motown decay for non-muted notes', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0);

        const mockGains = playback.audio.createGain.mock.results;
        // Gains: mainGain (0), bodyMix (1), growlGain (2), impactGain (3 - inside playPercussiveStrike)
        const mainGain = mockGains[0].value;

        // Stage 1: Pluck Settle (50%)
        expect(mainGain.gain.setTargetAtTime).toHaveBeenCalledWith(
            expect.any(Number),
            10.015,
            0.06,
        );
        // Stage 2: Woody Ring (20%)
        expect(mainGain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 10.08, 0.6);
    });

    it('should apply muted characteristics when muted: true', () => {
        playBassNote(getState(), 41.2, 10, 1.0, 1.0, true);

        const lp1 = playback.audio.createBiquadFilter.mock.results[0].value;
        expect(lp1.frequency.setValueAtTime).toHaveBeenCalledWith(300, 10);

        const mainGain = playback.audio.createGain.mock.results[0].value;
        // Muted notes have short release (15ms)
        expect(mainGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.015, 0.01);
    });

    it('should use 5ms exponential ramp for monophonic cutoff', () => {
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
