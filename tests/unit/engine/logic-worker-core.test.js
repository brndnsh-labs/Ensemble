/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getState } from '../../../public/state.js';
import { WORKER_MSG, WORKER_RESP } from '../../../public/worker-types.js';

// Setup global mocks BEFORE importing the worker
const mockPostMessage = vi.fn();
vi.stubGlobal('postMessage', mockPostMessage);
vi.stubGlobal('performance', { now: vi.fn(() => 1000) });
const mockSelf = { onmessage: null };
vi.stubGlobal('self', mockSelf);

// Mock intervals/timers
vi.stubGlobal(
    'setInterval',
    vi.fn(() => 123),
);
vi.stubGlobal('clearInterval', vi.fn());

vi.mock('../../../public/engine/midi-worker-logic.js', () => {
    let exporting = false;
    return {
        handleExport: vi.fn(),
        isExporting: vi.fn(() => exporting),
        setOnExportEnd: vi.fn(),
        _setExporting: (val) => (exporting = val),
    };
});

import { _setExporting } from '../../../public/engine/midi-worker-logic.js';

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mockChord = {
        sectionId: 's1',
        rootMidi: 60,
        intervals: [0, 4, 7],
        freqs: [261.63, 329.63, 392.0],
    };
    const mockState = {
        arranger: {
            totalSteps: 16,
            timeSignature: '4/4',
            measureMap: [{ start: 0, end: 16 }],
            sectionMap: [{ start: 0, end: 16, chord: mockChord }],
            stepMap: [{ start: 0, end: 16, chord: mockChord }],
            progression: [mockChord],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, volume: 0.5, style: 'smart', buffer: new Map() },
        bass: { enabled: true, volume: 0.5, style: 'smart', buffer: new Map() },
        soloist: {
            enabled: true,
            volume: 0.5,
            style: 'smart',
            buffer: new Map(),
            phraseContext: {},
            busySteps: 0,
            activeSteps: 0,
            restSteps: 0,
            sessionSteps: 0,
        },
        harmony: { enabled: true, volume: 0.5, style: 'smart', buffer: new Map() },
        groove: {
            enabled: true,
            volume: 0.5,
            measures: 1,
            instruments: [{ name: 'Kick', steps: new Array(128).fill(0) }],
        },
        playback: { bpm: 120, workerLogging: false, step: 0, intent: {}, modals: {} },
    };
    return {
        ...actual,
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Logic Worker Messaging', () => {
    let _LogicWorker;

    beforeEach(async () => {
        vi.clearAllMocks();
        _setExporting(false);
        _LogicWorker = await import('../../../public/logic-worker.js');
    });

    it('should handle START and STOP messages', () => {
        self.onmessage({ data: { type: WORKER_MSG.START } });
        expect(global.setInterval).toHaveBeenCalled();

        self.onmessage({ data: { type: WORKER_MSG.STOP } });
        expect(global.clearInterval).toHaveBeenCalled();
    });

    it('should handle SYNC_STATE message', () => {
        const state = getState();
        const newData = {
            playback: { bpm: 140 },
            groove: { volume: 0.9, instruments: [{ name: 'Kick', steps: [1, 0, 0, 0] }] },
        };
        self.onmessage({ data: { type: WORKER_MSG.SYNC_STATE, data: newData } });

        expect(state.playback.bpm).toBe(140);
        expect(state.groove.volume).toBe(0.9);
        expect(state.groove.instruments[0].steps[0]).toBe(1);
    });

    it('should handle FLUSH message', () => {
        const fullChord = {
            sectionId: 's1',
            rootMidi: 60,
            intervals: [0, 4, 7],
            freqs: [261.63, 329.63, 392.0],
        };
        const flushData = {
            step: 0,
            syncData: {
                arranger: {
                    totalSteps: 32,
                    key: 'C',
                    isMinor: false,
                    timeSignature: '4/4',
                    measureMap: [
                        { start: 0, end: 16 },
                        { start: 16, end: 32 },
                    ],
                    stepMap: [{ start: 0, end: 32, chord: fullChord }],
                },
            },
        };
        self.onmessage({ data: { type: WORKER_MSG.FLUSH, data: flushData } });

        expect(getState().arranger.totalSteps).toBe(32);
        const errorCalls = mockPostMessage.mock.calls.filter(
            (c) => c[0].type === WORKER_RESP.ERROR,
        );
        expect(errorCalls.length).toBe(0);
    });

    it('should queue messages during export', () => {
        _setExporting(true);
        self.onmessage({ data: { type: WORKER_MSG.SYNC_STATE, data: { playback: { bpm: 200 } } } });

        // State should NOT be updated yet
        expect(getState().playback.bpm).not.toBe(200);
    });

    it('should handle RESOLUTION messages', () => {
        self.onmessage({ data: { type: WORKER_MSG.RESOLUTION, data: { step: 16 } } });
        expect(mockPostMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                isResolution: true,
            }),
        );
    });

    it('should handle ERROR during processing', () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Trigger error by sending malformed data to SYNC_STATE
        self.onmessage({ data: { type: WORKER_MSG.SYNC_STATE, data: null } });

        expect(mockPostMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                type: WORKER_RESP.ERROR,
            }),
        );
        consoleSpy.mockRestore();
    });
});
