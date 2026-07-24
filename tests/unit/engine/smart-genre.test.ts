// @ts-nocheck
/* eslint-disable */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    CANONICAL_METERS_BY_FEEL,
    GENRE_FEELS,
    getCanonicalMeters,
} from '../../../public/data/smart-genres.js';
import { dispatch, getState } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock dependencies that are dynamically imported to prevent floating promises
vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = await importOriginal();
    const { playbackReducer } = await import('../../../public/state/playback.js');
    const { arrangerReducer } = await import('../../../public/state/arranger.js');
    const { instrumentReducer } = await import('../../../public/state/instruments.js');
    const { grooveReducer } = await import('../../../public/state/groove.js');
    const { midiReducer } = await import('../../../public/state/midi.js');
    const { vizReducer } = await import('../../../public/state/visualizer.js');
    return {
        ...actual,
        // Wrap dispatch to avoid handleEffects during tests
        dispatch: vi.fn((action, payload) => {
            // Only perform state updates, skip handleEffects side-effects
            const a = { type: action, payload };
            playbackReducer(a);
            arrangerReducer(a);
            instrumentReducer(a);
            grooveReducer(a, actual.playback);
            midiReducer(a);
            vizReducer(a);
        }),
    };
});

vi.mock('../../../public/controllers/instrument-controller.js', () => ({
    loadDrumPreset: vi.fn(),
    togglePower: vi.fn(),
}));

vi.mock('../../../public/controllers/app-controller.js', () => ({
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

    describe('Canonical meters (S10 time-signature hint)', () => {
        it('returns the idiomatic meters for genres with extra time signatures', () => {
            expect(getCanonicalMeters('Jazz')).toEqual(['4/4', '3/4', '6/8']);
            expect(getCanonicalMeters('Blues')).toEqual(['4/4', '12/8', '6/8']);
            expect(getCanonicalMeters('Country')).toEqual(['4/4', '3/4']);
            expect(getCanonicalMeters('Acoustic')).toEqual(['4/4', '3/4']);
        });

        it('defaults non-annotated genres (and unknown feels) to 4/4', () => {
            expect(getCanonicalMeters('Funk')).toEqual(['4/4']);
            expect(getCanonicalMeters('Reggae')).toEqual(['4/4']);
            expect(getCanonicalMeters('Nonexistent Genre')).toEqual(['4/4']);
            expect(getCanonicalMeters(undefined)).toEqual(['4/4']);
        });

        it('covers every genre feel with a non-empty meter list including 4/4', () => {
            for (const feel of GENRE_FEELS) {
                const meters = CANONICAL_METERS_BY_FEEL[feel];
                expect(meters, `${feel} has canonical meters`).toBeTruthy();
                expect(meters.length, `${feel} non-empty`).toBeGreaterThan(0);
                expect(meters, `${feel} includes 4/4`).toContain('4/4');
            }
        });

        it('only lists meters the picker actually offers', () => {
            const OFFERED = ['4/4', '3/4', '2/4', '5/4', '6/8', '7/8', '7/4', '12/8'];
            for (const feel of GENRE_FEELS) {
                for (const meter of CANONICAL_METERS_BY_FEEL[feel]) {
                    expect(OFFERED, `${feel}'s ${meter} is a real option`).toContain(meter);
                }
            }
        });
    });

    describe('State Updates & Presets', () => {
        it('should update all instrument styles when a genre is selected', () => {
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

            // Check Chords
            expect(chords.style).toBe('funk');

            // Check Bass
            expect(bass.style).toBe('funk');

            // Check Soloist
            expect(soloist.style).toBe('blues');

            // Check Harmony
            expect(harmony.style).toBe('horns');
        });

        it('should set appropriate instrument styles for each smart genre configuration', () => {
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
