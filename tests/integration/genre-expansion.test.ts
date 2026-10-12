import { describe, expect, it } from 'vitest';
import { BASS_STYLES, CHORD_STYLES, SOLOIST_STYLES } from '../../public/data/instrument-styles.js';

describe('Genre Expansion Integration', () => {
    describe('Definitions', () => {
        it('should have new Chord Styles', () => {
            expect(CHORD_STYLES).toContain('strum-country');
            expect(CHORD_STYLES).toContain('power-metal');
        });

        it('should have new Bass Styles', () => {
            expect(BASS_STYLES).toContain('country');
            expect(BASS_STYLES).toContain('metal');
        });

        it('should have new Soloist Styles', () => {
            expect(SOLOIST_STYLES).toContain('country');
            expect(SOLOIST_STYLES).toContain('metal');
        });
    });
});
