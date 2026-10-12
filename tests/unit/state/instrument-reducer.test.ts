import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groove } from '../../../public/state/groove.js';
import { bass, chords, instrumentReducer, soloist } from '../../../public/state/instruments.js';
import {
    ACTIONS,
    type BassState,
    type ChordState,
    type Mutable,
    type SoloistState,
} from '../../../public/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

const mutableChords = chords as Mutable<typeof chords>;

describe('Instrument Reducer', () => {
    beforeEach(() => {
        resetAllStateForTest();
    });

    it('should set style for modules', () => {
        // #1381 — ACTIONS.SET_STYLE was deleted (nothing dispatched it); the live
        // per-module style write goes through generic SET_PARAM instead.
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'bass', param: 'style', value: 'funk' },
        });
        expect(bass.style).toBe('funk');

        // Invalid module — must not throw.
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'invalid', param: 'style', value: 'funk' },
        } as any);
    });

    it('should set volume and reverb for modules', () => {
        instrumentReducer({ type: ACTIONS.SET_VOLUME, payload: { module: 'chords', value: 0.8 } });
        expect(chords.volume).toBe(0.8);
        instrumentReducer({ type: ACTIONS.SET_REVERB, payload: { module: 'bass', value: 0.2 } });
        expect(bass.reverb).toBe(0.2);
    });

    it('should set soloist mode', () => {
        instrumentReducer({ type: ACTIONS.SET_SOLOIST_MODE, payload: 'guitar' });
        expect(soloist.mode).toBe('guitar');
    });

    describe('SET_INSTRUMENT_VOICE sound-source mode (#675)', () => {
        it('pins the source when auto:false (a manual pick)', () => {
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'chords', voice: 'pack:grand', auto: false },
            });
            expect(chords.voice).toBe('pack:grand');
            expect(chords.autoSound).toBe(false);
        });

        it('keeps Auto on when auto:true (genre auto-follow)', () => {
            mutableChords.autoSound = false;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'chords', voice: 'pack:rhodes', auto: true },
            });
            expect(chords.voice).toBe('pack:rhodes');
            expect(chords.autoSound).toBe(true);
        });

        it('leaves the mode untouched when auto is omitted (bare voice reset)', () => {
            mutableChords.autoSound = true;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'chords', voice: 'synth' },
            });
            expect(chords.voice).toBe('synth');
            expect(chords.autoSound).toBe(true);
        });
    });

    it('should handle SET_GENRE_FEEL for all instruments', () => {
        const payload = { chord: 'pad', bass: 'slap' };
        instrumentReducer({ type: ACTIONS.SET_GENRE_FEEL, payload });
        expect(chords.style).toBe('pad');
        expect(bass.style).toBe('slap');
    });

    it.each([
        ['chords', chords],
        ['bass', bass],
        ['soloist', soloist],
    ] as const)('does not create a field %s does not declare (#1633)', (module, slice) => {
        // The removed `pinnedProfile`/`motifTracking`/`complexity` class of stale dispatch:
        // the write is dropped (and warned about), never resurrected as a top-level field.
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (const param of ['pinnedProfile', 'motifTracking', 'noSuchField']) {
            expect(
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module, param, value: 'evans' },
                } as any),
            ).toBe(false);
            expect(Object.hasOwn(slice, param)).toBe(false);
        }
        expect(warn).toHaveBeenCalledTimes(3);
        expect(warn.mock.calls[0][0]).toContain(`'${module}' has no field 'pinnedProfile'`);
        warn.mockRestore();
    });

    it.each(['cb', 'bb', 'sb', 'gb'])("no longer answers to the alias '%s'", (module) => {
        const volume = soloist.volume;
        for (const type of [ACTIONS.SET_PARAM, ACTIONS.SET_VOLUME, ACTIONS.SET_REVERB]) {
            instrumentReducer({
                type,
                payload: { module, param: 'volume', value: 0.123 },
            } as any);
        }
        expect(soloist.volume).toBe(volume);
        expect(bass.volume).not.toBe(0.123);
        expect(chords.volume).not.toBe(0.123);
        expect(groove.volume).not.toBe(0.123);
    });

    it('a live soloist key still applies', () => {
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'soloist', param: 'volume', value: 0.42 },
        });
        expect(soloist.volume).toBe(0.42);
    });

    it('should return false for unknown actions', () => {
        const result = instrumentReducer({
            type: 'UNKNOWN_ACTION',
            payload: {},
        } as unknown as Parameters<typeof instrumentReducer>[0]);
        expect(result).toBe(false);
    });

    describe('SET_PARAM via instrumentReducer', () => {
        it('should update chords parameters', () => {
            const params = {
                enabled: false,
                volume: 0.1,
                voice: 'pack:wurlitzer',
            } as const;
            for (const [p, v] of Object.entries(params) as Array<[keyof ChordState, unknown]>) {
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'chords', param: p, value: v },
                });
                expect((chords as any)[p]).toBe(v);
            }
        });

        it('should update bass parameters', () => {
            const params = {
                enabled: false,
                volume: 0.1,
                voice: 'pack:synthbass',
            } as const;
            for (const [p, v] of Object.entries(params) as Array<[keyof BassState, unknown]>) {
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'bass', param: p, value: v },
                });
                expect((bass as any)[p]).toEqual(v);
            }
        });

        it('should update soloist parameters', () => {
            const params = {
                enabled: true,
                volume: 0.1,
                voice: 'pack:sax',
            } as const;
            for (const [p, v] of Object.entries(params) as Array<[keyof SoloistState, unknown]>) {
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'soloist', param: p, value: v },
                });
                expect((soloist as any)[p]).toEqual(v);
            }
        });

        it('writes nothing for the retired harmony lane (#1436)', () => {
            for (const module of ['harmony', 'harmonies']) {
                expect(
                    instrumentReducer({
                        type: ACTIONS.SET_PARAM,
                        payload: { module, param: 'volume', value: 0.8 },
                    } as any),
                ).toBe(false);
            }
        });
    });
});
