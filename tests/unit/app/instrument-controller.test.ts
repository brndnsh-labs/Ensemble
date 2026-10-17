// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as InstrumentController from '../../../public/controllers/instrument-controller.js';
import * as Engine from '../../../public/engine/engine.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/engine/engine.js', () => ({
    killAllPianoNotes: vi.fn(),
    killBassBus: vi.fn(),
    killBassNote: vi.fn(),
    killChordBus: vi.fn(),
    killDrumBus: vi.fn(),
    killDrumNote: vi.fn(),
    killSoloistBus: vi.fn(),
    killSoloistNote: vi.fn(),
    restoreGains: vi.fn(),
}));

vi.mock('../../../public/engine/synth-drums.js', () => ({
    loadDrumKit: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../public/state.js', () => {
    const mockState = {
        playback: { bpm: 120, bandIntensity: 0.5, complexity: 0.5, autoIntensity: false },
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
            key: 'C',
            isMinor: false,
        },
        chords: {
            style: 'rhythmic',
            octave: 4,
            density: 1,
            enabled: true,
            volume: 0.5,
        },
        bass: {
            style: 'simple',
            octave: 2,
            enabled: true,
            volume: 0.5,
        },
        soloist: makeSoloistMock({
            enabled: true,
            volume: 0.5,
            mode: 'auto',
        }),
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
        state.groove.enabled = true;
    });

    describe('flushBuffers', () => {
        it('should silence every lane', () => {
            InstrumentController.flushBuffers();

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
        });

        it('silences only the bass voices when the bass is toggled', () => {
            InstrumentController.togglePower('bass');

            expect(Engine.killBassNote).toHaveBeenCalled();
            expect(Engine.killBassBus).toHaveBeenCalled();
            // The comp is voiced by the band, not baked from which lanes sound (#1650), and the
            // time must not hiccup: chords, drums and soloist ring through.
            expect(Engine.killAllPianoNotes).not.toHaveBeenCalled();
            expect(Engine.killDrumNote).not.toHaveBeenCalled();
            expect(Engine.killSoloistNote).not.toHaveBeenCalled();
        });

        it('toggles the soloist lane and silences only its voices', () => {
            InstrumentController.togglePower('soloist');
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
                module: 'soloist',
                param: 'enabled',
                value: false,
            });
            expect(getState().soloist.enabled).toBe(false);
            expect(Engine.killSoloistNote).toHaveBeenCalled();
            expect(Engine.killAllPianoNotes).not.toHaveBeenCalled();
        });
    });
});
