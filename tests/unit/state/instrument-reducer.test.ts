import { beforeEach, describe, expect, it } from 'vitest';
import {
    bass,
    chords,
    harmony,
    instrumentReducer,
    soloist,
} from '../../../public/state/instruments.js';
import { ACTIONS, type Mutable } from '../../../public/types.js';
import { resetAllStateForTest } from '../../utils/reset-state.js';

const mutableHarmony = harmony as Mutable<typeof harmony>;

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
        });
    });

    it('should set volume and reverb for modules', () => {
        instrumentReducer({ type: ACTIONS.SET_VOLUME, payload: { module: 'chords', value: 0.8 } });
        expect(chords.volume).toBe(0.8);
        instrumentReducer({ type: ACTIONS.SET_REVERB, payload: { module: 'harmony', value: 0.2 } });
        expect(harmony.reverb).toBe(0.2);
    });

    it('should set soloist mode', () => {
        instrumentReducer({ type: ACTIONS.SET_SOLOIST_MODE, payload: 'guitar' });
        expect(soloist.mode).toBe('guitar');
    });

    describe('SET_INSTRUMENT_VOICE sound-source mode (#675)', () => {
        it('pins the source when auto:false (a manual pick)', () => {
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'harmony', voice: 'pack:strings-ensemble', auto: false },
            });
            expect(harmony.voice).toBe('pack:strings-ensemble');
            expect(harmony.autoSound).toBe(false);
        });

        it('keeps Auto on when auto:true (genre auto-follow)', () => {
            mutableHarmony.autoSound = false;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'harmony', voice: 'pack:horns-section', auto: true },
            });
            expect(harmony.voice).toBe('pack:horns-section');
            expect(harmony.autoSound).toBe(true);
        });

        it('leaves the mode untouched when auto is omitted (bare voice reset)', () => {
            mutableHarmony.autoSound = true;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'harmony', voice: 'synth' },
            });
            expect(harmony.voice).toBe('synth');
            expect(harmony.autoSound).toBe(true);
        });
    });

    it('should handle SET_GENRE_FEEL for all instruments', () => {
        const payload = { chord: 'pad', bass: 'slap', soloist: 'shred', harmony: 'strings' };
        instrumentReducer({ type: ACTIONS.SET_GENRE_FEEL, payload });
        expect(chords.style).toBe('pad');
        expect(bass.style).toBe('slap');
        expect(soloist.style).toBe('shred');
        expect(harmony.style).toBe('strings');
    });

    it('drops deprecated soloist payload keys instead of resurrecting them (#866 compat shim)', () => {
        // An old persisted session / share-URL carries the inert legacy fields
        // removed in #866. They must be silently dropped on load — NOT written
        // back onto state via applySoloistPayload's unknown-key fall-through.
        // `ACTIONS.UPDATE_SB` (the old multi-key batch form this once went
        // through) was deleted in #1381 — nothing dispatched it — but
        // `applySoloistPayload` itself is still live under `SET_PARAM`
        // (one key per dispatch), which exercises the same per-key filter.
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'soloist', param: 'pinnedProfile', value: 'evans' },
        });
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            payload: { module: 'soloist', param: 'motifTracking', value: true },
        });
        instrumentReducer({
            type: ACTIONS.SET_PARAM,
            // a live key alongside the deprecated ones still applies
            payload: { module: 'soloist', param: 'tension', value: 0.42 },
        });
        expect(soloist.session.tension).toBe(0.42);
        expect((soloist as Record<string, unknown>).pinnedProfile).toBeUndefined();
        expect((soloist as Record<string, unknown>).motifTracking).toBeUndefined();
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
                instrument: 'Wurlitzer',
            };
            for (const [p, v] of Object.entries(params)) {
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
                instrument: 'Synth',
            };
            for (const [p, v] of Object.entries(params)) {
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
                instrument: 'Sax',
            };
            for (const [p, v] of Object.entries(params)) {
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'soloist', param: p, value: v },
                });
                expect((soloist as any)[p]).toEqual(v);
            }
        });

        it('should update harmony parameters', () => {
            const params = {
                enabled: true,
                volume: 0.1,
                instrument: 'Trumpet',
            };
            for (const [p, v] of Object.entries(params)) {
                instrumentReducer({
                    type: ACTIONS.SET_PARAM,
                    payload: { module: 'harmony', param: p, value: v },
                });
                expect((harmony as any)[p]).toEqual(v);
            }
        });

        it('should alias harmonies module to harmony', () => {
            instrumentReducer({
                type: ACTIONS.SET_PARAM,
                payload: {
                    module: 'harmonies',
                    param: 'volume',
                    value: 0.8,
                },
            });
            expect(harmony.volume).toEqual(0.8);
        });
    });
});
