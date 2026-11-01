import { describe, expect, it } from 'vitest';
import { transposeChordText } from '../../../core/engine/transpose.js';

// #777: the single shared chord-text transposer. Covers the slash-bass bug and round-trip
// pitch stability (the relative-key rewrite went with the text chart, #1740).
// Pure function — no mocks needed (real config + real normalizeKey).

describe('transposeChordText — transpose', () => {
    it('transposes note-name roots by +delta', () => {
        expect(transposeChordText('C F G', 2)).toBe('D G A');
    });

    it('leaves Roman numerals intact (key-relative; the key label moves instead)', () => {
        expect(transposeChordText('I V vi IV', 2)).toBe('I V vi IV');
    });

    it('leaves Nashville numbers intact', () => {
        expect(transposeChordText('1 5 6- 4', 2)).toBe('1 5 6- 4');
    });

    it('transposes the slash bass together with the root (#777 — was the bug)', () => {
        // Previously transposeKey split a regex that omitted "/", so the bass stayed put:
        // C/E +2 -> D/E. With the shared "/"-aware tokenizer the bass moves too.
        expect(transposeChordText('C/E', 2)).toBe('D/Gb');
        expect(transposeChordText('Am7/G', 5)).toBe('Dm7/C');
        expect(transposeChordText('C/E F/A | G/B', 2)).toBe('D/Gb G/B | A/Db');
    });

    it('preserves chord suffixes/quality while moving the root', () => {
        expect(transposeChordText('Cmaj7 Am7b5', 2)).toBe('Dmaj7 Bm7b5');
    });

    it('normalizes Unicode accidentals in the root but preserves the rest', () => {
        expect(transposeChordText('A♭maj7 | C♯m7', 1)).toBe('Amaj7 | Dm7');
    });

    it('uses a robust modulo (handles shifts beyond ±12)', () => {
        expect(transposeChordText('C', 14)).toBe('D'); // +14 == +2
        expect(transposeChordText('C', -13)).toBe('B'); // -13 == -1
    });
});

describe('transposeChordText — spelling from the target key (#1977)', () => {
    const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    // The key picker is all-flat, so a sharp minor like F# minor arrives as Gb and spells flat.
    const SHARP_MAJOR = new Set(['G', 'D', 'A', 'E', 'B']);
    const SHARP_MINOR = new Set(['E', 'B']);
    const every = KEYS.map((r) => `${r}m7/${r}`).join(' ');

    for (const isMinor of [false, true]) {
        for (const key of KEYS) {
            const sharp = (isMinor ? SHARP_MINOR : SHARP_MAJOR).has(key);
            it(`${key}${isMinor ? ' minor' : ''}: no ${sharp ? 'flat' : 'sharp'} roots or basses`, () => {
                const out = transposeChordText(every, 0, { key, isMinor });
                expect(out).not.toMatch(sharp ? /[A-G]b/ : /[A-G]#/);
            });
        }
    }

    it('Autumn Leaves in E minor reads F#m7b5 B7b9 Em', () => {
        expect(transposeChordText('Am7b5 D7b9 Gm', 9, { key: 'E', isMinor: true })).toBe(
            'F#m7b5 B7b9 Em',
        );
    });
    it('Autumn Leaves in F minor reads Gm7b5 C7b9 Fm', () => {
        expect(transposeChordText('Am7b5 D7b9 Gm', 10, { key: 'F', isMinor: true })).toBe(
            'Gm7b5 C7b9 Fm',
        );
    });
    it('spells a slash bass from the target key too', () => {
        expect(transposeChordText('C/E', 2, { key: 'D', isMinor: false })).toBe('D/F#');
    });
});

describe('transposeChordText — round-trip', () => {
    it('round-trips +n then -n back to the original (flat-canonical input)', () => {
        const fixture = 'C/E F | Am7/G | Dmaj7';
        expect(transposeChordText(transposeChordText(fixture, 5), -5)).toBe(fixture);
    });

    it('a full octave (+12) is the identity', () => {
        const fixture = 'Db/Gb Bb | Ebm7';
        expect(transposeChordText(fixture, 12)).toBe(fixture);
    });
});
