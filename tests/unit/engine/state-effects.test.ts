// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemeToDom, setBpm } from '../../../public/app-controller.js';
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
import { togglePlay } from '../../../public/engine/scheduler-core.js';
import { loadDrumPreset } from '../../../public/instrument-controller.js';
import { initMIDI } from '../../../public/midi-controller.js';
import { handleEffects } from '../../../public/state-effects.js';
import { ACTIONS } from '../../../public/types.js';

// Mock all the imported functions
vi.mock('../../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));
vi.mock('../../../public/engine/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));
vi.mock('../../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
    applyThemeToDom: vi.fn(),
}));
vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
}));
vi.mock('../../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    restoreGains: vi.fn(),
    syncBusReverbSend: vi.fn(),
    syncBusVolume: vi.fn(),
}));
vi.mock('../../../public/midi-controller.js', () => ({
    initMIDI: vi.fn(),
}));

describe('State Effects Handler', () => {
    let stateMap;
    let dispatch;

    beforeEach(() => {
        vi.clearAllMocks();
        stateMap = {
            playback: { isPlaying: false, toasts: [], theme: 'dark' },
            midi: { enabled: false },
        };
        dispatch = vi.fn();
    });

    it('should call togglePlay on TOGGLE_PLAY action', () => {
        const payload = {};
        handleEffects(ACTIONS.TOGGLE_PLAY, payload, stateMap, { dispatch });
        expect(togglePlay).toHaveBeenCalledWith(stateMap, true, dispatch);
    });

    it('should call validateProgression on section-related actions', () => {
        handleEffects(ACTIONS.SET_SECTIONS, {}, stateMap, { dispatch });
        expect(validateProgression).toHaveBeenCalledWith(stateMap, dispatch);
    });

    it('should call setBpm on SET_BPM action', () => {
        const payload = 120;
        const context = { dispatch, oldBpm: 100 };
        handleEffects(ACTIONS.SET_BPM, payload, stateMap, context);
        expect(setBpm).toHaveBeenCalledWith(payload, undefined, true, 100);
    });

    it('should call loadDrumPreset on SET_GENRE_FEEL if not playing', () => {
        const payload = { drum: 'rock' };
        stateMap.playback.isPlaying = false;
        handleEffects(ACTIONS.SET_GENRE_FEEL, payload, stateMap, { dispatch });
        expect(loadDrumPreset).toHaveBeenCalledWith('rock');
    });

    it('should NOT call loadDrumPreset on SET_GENRE_FEEL if playing', () => {
        const payload = { drum: 'rock' };
        stateMap.playback.isPlaying = true;
        handleEffects(ACTIONS.SET_GENRE_FEEL, payload, stateMap, { dispatch });
        expect(loadDrumPreset).not.toHaveBeenCalled();
    });

    describe('genre auto-follow on SET_GENRE_FEEL (#675)', () => {
        beforeEach(() => {
            __resetPackCacheForTest();
            // Harmony in Auto mode, currently on synth; other lanes absent (skipped).
            stateMap.harmony = { autoSound: true, voice: 'synth' };
        });

        it('switches an Auto lane to the genre-mapped pack when installed', () => {
            markPackInstalled('horns-section', true);
            handleEffects(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk' }, stateMap, { dispatch });
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
                voice: 'pack:horns-section',
                auto: true,
            });
        });

        it('leaves a pinned lane (autoSound:false) untouched', () => {
            stateMap.harmony = { autoSound: false, voice: 'synth' };
            markPackInstalled('horns-section', true);
            handleEffects(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk' }, stateMap, { dispatch });
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('does not write when the mapped sound already matches (no churn)', () => {
            markPackInstalled('horns-section', true);
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk' }, stateMap, { dispatch });
            expect(dispatch).not.toHaveBeenCalled();
        });

        it('falls back to synth (no auto-download) when the mapped pack is not installed', () => {
            // Auto lane currently pinned-by-prior-state to the horns pack, but it
            // is no longer installed → auto-follow recovers it to synth.
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(ACTIONS.SET_GENRE_FEEL, { genreName: 'Funk' }, stateMap, { dispatch });
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
                voice: 'synth',
                auto: true,
            });
        });

        it('uses synth for a genre with no harmony mapping', () => {
            markPackInstalled('horns-section', true);
            stateMap.harmony = { autoSound: true, voice: 'pack:horns-section' };
            handleEffects(ACTIONS.SET_GENRE_FEEL, { genreName: 'Hip Hop' }, stateMap, { dispatch });
            expect(dispatch).toHaveBeenCalledWith(ACTIONS.SET_INSTRUMENT_VOICE, {
                module: 'harmony',
                voice: 'synth',
                auto: true,
            });
        });
    });

    it('should re-send the bus reverb on SET_REVERB action (#688)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects(ACTIONS.SET_REVERB, payload, stateMap, { dispatch });
        expect(syncBusReverbSend).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-send the bus reverb on SET_REVERB with no module', () => {
        handleEffects(ACTIONS.SET_REVERB, { value: 0.6 }, stateMap, { dispatch });
        expect(syncBusReverbSend).not.toHaveBeenCalled();
    });

    it('should re-trim the bus gain on SET_VOLUME action (#1111)', () => {
        const payload = { module: 'chords', value: 0.6 };
        handleEffects(ACTIONS.SET_VOLUME, payload, stateMap, { dispatch });
        expect(syncBusVolume).toHaveBeenCalledWith(stateMap, 'chords');
    });

    it('should NOT re-trim the bus gain on SET_VOLUME with no module', () => {
        handleEffects(ACTIONS.SET_VOLUME, { value: 0.6 }, stateMap, { dispatch });
        expect(syncBusVolume).not.toHaveBeenCalled();
    });

    it('should call restoreGains on RESTORE_GAINS action', () => {
        handleEffects(ACTIONS.RESTORE_GAINS, {}, stateMap, { dispatch });
        expect(restoreGains).toHaveBeenCalledWith(stateMap);
    });

    it('should call initAudio on INIT_AUDIO action', () => {
        handleEffects(ACTIONS.INIT_AUDIO, {}, stateMap, { dispatch });
        expect(initAudio).toHaveBeenCalledWith(stateMap);
    });

    it('should apply theme and init MIDI on HYDRATE', () => {
        stateMap.playback.palette = 'midnight';
        stateMap.playback.mode = 'light';
        stateMap.midi.enabled = true;
        handleEffects('HYDRATE', {}, stateMap, { dispatch });
        expect(applyThemeToDom).toHaveBeenCalledWith('midnight', 'light');
        expect(initMIDI).toHaveBeenCalled();
    });

    it('should set toast expiration on SHOW_TOAST', () => {
        vi.useFakeTimers();
        stateMap.playback.toasts = [{ id: 'toast1' }];
        handleEffects(ACTIONS.SHOW_TOAST, 'msg', stateMap, { dispatch });

        vi.advanceTimersByTime(2000);
        expect(dispatch).toHaveBeenCalledWith('TOAST_EXPIRED', 'toast1');
        vi.useRealTimers();
    });

    it('should set flash expiration on TRIGGER_FLASH', () => {
        vi.useFakeTimers();
        handleEffects(ACTIONS.TRIGGER_FLASH, 0.5, stateMap, { dispatch });

        vi.advanceTimersByTime(50);
        expect(dispatch).toHaveBeenCalledWith('FLASH_EXPIRED');
        vi.useRealTimers();
    });
});
