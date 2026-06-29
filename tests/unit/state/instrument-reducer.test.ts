import { beforeEach, describe, expect, it } from 'vitest';
import {
    bass,
    chords,
    harmony,
    instrumentReducer,
    soloist,
} from '../../../public/state/instruments.js';
import { ACTIONS } from '../../../public/types.js';

describe('Instrument Reducer', () => {
    beforeEach(() => {
        instrumentReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
    });

    it('should reset all instruments to default values', () => {
        soloist.enabled = true;
        soloist.volume = 0.9;
        instrumentReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
        expect(soloist.enabled).toBe(false);
        expect(soloist.volume).toBe(1.0);
    });

    it('should return false for SET_MODAL_OPEN', () => {
        const result = instrumentReducer({
            type: ACTIONS.SET_MODAL_OPEN,
            payload: { modal: 'settings', open: true },
        });
        expect(result).toBe(false);
    });

    it('should set style for modules', () => {
        instrumentReducer({ type: ACTIONS.SET_STYLE, payload: { module: 'bass', style: 'funk' } });
        expect(bass.style).toBe('funk');

        // Invalid module
        instrumentReducer({
            type: ACTIONS.SET_STYLE,
            payload: { module: 'invalid', style: 'funk' },
        });
    });

    it('should set density for chords', () => {
        instrumentReducer({ type: ACTIONS.SET_DENSITY, payload: 'rich' });
        expect(chords.density).toBe('rich');
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
            harmony.autoSound = false;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'harmony', voice: 'pack:horns-section', auto: true },
            });
            expect(harmony.voice).toBe('pack:horns-section');
            expect(harmony.autoSound).toBe(true);
        });

        it('leaves the mode untouched when auto is omitted (bare voice reset)', () => {
            harmony.autoSound = true;
            instrumentReducer({
                type: ACTIONS.SET_INSTRUMENT_VOICE,
                payload: { module: 'harmony', voice: 'synth' },
            });
            expect(harmony.voice).toBe('synth');
            expect(harmony.autoSound).toBe(true);
        });

        it('defaults autoSound to true on reset', () => {
            harmony.autoSound = false;
            instrumentReducer({ type: ACTIONS.RESET_STATE, payload: undefined });
            expect(harmony.autoSound).toBe(true);
            expect(bass.autoSound).toBe(true);
            expect(chords.autoSound).toBe(true);
            expect(soloist.autoSound).toBe(true);
        });
    });

    it('should handle session resets', () => {
        soloist.session.sessionSteps = 100;
        instrumentReducer({ type: ACTIONS.RESET_SESSION, payload: undefined });
        expect(soloist.session.sessionSteps).toBe(0);
    });

    it('should update conductor decisions', () => {
        instrumentReducer({
            type: ACTIONS.UPDATE_CONDUCTOR_DECISION,
            payload: { density: 'thin', hookProb: 0.9 },
        });
        expect(chords.density).toBe('thin');
        expect(soloist.hookRetentionProb).toBe(0.9);
    });

    it('should handle SET_GENRE_FEEL for all instruments', () => {
        const payload = { chord: 'pad', bass: 'slap', soloist: 'shred', harmony: 'strings' };
        instrumentReducer({ type: ACTIONS.SET_GENRE_FEEL, payload });
        expect(chords.style).toBe('pad');
        expect(bass.style).toBe('slap');
        expect(soloist.style).toBe('shred');
        expect(harmony.style).toBe('strings');
    });

    it('should update HB and SB state', () => {
        instrumentReducer({ type: ACTIONS.UPDATE_HB, payload: { style: 'horns' } });
        expect(harmony.style).toBe('horns');
        instrumentReducer({ type: ACTIONS.UPDATE_SB, payload: { tension: 0.5 } });
        expect(soloist.session.tension).toBe(0.5);
    });

    it('drops deprecated soloist payload keys instead of resurrecting them (#866 compat shim)', () => {
        // An old persisted session / share-URL carries the inert legacy fields
        // removed in #866. They must be silently dropped on load — NOT written
        // back onto state via applySoloistPayload's unknown-key fall-through.
        instrumentReducer({
            type: ACTIONS.UPDATE_SB,
            payload: {
                pinnedProfile: 'evans',
                motifTracking: true,
                tension: 0.42, // a live key alongside them still applies
            },
        });
        expect(soloist.session.tension).toBe(0.42);
        expect((soloist as Record<string, unknown>).pinnedProfile).toBeUndefined();
        expect((soloist as Record<string, unknown>).motifTracking).toBeUndefined();
    });

    it('should return false for unknown actions', () => {
        const result = instrumentReducer({ type: 'UNKNOWN_ACTION', payload: {} });
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
