/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Engine from '../../../public/engine/engine.js';
import * as InstrumentController from '../../../public/instrument-controller.js';
import * as Persistence from '../../../public/persistence.js';
import { dispatch, getState } from '../../../public/state.js';
import * as UI from '../../../public/ui.js';
import * as WorkerClient from '../../../public/worker-client.js';

// Mock dependencies
vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(),
});

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

vi.mock('../../../public/worker-client.js', () => ({
    flushWorker: vi.fn(),
    syncWorker: vi.fn(),
}));

vi.mock('../../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: vi.fn(),
}));

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
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
        },
        arranger: {
            timeSignature: '4/4',
            progression: [],
            stepMap: [],
            sectionMap: [],
            totalSteps: 16,
            key: 'C',
            isMinor: false,
        },
        chords: {
            style: 'smart',
            octave: 65,
            density: 'standard',
            enabled: true,
            volume: 0.5,
            buffer: new Map(),
        },
        bass: {
            style: 'smart',
            octave: 38,
            enabled: true,
            volume: 0.5,
            lastFreq: null,
            lastPlayedFreq: 40,
            buffer: new Map(),
        },
        soloist: {
            style: 'smart',
            octave: 72,
            enabled: true,
            volume: 0.5,
            lastFreq: null,
            lastPlayedFreq: null,
            mode: 'monophonic',
            sessionSteps: 0,
            tradeMode: 'manual',
            buffer: new Map(),
        },
        harmony: {
            style: 'smart',
            octave: 60,
            enabled: true,
            volume: 0.4,
            complexity: 0.5,
            buffer: new Map(),
        },
        vizState: { enabled: true },
    };
    return {
        ...actual,
        stateMap: mockState,
        getState: () => mockState,
        dispatch: vi.fn((action, _payload) => {
            if (action === 'SET_PARAM' || action === 'SET_ACTIVE_MEASURE') {
                // simple local mock logic if needed, but mostly we assert on dispatch
            }
        }),
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
    });

    describe('switchMeasure', () => {
        it('should dispatch SET_ACTIVE_MEASURE if changing measure', () => {
            InstrumentController.switchMeasure(1);
            expect(dispatch).toHaveBeenCalledWith('SET_ACTIVE_MEASURE', 1);
        });

        it('should not dispatch if measure is the same', () => {
            InstrumentController.switchMeasure(0);
            expect(dispatch).not.toHaveBeenCalled();
        });
    });

    describe('updateMeasures', () => {
        it('should dispatch SET_PARAM and save state', () => {
            InstrumentController.updateMeasures('4');
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'groove',
                param: 'measures',
                value: 4,
            });
            expect(Persistence.saveCurrentState).toHaveBeenCalled();
        });

        it('should reset currentMeasure if it exceeds the new limit', () => {
            const state = getState();
            state.groove.currentMeasure = 3;
            InstrumentController.updateMeasures('2');
            expect(dispatch).toHaveBeenCalledWith('SET_ACTIVE_MEASURE', 0);
        });
    });

    describe('loadDrumPreset', () => {
        it('should load a preset and update groove state', () => {
            InstrumentController.loadDrumPreset('Basic Rock');
            const state = getState();
            expect(state.groove.lastDrumPreset).toBe('Basic Rock');
            expect(dispatch).toHaveBeenCalledWith('DRUM_PRESET_LOADED');
            // Assuming Basic Rock has swing 0
            expect(state.groove.swing).toBe(0);
        });
    });

    describe('saveDrumPreset', () => {
        it('should prompt for name and save to localStorage', () => {
            window.prompt = vi.fn().mockReturnValue('My Cool Beat');
            localStorage.getItem.mockReturnValue('[]');
            localStorage.setItem.mockClear();

            InstrumentController.saveDrumPreset();

            expect(window.prompt).toHaveBeenCalled();
            expect(localStorage.setItem).toHaveBeenCalled();
            expect(UI.showToast).toHaveBeenCalledWith('Saved "My Cool Beat" to drum library');

            delete window.prompt;
        });

        it('should abort if prompt is cancelled', () => {
            window.prompt = vi.fn().mockReturnValue(null);
            localStorage.setItem.mockClear();

            InstrumentController.saveDrumPreset();

            expect(localStorage.setItem).not.toHaveBeenCalled();
            delete window.prompt;
        });
    });

    describe('cloneMeasure', () => {
        it('should clone the current measure to all other measures', () => {
            const state = getState();
            state.groove.measures = 2;
            state.groove.currentMeasure = 0;
            state.groove.instruments[0].steps[0] = 1; // Set a kick on step 0

            InstrumentController.cloneMeasure();

            expect(state.groove.instruments[0].steps[16]).toBe(1); // Assuming 16 spm, step 16 is beat 1 of measure 2
            expect(dispatch).toHaveBeenCalledWith('DRUM_MEASURE_CLONED');
            expect(UI.showToast).toHaveBeenCalled();
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

        it('should reset taps if too much time passes', () => {
            vi.advanceTimersByTime(4000); // Clear state from previous test (performance.now() resets to 0, old array ends at 1500)
            const setBpmRef = vi.fn();
            InstrumentController.handleTap(setBpmRef);
            vi.advanceTimersByTime(3000); // Wait 3s
            InstrumentController.handleTap(setBpmRef);
            // Only 1 tap in new series, so setBpmRef should not be called with a calculation
            expect(setBpmRef).not.toHaveBeenCalled();
        });
    });

    describe('flushBuffers', () => {
        it('should clear all buffers and call flushWorker with full syncData', () => {
            const state = getState();
            state.bass.buffer.set(1, {});

            InstrumentController.flushBuffers();

            expect(state.bass.buffer.size).toBe(0);
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killBassNote).toHaveBeenCalled();
            expect(Engine.killSoloistNote).toHaveBeenCalled();
            expect(Engine.killDrumNote).toHaveBeenCalled();

            expect(Engine.killChordBus).toHaveBeenCalled();
            expect(Engine.killBassBus).toHaveBeenCalled();
            expect(Engine.killSoloistBus).toHaveBeenCalled();
            expect(Engine.killDrumBus).toHaveBeenCalled();

            expect(WorkerClient.flushWorker).toHaveBeenCalledWith(10, expect.any(Object), 0);
            expect(Engine.restoreGains).toHaveBeenCalled();
        });
    });

    describe('togglePower', () => {
        it('should toggle chords and flush specific buffer', () => {
            InstrumentController.togglePower('chords');
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'chords',
                param: 'enabled',
                value: false,
            });
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killChordBus).toHaveBeenCalled();
            expect(WorkerClient.syncWorker).toHaveBeenCalled();
        });

        it('should toggle viz state', () => {
            InstrumentController.setInstrumentControllerRefs(null);

            InstrumentController.togglePower('viz');

            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'vizState',
                param: 'enabled',
                value: false,
            });
        });

        it('should handle soloist specific phrasing resets when turning on', () => {
            const state = getState();
            state.soloist.enabled = false; // Currently off

            InstrumentController.togglePower('soloist');

            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'soloist',
                param: 'isWaitingForEntry',
                value: true,
            });
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'soloist',
                param: 'isResting',
                value: true,
            });
        });

        it('should transfer lastPlayedFreq to lastFreq for bass on flush', () => {
            const state = getState();
            state.bass.lastPlayedFreq = 55;
            state.bass.lastFreq = null;

            InstrumentController.togglePower('bass');
            // Bass buffer flush logic
            expect(state.bass.lastFreq).toBe(55);
        });
    });
});
