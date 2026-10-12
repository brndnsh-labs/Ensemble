import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groove, grooveReducer as grooveReducerImpl } from '../../../public/state/groove.js';
import { ACTIONS } from '../../../public/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

// Tests call grooveReducer with 1-2 args; production signature requires 2 (action object + optional playback).
const grooveReducer = grooveReducerImpl as (action: any, playback?: any) => any;

describe('Groove Reducer', () => {
    beforeEach(() => {
        resetAllStateForTest();
    });

    it('should set swing and subdivision', () => {
        grooveReducer({ type: ACTIONS.SET_SWING, payload: 25 });
        expect(groove.swing).toBe(25);
        grooveReducer({ type: ACTIONS.SET_SWING_SUB, payload: '16th' });
        expect(groove.swingSub).toBe('16th');
    });

    it('should set humanize', () => {
        grooveReducer({ type: ACTIONS.SET_HUMANIZE, payload: 40 });
        expect(groove.humanize).toBe(40);
    });

    it('should set volume and reverb via module actions', () => {
        grooveReducer({ type: ACTIONS.SET_VOLUME, payload: { module: 'groove', value: 0.7 } });
        expect(groove.volume).toBe(0.7);
        grooveReducer({ type: ACTIONS.SET_REVERB, payload: { module: 'groove', value: 0.3 } });
        expect(groove.reverb).toBe(0.3);

        const result = grooveReducer({
            type: ACTIONS.SET_VOLUME,
            payload: { module: 'other', value: 0.1 },
        });
        expect(result).toBe(false);
    });

    it('should handle SET_GENRE_FEEL - immediate update when NOT playing', () => {
        const playbackMock = { isPlaying: false };
        const payload = { feel: 'Jazz', genreName: 'Jazz', swing: 50, sub: '16th' };

        grooveReducer({ type: ACTIONS.SET_GENRE_FEEL, payload }, playbackMock);

        expect(groove.genreFeel).toBe('Jazz');
        expect(groove.swing).toBe(50);
        expect(groove.swingSub).toBe('16th');
        expect(groove.pendingGenreFeel).toBeNull();
    });

    it('should handle SET_GENRE_FEEL - deferred update when playing', () => {
        const playbackMock = { isPlaying: true };
        const payload = { feel: 'Jazz', genreName: 'Jazz' };

        grooveReducer({ type: ACTIONS.SET_GENRE_FEEL, payload }, playbackMock);

        expect(groove.genreFeel).toBe('Rock'); // Still Rock
        expect(groove.pendingGenreFeel).toEqual(payload);
    });

    it('should return false for unknown actions', () => {
        const result = grooveReducer({ type: 'UNKNOWN', payload: {} }, {});
        expect(result).toBe(false);
    });

    describe('setGrooveParam', () => {
        it('should update all supported parameters', () => {
            const params = {
                enabled: false,
                volume: 0.1,
                reverb: 0.1,
                humanize: 50,
                swing: 10,
                swingSub: '16th',
                genreFeel: 'Jazz',
                lastSmartGenre: 'Jazz',
                pendingGenreFeel: { feel: 'Funk' },
                lastHatGain: 0.8,
            };

            for (const [param, value] of Object.entries(params)) {
                grooveReducer(
                    { type: ACTIONS.SET_PARAM, payload: { module: 'groove', param, value } },
                    {},
                );
                expect((groove as any)[param]).toEqual(value);
            }
        });
    });

    // #1182: this slice is the SINGLE authority for SET_PARAM/SET_VOLUME/SET_REVERB
    // on the groove lane. `state.ts` runs instrumentReducer and grooveReducer back
    // to back and ignores their boolean returns, so before this both wrote groove
    // state on every one of these actions.
    describe('#1182 sole authority over the groove lane', () => {
        // The old `drum`, `drums` and `gb` aliases are gone (#1633): the module is the slice name.
        it("owns SET_PARAM / SET_VOLUME / SET_REVERB for module 'groove'", () => {
            const module = 'groove';
            expect(
                grooveReducer(
                    {
                        type: ACTIONS.SET_PARAM,
                        payload: { module, param: 'humanize', value: 3 },
                    },
                    {},
                ),
            ).toBe(true);
            expect(groove.humanize).toBe(3);

            expect(
                grooveReducer({ type: ACTIONS.SET_VOLUME, payload: { module, value: 0.42 } }),
            ).toBe(true);
            expect(groove.volume).toBe(0.42);

            expect(
                grooveReducer({ type: ACTIONS.SET_REVERB, payload: { module, value: 0.11 } }),
            ).toBe(true);
            expect(groove.reverb).toBe(0.11);
        });

        it.each(['drum', 'drums', 'gb'])("no longer answers to the alias '%s'", (module) => {
            const before = { ...groove };
            for (const type of [ACTIONS.SET_PARAM, ACTIONS.SET_VOLUME, ACTIONS.SET_REVERB]) {
                expect(
                    grooveReducer(
                        { type, payload: { module, param: 'humanize', value: 99 } } as any,
                        {},
                    ),
                ).toBe(false);
            }
            expect(groove.humanize).toBe(before.humanize);
            expect(groove.volume).toBe(before.volume);
            expect(groove.reverb).toBe(before.reverb);
        });

        it('does not create a field the slice does not declare (#1633)', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const result = grooveReducer(
                {
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'groove', param: 'noSuchField', value: 1 },
                } as any,
                {},
            );
            expect(result).toBe(false);
            expect(Object.hasOwn(groove, 'noSuchField')).toBe(false);
            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn.mock.calls[0][0]).toContain("'groove' has no field 'noSuchField'");
            warn.mockRestore();
        });

        it('instrumentReducer declines the groove lane instead of double-writing it', async () => {
            const { instrumentReducer } = await import('../../../public/state/instruments.js');

            for (const module of ['groove'] as const) {
                expect(
                    instrumentReducer({
                        type: ACTIONS.SET_VOLUME,
                        payload: { module, value: 0.99 },
                    } as any),
                ).toBe(false);
                expect(
                    instrumentReducer({
                        type: ACTIONS.SET_REVERB,
                        payload: { module, value: 0.99 },
                    } as any),
                ).toBe(false);
                expect(
                    instrumentReducer({
                        type: ACTIONS.SET_PARAM,
                        payload: { module, param: 'humanize', value: 99 },
                    } as any),
                ).toBe(false);
            }

            // Declining must mean "didn't touch it", not "wrote it and reported false".
            expect(groove.volume).not.toBe(0.99);
            expect(groove.reverb).not.toBe(0.99);
            expect(groove.humanize).not.toBe(99);
        });

        it('still routes non-groove modules to instrumentReducer', async () => {
            const { instrumentReducer, chords } = await import(
                '../../../public/state/instruments.js'
            );
            expect(
                instrumentReducer({
                    type: ACTIONS.SET_VOLUME,
                    payload: { module: 'chords', value: 0.33 },
                } as any),
            ).toBe(true);
            expect(chords.volume).toBe(0.33);
        });
    });
});
