import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arranger } from '../../../public/state/arranger.js';
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
        instrumentReducer(ACTIONS.RESET_STATE);
        arranger.key = 'C';
    });

    it('should reset all instruments to default values', () => {
        soloist.enabled = true;
        soloist.volume = 0.9;
        instrumentReducer(ACTIONS.RESET_STATE);
        expect(soloist.enabled).toBe(false);
        expect(soloist.volume).toBe(0.5);
    });

    it('should clear soloist buffer when performance modal opens', () => {
        soloist.buffer.set(1, {});
        instrumentReducer(ACTIONS.SET_MODAL_OPEN, { modal: 'performance', open: true });
        expect(soloist.buffer.size).toBe(0);

        // Should return false for other modals
        const result = instrumentReducer(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        expect(result).toBe(false);
    });

    it('should handle MusicXML import with transposition', () => {
        arranger.key = 'G';
        const payload = {
            xmlKey: 'C',
            leadSheetMelody: [{ step: 0, midi: 60 }],
        };
        instrumentReducer(ACTIONS.IMPORT_MUSICXML, payload);
        expect(soloist.style).toBe('lead_sheet');
        expect(soloist.leadSheetMelody[0].midi).toBe(67);
    });

    it('should clear lead sheet', () => {
        soloist.leadSheetMelody = [{ midi: 60 }];
        soloist.lastSmartStyle = 'blues';
        instrumentReducer(ACTIONS.CLEAR_LEAD_SHEET);
        expect(soloist.leadSheetMelody.length).toBe(0);
        expect(soloist.style).toBe('blues');
    });

    it('should set style for modules', () => {
        instrumentReducer(ACTIONS.SET_STYLE, { module: 'bass', style: 'funk' });
        expect(bass.style).toBe('funk');

        // Invalid module
        instrumentReducer(ACTIONS.SET_STYLE, { module: 'invalid', style: 'funk' });
    });

    it('should set density for chords', () => {
        instrumentReducer(ACTIONS.SET_DENSITY, 'rich');
        expect(chords.density).toBe('rich');
    });

    it('should set volume, reverb and octave for modules', () => {
        instrumentReducer(ACTIONS.SET_VOLUME, { module: 'chords', value: 0.8 });
        expect(chords.volume).toBe(0.8);
        instrumentReducer(ACTIONS.SET_REVERB, { module: 'harmony', value: 0.2 });
        expect(harmony.reverb).toBe(0.2);
        instrumentReducer(ACTIONS.SET_OCTAVE, { module: 'soloist', value: 84 });
        expect(soloist.octave).toBe(84);
    });

    it('should set piano roots', () => {
        instrumentReducer(ACTIONS.SET_PIANO_ROOTS, true);
        expect(chords.pianoRoots).toBe(true);
    });

    it('should set soloist mode and preset', () => {
        instrumentReducer(ACTIONS.SET_SOLOIST_MODE, 'guitar');
        expect(soloist.mode).toBe('guitar');
        instrumentReducer(ACTIONS.SET_SOLOIST_PRESET, 'neo');
        expect(soloist.preset).toBe('neo');
    });

    it('should handle session resets and steps', () => {
        soloist.sessionSteps = 100;
        instrumentReducer(ACTIONS.RESET_SESSION);
        expect(soloist.sessionSteps).toBe(0);
        instrumentReducer(ACTIONS.SET_SESSION_STEPS, 50);
        expect(soloist.sessionSteps).toBe(50);
    });

    it('should update conductor decisions', () => {
        instrumentReducer(ACTIONS.UPDATE_CONDUCTOR_DECISION, { density: 'thin', hookProb: 0.9 });
        expect(chords.density).toBe('thin');
        expect(soloist.hookRetentionProb).toBe(0.9);
    });

    it('should handle SET_GENRE_FEEL for all instruments', () => {
        const payload = { chord: 'pad', bass: 'slap', soloist: 'shred', harmony: 'strings' };
        instrumentReducer(ACTIONS.SET_GENRE_FEEL, payload);
        expect(chords.style).toBe('pad');
        expect(bass.style).toBe('slap');
        expect(soloist.style).toBe('shred');
        expect(harmony.style).toBe('strings');
    });

    it('should update HB and SB state', () => {
        instrumentReducer(ACTIONS.UPDATE_HB, { style: 'horns' });
        expect(harmony.style).toBe('horns');
        instrumentReducer(ACTIONS.UPDATE_SB, { tension: 0.5 });
        expect(soloist.tension).toBe(0.5);
    });

    it('should set active tabs for modules', () => {
        instrumentReducer(ACTIONS.SET_ACTIVE_TAB, { module: 'bass', tab: 'classic' });
        expect(bass.activeTab).toBe('classic');
        // Groove should be ignored here (handled elsewhere)
        const result = instrumentReducer(ACTIONS.SET_ACTIVE_TAB, { module: 'groove', tab: 'grid' });
        expect(result).toBe(false);
        // Invalid module
        const invalidResult = instrumentReducer(ACTIONS.SET_ACTIVE_TAB, {
            module: 'invalid',
            tab: 'grid',
        });
        expect(invalidResult).toBe(true); // Since it hits the default return true at the end of the block
    });

    it('should return false for unknown actions', () => {
        const result = instrumentReducer('UNKNOWN_ACTION', {});
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
                instrumentReducer(ACTIONS.SET_PARAM, { module: 'chords', param: p, value: v });
                expect(chords[p]).toBe(v);
            }
        });

        it('should update bass parameters', () => {
            const params = {
                enabled: false,
                volume: 0.1,
                instrument: 'Synth',
            };
            for (const [p, v] of Object.entries(params)) {
                instrumentReducer(ACTIONS.SET_PARAM, { module: 'bass', param: p, value: v });
                expect(bass[p]).toEqual(v);
            }
        });

        it('should update soloist parameters', () => {
            const params = {
                enabled: true,
                volume: 0.1,
                instrument: 'Sax',
            };
            for (const [p, v] of Object.entries(params)) {
                instrumentReducer(ACTIONS.SET_PARAM, { module: 'soloist', param: p, value: v });
                expect(soloist[p]).toEqual(v);
            }
        });

        it('should update harmony parameters', () => {
            const params = {
                enabled: true,
                volume: 0.1,
                instrument: 'Trumpet',
            };
            for (const [p, v] of Object.entries(params)) {
                instrumentReducer(ACTIONS.SET_PARAM, { module: 'harmony', param: p, value: v });
                expect(harmony[p]).toEqual(v);
            }
        });

        it('should alias harmonies module to harmony', () => {
            instrumentReducer(ACTIONS.SET_PARAM, { module: 'harmonies', param: 'volume', value: 0.8 });
            expect(harmony.volume).toEqual(0.8);
        });
    });
});
