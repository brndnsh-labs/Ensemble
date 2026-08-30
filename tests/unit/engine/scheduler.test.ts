// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Global Mocks
vi.stubGlobal('window', {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
});
vi.stubGlobal(
    'CustomEvent',
    class {
        constructor(type, detail) {
            this.type = type;
            this.detail = detail?.detail;
        }
    },
);

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();

    const mockArranger = {
        stepMap: [],
        sections: [],
        totalSteps: 0,
        timeSignature: '4/4',
        measureMap: new Map(),
    };
    const mockOscillator = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn() },
        onended: null,
    };
    const mockGain = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        gain: {
            setValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
        },
    };

    const mockPlayback = {
        audio: {
            currentTime: 0,
            createOscillator: () => mockOscillator,
            createGain: () => mockGain,
        },
        unswungNextNoteTime: 0,
        currentKey: '',
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        drawQueue: [],
        visualFlash: false,
        metronome: false,
        countIn: false,
        isCountingIn: false,
        countInBeat: 0,
        viz: null,
        bpm: 120,
        masterGain: {},
    };
    const mockGroove = {
        genreFeel: 'Rock',
        instruments: [],
        humanize: 0,
        measures: 1,
        enabled: true,
        sectionSeedMap: {},
        buffer: new Map(),
    };
    const mockMidi = { enabled: false };
    const mockSoloist = makeSoloistMock({ style: 'scalar', enabled: false, buffer: new Map() });
    const mockVizState = { enabled: false };
    const mockBass = { enabled: false, buffer: new Map() };
    const mockChords = { enabled: false, buffer: new Map() };
    const mockHarmony = { enabled: false, buffer: new Map() };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };

    const mockStateMap = {
        arranger: mockArranger,
        playback: mockPlayback,
        groove: mockGroove,
        midi: mockMidi,
        soloist: mockSoloist,
        vizState: mockVizState,
        bass: mockBass,
        chords: mockChords,
        harmony: mockHarmony,
        conductor: mockConductor,
    };

    return {
        ...actual,
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false },
    },
    triggerFlash: vi.fn(),
}));

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    flushBuffers: vi.fn(),
}));

// Mock scheduler-core dependencies to avoid real audio/worker calls
vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    restoreGains: vi.fn(),
    playDrumSound: vi.fn(),
    playBassNote: vi.fn(),
    playSoloNote: vi.fn(),
    playNote: vi.fn(),
    playHarmonyNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
    killAllNotes: vi.fn(),
    killHarmonyNote: vi.fn(),
    killAllPianoNotes: vi.fn(),
    killSoloistNote: vi.fn(),
    killBassNote: vi.fn(),
    killDrumNote: vi.fn(),
    killChordBus: vi.fn(),
    killSoloistBus: vi.fn(),
    killBassBus: vi.fn(),
    killDrumBus: vi.fn(),
    updateSustain: vi.fn(),
}));

// Mock platform dependencies often used by scheduler
vi.mock('../../../public/platform.js', () => ({
    initPlatform: vi.fn(),
    unlockAudio: vi.fn(),
    lockAudio: vi.fn(),
    activateWakeLock: vi.fn(),
    deactivateWakeLock: vi.fn(),
}));

vi.mock('../../../public/worker-client.js', () => ({
    requestBuffer: vi.fn(),
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
    stopWorker: vi.fn(),
    startWorker: vi.fn(),
    requestResolution: vi.fn(),
}));

