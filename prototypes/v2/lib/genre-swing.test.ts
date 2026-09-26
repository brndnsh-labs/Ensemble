import { STYLES } from '@band/index';
import { GENRE_NAMES, SMART_GENRES } from '@engine/data/smart-genres';
import { describe, expect, it } from 'vitest';
import { STYLE_FOR_GENRE } from './band-voices';
import { genreSwing } from './genre-swing';

describe('genreSwing — the band style is the one swing authority', () => {
    it("gives every genre its band style's swing and grid", () => {
        for (const genre of GENRE_NAMES) {
            const { feel } = STYLES[STYLE_FOR_GENRE[genre]];
            expect(genreSwing(genre), genre).toEqual({
                swing: feel.swing,
                swingSub: feel.swingGrid === 16 ? '16th' : '8th',
            });
        }
    });

    it('plays the numbers Brandon passed by ear (2026-09-26)', () => {
        expect(genreSwing('Jazz')).toEqual({ swing: 60, swingSub: '8th' });
        expect(genreSwing('Blues')).toEqual({ swing: 100, swingSub: '8th' });
        expect(genreSwing('Neo-Soul')).toEqual({ swing: 45, swingSub: '16th' });
        expect(genreSwing('Funk')).toEqual({ swing: 15, swingSub: '16th' });
    });

    it('has no answer for a name without a band style, prototype keys included', () => {
        expect(genreSwing('Polka')).toBeNull();
        expect(genreSwing('constructor')).toBeNull();
    });

    it('leaves no second source: the genre table carries no swing', () => {
        // (The old engine's drum presets were the other source; they are gone, 2026-09-26.)
        for (const [name, genre] of Object.entries(SMART_GENRES)) {
            expect(Object.hasOwn(genre, 'swing'), name).toBe(false);
            expect(Object.hasOwn(genre, 'sub'), name).toBe(false);
        }
    });
});
