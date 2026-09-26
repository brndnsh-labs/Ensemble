// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setBpm } from '../../../public/controllers/app-controller.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import {
    initAudio,
    restoreGains,
    syncBusReverbSend,
    syncBusVolume,
} from '../../../public/engine/engine.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../../public/engine/instrument-registry.js';
import { handleEffects, reconcileUrlGenreOnBoot } from '../../../public/state/state-effects.js';
import { ACTIONS } from '../../../public/types.js';

// Mock all the imported functions
vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));
vi.mock('../../../public/controllers/app-controller.js', () => ({
    setBpm: vi.fn(),
}));
vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
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
            playback: { isPlaying: false, toasts: [], theme: 'dark' },
        };
        dispatch = vi.fn();
    });

    it('should call validateProgression on section-related actions', () => {
        handleEffects({ type: ACTIONS.SET_SECTIONS, payload: {} }, stateMap, { dispatch });
        expect(validateProgression).toHaveBeenCalledWith(stateMap, dispatch);
    });

    it('should call setBpm on SET_BPM action', () => {
        const payload = 120;
        const context = { dispatch, oldBpm: 100 };
        handleEffects({ type: ACTIONS.SET_BPM, payload: payload }, stateMap, context);
        expect(setBpm).toHaveBeenCalledWith(payload, true, 100);
    });

    it('reconciles URL genre effects after boot while restoring explicit groove settings (#1000)', async () => {
        __resetPackCacheForTest();
        markPackInstalled('horns-section', true);
        stateMap = {
            playback: { isPlaying: false },
            chords: { autoSound: false, voice: 'pack:clavinet' },
            bass: { autoSound: false, voice: 'synth' },
            soloist: {
                autoSound: false,
                voice: 'synth',
                autoMode: false,
                mode: 'monophonic',
            },
            harmony: { autoSound: true, voice: 'synth' },
            groove: { autoSound: false, voice: 'synth' },
        };

        await reconcileUrlGenreOnBoot(
            stateMap,
            'Funk',
            { swing: 73, swingSub: '8th', humanize: 9 },
            dispatch,
        );

        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'harmony',
            voice: 'pack:horns-section',
            auto: true,
        });
        expect(dispatch).not.toHaveBeenCalledWith(
            ACTIONS.SET_INSTRUMENT_VOICE,
            expect.objectContaining({ module: 'chords' }),
        );
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
            module: 'groove',
            param: 'swing',
            value: 73,
        });
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
            module: 'groove',
            param: 'swingSub',
            value: '8th',
        });
        expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_PARAM, {
            module: 'groove',
            param: 'humanize',
            value: 9,
        });
    });

    describe('genre auto-follow on SET_GENRE_FEEL (#675)', () => {
        beforeEach(() => {
            __resetPackCacheForTest();
            // Harmony in Auto mode, currently on synth; other lanes absent (skipped).
            stateMap.harmony = { autoSound: true, voice: 'synth' };
        });

        it('switches an Auto lane to the genre-mapped pack when installed', () => {
            markPackInstalled('horns-section', true);
            handleEffects(
                { type: ACTIONS.SET_GENRE_FEEL, payload: { genreName: 'Funk' } },
                stateMap,
                { dispatch },
            );
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
                voice: 'pack:horns-section',
                auto: true,
            });
        });

        it('leaves a pinned lane (autoSound:false) untouched', () => {
            stateMap.harmony = { autoSound: false, voice: 'synth' };
            markPackInstalled('horns-section', true);
            handleEffects(
                { type: ACTIONS.SET_GENRE_FEEL, payload: { genreName: 'Funk' } },
                stateMap,
                { dispatch },
            );
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('does not write when the mapped sound already matches (no churn)', () => {
            markPackInstalled('horns-section', true);
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(
                { type: ACTIONS.SET_GENRE_FEEL, payload: { genreName: 'Funk' } },
                stateMap,
                { dispatch },
            );
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('falls back to synth (no auto-download) when the mapped pack is not installed', () => {
            // Auto lane currently pinned-by-prior-state to the horns pack, but it
            // is no longer installed → auto-follow recovers it to synth.
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(
                { type: ACTIONS.SET_GENRE_FEEL, payload: { genreName: 'Funk' } },
                stateMap,
                { dispatch },
            );
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
                voice: 'synth',
                auto: true,
            });
        });

        it('uses synth for a genre with no harmony mapping', () => {
            markPackInstalled('horns-section', true);
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(
                { type: ACTIONS.SET_GENRE_FEEL, payload: { genreName: 'Hip Hop' } },
                stateMap,
                { dispatch },
            );
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
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

    it('should call restoreGains on RESTORE_GAINS action', () => {
        handleEffects({ type: ACTIONS.RESTORE_GAINS, payload: {} }, stateMap, { dispatch });
        expect(restoreGains).toHaveBeenCalledWith(stateMap);
    });

    it('should call initAudio on INIT_AUDIO action', () => {
        handleEffects({ type: ACTIONS.INIT_AUDIO, payload: {} }, stateMap, { dispatch });
        expect(initAudio).toHaveBeenCalledWith(stateMap);
    });

    it('should set toast expiration on SHOW_TOAST', () => {
        vi.useFakeTimers();
        stateMap.playback.toasts = [{ id: 'toast1' }];
        handleEffects({ type: ACTIONS.SHOW_TOAST, payload: 'msg' }, stateMap, { dispatch });

        vi.advanceTimersByTime(2000);
        expect(dispatch).toHaveBeenCalledWith('TOAST_EXPIRED', 'toast1');
        vi.useRealTimers();
    });

    it('should set flash expiration on TRIGGER_FLASH', () => {
        vi.useFakeTimers();
        handleEffects({ type: ACTIONS.TRIGGER_FLASH, payload: 0.5 }, stateMap, { dispatch });

        vi.advanceTimersByTime(50);
        expect(dispatch).toHaveBeenCalledWith('FLASH_EXPIRED');
        vi.useRealTimers();
    });
});
