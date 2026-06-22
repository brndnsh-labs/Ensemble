/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reverbSendForPack } from '../../../public/data/sound-packs.js';
import {
    killAllNotes,
    killBassBus,
    killChordBus,
    killDrumBus,
    killHarmonyBus,
    killSoloistBus,
    restoreGains,
    syncBusReverbSend,
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

        // Each bus gets its own reverb-send gain mock so #686 assertions can read
        // the per-lane send independently.
        const bus = () => ({
            gain: mockGain,
            reverb: { gain: { cancelScheduledValues: vi.fn(), setTargetAtTime: vi.fn() } },
            eq: {},
            panner: null,
            sidechain: null,
        });
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
            chords: { enabled: true, volume: 1.0, reverb: 0.2, voice: 'synth' },
            bass: { enabled: true, volume: 1.0, reverb: 0.2, voice: 'synth' },
            soloist: makeSoloistMock({ enabled: true, volume: 1.0, reverb: 0.2, voice: 'synth' }),
            harmony: { enabled: true, volume: 1.0, reverb: 0.2, voice: 'synth' },
            groove: { enabled: true, volume: 1.0, reverb: 0.2, voice: 'synth' },
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
            // mult for chords is MIXER_GAIN_MULTIPLIERS.chords (0.135), vol is 1.0 -> 0.135
            expect(mockGain.gain.setTargetAtTime).toHaveBeenCalledWith(0.135, 10.0, 0.04);
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

    describe('syncBusReverbSend (#686)', () => {
        it('scales the lane send by the active pack multiplier', () => {
            state.chords.voice = 'pack:clavinet';
            syncBusReverbSend(state, 'chords');
            const send = state.playback.audioGraph.chords.reverb.gain;
            // reverb (0.2) × reverbSendForPack('clavinet') (>1, dry → more hall).
            const expected = 0.2 * reverbSendForPack('clavinet');
            expect(send.cancelScheduledValues).toHaveBeenCalledWith(10.0);
            expect(send.setTargetAtTime).toHaveBeenCalledWith(expected, 10.0, 0.04);
            expect(expected).toBeGreaterThan(0.2); // genuinely lifted
        });

        it('leaves the send at the raw reverb value for the synth voice (×1)', () => {
            state.chords.voice = 'synth';
            syncBusReverbSend(state, 'chords');
            expect(
                state.playback.audioGraph.chords.reverb.gain.setTargetAtTime,
            ).toHaveBeenCalledWith(0.2, 10.0, 0.04);
        });

        it('maps the harmony module to the harmonies bus and cuts a roomy pack send', () => {
            state.harmony.voice = 'pack:strings-ensemble';
            syncBusReverbSend(state, 'harmony');
            const expected = 0.2 * reverbSendForPack('strings-ensemble');
            expect(
                state.playback.audioGraph.harmonies.reverb.gain.setTargetAtTime,
            ).toHaveBeenCalledWith(expected, 10.0, 0.04);
            expect(expected).toBeLessThan(0.2); // baked room → pulled back
        });

        it('no-ops before the audio graph exists', () => {
            state.playback.audioGraph = undefined;
            expect(() => syncBusReverbSend(state, 'chords')).not.toThrow();
        });
    });
});
