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
        playback.audio.currentTime = 10.0;
        playback.conductorVelocity = 1.0;
        midi.enabled = false;
        midi.selectedOutputId = null;
        groove.enabled = true;
        groove.instruments = [
            { name: 'Snare', steps: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0] },
        ];
        groove.pendingGenreFeel = null;
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
        arranger.sectionMap = arranger.stepMap;
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

        it('should calculate rhythm section mask (lines 1118-1140)', () => {
            // Step 0 triggers mask calculation
            scheduleGlobalEvent(getState(), 0, 0);
            expect(groove.snareMask).toBeGreaterThan(0);
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
