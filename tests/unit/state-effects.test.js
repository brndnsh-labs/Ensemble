import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, setBpm } from '../../public/app-controller.js';
import { validateProgression } from '../../public/chords-engine.js';
import { initAudio, restoreGains } from '../../public/engine/engine.js';
import { togglePlay } from '../../public/engine/scheduler-core.js';
import { loadDrumPreset } from '../../public/instrument-controller.js';
import { initMIDI } from '../../public/midi-controller.js';
import { handleEffects } from '../../public/state-effects.js';
import { ACTIONS } from '../../public/types.js';

// Mock all the imported functions
vi.mock('../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
}));
vi.mock('../../public/chords-engine.js', () => ({
    validateProgression: vi.fn(),
}));
vi.mock('../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
    applyTheme: vi.fn(),
}));
vi.mock('../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
}));
vi.mock('../../public/engine/engine.js', () => ({
    initAudio: vi.fn(),
    restoreGains: vi.fn(),
}));
vi.mock('../../public/midi-controller.js', () => ({
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
        const payload = { viz: true };
        handleEffects(ACTIONS.TOGGLE_PLAY, payload, stateMap, { dispatch });
        expect(togglePlay).toHaveBeenCalledWith(stateMap, payload.viz, true, dispatch);
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

    it('should call restoreGains on RESTORE_GAINS action', () => {
        handleEffects(ACTIONS.RESTORE_GAINS, {}, stateMap, { dispatch });
        expect(restoreGains).toHaveBeenCalledWith(stateMap);
    });

    it('should call initAudio on INIT_AUDIO action', () => {
        handleEffects(ACTIONS.INIT_AUDIO, {}, stateMap, { dispatch });
        expect(initAudio).toHaveBeenCalledWith(stateMap);
    });

    it('should apply theme and init MIDI on HYDRATE', () => {
        stateMap.playback.theme = 'light';
        stateMap.midi.enabled = true;
        handleEffects('HYDRATE', {}, stateMap, { dispatch });
        expect(applyTheme).toHaveBeenCalledWith('light');
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
