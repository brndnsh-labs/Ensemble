import { describe, expect, it } from 'vitest';
import { DRUM_PRESETS } from '../../public/data/drum-presets.js';
import { BASS_STYLES, CHORD_STYLES, SOLOIST_STYLES } from '../../public/data/instrument-styles.js';

describe('Genre Expansion Integration', () => {
    describe('Definitions', () => {
        it('should have Country (Two-Step) drum preset', () => {
            expect(DRUM_PRESETS['Country (Two-Step)']).toBeDefined();
            expect(DRUM_PRESETS['Country (Two-Step)'].category).toBe('Country/Folk');
            expect(DRUM_PRESETS['Country (Two-Step)'].Kick).toBeDefined();
        });

        it('should have Metal (Speed) drum preset', () => {
            expect(DRUM_PRESETS['Metal (Speed)']).toBeDefined();
            expect(DRUM_PRESETS['Metal (Speed)'].category).toBe('Rock/Metal');
        });

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
