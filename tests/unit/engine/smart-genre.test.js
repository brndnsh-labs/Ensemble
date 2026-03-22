/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock dependencies that are dynamically imported to prevent floating promises
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        // Wrap dispatch to avoid handleEffects during tests
        dispatch: vi.fn((action, payload) => {
            // Only perform state updates, skip handleEffects side-effects
            actual.playbackReducer(action, payload);
            actual.arrangerReducer(action, payload);
            actual.instrumentReducer(action, payload);
            actual.grooveReducer(action, payload, actual.playback);
            actual.midiReducer(action, payload);
            actual.vizReducer(action, payload);
        }),
    };
});

vi.mock('../../../public/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    togglePower: vi.fn(),
}));

vi.mock('../../../public/app-controller.js', () => ({
    setBpm: vi.fn(),
    applyTheme: vi.fn(),
}));

vi.mock('../../../public/engine/scheduler-core.js', () => ({
    togglePlay: vi.fn(),
    scheduler: vi.fn(),
}));

describe('Smart Genre System', () => {
    let playback, chords, bass, soloist, harmony, groove;

    beforeEach(() => {
        const state = getState();
        playback = state.playback;
        chords = state.chords;
        bass = state.bass;
        soloist = state.soloist;
        harmony = state.harmony;
        groove = state.groove;

        dispatch(ACTIONS.RESET_STATE);
        // Ensure we are not playing to avoid pending state by default
        playback.isPlaying = false;

        // Reset some defaults
        chords.style = 'smart';
        bass.style = 'smart';
        soloist.style = 'smart';
        harmony.style = 'smart';
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
        it('should update all instruments and switch to smart tabs when a genre is selected', () => {
            // Set some non-default states first to verify reset/update
            chords.activeTab = 'classic';
            bass.activeTab = 'classic';
            groove.activeTab = 'classic';

            const payload = {
                genreName: 'Funk',
                feel: 'Funk',
                swing: 15,
                sub: '16th',
                drum: 'Funk',
                chord: 'funk',
                bass: 'funk',
                soloist: 'blues',
                harmony: 'horns',
            };

            dispatch(ACTIONS.SET_GENRE_FEEL, payload);

            // Check Groove
            expect(groove.genreFeel).toBe('Funk');
            expect(groove.swing).toBe(15);
            expect(groove.swingSub).toBe('16th');
            expect(groove.activeTab).toBe('smart');

            // Check Chords
            expect(chords.style).toBe('funk');
            expect(chords.activeTab).toBe('smart');

            // Check Bass
            expect(bass.style).toBe('funk');
            expect(bass.activeTab).toBe('smart');

            // Check Soloist
            expect(soloist.style).toBe('blues');
            expect(soloist.activeTab).toBe('smart');

            // Check Harmony
            expect(harmony.style).toBe('horns');
            expect(harmony.activeTab).toBe('smart');
        });

        it('should set appropriate instrument styles for each smart genre configuration', () => {
            // This simulates what ui-controller.js does when it dispatches SET_GENRE_FEEL
            // and then dispatches SET_STYLE/SET_ACTIVE_TAB sequence

            const JAZZ_CONFIG = {
                feel: 'Jazz',
                swing: 60,
                sub: '8th',
                drum: 'Jazz',
                chord: 'jazz',
                bass: 'quarter',
                soloist: 'bird',
            };

            dispatch(ACTIONS.SET_GENRE_FEEL, JAZZ_CONFIG);
            dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: JAZZ_CONFIG.chord });
            dispatch(ACTIONS.SET_STYLE, { module: 'bass', style: JAZZ_CONFIG.bass });
            dispatch(ACTIONS.SET_STYLE, { module: 'soloist', style: JAZZ_CONFIG.soloist });

            expect(chords.style).toBe('jazz');
            expect(bass.style).toBe('quarter');
            expect(soloist.style).toBe('bird');
        });
    });
});
