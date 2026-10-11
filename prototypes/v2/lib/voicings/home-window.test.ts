/**
 * The home window's key rule (#1598): where a guitarist's hand sits for a key, and that an F
 * blues voiced there is first-position shells.
 */
import { notePc, parseChord } from '@band/index';
import { describe, expect, it } from 'vitest';
import { voicingChord } from './adapter';
import { HOME_FRETS, keyHomeWindow, lowestFret } from './home-window';
import { GUITAR } from './instruments';
import { mod } from './theory';
import { voiceChart } from './voicing';

const LOW = [6, 5];
const window = (key: string, minor = false) =>
    keyHomeWindow(GUITAR, LOW, { tonic: notePc(key), minor });

/** A grip as a player writes it, 6th string first, `x` for a string left out. */
const frets = (v: { notes: { string: number; fret: number }[] }): string =>
    [6, 5, 4, 3, 2, 1].map((s) => v.notes.find((n) => n.string === s)?.fret ?? 'x').join(' ');

describe('lowestFret', () => {
    it('finds a pitch class nearest the nut on a string, never on the open string', () => {
        // F and B♭ at the 1st fret of the 6th and 5th strings; C at the 3rd of the 5th.
        expect(lowestFret(GUITAR, 6, notePc('F'))).toBe(1);
        expect(lowestFret(GUITAR, 5, notePc('Bb'))).toBe(1);
        expect(lowestFret(GUITAR, 5, notePc('C'))).toBe(3);
        // The open string's own note is the 12th fret, not fret 0.
        expect(lowestFret(GUITAR, 6, notePc('E'))).toBe(12);
        expect(lowestFret(GUITAR, 5, notePc('A'))).toBe(12);
    });
});

describe('keyHomeWindow on a guitar', () => {
    it('sits on frets 1–6 for C, F and the flat keys and 2–7 for the sharp keys', () => {
        const major = Object.fromEntries(
            ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map((k) => [
                k,
                window(k).join('–'),
            ]),
        );
        expect(major).toEqual({
            C: '1–6',
            Db: '1–6',
            D: '2–7',
            Eb: '1–6',
            E: '2–7',
            F: '1–6',
            'F#': '1–6',
            G: '2–7',
            Ab: '1–6',
            A: '2–7',
            Bb: '1–6',
            B: '2–7',
        });
    });

    it('sits a minor key by its own i, iv and v, not by its relative major', () => {
        const minor = Object.fromEntries(
            ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'].map((k) => [
                k,
                window(k, true).join('–'),
            ]),
        );
        expect(minor).toEqual({
            C: '1–6',
            'C#': '2–7',
            D: '1–6',
            Eb: '1–6',
            E: '2–7',
            F: '1–6',
            'F#': '2–7',
            G: '1–6',
            'G#': '1–6',
            // A minor's v is E, at the 7th fret: 2–7, where C major (its relative) sits on 1–6.
            A: '2–7',
            Bb: '1–6',
            B: '2–7',
        });
    });

    it('holds the I, IV and V roots on the 6th or 5th string in every key, major and minor', () => {
        for (let tonic = 0; tonic < 12; tonic++) {
            for (const minor of [false, true]) {
                const [from, to] = keyHomeWindow(GUITAR, LOW, { tonic, minor });
                expect(to - from + 1).toBe(HOME_FRETS);
                // Never up the neck: every key has a position at the nut or a fret above it.
                expect(from).toBeLessThanOrEqual(2);
                for (const interval of [0, 5, 7]) {
                    const pc = mod(tonic + interval, 12);
                    const inside = LOW.some((s) => {
                        const f = lowestFret(GUITAR, s, pc);
                        return f >= from && f <= to;
                    });
                    expect(inside, `key ${tonic}${minor ? 'm' : ''}, root +${interval}`).toBe(true);
                }
            }
        }
    });
});

describe('an F blues in its key window', () => {
    const key = { tonic: notePc('F'), minor: false };
    const blues = 'F7 Bb7 F7 F7 Bb7 Bb7 F7 D7 Gm7 C7 F7 C7'.split(' ');
    const chords = blues.map((symbol) => voicingChord(parseChord(symbol, key)!, 'F', false, ''));
    const home = keyHomeWindow(GUITAR, LOW, key);

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
