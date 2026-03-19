// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { getFormattedChordNames } from '../../public/engine/chords-engine.js';

describe('Chord Formatting Verification', () => {
    it('correctly formats im9 rendering', () => {
        // "im9"
        const quality = 'm9';
        const is7th = true;
        const rootName = 'C';
        const rootNNS = '1';
        const rootRomanBase = 'I';

        const formatted = getFormattedChordNames(rootName, rootNNS, rootRomanBase, quality, is7th);

        expect(formatted.roman.root).toBe('i');
        expect(formatted.roman.suffix).toBe('9');
        expect(formatted.roman.suffix).not.toContain('7');
    });

    it('correctly formats IV13 rendering', () => {
        // "IV13"
        const quality = '13';
        const is7th = true;

        const formatted = getFormattedChordNames('F', '4', 'IV', quality, is7th);

        expect(formatted.roman.root).toBe('IV');
        expect(formatted.roman.suffix).toBe('13');
    });

    it('correctly formats other extended chords', () => {
        const cases = [
            { rootBase: 'I', quality: 'm11', is7th: true, expectedRoot: 'i', expectedSuffix: '11' },
            { rootBase: 'I', quality: 'm13', is7th: true, expectedRoot: 'i', expectedSuffix: '13' },
            { rootBase: 'IV', quality: '9', is7th: true, expectedRoot: 'IV', expectedSuffix: '9' },
            {
                rootBase: 'IV',
                quality: '11',
                is7th: true,
                expectedRoot: 'IV',
                expectedSuffix: '11',
            },
            { rootBase: 'V', quality: '9', is7th: true, expectedRoot: 'V', expectedSuffix: '9' },
            { rootBase: 'V', quality: '11', is7th: true, expectedRoot: 'V', expectedSuffix: '11' },
            { rootBase: 'V', quality: '13', is7th: true, expectedRoot: 'V', expectedSuffix: '13' },
            { rootBase: 'V', quality: 'm9', is7th: true, expectedRoot: 'v', expectedSuffix: '9' }, // "vm9"
            { rootBase: 'V', quality: 'm11', is7th: true, expectedRoot: 'v', expectedSuffix: '11' }, // "vm11"
            { rootBase: 'V', quality: 'm13', is7th: true, expectedRoot: 'v', expectedSuffix: '13' }, // "vm13"
        ];

        cases.forEach(({ rootBase, quality, is7th, expectedRoot, expectedSuffix }) => {
            const formatted = getFormattedChordNames('C', '1', rootBase, quality, is7th);
            expect(formatted.roman.root).toBe(expectedRoot);
            expect(formatted.roman.suffix).toBe(expectedSuffix);
        });
    });
});
