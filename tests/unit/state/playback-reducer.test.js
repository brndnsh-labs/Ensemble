import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playback, playbackReducer } from '../../../public/state/playback.js';
import { ACTIONS } from '../../../public/types.js';

describe('Playback Reducer', () => {
    beforeEach(() => {
        playbackReducer(ACTIONS.RESET_STATE);
    });

    it('should reset to default values', () => {
        // Manually change some values first
        playback.bpm = 150;
        playback.bandIntensity = 0.8;

        playbackReducer(ACTIONS.RESET_STATE);

        expect(playback.bpm).toBe(100);
        expect(playback.bandIntensity).toBe(0.35);
        expect(playback.theme).toBe('auto');
    });

    it('should set BPM with clamping [40, 240]', () => {
        playbackReducer(ACTIONS.SET_BPM, 120);
        expect(playback.bpm).toBe(120);

        playbackReducer(ACTIONS.SET_BPM, 30);
        expect(playback.bpm).toBe(40);

        playbackReducer(ACTIONS.SET_BPM, 300);
        expect(playback.bpm).toBe(240);
    });

    it('should toggle playing state and reset session tracking', () => {
        // Start
        vi.spyOn(performance, 'now').mockReturnValue(1234.56);
        playbackReducer(ACTIONS.TOGGLE_PLAY);
        expect(playback.isPlaying).toBe(true);
        expect(playback.sessionStartTime).toBe(1234.56);
        expect(playback.currentLoopCount).toBe(0);

        // Stop
        playbackReducer(ACTIONS.TOGGLE_PLAY);
        expect(playback.isPlaying).toBe(false);
    });

    it('should set band intensity with clamping [0, 1]', () => {
        playbackReducer(ACTIONS.SET_BAND_INTENSITY, 0.75);
        expect(playback.bandIntensity).toBe(0.75);

        playbackReducer(ACTIONS.SET_BAND_INTENSITY, -0.5);
        expect(playback.bandIntensity).toBe(0);

        playbackReducer(ACTIONS.SET_BAND_INTENSITY, 1.5);
        expect(playback.bandIntensity).toBe(1);
    });

    it('should set complexity with clamping [0, 1]', () => {
        playbackReducer(ACTIONS.SET_COMPLEXITY, 0.5);
        expect(playback.complexity).toBe(0.5);

        playbackReducer(ACTIONS.SET_COMPLEXITY, -1);
        expect(playback.complexity).toBe(0);

        playbackReducer(ACTIONS.SET_COMPLEXITY, 2);
        expect(playback.complexity).toBe(1);
    });

    it('should handle modal opening/closing for valid modals only', () => {
        // Valid modal
        const result = playbackReducer(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        expect(result).toBe(true);
        expect(playback.modals.settings).toBe(true);

        // Invalid modal
        const invalidResult = playbackReducer(ACTIONS.SET_MODAL_OPEN, {
            modal: 'invalid_modal',
            open: true,
        });
        expect(invalidResult).toBe(false);
    });

    it('should handle generic SET_PARAM for playback module', () => {
        playbackReducer(ACTIONS.SET_PARAM, { module: 'playback', param: 'countIn', value: false });
        expect(playback.countIn).toBe(false);
    });

    it('should update conductor decisions', () => {
        playbackReducer(ACTIONS.UPDATE_CONDUCTOR_DECISION, {
            velocity: 0.8,
            lyricalBias: 0.2,
            intent: { syncopation: 0.9 },
        });
        expect(playback.conductorVelocity).toBe(0.8);
        expect(playback.lyricalBias).toBe(0.2);
        expect(playback.intent.syncopation).toBe(0.9);
    });
});
