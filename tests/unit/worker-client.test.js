/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Worker
const mockPostMessage = vi.fn();
global.Worker = class MockWorker {
    constructor() {
        this.postMessage = mockPostMessage;
        this.onmessage = null;
    }
};

// Mock URL and DOM elements
global.URL.createObjectURL = vi.fn(() => 'blob:mock');
global.URL.revokeObjectURL = vi.fn();
const mockClick = vi.fn();
global.document.createElement = vi.fn(() => ({
    href: '',
    download: '',
    click: mockClick,
}));

import {
    flushWorker,
    getTimerWorker,
    initWorker,
    requestBuffer,
    requestResolution,
    setExportProgressHandler,
    startExport,
    startWorker,
    stopWorker,
    syncWorker,
} from '../../public/worker-client.js';
import { WORKER_MSG, WORKER_RESP } from '../../public/worker-types.js';

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        arranger: {
            progression: [],
            stepMap: [],
            sectionMap: [],
            totalSteps: 16,
            key: 'C',
            isMinor: false,
            timeSignature: '4/4',
            grouping: [2, 2],
        },
        chords: { style: 'smart', octave: 65, density: 'standard', enabled: true, volume: 0.5 },
        bass: { style: 'smart', octave: 38, enabled: true, volume: 0.5, lastFreq: 40 },
        soloist: {
            style: 'smart',
            octave: 72,
            enabled: true,
            volume: 0.5,
            lastFreq: 500,
            mode: 'monophonic',
            sessionSteps: 0,
        },
        harmony: { style: 'smart', octave: 60, enabled: true, volume: 0.4, complexity: 0.5 },
        groove: {
            genreFeel: 'Rock',
            enabled: true,
            volume: 0.5,
            measures: 1,
            swing: 0,
            swingSub: '8th',
            instruments: [{ name: 'Kick', steps: [], muted: false }],
        },
        playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5, autoIntensity: false },
        midi: {
            chordsChannel: 1,
            bassChannel: 2,
            soloistChannel: 3,
            harmonyChannel: 4,
            drumsChannel: 10,
            chordsOctave: 0,
            bassOctave: 0,
            soloistOctave: 0,
            harmonyOctave: 0,
            drumsOctave: 0,
            velocitySensitivity: 1.0,
        },
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
    };
});

