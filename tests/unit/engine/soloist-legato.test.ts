import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playSoloNote } from '../../../core/engine/synth-soloist.js';
import { getState } from '../../../core/state.js';
import type { Mutable, SoloistState } from '../../../core/types.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock State
vi.mock('../../../core/state.js', () => {
    const mockAudioContext = {
        createGain: () => ({
            gain: {
                value: 0,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            connect: vi.fn(),
            disconnect: vi.fn(),
        }),
        createOscillator: () => ({
            frequency: {
                value: 440,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            // The reworked soloist voice (#649) ramps osc2.detune via
            // applyDetuneSettle, so detune needs linearRampToValueAtTime.
            detune: {
                value: 0,
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
                setTargetAtTime: vi.fn(),
                cancelScheduledValues: vi.fn(),
            },
            type: 'sine',
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null,
        }),
        createBiquadFilter: () => ({
            type: '',
            frequency: {
                value: 1000,
                setValueAtTime: vi.fn(),
                exponentialRampToValueAtTime: vi.fn(),
            },
            Q: { value: 1 },
            gain: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        }),
        createStereoPanner: () => ({
            pan: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn(),
        }),
        currentTime: 100,
    };

    const mockState = {
        playback: {
            audio: mockAudioContext,
            soloistGain: { gain: { value: 1 } },
            bandIntensity: 0.5,
        },
        soloist: makeSoloistMock({
            activeVoices: [],
            mode: 'monophonic',
            voice: 'synth',
            lastRenderedFreq: null, // New property
        }),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Soloist Legato Articulation', () => {
    // The mocked slice is plain, so the tests may write the read-only fields directly.
    const soloist = getState().soloist as Omit<Mutable<SoloistState>, 'audio'> & {
        audio: Mutable<SoloistState['audio']>;
    };

    /** The oscillator-shaped mock node in a voice: the one with a scheduled frequency. */
    function oscOf(voice: { nodes: unknown[] }) {
        const osc = voice.nodes.find(
            (n) => (n as { frequency?: { setValueAtTime?: unknown } }).frequency?.setValueAtTime,
        ) as unknown as {
            frequency: {
                setValueAtTime: ReturnType<typeof vi.fn>;
                exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
            };
        };
        expect(osc).toBeDefined();
        return osc;
    }

    beforeEach(() => {
        soloist.audio.activeVoices = [];
        soloist.audio.lastRenderedFreq = null;
        vi.clearAllMocks();
    });

    it('should track lastRenderedFreq across calls', () => {
        playSoloNote(getState(), 440, 100, 0.5, 0.5, 0, false);
        expect(soloist.audio.lastRenderedFreq).toBe(440);

        playSoloNote(getState(), 880, 101, 0.5, 0.5, 0, false);
        expect(soloist.audio.lastRenderedFreq).toBe(880);
    });

    it('should use portamento ramp when isLegato is true', () => {
        // First note to establish prevFreq
        playSoloNote(getState(), 440, 100, 0.5, 0.5, 0, false);

        // Legato note (Monophonic Mode)
        soloist.mode = 'monophonic';
        playSoloNote(getState(), 554, 100.5, 0.5, 0.5, 0, true);

        const voice = soloist.audio.activeVoices[0];
        const osc = oscOf(voice);

        // Should start at prevFreq (440)
        expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 100.5);

        // Monophonic mode now uses an 85ms portamento glide (epic-3-soloist S1).
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(554, 100.5 + 0.085);
    });

    it('should use 40ms glide for guitar mode', () => {
        soloist.mode = 'guitar';
        playSoloNote(getState(), 440, 100, 0.5, 0.5, 0, false);
        playSoloNote(getState(), 554, 100.5, 0.5, 0.5, 0, true);

        // In guitar mode, playTime 100.5 doesn't kill the first voice (100 + 0.5 + 1.0 > 100.5)
        // So the activeVoices will have 2 voices. The legato glide happens on the SECOND voice.
        const voice = soloist.audio.activeVoices[1];
        const osc = oscOf(voice);

        // Guitar mode keeps a quicker hammer-on glide of 40ms (epic-3-soloist S1).
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(554, 100.5 + 0.04);
    });

    it('should use a gentler attack for legato notes (trumpet)', () => {
        playSoloNote(getState(), 440, 100, 0.5, 0.5, 0, true);

        const voice = soloist.audio.activeVoices[0];
        const gain = voice.gain;

        // Legato attack swells in gently (epic-3-soloist S1) — 0.032 for trumpet,
        // slower than the staccato 0.02, so a connected note blends under the
        // prior release.
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 100, 0.032);
    });

    it('should use normal attack (0.02s) for non-legato trumpet', () => {
        playSoloNote(getState(), 440, 100, 0.5, 0.5, 0, false);

        const voice = soloist.audio.activeVoices[0];
        const gain = voice.gain;

        // Expect setTargetAtTime with timeConstant 0.02
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 100, 0.02);
    });
});