vi.mock('../../../public/engine/conductor.js', () => ({
    updateAutoConductor: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

import { runDrumTick } from '../../../public/engine/drums-tick.js';
import * as Engine from '../../../public/engine/engine.js';
import {
    scheduleChordVisuals,
    scheduleGlobalEvent,
    scheduler,
    togglePlay,
} from '../../../public/engine/scheduler-core.js';
import { triggerFlash } from '../../../public/ui.js';

const { arranger, playback, vizState, groove, midi, soloist, chords, bass, harmony } = getState();

describe('Scheduler Core System', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        playback.currentKey = '';
        playback.drawQueue.length = 0;
        playback.visualFlash = false;
        vizState.enabled = false;
        playback.viz = null;
        playback.metronome = false;
        playback.isPlaying = false;
        playback.isEndingPending = false;
        playback.resolutionTriggered = false;
        playback.isCountingIn = false;
        playback.countInBeat = 0;
        playback.step = 0;
        playback.bpm = 120;
        playback.nextNoteTime = 0;
        playback.unswungNextNoteTime = 0;
        playback.audio.currentTime = 10.0;
        playback.conductorVelocity = 1.0;
        midi.enabled = false;
        midi.selectedOutputId = null;
        groove.enabled = true;
        groove.genreFeel = 'Rock';
        groove.measures = 1;
        groove.swing = 0;
        groove.swingSub = '8th';
        groove.instruments = [
            { name: 'Snare', steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
        ];
        groove.pendingGenreFeel = null;
        groove.sectionSeedMap = {};
        groove.fillActive = false;
        groove.fillStartStep = 0;
        groove.fillLength = 0;
        groove.pendingCrash = false;
        groove.buffer = new Map();
        bass.buffer = new Map();
        bass.enabled = true;
        soloist.audio.buffer = new Map();
        soloist.enabled = true;
        chords.buffer = new Map();
        chords.enabled = true;
        harmony.buffer = new Map();
        harmony.enabled = true;

        // Setup a simple song structure with a key change
        // Bar 1 (Step 0): Key A
        // Bar 2 (Step 16): Key B
        arranger.totalSteps = 32;
        arranger.timeSignature = '4/4';
        arranger.grouping = null;
        arranger.measureMap = [];
        arranger.stepMap = [
            {
                start: 0,
                end: 16,
                chord: {
                    sectionId: 's1',
                    key: 'A',
                    freqs: [],
                    rootMidi: 60,
                    intervals: [0, 4, 7],
                    beats: 4,
                },
            },
            {
                start: 16,
                end: 32,
                chord: {
                    sectionId: 's2',
                    key: 'B',
                    freqs: [],
                    rootMidi: 62,
                    intervals: [0, 4, 7],
                    beats: 4,
                },
            },
        ];
        arranger.sections = [
            { id: 's1', key: 'A' },
            { id: 's2', key: 'B' },
        ];
        arranger.sectionMap = [
            { id: 's1', start: 0, end: 16 },
            { id: 's2', start: 16, end: 32 },
        ];
    });

    describe('Playback Control (togglePlay)', () => {
        it('should start playback correctly', () => {
            togglePlay(getState(), null);
            expect(playback.isPlaying).toBe(true);
            expect(playback.step).toBe(0);
        });

        it('should start with count-in if enabled (lines 168-169)', () => {
            playback.countIn = true;
            togglePlay(getState(), null);
            expect(playback.isCountingIn).toBe(true);
        });

        it('should stop playback correctly', () => {
            playback.isPlaying = true;
            playback.audio.state = 'running';
            playback.audio.suspend = vi.fn();

            togglePlay(getState(), null);

            expect(playback.isPlaying).toBe(false);

            // Advance timers to trigger suspend
            vi.advanceTimersByTime(3500);
            expect(playback.audio.suspend).toHaveBeenCalled();
        });
    });

    describe('Engine Scheduling Loop (scheduler)', () => {
        it('should trigger resolution at song end if ending is pending (lines 304-328)', () => {
            const state = getState();
            state.playback.isPlaying = true;
            state.playback.isEndingPending = true;
            state.playback.step = state.arranger.totalSteps; // 32
            state.playback.scheduleAheadTime = 0.2;
            state.playback.nextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;

            scheduler(getState());

            expect(state.playback.resolutionTriggered).toBe(true);
            expect(state.playback.isScheduling).toBe(false);
        });

        it('should handle count-in correctly (lines 290-292)', () => {
            const state = getState();
            state.playback.isPlaying = true;
            state.playback.isCountingIn = true;
            state.playback.countInBeat = 0;
            state.playback.scheduleAheadTime = 0.2;
            state.playback.nextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;

            scheduler(getState());

            expect(state.playback.countInBeat).toBe(1);
            expect(state.playback.isScheduling).toBe(false);
        });

        it('should apply pending genre (lines 330-332)', () => {
            const state = getState();
            state.playback.isPlaying = true;
            state.playback.step = 0;
            state.playback.scheduleAheadTime = 0.2;
            state.playback.nextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;
            state.groove.pendingGenreFeel = { drum: 'Modern808' };

            scheduler(getState());

            expect(state.groove.pendingGenreFeel).toBe(null);
            expect(state.playback.isScheduling).toBe(false);
        });

        it('applies a pending genre at a mixed-meter bar line', () => {
            const state = getState();
            state.arranger.totalSteps = 40;
            state.arranger.measureMap = [
                { start: 0, end: 16, ts: '4/4' },
                { start: 16, end: 28, ts: '3/4' },
                { start: 28, end: 40, ts: '3/4' },
            ];
            state.playback.isPlaying = true;
            state.playback.step = 28;
            state.playback.scheduleAheadTime = 0.2;
            state.playback.nextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;
            state.groove.pendingGenreFeel = { feel: 'Jazz' };

            scheduler(state);

            expect(state.groove.genreFeel).toBe('Jazz');
            expect(state.groove.pendingGenreFeel).toBe(null);
            expect(state.playback.isScheduling).toBe(false);
        });

        it('restarts eighth-note swing phase at an offset mixed-meter bar line', () => {
            const state = getState();
            state.arranger.totalSteps = 30;
            state.arranger.timeSignature = '7/8';
            state.arranger.measureMap = [
                { start: 0, end: 14, ts: '7/8' },
                { start: 14, end: 30, ts: '4/4' },
            ];
            state.playback.isPlaying = true;
            state.playback.step = 14;
            state.playback.scheduleAheadTime = 0.01;
            state.playback.nextNoteTime = 10.0;
            state.playback.unswungNextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;
            state.groove.swing = 100;
            state.groove.swingSub = '8th';

            scheduler(state);

            expect(state.playback.step).toBe(15);
            // #1067: 8th-swing subIndex 0 ("1") weight is 1 (was 1.5 pre-fix), so at
            // swing:100 duration is stepSec*(4/3) — see the mirrored assertion in
            // midi-worker-deep.test.ts.
            expect(state.playback.nextNoteTime - 10.0).toBeCloseTo(0.125 * (4 / 3), 10);
        });
    });

    describe('Instrument Specific Scheduling', () => {
        it('should handle chord sustain CC events (lines 1005-1015)', () => {
            midi.enabled = true;
            midi.selectedOutputId = 'mock';
            const chordNotes = [
                {
                    freq: 261,
                    velocity: 0.8,
                    ccEvents: [{ controller: 64, value: 127, timingOffset: 0.01 }],
                },
            ];
            chords.buffer.set(0, chordNotes);

            // Trigger chord scheduling via global event
            scheduleGlobalEvent(getState(), 0, 10.0);

            expect(Engine.updateSustain).toHaveBeenCalledWith(
                expect.any(Object),
                true,
                expect.any(Number),
            );
        });

        it('should handle harmony voice killing on chord start (lines 1043-1046)', () => {
            const harmonyNotes = [
                {
                    freq: 440,
                    velocity: 0.5,
                    isChordStart: true,
                    killFade: 0.1,
                },
            ];
            harmony.buffer.set(0, harmonyNotes);

            scheduleGlobalEvent(getState(), 0, 10.0);

            // B11 (#710) — the release is scheduled at the chord's onset
            // (`time` = 10.0), not currentTime, for a true crossfade. #934 — the
            // chord-change release now flows through `releaseHarmonyVoicing`
            // (synth-harmonies owns the lifecycle): no legato here, so the
            // keep-set is empty and every prior voice is released.
            expect(Engine.releaseHarmonyVoicing).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Set),
                10.0,
                0.1,
            );
            expect(Engine.playHarmonyNote).toHaveBeenCalled();
        });

        it('should push harmony and soloist visual events (lines 1083-1093)', () => {
            vizState.enabled = true;
            playback.viz = { pushNote: vi.fn(), truncateNotes: vi.fn() };

            soloist.audio.buffer.set(0, [{ freq: 880, velocity: 0.9, durationSteps: 4 }]);
            harmony.buffer.set(0, [{ freq: 440, velocity: 0.5, durationSteps: 4 }]);

            scheduleGlobalEvent(getState(), 0, 10.0);

            const soloistVis = playback.drawQueue.find(
                (e) => e.type === 'note' && e.track === 'soloist',
            );
            const harmonyVis = playback.drawQueue.find(
                (e) => e.type === 'note' && e.track === 'harmony',
            );
            expect(soloistVis).toBeDefined();
            expect(harmonyVis).toBeDefined();
        });
    });

    describe('Global Event Scheduling', () => {
        it('should push timeline step events while visuals are enabled', () => {
            playback.visualFlash = true;
            groove.enabled = true;
            vizState.enabled = true;

            scheduleGlobalEvent(getState(), 0, 10.0);
            const step0 = playback.drawQueue.find((e) => e.type === 'step');
            expect(step0).toMatchObject({ type: 'step', step: 0, time: 10.0 });
            expect(triggerFlash).toHaveBeenCalledWith(0.1);
        });

        it('should not queue visual-only global events while visuals are disabled', () => {
            playback.visualFlash = true;
            groove.enabled = true;
            vizState.enabled = false;

            scheduleGlobalEvent(getState(), 0, 10.0);

            expect(playback.drawQueue.find((e) => e.type === 'step')).toBeUndefined();
            expect(
                playback.drawQueue.find((e) => e.type === 'note' && e.track === 'drums'),
            ).toBeUndefined();
        });
        it('should emit a key-updated event when playhead crosses section threshold', () => {
            // Trigger Step 0 (Key A)
            scheduleGlobalEvent(getState(), 0, 0);

            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'key-change',
                    detail: { key: 'A' },
                }),
            );

            window.dispatchEvent.mockClear();

            // Trigger Step 15 (Still Key A)
            scheduleGlobalEvent(getState(), 15, 0);
            expect(window.dispatchEvent).not.toHaveBeenCalled();

            // Trigger Step 16 (Key B)
            scheduleGlobalEvent(getState(), 16, 0);
            expect(window.dispatchEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'key-change',
                    detail: { key: 'B' },
                }),
            );
        });

        it('should handle metronome logic (lines 1158-1177)', () => {
            playback.metronome = true;

            // Step 0 is Measure Start (1000Hz)
            scheduleGlobalEvent(getState(), 0, 0);

            const osc = playback.audio.createOscillator();
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(1000, 0);

            // Step 4 is a normal beat in 4/4 (600Hz)
            scheduleGlobalEvent(getState(), 4, 1.0);
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, 1.0);

            // Step 8 is Group Start in 4/4 [2, 2] grouping (800Hz)
            scheduleGlobalEvent(getState(), 8, 2.0);
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(800, 2.0);

            // Step 12 is a normal beat (600Hz)
            scheduleGlobalEvent(getState(), 12, 3.0);
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(600, 3.0);

            // Trigger onended for coverage
            if (osc.onended) {
                osc.onended();
            }
        });

        it('accents the authored meter grouping', () => {
            playback.metronome = true;
            arranger.timeSignature = '5/4';
            arranger.grouping = [2, 3];

            scheduleGlobalEvent(getState(), 8, 2.0);

            const osc = playback.audio.createOscillator();
            expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(800, 2.0);
        });

        it('expires an old fill at a drum-muted seam before the next audible section', () => {
            arranger.totalSteps = 48;
            arranger.sections = [
                { id: 'audible-a', key: 'A' },
                { id: 'muted', key: 'B', instruments: { groove: false } },
                { id: 'audible-b', key: 'C', instruments: { groove: true } },
            ];
            arranger.sectionMap = [
                { id: 'audible-a', start: 0, end: 16 },
                { id: 'muted', start: 16, end: 32 },
                { id: 'audible-b', start: 32, end: 48 },
            ];
            arranger.stepMap = [
                {
                    start: 0,
                    end: 16,
                    chord: {
                        sectionId: 'audible-a',
                        key: 'A',
                        rootMidi: 60,
                        beats: 4,
                        freqs: [261.63, 329.63, 392],
                    },
                },
                {
                    start: 16,
                    end: 32,
                    chord: {
                        sectionId: 'muted',
                        key: 'B',
                        rootMidi: 62,
                        beats: 4,
                        freqs: [293.66, 369.99, 440],
                    },
                },
                {
                    start: 32,
                    end: 48,
                    chord: {
                        sectionId: 'audible-b',
                        key: 'C',
                        rootMidi: 64,
                        beats: 4,
                        freqs: [329.63, 415.3, 493.88],
                    },
                },
            ];
            groove.enabled = true;
            groove.fillActive = true;
            groove.fillStartStep = 0;
            groove.fillLength = 16;
            groove.pendingCrash = true;

            scheduleGlobalEvent(getState(), 16, 1.0);

            expect(groove.fillActive).toBe(false);
            expect(groove.pendingCrash).toBe(false);
        });

        it('keeps main and worker drum phase aligned at a mixed-meter seam and loop two', () => {
            arranger.totalSteps = 28;
            arranger.timeSignature = '3/4';
            arranger.grouping = null;
            arranger.sections = [
                { id: 'waltz', key: 'A', timeSignature: '3/4' },
                { id: 'straight', key: 'B', timeSignature: '4/4' },
            ];
            arranger.sectionMap = [
                { id: 'waltz', start: 0, end: 12, timeSignature: '3/4' },
                { id: 'straight', start: 12, end: 28, timeSignature: '4/4' },
            ];
            arranger.measureMap = [
                { start: 0, end: 12, ts: '3/4' },
                { start: 12, end: 28, ts: '4/4' },
            ];
            arranger.stepMap = [
                {
                    start: 0,
                    end: 12,
                    chord: {
                        sectionId: 'waltz',
                        key: 'A',
                        timeSignature: '3/4',
                        freqs: [],
                        rootMidi: 60,
                        intervals: [0, 4, 7],
                        beats: 3,
                    },
                },
                {
                    start: 12,
                    end: 28,
                    chord: {
                        sectionId: 'straight',
                        key: 'B',
                        timeSignature: '4/4',
                        freqs: [],
                        rootMidi: 62,
                        intervals: [0, 4, 7],
                        beats: 4,
                    },
                },
            ];
            vizState.enabled = true;

            for (const step of [12, 40]) {
                const workerTick = runDrumTick(getState(), step, {
                    mainCursor: { index: 0, sectionIndex: 0 },
                    lookaheadCursor: { index: 0, sectionIndex: 0 },
                });
                expect(workerTick.ts.beats).toBe(4);
                expect(workerTick.stepInfo.mStep).toBe(0);
                expect(workerTick.drumStep).toBe(0);

                playback.drawQueue.length = 0;
                scheduleGlobalEvent(getState(), step, 10);
                expect(playback.drawQueue).toContainEqual(
                    expect.objectContaining({
                        type: 'step',
                        step: 0,
                        chartStep: 12,
                    }),
                );
            }

            groove.enabled = false;
            playback.drawQueue.length = 0;
            scheduleGlobalEvent(getState(), 12, 10);
            expect(playback.drawQueue).toContainEqual(
                expect.objectContaining({ type: 'step', step: 0, chartStep: 12 }),
            );
        });

        it('keeps two-measure drum patterns bar-local at an offset seam and later loop', () => {
            arranger.totalSteps = 46;
            arranger.timeSignature = '7/8';
            arranger.sections = [
                { id: 'odd', key: 'A', timeSignature: '7/8' },
                { id: 'disco', key: 'B', timeSignature: '4/4' },
            ];
            arranger.sectionMap = [
                { id: 'odd', start: 0, end: 14, timeSignature: '7/8' },
                { id: 'disco', start: 14, end: 46, timeSignature: '4/4' },
            ];
            arranger.measureMap = [
                { start: 0, end: 14, ts: '7/8' },
                { start: 14, end: 30, ts: '4/4' },
                { start: 30, end: 46, ts: '4/4' },
            ];
            arranger.stepMap = [
                {
                    start: 0,
                    end: 14,
                    chord: {
                        sectionId: 'odd',
                        key: 'A',
                        timeSignature: '7/8',
                        freqs: [],
                        rootMidi: 60,
                        intervals: [0, 4, 7],
                        beats: 7,
                    },
                },
                {
                    start: 14,
                    end: 30,
                    chord: {
                        sectionId: 'disco',
                        key: 'B',
                        timeSignature: '4/4',
                        freqs: [],
                        rootMidi: 62,
                        intervals: [0, 4, 7],
                        beats: 4,
                    },
                },
                {
                    start: 30,
                    end: 46,
                    chord: {
                        sectionId: 'disco',
                        key: 'B',
                        timeSignature: '4/4',
                        freqs: [],
                        rootMidi: 62,
                        intervals: [0, 4, 7],
                        beats: 4,
                    },
                },
            ];
            groove.genreFeel = 'Disco';
            groove.measures = 2;
            groove.sectionSeedMap = { disco: 0.1 }; // foundation motif: no ghost-snare fallback
            groove.instruments = [
                { name: 'Snare', steps: Array.from({ length: 32 }, () => 0), muted: false },
            ];
            playback.bandIntensity = 0.8;

            // The final step of bar 2 is drumStep 31 but bar-local loopStep 15.
            // Disco's turnaround crack keys on the latter and must recur on loop 2.
            for (const step of [45, 91]) {
                const tick = runDrumTick(getState(), step, {
                    mainCursor: { index: 0, sectionIndex: 0 },
                    lookaheadCursor: { index: 0, sectionIndex: 0 },
                });
                expect(tick.drumStep).toBe(31);
                expect(tick.drumHits).toContainEqual(
                    expect.objectContaining({
                        shouldPlay: true,
                        soundName: 'Snare',
                    }),
                );
                expect(tick.drumHits[0].velocity).toBeGreaterThan(1.2);
            }
        });

        it('schedules a globally disabled lane when its section forces it on', () => {
            bass.enabled = false;
            arranger.sections[0].instruments = { bass: true };
            bass.buffer.set(0, [{ freq: 110, durationSteps: 4, velocity: 0.8 }]);

            scheduleGlobalEvent(getState(), 0, 10.0);

            expect(Engine.playBassNote).toHaveBeenCalled();
        });

        it('does not schedule a globally enabled lane when its section forces it off', () => {
            bass.enabled = true;
            arranger.sections[0].instruments = { bass: false };
            bass.buffer.set(0, [{ freq: 110, durationSteps: 4, velocity: 0.8 }]);

            scheduleGlobalEvent(getState(), 0, 10.0);

            expect(Engine.playBassNote).not.toHaveBeenCalled();
        });

        it('should calculate rhythm section mask (lines 1118-1140)', () => {
            // Step 0 triggers mask calculation
            scheduleGlobalEvent(getState(), 0, 0);
            expect(groove.snareMask).toBeGreaterThan(0);
        });
    });

    // #1323: the visualizer used to own a private `DRUM_VIS_PITCHES` map with
    // the same `|| 36` Kick fallback #1321 removed from live MIDI-out. It was
    // missing the percussion lanes, the space-form Toms, and the suffix-first
    // Agogo/Cowbell variants — so 8 of the 13 drum lanes, plus most of the
    // soundNames the groove strategies emit, drew on top of the Kick. The
    // visualizer now reads the one completed `DRUM_MAP`.
    describe('Drum visualizer note mapping (#1323)', () => {
        // The GM note each emitted soundName must draw at, spelled out
        // literally rather than read back out of DRUM_MAP — a re-read would
        // pass for any map, including the broken one.
        const GM_NOTES: Record<string, number> = {
            Kick: 36,
            Snare: 38,
            Sidestick: 37,
            Brush: 37,
            HiHat: 42,
            HiHatQuarter: 42,
            HiHatHalf: 46,
            HiHatPedal: 44,
            Open: 46,
            Ride: 51,
            Crash: 49,
            China: 52,
            Cowbell: 56,
            CowbellHigh: 56,
            CowbellLow: 56,
            AgogoHigh: 67,
            AgogoLow: 68,
            Clave: 75,
            Conga: 63,
            Bongo: 60,
            Perc: 67,
            Shaker: 70,
            Guiro: 74,
            'High Tom': 50,
            'Mid Tom': 47,
            'Low Tom': 43,
        };

        // The eight lanes that fell through the old `DRUM_VIS_PITCHES` map to
        // its `|| 36` Kick fallback. A groove strategy can rewrite the Kick/
        // Snare/HiHat/Open lanes' soundName from context, but never these.
        //
        // `Shaker` is deliberately NOT here: the old map already had
        // `Shaker: 70`, so a Shaker row would stay green against the broken
        // map and guard `DRUM_MAP`'s value rather than this fix. It rides the
        // full-kit sweep below instead.
        const PREVIOUSLY_KICK_LANES: Array<[string, number]> = [
            ['Clave', 75],
            ['Conga', 63],
            ['Bongo', 60],
            ['Perc', 67],
            ['Guiro', 74],
            ['High Tom', 50],
            ['Mid Tom', 47],
            ['Low Tom', 43],
        ];

        // The previously-Kick soundNames the groove strategies emit that no
        // lane is named after — the other half of the bug. Each needs its own
        // genre/intensity fixture to reach through a lane sweep (`China` is
        // Metal's accentCymbal, the Agogo/Cowbell variants are Latin/Disco,
        // `Sidestick` needs bandIntensity < 0.4), so they're driven through
        // the buffer path instead, which takes `n.name` verbatim.
        const PREVIOUSLY_KICK_SOUNDS: Array<[string, number]> = [
            ['Sidestick', 37],
            ['Brush', 37],
            ['China', 52],
            ['CowbellHigh', 56],
            ['CowbellLow', 56],
            ['AgogoHigh', 67],
            ['AgogoLow', 68],
            ['HiHatPedal', 44],
        ];

        // The full default kit, in `groove.instruments` order.
        const ALL_LANES = [
            'Kick',
            'Snare',
            'HiHat',
            'Open',
            'Shaker',
            ...PREVIOUSLY_KICK_LANES.map(([lane]) => lane),
        ];

        /**
         * Arm the given drum lanes on every step and drive a full bar through
         * the live `scheduleGlobalEvent` path, returning what actually SOUNDED
         * (`playDrumSound`'s soundName, in emission order) alongside what was
         * drawn (the queued visualizer notes' midi, same order — both come off
         * the same `drumHits.forEach`).
         *
         * Two deliberate shapes here. Pairing sounded-with-drawn, rather than
         * asserting lane → hard-coded note, keeps the test honest when a groove
         * strategy rewrites a lane's soundName from context (`bandIntensity <
         * 0.4` swaps Snare for Sidestick, entropy syncopation reclaims Open as
         * HiHat, ...) — and exercising those rewrites is the point, since they
         * emit names no lane is called. Sweeping a whole bar with every step
         * armed is because a strategy freely suppresses individual steps (Rock
         * mutes a snare on the downbeat and won't place an open hat with no
         * HiHat lane present), so a single-step probe measures the strategy
         * rather than the mapping.
         */
        function playKit(lanes: string[]) {
            playback.drawQueue.length = 0;
            Engine.playDrumSound.mockClear();
            groove.instruments = lanes.map((name) => ({ name, steps: new Array(16).fill(2) }));
            for (let step = 0; step < 16; step++) {
                scheduleGlobalEvent(getState(), step, 10.0 + step * 0.1);
            }
            return {
                sounded: Engine.playDrumSound.mock.calls.map((call) => call[1]),
                drawn: playback.drawQueue
                    .filter((e) => e.type === 'note' && e.track === 'drums')
                    .map((e) => e.midi),
            };
        }

        beforeEach(() => {
            vizState.enabled = true;
            // Isolate the drum lane under test: the melodic lanes queue their
            // own visualizer events onto the same drawQueue.
            bass.enabled = false;
            soloist.enabled = false;
            chords.enabled = false;
            harmony.enabled = false;
            // The groove strategies read these and the outer beforeEach doesn't
            // reset them — pin both so lane→soundName resolution is stable
            // regardless of test order.
            playback.bandIntensity = 0.5;
            groove.genreFeel = 'Rock';
        });

        it('draws every hit of a full kit bar as the instrument that actually sounded', () => {
            const { sounded, drawn } = playKit(ALL_LANES);

            expect(sounded.length, 'the kit sounded nothing').toBeGreaterThan(0);
            expect(drawn, 'the kit drew a different number of notes than it sounded').toHaveLength(
                sounded.length,
            );
            sounded.forEach((soundName, i) => {
                expect(
                    GM_NOTES[soundName],
                    `"${soundName}" sounded but isn't in this test's GM table`,
                ).toBeTypeOf('number');
                expect(
                    drawn[i],
                    `"${soundName}" should visualize as GM ${GM_NOTES[soundName]}`,
                ).toBe(GM_NOTES[soundName]);
            });

            // Proof the sweep reaches the strategy-rewritten names (Sidestick,
            // Crash, Ride, ...) and not just the identity lane→soundName path —
            // otherwise the pairing above would only ever cover 13 names.
            const laneNames = new Set(ALL_LANES);
            expect(
                sounded.some((name) => !laneNames.has(name)),
                'the sweep never exercised a strategy-rewritten soundName',
            ).toBe(true);
        });

        it.each(PREVIOUSLY_KICK_LANES)(
            'draws the %s lane at GM %i instead of the old Kick fallback',
            (laneName, expectedNote) => {
                const { sounded, drawn } = playKit([laneName]);

                // These lanes are never soundName-rewritten, so the hard
                // lane→note assertion is safe and is the direct #1323
                // regression statement.
                expect(sounded.length, `${laneName} sounded nothing`).toBeGreaterThan(0);
                expect(new Set(sounded)).toEqual(new Set([laneName]));
                expect(
                    new Set(drawn),
                    `${laneName} drew a note other than GM ${expectedNote}`,
                ).toEqual(new Set([expectedNote]));
                expect(
                    drawn,
                    `${laneName} drew a different number of notes than it sounded`,
                ).toHaveLength(sounded.length);
                expect(expectedNote, `${laneName} still draws at the Kick position`).not.toBe(36);
            },
        );

        it('skips the event for a name with no DRUM_MAP entry instead of drawing a Kick', () => {
            const { sounded, drawn } = playKit(['TotallyMadeUpPercussion']);

            // A missing dot is a smaller error than a confidently wrong one —
            // the same rule `sendMIDIDrum` adopted in #1321. Asserting
            // `sounded` too proves the hit still reached the audio path and
            // only the visualizer skipped it.
            expect(sounded.length, 'the made-up lane never sounded').toBeGreaterThan(0);
            expect(new Set(sounded)).toEqual(new Set(['TotallyMadeUpPercussion']));
            expect(drawn).toHaveLength(0);
        });

        /**
         * Drive the OTHER changed call site: `scheduleDrumsFromBuffer`,
         * reached only through the song-ending resolution
         * (`triggerResolution` → 50ms → `scheduleResolution`). It reads the
         * worker's notes verbatim off `groove.buffer` with no groove strategy
         * in between, which is what makes it the one seam that can exercise an
         * arbitrary soundName deterministically.
         *
         * Note the honest scope: `groove.buffer`'s only production writer is
         * `generateResolutionNotes` (`engine/resolution.ts`), which emits just
         * Kick/Snare/Crash — all three mapped identically by the old map, so
         * this call site's fix is inert *today*. It's tested anyway because
         * the point of #1323 is that both sites resolve a name the same way;
         * a future resolution voice would otherwise re-open the bug here only.
         */
        function playResolutionBuffer(names: string[]) {
            const state = getState();
            state.playback.isPlaying = true;
            state.playback.isEndingPending = true;
            state.playback.step = state.arranger.totalSteps;
            state.playback.scheduleAheadTime = 0.2;
            state.playback.nextNoteTime = 10.0;
            state.playback.audio.currentTime = 10.0;

            scheduler(getState());
            expect(state.playback.resolutionTriggered, 'resolution never triggered').toBe(true);

            // `triggerResolution` clears the buffers first, then the worker's
            // resolution notes arrive via the worker-client callback — so seed
            // AFTER the trigger, matching production ordering.
            playback.drawQueue.length = 0;
            Engine.playDrumSound.mockClear();
            groove.buffer.set(
                state.playback.step,
                names.map((name) => ({ name, velocity: 0.8, timingOffset: 0 })),
            );

            vi.advanceTimersByTime(60);

            return {
                sounded: Engine.playDrumSound.mock.calls.map((call) => call[1]),
                drawn: playback.drawQueue
                    .filter((e) => e.type === 'note' && e.track === 'drums')
                    .map((e) => e.midi),
            };
        }

        it('draws the strategy-emitted soundNames at their own GM note on the resolution path', () => {
            const { sounded, drawn } = playResolutionBuffer(
                PREVIOUSLY_KICK_SOUNDS.map(([name]) => name),
            );

            expect(sounded).toEqual(PREVIOUSLY_KICK_SOUNDS.map(([name]) => name));
            expect(drawn).toEqual(PREVIOUSLY_KICK_SOUNDS.map(([, note]) => note));
            // Every one of these hit the old map's `|| 36` Kick fallback.
            expect(drawn).not.toContain(36);
        });

        it('skips an unmapped name on the resolution path too', () => {
            const { sounded, drawn } = playResolutionBuffer(['Kick', 'NotARealDrum', 'Snare']);

            expect(sounded).toEqual(['Kick', 'NotARealDrum', 'Snare']);
            // Only the unmapped one drops out — and it does not shift the
            // others onto the wrong row.
            expect(drawn).toEqual([36, 38]);
        });
    });

    describe('Visual Scheduling', () => {
        it('should not push chord events while visualizer is disabled', () => {
            const chordData = {
                stepInChord: 0,
                chordIndex: 1,
                chord: {
                    freqs: [440, 550, 660],
                    rootMidi: 60,
                    intervals: [0, 4, 7],
                    beats: 4,
                },
            };
            const time = 10.0;

            vizState.enabled = false;
            playback.viz = null;

            scheduleChordVisuals(getState(), chordData, time);

            expect(playback.drawQueue.length).toBe(0);
        });

        it('should not push chord events if stepInChord is not 0', () => {
            const chordData = {
                stepInChord: 1,
                chordIndex: 1,
                chord: { freqs: [] },
            };

            scheduleChordVisuals(getState(), chordData, 10.0);

            expect(playback.drawQueue.length).toBe(0);
        });
    });
});
