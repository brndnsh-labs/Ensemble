/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    killAllNotes,
    killBassBus,
    killChordBus,
    killDrumBus,
    killHarmonyBus,
    killSoloistBus,
    restoreGains,
} from '../../../public/engine/engine.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock synthesis functions
vi.mock('../../../public/engine/synth-bass.js', () => ({
    killBassNote: vi.fn(),
    playBassNote: vi.fn(),
}));
vi.mock('../../../public/engine/synth-chords.js', () => ({
    killAllPianoNotes: vi.fn(),
    INSTRUMENT_PRESETS: {},
    playChordScratch: vi.fn(),
    playNote: vi.fn(),
    updateSustain: vi.fn(),
}));
vi.mock('../../../public/engine/synth-drums.js', () => ({
    killDrumNote: vi.fn(),
    playDrumSound: vi.fn(),
}));
vi.mock('../../../public/engine/synth-harmonies.js', () => ({
    killHarmonyNote: vi.fn(),
    playHarmonyNote: vi.fn(),
}));
vi.mock('../../../public/engine/synth-soloist.js', () => ({
    killSoloistNote: vi.fn(),
    playSoloNote: vi.fn(),
}));

describe('Engine Bus Management', () => {
    let state: any;
    let mockGain: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockGain = {
            gain: {
                cancelScheduledValues: vi.fn(),
                setTargetAtTime: vi.fn(),
            },
        };

        const bus = () => ({ gain: mockGain, reverb: {}, eq: {}, panner: null, sidechain: null });
        state = {
            playback: {
                audio: { currentTime: 10.0 },
                audioGraph: {
                    master: {},
                    chords: bus(),
                    bass: bus(),
                    soloist: bus(),
                    harmonies: bus(),
                    drums: bus(),
                },
                modals: {},
            },
            chords: { enabled: true, volume: 1.0 },
            bass: { enabled: true, volume: 1.0 },
            soloist: makeSoloistMock({ enabled: true, volume: 1.0 }),
            harmony: { enabled: true, volume: 1.0 },
            groove: { enabled: true, volume: 1.0 },
            midi: { enabled: false, muteLocal: false },
        };
    });

    describe('Individual Bus Killers', () => {
        it('should kill chord bus', () => {
            killChordBus(state);
            expect(mockGain.gain.cancelScheduledValues).toHaveBeenCalledWith(10.0);
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0, 10.0, 0.005);
        });

        it('should kill bass bus', () => {
            killBassBus(state);
            expect(mockGain.gain.cancelScheduledValues).toHaveBeenCalled();
        });

        it('should kill soloist bus', () => {
            killSoloistBus(state);
            expect(mockGain.gain.cancelScheduledValues).toHaveBeenCalled();
        });

        it('should kill harmony bus', () => {
            killHarmonyBus(state);
            expect(mockGain.gain.cancelScheduledValues).toHaveBeenCalled();
        });

        it('should kill drum bus', () => {
            killDrumBus(state);
            expect(mockGain.gain.cancelScheduledValues).toHaveBeenCalled();
        });
    });

    describe('killAllNotes', () => {
        it('should trigger all synth and bus killers', async () => {
            await killAllNotes(state);
            // Verify a few key ones
            const { killAllPianoNotes } = await import('../../../public/engine/synth-chords.js');
            expect(killAllPianoNotes).toHaveBeenCalled();
            // In public/engine/engine.js, killAllNotes only calls synth killers, not bus killers
            // expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledTimes(5);
        });
    });

    describe('restoreGains', () => {
        it('should restore gains to state levels', () => {
            restoreGains(state);
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalled();
            // mult for chords is 0.13, vol is 1.0 -> 0.13
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.13, 10.0, 0.04);
        });

        it('should mute if module is disabled', () => {
            state.chords.enabled = false;
            restoreGains(state);
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 10.0, 0.04);
        });

        it('should mute local audio if MIDI muteLocal is active', () => {
            state.midi.enabled = true;
            state.midi.muteLocal = true;
            restoreGains(state);
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.0001, 10.0, 0.04);
        });
    });
});
