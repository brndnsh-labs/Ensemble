/**
 * The window the stand opens on (#1598, #1840): first position, frets 1 to `HOME_FRETS`, and
 * that an F blues voiced there is first-position shells.
 */
import { notePc, parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import { voicingChord } from './adapter';
import { HOME_FRETS } from './home-window';
import { GUITAR } from './instruments';
import type { HomeWindow } from './types';
import { voiceChart } from './voicing';

const LOW = [6, 5];

/** A grip as a player writes it, 6th string first, `x` for a string left out. */
const frets = (v: { notes: { string: number; fret: number }[] }): string =>
    [6, 5, 4, 3, 2, 1].map((s) => v.notes.find((n) => n.string === s)?.fret ?? 'x').join(' ');

describe('an F blues in first position', () => {
    const key = { tonic: notePc('F'), minor: false };
    const blues = 'F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7'.split(' ');
    const chords = blues.map((symbol) => voicingChord(parseChord(symbol, key)!, 'F', false, ''));
    const home: HomeWindow = [1, HOME_FRETS];

    it('opens on first-position shells: F7 on the 6th string, B♭7 on the 5th, both at fret 1', () => {
        const voiced = voiceChart(chords, { instrument: GUITAR, home });
        expect(frets(voiced[0])).toBe('1 x 1 2 x x');
        expect(frets(voiced[1])).toBe('x 1 x 1 3 x');
        // The old fixed window hid fret 1, so the same chart opened on a 4th-string F7.
        const before = voiceChart(chords, { instrument: GUITAR, home: [2, 7] });
        expect(frets(before[0])).toBe('x x 3 x 4 5');
    });

    it('with roots kept to the 6th and 5th strings, plays the whole form in first position', () => {
        const voiced = voiceChart(chords, { instrument: GUITAR, home, rootStrings: LOW });
        expect(voiced.map((v) => `${v.symbol} ${frets(v)}`)).toEqual([
            'F7 1 x 1 2 x x',
            'B♭7 x 1 x 1 3 x',
            'F7 1 x 1 2 x x',
            'F7 1 x 1 2 x x',
            'B♭7 x 1 x 1 3 x',
            'B♭7 x 1 x 1 3 x',
            'F7 1 x 1 2 x x',
            'D7 x 5 4 5 x x',
            'Gm7 3 x 3 3 x x',
            'C7 x 3 2 3 x x',
            'F7 1 x 1 2 x x',
            'C7 x 3 2 3 x x',
        ]);
    });
});