describe('Worker Client', () => {
    let worker;
    let schedulerSpy;
    let notesSpy;

    beforeEach(async () => {
        vi.clearAllMocks();

        schedulerSpy = vi.fn();
        notesSpy = vi.fn();

        initWorker(schedulerSpy, notesSpy);
        worker = getTimerWorker();
    });

    describe('Message Handlers', () => {
        it('should handle TICK messages and call scheduler request handler', () => {
            worker.onmessage({ data: { type: WORKER_RESP.TICK } });
            expect(schedulerSpy).toHaveBeenCalled();
        });

        it('should handle NOTES messages and call notes received handler', () => {
            const notesData = {
                type: WORKER_RESP.NOTES,
                notes: [],
                requestTimestamp: 123,
                workerProcessTime: 5,
                isResolution: true,
            };
            worker.onmessage({ data: notesData });
            expect(notesSpy).toHaveBeenCalledWith([], 123, 5, true);
        });

        it('should handle EXPORT_PROGRESS messages', () => {
            const progressSpy = vi.fn();
            setExportProgressHandler(progressSpy);

            worker.onmessage({ data: { type: WORKER_RESP.EXPORT_PROGRESS, progress: 0.5 } });
            expect(progressSpy).toHaveBeenCalledWith(0.5);
        });

        it('should handle ERROR messages without crashing', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            worker.onmessage({ data: { type: WORKER_RESP.ERROR, data: 'Test Error' } });
            expect(consoleSpy).toHaveBeenCalledWith('[Worker Error]', 'Test Error');
            consoleSpy.mockRestore();
        });

        it('should handle EXPORT_COMPLETE messages, trigger download, and sanitize filenames', () => {
            const progressSpy = vi.fn();
            setExportProgressHandler(progressSpy);

            // Test with a dirty filename
            const completeEvent = {
                data: {
                    type: WORKER_RESP.EXPORT_COMPLETE,
                    blob: new Blob(['test'], { type: 'audio/midi' }),
                    filename: 'dirty_name!@#$.mid',
                },
            };
            worker.onmessage(completeEvent);

            expect(progressSpy).toHaveBeenCalledWith(1.0);
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(mockClick).toHaveBeenCalled();
            // Should clean up 'dirty_name!@#$.mid' to 'dirty_name.mid'
            // The DOM mock element stores the properties
            const linkElement = global.document.createElement.mock.results[0].value;
            expect(linkElement.download).toBe('dirty_name.mid');
        });

        it('should handle EXPORT_COMPLETE with default name if filename is empty', () => {
            worker.onmessage({ data: { type: WORKER_RESP.EXPORT_COMPLETE, blob: new Blob() } });
            const linkElement = global.document.createElement.mock.results[0].value;
            expect(linkElement.download).toBe('ensemble-export.mid');
        });
    });

    describe('Post Message Wrappers', () => {
        it('should send start message', () => {
            startWorker();
            expect(mockPostMessage).toHaveBeenCalledWith({ type: WORKER_MSG.START });
        });

        it('should send stop message', () => {
            stopWorker();
            expect(mockPostMessage).toHaveBeenCalledWith({ type: WORKER_MSG.STOP });
        });

        it('should send export message', () => {
            startExport({ bars: 4 });
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: WORKER_MSG.EXPORT,
                data: { bars: 4 },
            });
        });

        it('should send request buffer message', () => {
            vi.spyOn(performance, 'now').mockReturnValue(100);
            requestBuffer(16);
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: WORKER_MSG.REQUEST_BUFFER,
                data: { step: 16, requestTimestamp: 100 },
            });
        });

        it('should send request resolution message', () => {
            vi.spyOn(performance, 'now').mockReturnValue(200);
            requestResolution(32);
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: WORKER_MSG.RESOLUTION,
                data: { step: 32, requestTimestamp: 200 },
            });
        });

        it('should send flush message with data', () => {
            vi.spyOn(performance, 'now').mockReturnValue(300);
            flushWorker(0, { myData: true });
            expect(mockPostMessage).toHaveBeenCalledWith({
                type: WORKER_MSG.FLUSH,
                data: { step: 0, syncData: { myData: true }, requestTimestamp: 300 },
            });
        });
    });

    describe('syncWorker', () => {
        it('should send full sync data when no action is provided', () => {
            syncWorker();
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WORKER_MSG.SYNC_STATE,
                    data: expect.objectContaining({
                        arranger: expect.any(Object),
                        chords: expect.any(Object),
                        bass: expect.any(Object),
                        soloist: expect.any(Object),
                        harmony: expect.any(Object),
                        groove: expect.any(Object),
                        playback: expect.any(Object),
                        midi: expect.any(Object),
                    }),
                }),
            );
        });

        it('should send partial sync data based on action', () => {
            const actions = [
                'SET_BAND_INTENSITY',
                'UPDATE_HB',
                'UPDATE_SB',
                'SET_GENRE_FEEL',
                'SET_MODAL_OPEN',
                'SET_COMPLEXITY',
                'SET_AUTO_INTENSITY',
                'UPDATE_CONDUCTOR_DECISION',
                'SET_STYLE',
                'SET_VOLUME',
                'SET_OCTAVE',
                'SET_SWING',
                'SET_SWING_SUB',
                'SET_SESSION_STEPS',
                'SET_SOLOIST_MODE',
                'SET_BPM',
                'IMPORT_MUSICXML',
                'SET_SESSION_TIMER',
                'TOGGLE_PLAY',
                'ARRANGER_UPDATE',
            ];

            for (const action of actions) {
                mockPostMessage.mockClear();
                // We provide generic payloads that satisfy the switch logic
                let payload = {};
                if (action === 'SET_MODAL_OPEN') {
                    payload = { modal: 'performance', open: true };
                }
                if (['SET_STYLE', 'SET_VOLUME', 'SET_OCTAVE'].includes(action)) {
                    payload = { module: 'soloist', style: 'rock', value: 1 };
                }

                syncWorker(action, payload);

                expect(mockPostMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: WORKER_MSG.SYNC_STATE,
                        data: expect.any(Object),
                    }),
                );
            }
        });

        it('should handle SET_PARAM action', () => {
            mockPostMessage.mockClear();
            syncWorker('SET_PARAM', { module: 'soloist', param: 'drive', value: 0.5 });

            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WORKER_MSG.SYNC_STATE,
                    data: expect.objectContaining({
                        soloist: { drive: 0.5 },
                    }),
                }),
            );
        });
    });
});
