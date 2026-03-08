import { beforeEach, describe, expect, it } from 'vitest';
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
        arranger.key = 'C'; // Default
    });

    it('should reset all instruments to default values', () => {
        soloist.enabled = true;
        soloist.volume = 0.9;

        instrumentReducer(ACTIONS.RESET_STATE);

        expect(soloist.enabled).toBe(false);
        expect(soloist.volume).toBe(0.5);
        expect(chords.enabled).toBe(true);
        expect(bass.enabled).toBe(true);
    });

    it('should handle MusicXML import with transposition (C to G)', () => {
        arranger.key = 'G'; // Global key
        const payload = {
            xmlKey: 'C',
            leadSheetMelody: [
                { step: 0, midi: 60 }, // C
                { step: 4, midi: 64 }, // E
            ],
        };

        instrumentReducer(ACTIONS.IMPORT_MUSICXML, payload);

        expect(soloist.style).toBe('lead_sheet');
        expect(soloist.enabled).toBe(true);
        // Transposition from C to G is +7 semitones (or -5)
        // KEY_ORDER: C, Db, D, Eb, E, F, Gb, G ...
        // G is index 7, C is index 0. interval = 7 - 0 = 7.
        expect(soloist.leadSheetMelody[0].midi).toBe(67); // G
        expect(soloist.leadSheetMelody[1].midi).toBe(71); // B
    });

    it('should handle MusicXML import with no transposition (C to C)', () => {
        arranger.key = 'C';
        const payload = {
            xmlKey: 'C',
            leadSheetMelody: [{ step: 0, midi: 60 }],
        };
        instrumentReducer(ACTIONS.IMPORT_MUSICXML, payload);
        expect(soloist.leadSheetMelody[0].midi).toBe(60);
    });

    it('should update all instruments when SET_GENRE_FEEL is dispatched', () => {
        const payload = {
            chord: 'jazz_comp',
            bass: 'walking',
            soloist: 'bird',
            harmony: 'horns',
        };

        instrumentReducer(ACTIONS.SET_GENRE_FEEL, payload);

        expect(chords.style).toBe('jazz_comp');
        expect(bass.style).toBe('walking');
        expect(soloist.style).toBe('bird');
        expect(harmony.style).toBe('horns');

        expect(chords.activeTab).toBe('smart');
        expect(bass.activeTab).toBe('smart');
    });

    it('should handle individual SET_STYLE for modules', () => {
        instrumentReducer(ACTIONS.SET_STYLE, { module: 'soloist', style: 'metal' });
        expect(soloist.style).toBe('metal');

        instrumentReducer(ACTIONS.SET_STYLE, { module: 'bass', style: 'funk' });
        expect(bass.style).toBe('funk');
    });

    it('should handle UPDATE_HB and UPDATE_SB for bulk updates', () => {
        instrumentReducer(ACTIONS.UPDATE_SB, { tension: 0.8, complexity: 0.9 });
        expect(soloist.tension).toBe(0.8);
        expect(soloist.complexity).toBe(0.9);

        instrumentReducer(ACTIONS.UPDATE_HB, { complexity: 0.1 });
        expect(harmony.complexity).toBe(0.1);
    });
});
