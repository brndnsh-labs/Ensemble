/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Global Mocks
vi.stubGlobal('window', { 
    addEventListener: vi.fn(), 
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
});
vi.stubGlobal('CustomEvent', class { constructor(type, detail) { this.type = type; this.detail = detail?.detail; } });

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    
    const mockArranger = { stepMap: [], sections: [], totalSteps: 0, timeSignature: '4/4', measureMap: new Map() };
    const mockPlayback = { 
        audio: { currentTime: 0 },
        unswungNextNoteTime: 0,
        currentKey: '',
        conductorVelocity: 1.0,
        bandIntensity: 0.5,
        drawQueue: [],
        visualFlash: false,
        metronome: false,
        countIn: false,
        viz: null
    };
    const mockGroove = { genreFeel: 'Rock', instruments: [], humanize: 0, measures: 1 };
    const mockMidi = { enabled: false };
    const mockSoloist = { style: 'scalar' };
    const mockVizState = { enabled: false };
    const mockBass = { enabled: false };
    const mockChords = { enabled: false };
    const mockHarmony = { enabled: false };

    const mockStateMap = {
        arranger: mockArranger,
        playback: mockPlayback,
        groove: mockGroove,
        midi: mockMidi,
        soloist: mockSoloist,
        vizState: mockVizState,
        bass: mockBass,
        chords: mockChords,
        harmony: mockHarmony
    };

    return {
        ...actual,
        ...mockStateMap,
        getState: () => mockStateMap
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        metronome: { checked: false },
        visualFlash: { checked: false }
    },
    triggerFlash: vi.fn()
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

vi.mock('../../../public/conductor.js', () => ({
    conductorState: {},
    updateAutoConductor: vi.fn(),
    updateLarsTempo: vi.fn(),
    checkSectionTransition: vi.fn(),
}));

import { scheduleGlobalEvent, scheduleChordVisuals } from '../../../public/engine/scheduler-core.js';
import { getState } from '../../../public/state.js';
const { arranger, playback, vizState } = getState();

describe('Scheduler Core System', () => {
    
    beforeEach(() => {
        vi.clearAllMocks();
        playback.currentKey = '';
        playback.drawQueue.length = 0;
        playback.visualFlash = false;
        vizState.enabled = false;
        playback.viz = null;

        // Setup a simple song structure with a key change
        // Bar 1 (Step 0): Key A
        // Bar 2 (Step 16): Key B
        arranger.totalSteps = 32;
        arranger.stepMap = [
            { start: 0, end: 16, chord: { sectionId: 's1', key: 'A', freqs: [], rootMidi: 60, intervals: [0, 4, 7], beats: 4 } },
            { start: 16, end: 32, chord: { sectionId: 's2', key: 'B', freqs: [], rootMidi: 62, intervals: [0, 4, 7], beats: 4 } }
        ];
        arranger.sections = [
            { id: 's1', key: 'A' },
            { id: 's2', key: 'B' }
        ];
    });

    describe('Global Event Scheduling', () => {
        it('should emit a key-updated event when playhead crosses section threshold', () => {
            // Trigger Step 0 (Key A)
            scheduleGlobalEvent(0, 0);

            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'key-change',
                detail: { key: 'A' }
            }));

            window.dispatchEvent.mockClear();

            // Trigger Step 15 (Still Key A)
            scheduleGlobalEvent(15, 0);
            expect(window.dispatchEvent).not.toHaveBeenCalled();

            // Trigger Step 16 (Key B)
            scheduleGlobalEvent(16, 0);
            expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({
                type: 'key-change',
                detail: { key: 'B' }
            }));
        });
    });

    describe('Visual Scheduling', () => {
        it('should push chord_vis event to drawQueue even when visualizer is disabled', () => {
            const chordData = {
                stepInChord: 0,
                chordIndex: 1,
                chord: {
                    freqs: [440, 550, 660],
                    rootMidi: 60,
                    intervals: [0, 4, 7],
                    beats: 4
                }
            };
            const time = 10.0;

            vizState.enabled = false;
            playback.viz = null;

            scheduleChordVisuals(chordData, time);

            expect(playback.drawQueue.length).toBe(1);
            expect(playback.drawQueue[0]).toMatchObject({
                type: 'chord_vis',
                time: time,
                index: 1
            });
        });

        it('should not push chord_vis event if stepInChord is not 0', () => {
            const chordData = {
                stepInChord: 1,
                chordIndex: 1,
                chord: { freqs: [] }
            };

            scheduleChordVisuals(chordData, 10.0);

            expect(playback.drawQueue.length).toBe(0);
        });
    });
});
