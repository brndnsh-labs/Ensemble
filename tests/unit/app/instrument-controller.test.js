/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Engine from '../../../public/engine/engine.js';
import * as InstrumentController from '../../../public/instrument-controller.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';
import * as WorkerClient from '../../../public/worker-client.js';

vi.mock('../../../public/engine/engine.js', () => ({
    killAllPianoNotes: vi.fn(),
    killBassBus: vi.fn(),
    killBassNote: vi.fn(),
    killChordBus: vi.fn(),
    killDrumBus: vi.fn(),
    killDrumNote: vi.fn(),
    killHarmonyBus: vi.fn(),
    killHarmonyNote: vi.fn(),
    killSoloistBus: vi.fn(),
    killSoloistNote: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/engine/synth-drums.js', () => ({
    loadDrumKit: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../public/worker-client.js', () => ({
    flushWorker: vi.fn(),
    syncWorker: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { step: 10, bpm: 120, bandIntensity: 0.5, complexity: 0.5, autoIntensity: false },
        groove: {
            currentMeasure: 0,
            measures: 1,
            genreFeel: 'Rock',
            enabled: true,
            volume: 0.5,
            swing: 0,
            swingSub: '8th',
            lastDrumPreset: null,
            instruments: [
                { name: 'Kick', steps: new Array(128).fill(0), muted: false },
                { name: 'Snare', steps: new Array(128).fill(0), muted: false },
            ],
            buffer: { clear: vi.fn() },
        },
        arranger: {
            timeSignature: '4/4',
            progression: [],
            stepMap: [],
            sectionMap: [],
            totalSteps: 128,
            key: 'C',
            isMinor: false,
        },
        chords: {
            style: 'rhythmic',
            octave: 4,
            density: 1,
            enabled: true,
            volume: 0.5,
            buffer: { clear: vi.fn(), set: vi.fn(), size: 0, delete: vi.fn() },
        },
        bass: {
            style: 'simple',
            octave: 2,
            enabled: true,
            lastFreq: null,
            lastPlayedFreq: 55,
            volume: 0.5,
            buffer: { clear: vi.fn(), set: vi.fn(), size: 0, delete: vi.fn() },
        },
        soloist: {
            style: 'scalar',
            octave: 4,
            enabled: true,
            lastFreq: null,
            lastPlayedFreq: 440,
            volume: 0.5,
            mode: 'auto',
            sessionSteps: 0,
            buffer: { clear: vi.fn(), set: vi.fn(), size: 0, delete: vi.fn() },
        },
        harmony: {
            style: 'smart',
            octave: 4,
            enabled: true,
            volume: 0.5,
            complexity: 0.5,
            buffer: { clear: vi.fn(), set: vi.fn(), size: 0, delete: vi.fn() },
        },
        vizState: { enabled: true },
        midi: {},
    };

    return {
        getState: () => mockState,
        getSyncState: vi.fn(() => ({})),
        stateMap: mockState,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_PARAM') {
                const { module, param, value } = payload;
                if (mockState[module]) {
                    mockState[module][param] = value;
                }
            } else if (action === 'SET_ACTIVE_MEASURE') {
                mockState.groove.currentMeasure = payload;
            }
        }),
        subscribe: vi.fn(),
    };
});

describe('Instrument Controller', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        const state = getState();
        state.groove.currentMeasure = 0;
        state.groove.measures = 1;
        state.chords.enabled = true;
        state.bass.enabled = true;
        state.soloist.enabled = true;
        state.harmony.enabled = true;
        state.groove.enabled = true;
        state.vizState.enabled = true;

        // Reset buffers
        state.bass.buffer.size = 0;
    });

    describe('switchMeasure', () => {
        it('should dispatch SET_ACTIVE_MEASURE if changing measure', () => {
            InstrumentController.switchMeasure(1);
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_ACTIVE_MEASURE, 1);
        });

        it('should not dispatch if measure is the same', () => {
            InstrumentController.switchMeasure(0);
            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('loadDrumPreset', () => {
        it('should load a preset and update groove state', async () => {
            await InstrumentController.loadDrumPreset('Basic Rock');
            const state = getState();
            expect(state.groove.lastDrumPreset).toBe('Basic Rock');
            expect(dispatch).toHaveBeenCalledWith('DRUM_PRESET_LOADED');
        });
    });

    describe('handleTap', () => {
        it('should calculate BPM based on tap intervals', () => {
            const setBpmRef = vi.fn();

            // Simulate 4 taps at 500ms intervals (120 BPM)
            InstrumentController.handleTap(setBpmRef);
            vi.advanceTimersByTime(500);
            InstrumentController.handleTap(setBpmRef);
            vi.advanceTimersByTime(500);
            InstrumentController.handleTap(setBpmRef);
            vi.advanceTimersByTime(500);
            InstrumentController.handleTap(setBpmRef);

            expect(setBpmRef).toHaveBeenCalledWith(120);
        });
    });

    describe('flushBuffers', () => {
        it('should clear all buffers and call flushWorker', () => {
            const state = getState();
            state.bass.buffer.size = 1;

            InstrumentController.flushBuffers();

            expect(state.bass.buffer.clear).toHaveBeenCalled();
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killBassNote).toHaveBeenCalled();
            expect(Engine.killSoloistNote).toHaveBeenCalled();
            expect(Engine.killDrumNote).toHaveBeenCalled();

            expect(WorkerClient.flushWorker).toHaveBeenCalled();
            expect(Engine.restoreGains).toHaveBeenCalled();
        });
    });

    describe('togglePower', () => {
        it('should toggle module enabled state', () => {
            InstrumentController.togglePower('chords');
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
                module: 'chords',
                param: 'enabled',
                value: false,
            });
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killChordBus).toHaveBeenCalled();
            expect(WorkerClient.syncWorker).toHaveBeenCalled();
        });

        it('should handle soloist specific phrasing resets when turning on', () => {
            const state = getState();
            state.soloist.enabled = false;

            InstrumentController.togglePower('soloist');

            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'isWaitingForEntry',
                    value: true,
                }),
            );
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'soloist',
                    param: 'isResting',
                    value: true,
                }),
            );
        });

        it('should toggle viz state', () => {
            InstrumentController.togglePower('viz');
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
                module: 'vizState',
                param: 'enabled',
                value: false,
            });
        });

        it('should handle chord/harmony alias names', () => {
            InstrumentController.togglePower('harmonies');
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'harmony',
                }),
            );
        });
    });
});
