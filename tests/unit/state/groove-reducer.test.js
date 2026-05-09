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
        expect(groove.volume).toBe(1.0);
        expect(groove.genreFeel).toBe('Rock');
        expect(groove.instruments[0].steps[0]).toBe(0);
    });

    it('should set active measure', () => {
        grooveReducer(ACTIONS.SET_ACTIVE_MEASURE, 2);
        expect(groove.currentMeasure).toBe(2);
    });

    it('should set swing and subdivision', () => {
        grooveReducer(ACTIONS.SET_SWING, 25);
        expect(groove.swing).toBe(25);
        grooveReducer(ACTIONS.SET_SWING_SUB, '16th');
        expect(groove.swingSub).toBe('16th');
    });

    it('should set humanize', () => {
        grooveReducer(ACTIONS.SET_HUMANIZE, 40);
        expect(groove.humanize).toBe(40);
    });

    it('should set volume and reverb via module actions', () => {
        grooveReducer(ACTIONS.SET_VOLUME, { module: 'groove', value: 0.7 });
        expect(groove.volume).toBe(0.7);
        grooveReducer(ACTIONS.SET_REVERB, { module: 'drum', value: 0.3 });
        expect(groove.reverb).toBe(0.3);

        const result = grooveReducer(ACTIONS.SET_VOLUME, { module: 'other', value: 0.1 });
        expect(result).toBe(false);
    });

    it('should set creativity and countdown', () => {
        grooveReducer(ACTIONS.SET_PARAM, { module: 'groove', param: 'creativity', value: true });
        expect(groove.creativity).toBe(true);
        grooveReducer(ACTIONS.SET_GENRE_COUNTDOWN, 4);
        expect(groove.genreSwitchCountdown).toBe(4);

        // Setting same value returns false
        const result = grooveReducer(ACTIONS.SET_GENRE_COUNTDOWN, 4);
        expect(result).toBe(false);
    });

    it('should trigger drum fills', () => {
        const payload = { steps: { 0: 1 }, startStep: 16, length: 16, crash: true };
        grooveReducer(ACTIONS.TRIGGER_FILL, payload);
        expect(groove.fillActive).toBe(true);
        expect(groove.fillSteps[0]).toBe(1);
        expect(groove.pendingCrash).toBe(true);
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

    it('should return false for unknown actions', () => {
        const result = grooveReducer('UNKNOWN', {}, {});
        expect(result).toBe(false);
    });

    describe('setGrooveParam', () => {
        it('should update all supported parameters', () => {
            const params = {
                enabled: false,
                volume: 0.1,
                reverb: 0.1,
                measures: 4,
                currentMeasure: 1,
                followPlayback: false,
                humanize: 50,
                swing: 10,
                swingSub: '16th',
                lastDrumPreset: 'Jazz Kit',
                genreFeel: 'Jazz',
                lastSmartGenre: 'Jazz',
                pendingGenreFeel: { feel: 'Funk' },
                genreSwitchCountdown: 2,
                fillActive: true,
                lastHatGain: 0.8,
                fillStartStep: 32,
                fillLength: 8,
                snareMask: 123,
                pendingCrash: true,
                creativity: true,
            };

            for (const [param, value] of Object.entries(params)) {
                grooveReducer(ACTIONS.SET_PARAM, { module: 'groove', param, value }, {});
                expect(groove[param]).toEqual(value);
            }
        });
    });
});
