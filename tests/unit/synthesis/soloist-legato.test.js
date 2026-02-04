import { describe, it, expect, vi, beforeEach } from 'vitest';
import { playSoloNote } from '../../../public/engine/synth-soloist.js';
import { getState } from '../../../public/state.js';

// Mock State
vi.mock('../../../public/state.js', () => {
    const mockAudioContext = {
        createGain: () => ({
            gain: { value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn()
        }),
        createOscillator: () => ({
            frequency: { value: 440, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
            detune: { value: 0, setValueAtTime: vi.fn(), cancelScheduledValues: vi.fn() },
            type: 'sine',
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            onended: null
        }),
        createBiquadFilter: () => ({
            frequency: { value: 1000, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
            Q: { value: 1 },
            connect: vi.fn(),
            disconnect: vi.fn()
        }),
        createStereoPanner: () => ({
            pan: { value: 0, setValueAtTime: vi.fn() },
            connect: vi.fn(),
            disconnect: vi.fn()
        }),
        currentTime: 100
    };

    const mockState = {
        playback: { 
            audio: mockAudioContext,
            soloistGain: { gain: { value: 1 } },
            bandIntensity: 0.5
        },
        soloist: { 
            activeVoices: [], 
            preset: 'neo', 
            doubleStops: false,
            lastRenderedFreq: null // New property
        }
    };
    return {
        getState: () => mockState
    };
});

describe('Soloist Legato Articulation', () => {
    const { soloist } = getState();

    beforeEach(() => {
        soloist.activeVoices = [];
        soloist.lastRenderedFreq = null;
        vi.clearAllMocks();
    });

    it('should track lastRenderedFreq across calls', () => {
        playSoloNote(440, 100, 0.5, 0.5, 0, 'scalar', false);
        expect(soloist.lastRenderedFreq).toBe(440);

        playSoloNote(880, 101, 0.5, 0.5, 0, 'scalar', false);
        expect(soloist.lastRenderedFreq).toBe(880);
    });

    it('should use portamento ramp when isLegato is true', () => {
        // First note to establish prevFreq
        playSoloNote(440, 100, 0.5, 0.5, 0, 'scalar', false);
        
        // Legato note
        playSoloNote(554, 100.5, 0.5, 0.5, 0, 'scalar', true);
        
        // Voice limit is 1, so the first note is gone. 
        // The active voice at index 0 is the NEW note.
        const voice = soloist.activeVoices[0];
        const osc = voice.nodes.find(n => n.frequency && n.frequency.setValueAtTime);
        
        // Should start at prevFreq (440)
        expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(440, 100.5);
        
        // Should ramp to new freq (554) over glide time (40ms)
        expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(554, 100.5 + 0.04);
    });

    it('should use fast attack (0.005s) for legato notes', () => {
        playSoloNote(440, 100, 0.5, 0.5, 0, 'scalar', true);
        
        const voice = soloist.activeVoices[0];
        const gain = voice.gain;

        // Expect setTargetAtTime with timeConstant 0.005
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 100, 0.005);
    });

    it('should use normal attack (0.02s) for non-legato Neo preset', () => {
        soloist.preset = 'neo';
        playSoloNote(440, 100, 0.5, 0.5, 0, 'scalar', false);
        
        const voice = soloist.activeVoices[0];
        const gain = voice.gain;

        // Expect setTargetAtTime with timeConstant 0.02
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(expect.any(Number), 100, 0.02);
    });
});
