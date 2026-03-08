import { beforeEach, describe, expect, it } from 'vitest';
import { groove, grooveReducer } from '../../../public/state/groove.js';
import { ACTIONS } from '../../../public/types.js';

describe('Groove Reducer', () => {
    beforeEach(() => {
        grooveReducer(ACTIONS.RESET_STATE);
    });

    it('should reset to default values and clear instruments', () => {
        groove.volume = 0.9;
        groove.instruments[0].steps[0] = 1;

        grooveReducer(ACTIONS.RESET_STATE);

        expect(groove.volume).toBe(0.5);
        expect(groove.genreFeel).toBe('Rock');
        expect(groove.instruments[0].steps[0]).toBe(0);
    });

    it('should set groove steps for a specific instrument', () => {
        const steps = new Array(128).fill(0);
        steps[0] = 1;
        steps[4] = 2;

        grooveReducer(ACTIONS.SET_GROOVE_STEPS, { instrument: 'Kick', steps });

        expect(groove.instruments.find((i) => i.name === 'Kick').steps[0]).toBe(1);
        expect(groove.instruments.find((i) => i.name === 'Kick').steps[4]).toBe(2);
    });

    it('should handle SET_GENRE_FEEL - immediate update when NOT playing', () => {
        const playbackMock = { isPlaying: false };
        const payload = { feel: 'Jazz', genreName: 'Jazz', swing: 50, sub: '16th' };

        grooveReducer(ACTIONS.SET_GENRE_FEEL, payload, playbackMock);

        expect(groove.genreFeel).toBe('Jazz');
        expect(groove.swing).toBe(50);
        expect(groove.swingSub).toBe('16th');
        expect(groove.pendingGenreFeel).toBeNull();
    });

    it('should handle SET_GENRE_FEEL - deferred update when playing', () => {
        const playbackMock = { isPlaying: true };
        const payload = { feel: 'Jazz', genreName: 'Jazz' };

        grooveReducer(ACTIONS.SET_GENRE_FEEL, payload, playbackMock);

        expect(groove.genreFeel).toBe('Rock'); // Still Rock
        expect(groove.pendingGenreFeel).toEqual(payload);
    });

    it('should set Lars Intensity with clamping [0, 1]', () => {
        grooveReducer(ACTIONS.SET_LARS_INTENSITY, 0.8);
        expect(groove.larsIntensity).toBe(0.8);

        grooveReducer(ACTIONS.SET_LARS_INTENSITY, -1);
        expect(groove.larsIntensity).toBe(0);

        grooveReducer(ACTIONS.SET_LARS_INTENSITY, 2);
        expect(groove.larsIntensity).toBe(1);
    });

    it('should set groove seeds per section', () => {
        grooveReducer(ACTIONS.SET_GROOVE_SEED, { sectionId: 's1', seed: 12345 });
        expect(groove.sectionSeedMap.s1).toBe(12345);
    });

    it('should update pocket configuration', () => {
        const config = { globalDrive: 0.5, tightness: 0.9 };
        grooveReducer(ACTIONS.SET_POCKET_CONFIG, config);
        expect(groove.pocket.globalDrive).toBe(0.5);
        expect(groove.pocket.tightness).toBe(0.9);
    });
});
