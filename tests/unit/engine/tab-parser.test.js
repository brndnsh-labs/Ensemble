import { describe, expect, it, vi } from 'vitest';
import { countSyllables, detectKey, parseTab } from '../../../public/tab-parser.js';

// Mock generateId
vi.mock('../../../public/utils.js', () => ({
    generateId: () => `test-id-${Math.random().toString(36).substr(2, 9)}`,
}));

describe('Tab Parser', () => {
    describe('countSyllables', () => {
        it('should count vowel groups as syllables', () => {
            expect(countSyllables('Hello')).toBe(2);
            expect(countSyllables('Sunlight')).toBe(2);
            expect(countSyllables('Creeping')).toBe(2);
        });

        it('should handle silent e adjustment', () => {
            // "skate" has 1 syllable (silent e)
            expect(countSyllables('skate')).toBe(1);
            // "these" has 1
            expect(countSyllables('these')).toBe(1);
        });

        it('should count multiple words', () => {
            // "Under a trillion stars" -> Un-der (2) a (1) tril-lion (2) stars (1) = 6
            expect(countSyllables('Under a trillion stars')).toBe(6);
        });
    });

    describe('parseTab', () => {
        it('should detect capo information', () => {
            const tab = `
Capo: 2
[Verse]
G C D G
`;
            const { sections, capo } = parseTab(tab);
            expect(capo).toBe(2);
            expect(sections).toHaveLength(1);
            expect(sections[0].value).toBe('G | C | D | G');
        });

        it('should parse a simple section with chords and lyrics', () => {
            const tab = `
[Verse]
G          C
Hello there world
D          G
Nice to see you
`;
            const { sections } = parseTab(tab);
            expect(sections).toHaveLength(1);
            expect(sections[0].label).toBe('Verse');
            expect(sections[0].value).toBe('G | C | D | G');
            expect(sections[0].syllables).toEqual([2, 2, 2, 2]);
        });

        it('should handle repeat notations like x2', () => {
            const tab = `
[Intro]
Em C G D x2
`;
            const { sections } = parseTab(tab);
            expect(sections[0].repeat).toBe(2);
            expect(sections[0].value).toBe('Em | C | G | D');
        });

        it('should handle jazz headers and m7b5 notation', () => {
            const tab = `
INTRO: Gbm7 F7 Em7 A7 D A7 (x2)
#1.
A7                D                    Dm7  G7
Somewhere there's music..how faint the tune?
`;
            const { sections } = parseTab(tab);
            expect(sections).toHaveLength(2);
            expect(sections[0].label).toBe('INTRO');
            expect(sections[0].repeat).toBe(2);
            expect(sections[0].value).toBe('Gbm7 | F7 | Em7 | A7 | D | A7');
            expect(sections[1].label).toBe('1.');
            expect(sections[1].value).toBe('A7 | D | Dm7 | G7');
        });

        it('should handle pipe-aware bars and measure grouping', () => {
            const tab = `
[Intro]
| F Dm Bb Gm9 | Ebmaj7 | % |
`;
            const { sections } = parseTab(tab);
            expect(sections).toHaveLength(1);
            expect(sections[0].value).toBe('F Dm Bb Gm9 | Ebmaj7 | Ebmaj7');
        });
    });

    describe('detectKey', () => {
        it('should detect G Major for a simple G-C-D progression', () => {
            const sections = [{ value: 'G | C | D | G', repeat: 1 }];
            const result = detectKey(sections);
            expect(result.key).toBe('G');
            expect(result.isMinor).toBe(false);
            expect(result.confidence).toBeGreaterThan(0.5);
        });

        it('should detect A Minor for Am-Dm-E7', () => {
            const sections = [{ value: 'Am | Dm | E7 | Am', repeat: 1 }];
            const result = detectKey(sections);
            expect(result.key).toBe('A');
            expect(result.isMinor).toBe(true);
        });

        it('should handle weighted scoring for first/last chords', () => {
            // Even if there are many other chords, the first chord G strongly suggests G
            const sections = [{ value: 'G | F | Eb | Bb', repeat: 1 }];
            const result = detectKey(sections);
            expect(result.key).toBe('G');
        });
    });
});
