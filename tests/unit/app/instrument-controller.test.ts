// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as InstrumentController from '../../../public/controllers/instrument-controller.js';
import * as ChordsEngine from '../../../public/engine/chords-engine.js';
import * as Engine from '../../../public/engine/engine.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);
const mockTrack = vi.hoisted(() => vi.fn());

vi.mock('../../../public/telemetry.js', () => ({
    track: mockTrack,
}));

vi.mock('../../../public/engine/engine.js', () => ({
    killAllPianoNotes: vi.fn(),
    killBassBus: vi.fn(),
    killBassNote: vi.fn(),
    killChordBus: vi.fn(),
    killDrumBus: vi.fn(),
    killDrumNote: vi.fn(),
    killHarmonyBus: vi.fn(),
    killHarmonyNote: vi.fn(),
    releaseHarmonyVoicing: vi.fn(),
    killSoloistBus: vi.fn(),
    killSoloistNote: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));

vi.mock('../../../public/engine/synth-drums.js', () => ({
    loadDrumKit: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { step: 10, bpm: 120, bandIntensity: 0.5, complexity: 0.5, autoIntensity: false },
        groove: {
            genreFeel: 'Rock',
            enabled: true,
            volume: 0.5,
            swing: 0,
            swingSub: '8th',
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
        soloist: makeSoloistMock({
            style: 'scalar',
            octave: 4,
            enabled: true,
            lastFreq: null,
            lastPlayedFreq: 440,
            volume: 0.5,
            mode: 'auto',
            sessionSteps: 0,
            buffer: { clear: vi.fn(), set: vi.fn(), size: 0, delete: vi.fn() },
        }),
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
        state.chords.enabled = true;
        state.bass.enabled = true;
        state.soloist.enabled = true;
        state.harmony.enabled = true;
        state.groove.enabled = true;
        state.vizState.enabled = true;

        // Reset buffers
        state.bass.buffer.size = 0;
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
        it('should clear all buffers and silence every lane', () => {
            const state = getState();
            state.bass.buffer.size = 1;

            InstrumentController.flushBuffers();

            expect(state.bass.buffer.clear).toHaveBeenCalled();
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killBassNote).toHaveBeenCalled();
            expect(Engine.killSoloistNote).toHaveBeenCalled();
            expect(Engine.killDrumNote).toHaveBeenCalled();
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
            expect(mockTrack).toHaveBeenCalledWith('instrument_toggled', {
                instrument: 'chords',
            });
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

        // #1313 — chord voicings are baked at parse time and depend on whether a bass
        // line is sounding, so a bass toggle must re-voice, and the flush must cover every
        // re-voiced lane.
        it('re-voices the progression on a bass toggle, then flushes the re-voiced lanes', () => {
            InstrumentController.togglePower('bass');

            const order = (fn) => fn.mock.invocationCallOrder[0];
            expect(ChordsEngine.validateProgression).toHaveBeenCalledTimes(1);
            // The WHOLE state tree — togglePower's local lane map is also called
            // `stateMap`, and passing that one throws on `arranger.scorePlan`.
            const [passedState] = ChordsEngine.validateProgression.mock.calls[0];
            expect(passedState.arranger).toBe(getState().arranger);
            expect(passedState.arranger).toBeDefined();
            expect(order(dispatch)).toBeLessThan(order(ChordsEngine.validateProgression));
            expect(order(ChordsEngine.validateProgression)).toBeLessThan(
                order(Engine.killAllPianoNotes),
            );
            // The comp and pads read the re-voiced progression too...
            expect(Engine.killAllPianoNotes).toHaveBeenCalled();
            expect(Engine.killHarmonyNote).toHaveBeenCalled();
            expect(Engine.killBassNote).toHaveBeenCalled();
            // ...but the time must not hiccup: drums and soloist ring through.
            expect(Engine.killDrumNote).not.toHaveBeenCalled();
            expect(Engine.killSoloistNote).not.toHaveBeenCalled();
        });

        it('does not re-voice the progression for a non-bass lane', () => {
            InstrumentController.togglePower('chords');
            expect(ChordsEngine.validateProgression).not.toHaveBeenCalled();
        });

        it('should toggle viz state', () => {
            InstrumentController.togglePower('viz');
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
                module: 'vizState',
                param: 'enabled',
                value: false,
            });
            expect(mockTrack).not.toHaveBeenCalled();
        });

        it('should handle chord/harmony alias names', () => {
            InstrumentController.togglePower('harmonies');
            expect(dispatch).toHaveBeenCalledWith(
                ACTIONS.SET_PARAM,
                expect.objectContaining({
                    module: 'harmony',
                }),
            );
            expect(mockTrack).toHaveBeenCalledWith('instrument_toggled', {
                instrument: 'harmony',
            });
        });
    });
});
