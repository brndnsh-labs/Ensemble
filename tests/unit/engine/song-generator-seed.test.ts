import { describe, expect, it } from 'vitest';
import { chordsFromSectionValue, parseSeedText } from '../../../public/song/song-generator-seed.js';

describe('parseSeedText', () => {
    it('parses Roman numerals separated by spaces', () => {
        expect(parseSeedText('I vi IV V')).toEqual(['I', 'vi', 'IV', 'V']);
    });

    it('parses Roman numerals separated by dashes', () => {
        expect(parseSeedText('I-V-vi-IV')).toEqual(['I', 'V', 'vi', 'IV']);
    });

    it('parses minor Roman numerals with accidentals', () => {
        expect(parseSeedText('i bVI bIII bVII')).toEqual(['i', 'bVI', 'bIII', 'bVII']);
    });

    it('parses letter chords', () => {
        expect(parseSeedText('C Am F G')).toEqual(['C', 'Am', 'F', 'G']);
    });

    it('parses letter chords with qualities', () => {
        expect(parseSeedText('Cmaj7 Am7 F G7')).toEqual(['Cmaj7', 'Am7', 'F', 'G7']);
    });

    it('handles pipe separators', () => {
        expect(parseSeedText('I | IV | V | I')).toEqual(['I', 'IV', 'V', 'I']);
    });

    it('handles commas', () => {
        expect(parseSeedText('C, Am, F, G')).toEqual(['C', 'Am', 'F', 'G']);
    });

    it('drops empty and non-chord tokens', () => {
        expect(parseSeedText('I    V  garbage_token vi IV')).toEqual(['I', 'V', 'vi', 'IV']);
    });

    it('returns empty array for empty input', () => {
        expect(parseSeedText('')).toEqual([]);
        expect(parseSeedText(null as unknown as string)).toEqual([]);
        expect(parseSeedText(undefined as unknown as string)).toEqual([]);
    });
});

describe('chordsFromSectionValue', () => {
    it('splits the canonical pipe-delimited chord value', () => {
        expect(chordsFromSectionValue('I | IV | V | I')).toEqual(['I', 'IV', 'V', 'I']);
    });

    it('handles extra whitespace', () => {
        expect(chordsFromSectionValue('I |   IV |V|I  ')).toEqual(['I', 'IV', 'V', 'I']);
    });

    it('handles empty strings', () => {
        expect(chordsFromSectionValue('')).toEqual([]);
    });
});
