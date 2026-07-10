// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

// Mock state
vi.mock('../../../public/state.js', () => {
    const playback = { bpm: 100, bandIntensity: 0.5, audio: { currentTime: 0 } };
    const arranger = {
        progression: [],
        stepMap: [],
        sectionMap: [],
        totalSteps: 0,
        key: 'C',
        isMinor: false,
        timeSignature: '4/4',
    };
    const chords = { enabled: true, style: 'smart', octave: 0, density: 0.5, volume: 1.0 };
    const bass = { enabled: true, style: 'basic', octave: 0, volume: 1.0 };
    const soloist = makeSoloistMock({
        enabled: true,
        style: 'jazz',
        octave: 0,
        volume: 1.0,
        mode: 'monophonic',
        sessionSteps: 0,
    });
    const harmony = { enabled: true, style: 'pad', octave: 0, volume: 1.0, complexity: 0.5 };
    const groove = {
        enabled: true,
        genreFeel: 'Rock',
        swing: 0,
        swingSub: '8th',
        instruments: [{ name: 'Kick', steps: [1, 0, 0, 0], muted: false }],
        volume: 1.0,
    };
    const vizState = {};
    const midi = {};

    const stateMap = {
        playback,
        arranger,
        chords,
        bass,
        soloist,
        harmony,
        groove,
        vizState,
        midi,
    };

    return {
        ...stateMap,
        stateMap: stateMap,
        getState: () => stateMap,
        getSyncState: () => stateMap,
        dispatch: vi.fn(),
        subscribe: vi.fn(),
    };
});

import { getState } from '../../../public/state.js';

const { arranger, playback, groove } = getState();

// We need to import syncWorker and initWorker AFTER we mock the global Worker
let lastWorkerInstance = null;
global.Worker = class MockWorker {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.postMessage = vi.fn();
        lastWorkerInstance = this;
    }
};

const { syncWorker, initWorker, getTimerWorker } = await import('../../../public/worker-client.js');

describe('Worker Synchronization Integrity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lastWorkerInstance = null;
        initWorker();
    });

    it('should include all critical state properties in the sync message', () => {
        // Setup state
        playback.bpm = 120;
        playback.bandIntensity = 0.7;
        groove.genreFeel = 'Jazz';
        groove.swing = 50;
        arranger.key = 'F';

        syncWorker();

        expect(lastWorkerInstance).not.toBeNull();
        const call = lastWorkerInstance.postMessage.mock.calls[0][0];

        expect(call.type).toBe('syncState');
        const data = call.data;

        // Verify Arranger
        expect(data.arranger.key).toBe('F');

        // Verify Context
        expect(data.playback.bpm).toBe(120);
        expect(data.playback.bandIntensity).toBe(0.7);

        // Verify Groove
        expect(data.groove.genreFeel).toBe('Jazz');
        expect(data.groove.swing).toBe(50);

        // Verify Instruments
        expect(data.chords).toBeDefined();
        expect(data.bass).toBeDefined();
        expect(data.soloist).toBeDefined();
    });

    it('should correctly deep-copy drum instrument steps to avoid reference sharing', () => {
        groove.instruments[0].steps[0] = 1;

        syncWorker();

        const data = getTimerWorker().postMessage.mock.calls[0][0].data;
        const sentSteps = data.groove.instruments[0].steps;

        // Modify local state
        groove.instruments[0].steps[0] = 2;

        // Sent steps should remain 1 (deep copy check)
        expect(sentSteps[0]).toBe(1);
    });

    it('should trigger onNotes callback when worker sends notes', () => {
        const onNotes = vi.fn();
        initWorker(null, onNotes);

        const mockNotes = [{ midi: 60, step: 0, module: 'bass' }];
        getTimerWorker().onmessage({ data: { type: 'notes', notes: mockNotes } });

        expect(onNotes).toHaveBeenCalledWith(mockNotes, undefined, undefined, undefined);
    });

    it('should handle delayed messages without crashing (Latency Simulation)', async () => {
        const onNotes = vi.fn();
        initWorker(null, onNotes);

        const mockNotes = [{ midi: 60, step: 0, module: 'bass' }];

        // Simulate a 100ms delay in the worker response
        await new Promise((resolve) => {
            setTimeout(() => {
                getTimerWorker().onmessage({ data: { type: 'notes', notes: mockNotes } });
                resolve();
            }, 100);
        });

        expect(onNotes).toHaveBeenCalledWith(mockNotes, undefined, undefined, undefined);
    });
});
