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

    it('uses the section meter for timing on the first and second chart loop', () => {
        state.arranger.totalSteps = 30;
        state.arranger.measureMap = [
            { start: 0, end: 16, ts: '4/4' },
            { start: 16, end: 30, ts: '7/8' },
        ];
        state.groove.swing = 100;
        state.groove.swingSub = '16th';

        const mixed = new ExportProcessor(state, {
            includedTracks: ['drums'],
            loopMode: 'once',
        });
        const durationAt = (step) => mixed.stepTimes[step + 1] - mixed.stepTimes[step];

        expect(durationAt(0)).toBeGreaterThan(0.125);
        expect(durationAt(16)).toBeCloseTo(0.125);
        expect(durationAt(30)).toBeCloseTo(durationAt(0));
        expect(durationAt(46)).toBeCloseTo(durationAt(16));
    });

    it('restarts eighth-note swing phase at an offset mixed-meter bar line', () => {
        state.arranger.totalSteps = 30;
        state.arranger.timeSignature = '7/8';
        state.arranger.measureMap = [
            { start: 0, end: 14, ts: '7/8' },
            { start: 14, end: 30, ts: '4/4' },
        ];
        state.groove.swing = 100;
        state.groove.swingSub = '8th';

        const mixed = new ExportProcessor(state, {
            includedTracks: ['drums'],
            loopMode: 'once',
        });
        const durationAt = (step) => mixed.stepTimes[step + 1] - mixed.stepTimes[step];

        expect(durationAt(14)).toBeCloseTo(0.1875);
        expect(durationAt(44)).toBeCloseTo(durationAt(14));
    });

    it('writes mixed-meter metadata at both first- and second-loop seams', () => {
        state.arranger.totalSteps = 30;
        state.arranger.timeSignature = '7/8';
        state.arranger.measureMap = [
            { start: 0, end: 14, ts: '7/8' },
            { start: 14, end: 30, ts: '4/4' },
        ];
        const mixed = new ExportProcessor(state, {
            includedTracks: [],
            loopMode: 'once',
        });

        for (const step of [0, 14, 30, 44]) {
            mixed.processStep(step);
        }

        const signatures = mixed.metaTrack.events
            .filter((event) => event.data[0] === 0xff && event.data[1] === 0x58)
            .map((event) => [event.time, event.data[3], 2 ** event.data[4]]);
        expect(signatures.map(([, num, denom]) => [num, denom])).toEqual([
            [7, 8],
            [4, 4],
            [7, 8],
            [4, 4],
        ]);
        expect(signatures.map(([time]) => time)).toEqual(
            [...signatures.map(([time]) => time)].sort((a, b) => a - b),
        );
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

    // #1078: the export unrolls `loopCount` arrangement passes, but the offline
    // export has no main-thread scheduler to advance `playback.currentLoopCount`,
    // so before the fix every unrolled pass rendered as loop 0 — soloist
    // development depth / loopLift, drum motif lift and #1011 reharm subs all
    // frozen at the first pass. processStep must now mirror the live scheduler.
    describe('#1078 loop-keyed export evolution', () => {
        const oneLoop = 32; // matches beforeEach arranger.totalSteps

        it('advances currentLoopCount per loop, stepping only at loop boundaries', () => {
            // The value the engine reads is written at the TOP of processStep,
            // before generateNotesForStep — so reading it after each call is
            // exactly what that pass's note generation saw.
            const seenAt = (step) => {
                processor.processStep(step);
                return processor.state.playback.currentLoopCount;
            };

            // last step of loop 0 is still loop 0; first step of loop 1 flips it.
            expect(seenAt(0)).toBe(0);
            expect(seenAt(oneLoop - 1)).toBe(0);
            expect(seenAt(oneLoop)).toBe(1);
            expect(seenAt(oneLoop + 5)).toBe(1);
            // the exact regression: mid-way through the 3rd pass must read loop 2,
            // not the pinned-0 it rendered before the fix.
            expect(seenAt(oneLoop * 2 + 3)).toBe(2);
        });

        it('drives the engine input across the full unrolled export (not pinned to 0)', () => {
            const seen = new Set();
            for (let step = 0; step < oneLoop * 4; step++) {
                processor.processStep(step);
                seen.add(processor.state.playback.currentLoopCount);
                // stays bar-aligned: floor(step / oneLoop), never mid-bar drift.
                expect(processor.state.playback.currentLoopCount).toBe(Math.floor(step / oneLoop));
            }
            // pre-fix this set was {0}; now it must span every unrolled pass.
            expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
        });
    });
});
