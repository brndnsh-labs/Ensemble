// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState } from '../../../core/state.js';
import { ACTIONS } from '../../../core/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

// Mock dependencies that are dynamically imported to prevent floating promises
vi.mock('../../../core/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const { playback, playbackReducer } = await import('../../../core/state/playback.js');
    const { arrangerReducer } = await import('../../../core/state/arranger.js');
    const { instrumentReducer } = await import('../../../core/state/instruments.js');
    const { grooveReducer } = await import('../../../core/state/groove.js');
    return {
        ...actual,
        // Wrap dispatch to avoid handleEffects during tests
        dispatch: vi.fn((action, payload) => {
            // Only perform state updates, skip handleEffects side-effects
            const a = { type: action, payload };
            playbackReducer(a);
            arrangerReducer(a);
            instrumentReducer(a);
            grooveReducer(a, playback);
        }),
    };
});

vi.mock('../../../core/controllers/instrument-controller.js', () => ({
    togglePower: vi.fn(),
}));

describe('Smart Genre System', () => {
    let playback, chords, bass, groove;

    beforeEach(() => {
        const state = getState();
        playback = state.playback;
        chords = state.chords;
        bass = state.bass;
        groove = state.groove;

        resetAllStateForTest();
        // Ensure we are not playing to avoid pending state by default
        playback.isPlaying = false;

        // Reset some defaults
        chords.style = 'smart';
        bass.style = 'smart';
        groove.genreFeel = 'Rock';
    });

    describe('Genre Switching Logic', () => {
        it('should queue a genre change during playback (pending)', () => {
            playback.isPlaying = true;

            dispatch(ACTIONS.SET_GENRE_FEEL, {
                feel: 'Jazz',
                swing: 60,
                sub: '8th',
                genreName: 'Jazz',
            });

            // Current genre should remain Rock until measure end
            expect(groove.genreFeel).toBe('Rock');
            // Pending should be set
            expect(groove.pendingGenreFeel).not.toBeNull();
            expect(groove.pendingGenreFeel.feel).toBe('Jazz');
        });

        it('should apply genre change immediately if not playing', () => {
            playback.isPlaying = false;

            dispatch(ACTIONS.SET_GENRE_FEEL, {
                feel: 'Funk',
                swing: 15,
                sub: '16th',
                genreName: 'Funk',
            });

            // Should apply immediately
            expect(groove.genreFeel).toBe('Funk');
            expect(groove.swing).toBe(15);
            expect(groove.swingSub).toBe('16th');
            expect(groove.pendingGenreFeel).toBeNull();
        });
    });

    describe('State Updates & Presets', () => {
        it('should update all instrument styles when a genre is selected', () => {
            const payload = {
                genreName: 'Funk',
                feel: 'Funk',
                swing: 15,
                sub: '16th',
                chord: 'funk',
                bass: 'funk',
            };

            dispatch(ACTIONS.SET_GENRE_FEEL, payload);

            // Check Groove
            expect(groove.genreFeel).toBe('Funk');
            expect(groove.swing).toBe(15);
            expect(groove.swingSub).toBe('16th');

            // Check Chords
            expect(chords.style).toBe('funk');

            // Check Bass
            expect(bass.style).toBe('funk');
        });

        it('should set appropriate instrument styles for each smart genre configuration', () => {
            const JAZZ_CONFIG = {
                feel: 'Jazz',
                swing: 60,
                sub: '8th',
                chord: 'jazz',
                bass: 'quarter',
            };

            dispatch(ACTIONS.SET_GENRE_FEEL, JAZZ_CONFIG);
            // #1381 — ACTIONS.SET_STYLE was deleted (nothing dispatched it); the live
            // per-module style write goes through generic SET_PARAM instead.
            dispatch(ACTIONS.SET_PARAM, {
                module: 'chords',
                param: 'style',
                value: JAZZ_CONFIG.chord,
            });
            dispatch(ACTIONS.SET_PARAM, {
                module: 'bass',
                param: 'style',
                value: JAZZ_CONFIG.bass,
            });

            expect(chords.style).toBe('jazz');
            expect(bass.style).toBe('quarter');
        });
    });
});
