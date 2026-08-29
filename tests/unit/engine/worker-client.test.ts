// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock Worker
const mockPostMessage = vi.fn();
global.Worker = class MockWorker {
    constructor(path) {
        this.path = path;
        this.postMessage = vi.fn((message) => mockPostMessage(message));
        this.onmessage = null;
        this.onerror = null;
        this.terminate = vi.fn();
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
    getMidiExportWorker,
    getTimerWorker,
    initWorker,
    requestBuffer,
    requestResolution,
    setExportProgressHandler,
    startExport,
    startWorker,
    stopWorker,
    syncWorker,
} from '../../../public/worker-client.js';
import {
    MIDI_EXPORT_MSG,
    MIDI_EXPORT_RESP,
    WORKER_MSG,
    WORKER_RESP,
} from '../../../public/worker-types.js';

// Mock State
vi.mock('../../../public/state.js', () => {
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
            sections: [],
        },
        chords: { style: 'smart', octave: 65, density: 'standard', enabled: true, volume: 0.5 },
        bass: { style: 'smart', octave: 38, enabled: true, volume: 0.5, lastFreq: 40 },
        soloist: makeSoloistMock({
            style: 'smart',
            octave: 72,
            enabled: true,
            volume: 0.5,
            lastFreq: 500,
            mode: 'monophonic',
            sessionSteps: 0,
        }),
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
        playback: {
            bpm: 120,
            bandIntensity: 0.5,
            complexity: 0.5,
            autoIntensity: false,
            isEndingPending: true,
            songMode: false,
        },
        midi: {
            enabled: false,
            outputs: [],
            selectedOutputId: null,
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
            inputs: [],
            selectedInputId: null,
            inputEnabled: false,
            muteLocal: true,
        },
        vizState: { enabled: false },
        conductor: { form: null },
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        getSyncState: () => mockState,
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

        it('should route progress through the dedicated export worker', async () => {
            const progressSpy = vi.fn();
            setExportProgressHandler(progressSpy);
            const exportPromise = startExport({});
            const exportWorker = getMidiExportWorker();

            exportWorker.onmessage({
                data: { type: MIDI_EXPORT_RESP.PROGRESS, progress: 0.5 },
            });
            expect(progressSpy).toHaveBeenCalledWith(0.5);
            exportWorker.onmessage({
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array(),
                    filename: 'progress.mid',
                },
            });
            await exportPromise;
        });

        it('should handle ERROR messages without crashing', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            worker.onmessage({ data: { type: WORKER_RESP.ERROR, data: 'Test Error' } });
            expect(consoleSpy).toHaveBeenCalledWith('[Worker Error]', 'Test Error');
            consoleSpy.mockRestore();
        });

        it('should handle export completion, trigger download, and sanitize filenames', async () => {
            const progressSpy = vi.fn();
            setExportProgressHandler(progressSpy);
            const exportPromise = startExport({});
            const exportWorker = getMidiExportWorker();

            // Test with a dirty filename
            const completeEvent = {
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array([1, 2, 3]),
                    filename: 'dirty_name!@#$.mid',
                },
            };
            exportWorker.onmessage(completeEvent);
            await exportPromise;

            expect(progressSpy).toHaveBeenCalledWith(1.0);
            expect(global.URL.createObjectURL).toHaveBeenCalled();
            expect(mockClick).toHaveBeenCalled();
            expect(exportWorker.terminate).toHaveBeenCalledOnce();
            expect(getMidiExportWorker()).toBeNull();
            // Should clean up 'dirty_name!@#$.mid' to 'dirty_name.mid'
            // The DOM mock element stores the properties
            const linkElement = global.document.createElement.mock.results[0].value;
            expect(linkElement.download).toBe('dirty_name.mid');
        });

        it('should handle export completion with a default name', async () => {
            const exportPromise = startExport({});
            const exportWorker = getMidiExportWorker();
            exportWorker.onmessage({
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array(),
                    filename: '',
                },
            });
            await exportPromise;
            const linkElement = global.document.createElement.mock.results[0].value;
            expect(linkElement.download).toBe('ensemble-export.mid');
        });

        it('keeps live scheduler ticks flowing while export is active', async () => {
            const exportPromise = startExport({});
            const exportWorker = getMidiExportWorker();

            worker.onmessage({ data: { type: WORKER_RESP.TICK } });
            expect(schedulerSpy).toHaveBeenCalledOnce();

            exportWorker.onmessage({
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array(),
                    filename: 'ticks.mid',
                },
            });
            await exportPromise;
        });

        it('terminates and rejects a superseded export before starting the next one', async () => {
            const firstPromise = startExport({ filename: 'first' });
            const firstWorker = getMidiExportWorker();
            const secondPromise = startExport({ filename: 'second' });
            const secondWorker = getMidiExportWorker();

            await expect(firstPromise).rejects.toThrow('superseded');
            expect(firstWorker.terminate).toHaveBeenCalledOnce();
            expect(secondWorker).not.toBe(firstWorker);

            secondWorker.onmessage({
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array(),
                    filename: 'second.mid',
                },
            });
            await secondPromise;
        });

        it('rejects export errors and releases the worker', async () => {
            const progressSpy = vi.fn();
            setExportProgressHandler(progressSpy);
            const exportPromise = startExport({});
            const exportWorker = getMidiExportWorker();

            exportWorker.onmessage({
                data: { type: MIDI_EXPORT_RESP.ERROR, data: 'generation failed' },
            });

            await expect(exportPromise).rejects.toThrow('generation failed');
            expect(progressSpy).toHaveBeenLastCalledWith(0);
            expect(exportWorker.terminate).toHaveBeenCalledOnce();
            expect(getMidiExportWorker()).toBeNull();
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

        it('should start export in a dedicated worker with a detached snapshot', async () => {
            const exportPromise = startExport({ bars: 4 });
            const exportWorker = getMidiExportWorker();
            expect(String(exportWorker.path)).toContain('midi-export-worker.ts');
            expect(exportWorker.postMessage).toHaveBeenCalledWith({
                type: MIDI_EXPORT_MSG.START,
                data: {
                    state: expect.objectContaining({
                        playback: expect.objectContaining({ audio: null, isPlaying: false }),
                        arranger: expect.objectContaining({ totalSteps: 16 }),
                    }),
                    options: { bars: 4 },
                },
            });
            expect(worker.postMessage).not.toHaveBeenCalledWith(
                expect.objectContaining({ type: MIDI_EXPORT_MSG.START }),
            );

            exportWorker.onmessage({
                data: {
                    type: MIDI_EXPORT_RESP.COMPLETE,
                    blob: new Uint8Array(),
                    filename: 'worker.mid',
                },
            });
            await exportPromise;
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
                'SET_COMPLEXITY',
                'SET_AUTO_INTENSITY',
                'UPDATE_CONDUCTOR_DECISION',
                'SET_STYLE',
                'SET_VOLUME',
                'SET_SWING',
                'SET_SWING_SUB',
                'SET_SOLOIST_MODE',
                'SET_BPM',
                'SET_SESSION_TIMER',
                'TOGGLE_PLAY',
                'ARRANGER_UPDATE',
                'SET_ENDING_PENDING',
                'SET_SONG_MODE',
            ];

            for (const action of actions) {
                mockPostMessage.mockClear();
                // We provide generic payloads that satisfy the switch logic
                let payload = {};
                if (['SET_STYLE', 'SET_VOLUME'].includes(action)) {
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

        it('should push isEndingPending and songMode deltas (#993)', () => {
            // The worker reads isEndingPending for ending-anticipation gestures
            // (harmony thickening, drum final-measure flourish) — before #993 these
            // two actions fell through the switch with no delta case, so the
            // anticipation window ran on a stale value.
            mockPostMessage.mockClear();
            syncWorker('SET_ENDING_PENDING');
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WORKER_MSG.SYNC_STATE,
                    data: expect.objectContaining({
                        playback: { isEndingPending: true },
                    }),
                }),
            );

            mockPostMessage.mockClear();
            syncWorker('SET_SONG_MODE');
            expect(mockPostMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: WORKER_MSG.SYNC_STATE,
                    data: expect.objectContaining({
                        playback: { songMode: false },
                    }),
                }),
            );
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
