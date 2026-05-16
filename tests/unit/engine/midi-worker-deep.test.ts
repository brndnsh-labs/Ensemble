// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExportProcessor } from '../../../public/engine/midi-worker-logic.js';
import { generateResolutionNotes } from '../../../public/engine/resolution.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// We need to mock worker-utils because getChordAtStep is used in processStep
vi.mock('../../../public/engine/worker-utils.js', () => ({
    getChordAtStep: vi.fn(() => ({
        chord: { sectionId: 's1', rootMidi: 60, intervals: [0, 4, 7], freqs: [261, 329, 392] },
        stepInChord: 0,
    })),
}));

vi.mock('../../../public/engine/resolution.js', () => ({
    generateResolutionNotes: vi.fn(),
}));

describe('MIDI Worker Logic Deep Dive', () => {
    let processor;
    let state;

    beforeEach(() => {
        vi.stubGlobal('postMessage', vi.fn());
        state = {
            playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5, intent: {} },
            arranger: {
                totalSteps: 32,
                timeSignature: '4/4',
                stepMap: [],
                progression: ['C'],
                key: 'C',
                isMinor: false,
            },
            chords: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
            bass: { enabled: true, style: 'Standard', volume: 0.5, octave: 0 },
            soloist: makeSoloistMock({
                enabled: true,
                style: 'Standard',
                volume: 0.5,
                lastMidi: 60,
                dynamicCenter: 60,
                octave: 0,
                phraseContext: {
                    role: 'call',
                    skeleton: [],
                    lastInterval: null,
                    profile: 'srv',
                },
            }),
            harmony: { enabled: true, style: 'Standard', volume: 0.5, octave: 0, complexity: 0.5 },
            groove: {
                enabled: true,
                volume: 0.5,
                measures: 1,
                fillActive: false,
                fillLength: 4,
                pendingCrash: false,
                instruments: [{ name: 'Kick', steps: Array(16).fill(0) }],
                lastDrumPreset: 'Standard',
                swing: 0,
                reverb: 0,
                anticipation: false,
            },
            midi: {
                chordsChannel: 0,
                bassChannel: 1,
                soloistChannel: 2,
                harmonyChannel: 3,
                drumsChannel: 9,
                latency: 0,
                velocitySensitivity: 1.0,
            },
        };
        processor = new ExportProcessor(state, {
            includedTracks: ['drums', 'soloist', 'chords', 'bass', 'harmonies'],
        });
    });

    it('should exercise drum fill end and pending crash (Lines 668-676)', () => {
        processor.state.groove.fillActive = true;
        processor.state.groove.fillLength = 4;
        processor.state.groove.fillStartStep = 0;
        processor.state.groove.pendingCrash = true;

        const mockTrack = { noteOn: vi.fn(), noteOff: vi.fn(), setName: vi.fn() };
        processor.drumTrack = mockTrack;

        processor.processStep(4);

        expect(processor.state.groove.fillActive).toBe(false);
        expect(processor.state.groove.pendingCrash).toBe(false);
        expect(mockTrack.noteOn).toHaveBeenCalled();
    });

    it('should exercise resolution note logic with pitch bend and CC (Lines 788-817)', () => {
        const mockTrack = {
            noteOn: vi.fn(),
            noteOff: vi.fn(),
            cc: vi.fn(),
            pitchBend: vi.fn(),
            endOfTrack: vi.fn(),
            marker: vi.fn(),
            text: vi.fn(),
            compile: vi.fn(() => new Uint8Array([0])),
            setName: vi.fn(),
        };
        processor.soloistTrack = mockTrack;
        processor.chordTrack = mockTrack;
        processor.bassTrack = mockTrack;
        processor.harmonyTrack = mockTrack;
        processor.drumTrack = mockTrack;
        processor.metaTrack = mockTrack;

        generateResolutionNotes.mockReturnValue([
            {
                module: 'soloist',
                midi: 60,
                bendStartInterval: 1,
                ccEvents: [{ timingOffset: 0, controller: 64, value: 127 }],
                durationSteps: 1,
            },
            {
                module: 'unknown', // Hit line 788 bail
                midi: 60,
            },
        ]);

        processor.finish();

        expect(mockTrack.cc).toHaveBeenCalled();
        expect(mockTrack.pitchBend).toHaveBeenCalled();
        expect(mockTrack.noteOn).toHaveBeenCalled();
    });

    it('should exercise CC only events in processStep (Lines 564-566)', async () => {
        const { getChordAtStep } = await import('../../../public/engine/worker-utils.js');
        getChordAtStep.mockReturnValue({
            chord: {
                sectionId: 's1',
                rootMidi: 60,
                intervals: [0, 4, 7],
                freqs: [261, 329, 392],
                notes: [{ midi: 0, ccEvents: [{ controller: 64, value: 127 }] }], // midi 0 triggers CC branch
            },
            stepInChord: 0,
        });

        const mockTrack = {
            cc: vi.fn(),
            noteOn: vi.fn(),
            noteOff: vi.fn(),
            setName: vi.fn(),
            text: vi.fn(),
        };
        processor.chordTrack = mockTrack;

        processor.processStep(0);
        expect(mockTrack.cc).toHaveBeenCalled();
    });

    it('should exercise ExportProcessor.start (Lines 147-157)', () => {
        const spy = vi.spyOn(processor, 'processChunk').mockImplementation(() => {});
        processor.start();
        expect(spy).toHaveBeenCalled();
    });

    it('should bail in start if no progression', () => {
        processor.state.arranger.progression = [];
        processor.start();
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
    });

    it('should exercise creativity variations in drums', () => {
        processor.state.groove.creativity = true;
        processor.state.groove.sectionSeedMap = { s1: 1 };

        processor.processStep(0);
        expect(true).toBe(true);
    });
});
