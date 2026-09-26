import { describe, expect, it } from 'vitest';
import { BASS_STYLES, CHORD_STYLES, SOLOIST_STYLES } from '../../public/data/instrument-styles.js';

describe('Genre Expansion Integration', () => {
    describe('Definitions', () => {
        it('should have new Chord Styles', () => {
            expect(CHORD_STYLES.find((s) => s.id === 'strum-country')).toBeDefined();
            expect(CHORD_STYLES.find((s) => s.id === 'power-metal')).toBeDefined();
        });

        it('should have new Bass Styles', () => {
            expect(BASS_STYLES.find((s) => s.id === 'country')).toBeDefined();
            expect(BASS_STYLES.find((s) => s.id === 'metal')).toBeDefined();
        });

        it('should have new Soloist Styles', () => {
            expect(SOLOIST_STYLES.find((s) => s.id === 'country')).toBeDefined();
            expect(SOLOIST_STYLES.find((s) => s.id === 'metal')).toBeDefined();
        });
    });
});
