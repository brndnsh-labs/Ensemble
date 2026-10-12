// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { syncBusReverbSend, syncBusVolume } from '../../../public/engine/engine.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../../public/engine/instrument-registry.js';
import { handleEffects, resolveAutoVoices } from '../../../public/state/state-effects.js';
import { ACTIONS } from '../../../public/types.js';

// Mock all the imported functions
vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));
vi.mock('../../../public/engine/engine.js', () => ({
    restoreGains: vi.fn(),
    syncBusReverbSend: vi.fn(),
    syncBusVolume: vi.fn(),
}));

describe('State Effects Handler', () => {
    let stateMap;
    let dispatch;

    beforeEach(() => {
        vi.clearAllMocks();
        stateMap = {
            playback: { isPlaying: false, theme: 'dark' },
        };
        dispatch = vi.fn();
    });

    it('moves only the Auto lanes when the genre changes (#1000)', () => {
        __resetPackCacheForTest();
        markPackInstalled('upright-bass', true);
        stateMap = {
            playback: { isPlaying: false },
            chords: { autoSound: false, voice: 'pack:clavinet' },
            bass: { autoSound: true, voice: 'synth' },
            soloist: {
                autoSound: false,
                voice: 'synth',
                autoMode: false,
                mode: 'monophonic',
            },
            groove: { autoSound: false, voice: 'synth' },
        };

        resolveAutoVoices(stateMap, 'Jazz', dispatch);

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'bass',
            voice: 'pack:upright-bass',
            auto: true,
        });
        expect(dispatch).not.toHaveBeenCalledWith(
            ACTIONS.SET_INSTRUMENT_VOICE,
            expect.objectContaining({ module: 'chords' }),
        );
    });

    describe('genre auto-follow (#675)', () => {
        beforeEach(() => {
            __resetPackCacheForTest();
            // Bass in Auto mode, currently on synth; other lanes absent (skipped).
            stateMap.bass = { autoSound: true, voice: 'synth' };
        });

        it('switches an Auto lane to the genre-mapped pack when installed', () => {
            markPackInstalled('upright-bass', true);
            resolveAutoVoices(stateMap, 'Jazz', dispatch);
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'bass',
                voice: 'pack:upright-bass',
                auto: true,
            });
        });

        it('leaves a pinned lane (autoSound:false) untouched', () => {
            stateMap.bass = { autoSound: false, voice: 'synth' };
            markPackInstalled('upright-bass', true);
            resolveAutoVoices(stateMap, 'Jazz', dispatch);
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('does not write when the mapped sound already matches (no churn)', () => {
            markPackInstalled('upright-bass', true);
            stateMap.bass = { autoSound: true, voice: 'pack:upright-bass' };
            resolveAutoVoices(stateMap, 'Jazz', dispatch);
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('falls back to synth (no auto-download) when the mapped pack is not installed', () => {
            // Auto lane currently pinned-by-prior-state to the upright pack, but it
            // is no longer installed → auto-follow recovers it to synth.
            stateMap.bass = { autoSound: true, voice: 'pack:upright-bass' };
            resolveAutoVoices(stateMap, 'Jazz', dispatch);
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'bass',
                voice: 'synth',
                auto: true,
            });
        });

        it('uses synth for a genre with no bass mapping', () => {
            markPackInstalled('upright-bass', true);
            stateMap.bass = { autoSound: true, voice: 'pack:upright-bass' };
            resolveAutoVoices(stateMap, 'Funk', dispatch);
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'bass',
                voice: 'synth',
                auto: true,
            });
        });
    });

    it('should re-send the bus reverb on SET_REVERB action (#688)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects({ type: ACTIONS.SET_REVERB, payload: payload }, stateMap, { dispatch });
        expect(syncBusReverbSend).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-send the bus reverb on SET_REVERB with no module', () => {
        handleEffects({ type: ACTIONS.SET_REVERB, payload: { value: 0.6 } }, stateMap, {
            dispatch,
        });
        expect(syncBusReverbSend).not.toHaveBeenCalled();
    });

    it('should re-trim the bus gain on SET_VOLUME action (#1111)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects({ type: ACTIONS.SET_VOLUME, payload: payload }, stateMap, { dispatch });
        expect(syncBusVolume).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-trim the bus gain on SET_VOLUME with no module', () => {
        handleEffects({ type: ACTIONS.SET_VOLUME, payload: { value: 0.6 } }, stateMap, {
            dispatch,
        });
        expect(syncBusVolume).not.toHaveBeenCalled();
    });
});
