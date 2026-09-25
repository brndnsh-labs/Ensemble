import { isScoreChord, SCORE_CHORD_QUALITIES } from '../../public/songbook/score-text.js';
import { chordPcs, KNOWN_QUALITIES, parseChord } from './chord.js';
import { mod12, notePc } from './pitch.js';

const C = { tonic: 0, minor: false };

describe('chord parity with the chart codec', () => {
    it('knows every quality spelling the codec accepts, and nothing it rejects', () => {
        const missing = [...SCORE_CHORD_QUALITIES].filter((q) => !KNOWN_QUALITIES.has(q));
        expect(missing).toEqual([]);
        const extra = [...KNOWN_QUALITIES].filter((q) => !isScoreChord(`C${q}`));
        expect(extra).toEqual([]);
    });

    it('parses every codec-valid symbol on every kind of root, with and without a slash bass', () => {
        for (const quality of SCORE_CHORD_QUALITIES) {
            for (const root of ['C', 'F#', 'Bb', 'bVII', 'ii', '5', 'b3']) {
                for (const symbol of [`${root}${quality}`, `${root}${quality}/E`]) {
                    if (!isScoreChord(symbol)) {
                        continue;
                    }
                    expect(parseChord(symbol, C), symbol).not.toBeNull();
                }
            }
        }
    });
});

describe('chord facts', () => {
    const facts = (symbol: string, key = C) => {
        const chord = parseChord(symbol, key);
        if (!chord) {
            throw new Error(`unparsed ${symbol}`);
        }
        return chord;
    };
    const names = (symbol: string, key = C) =>
        chordPcs(facts(symbol, key))
            .map((pc) => ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][pc])
            .join(' ');

    it.each([
        ['Cmaj7', 'C E G B', 'major'],
        ['C^', 'C E G B', 'major'],
        ['Cmaj', 'C E G', 'major'],
        ['Dm7', 'D F A C', 'minor'],
        ['G7', 'G B D F', 'dominant'],
        ['Bh7', 'B D F A', 'half-diminished'],
        ['Bo7', 'B D F Ab', 'diminished'],
        ['G7alt', 'G B F Ab Bb Eb', 'dominant'],
        ['G11', 'G D F A C', 'dominant'],
        ['G7sus', 'G C D F', 'dominant'],
        ['Csus', 'C F G', 'sus'],
        ['C5', 'C G', 'power'],
        ['C+', 'C E Ab', 'augmented'],
        ['Cm6', 'C Eb G A', 'minor'],
        ['C6/9', 'C E G A D', 'major'],
    ] as const)('%s → %s (%s)', (symbol, tones, family) => {
        expect(names(symbol)).toBe(tones);
        expect(facts(symbol).family).toBe(family);
    });

    it('reads roman numerals and Nashville numbers against the key', () => {
        const F = { tonic: notePc('F'), minor: false };
        expect(facts('V7', F).root).toBe(notePc('C'));
        expect(facts('bVII', F).root).toBe(notePc('Eb'));
        expect(facts('4', F).root).toBe(notePc('Bb'));
        expect(facts('b3', F).root).toBe(notePc('Ab'));
    });

    it('treats a lowercase numeral as naming a minor third', () => {
        expect(names('ii7')).toBe('D F A C');
        expect(names('iv6')).toBe('F Ab C D');
        expect(names('ii7b5')).toBe('D F Ab C');
        // A numeral whose quality has no major third is unchanged.
        expect(names('viio7')).toBe('B D F Ab');
    });

    it('keeps the slash bass separate from the chord', () => {
        const chord = facts('C/E');
        expect(chord.root).toBe(0);
        expect(chord.bass).toBe(4);
        expect(facts('C6/9').bass).toBe(0);
        expect(facts('ii7/5').bass).toBe(7);
    });

    it('names guide tones and a chord scale that contains every chord tone', () => {
        expect(facts('G7').guides).toEqual([4, 10]);
        expect(facts('C6').guides).toEqual([4, 9]);
        expect(facts('G7sus').guides).toEqual([5, 10]);
        for (const quality of SCORE_CHORD_QUALITIES) {
            const chord = parseChord(`C${quality}`, C);
            if (!chord) {
                continue;
            }
            for (const n of chord.intervals) {
                // Power chords and sus2 triads borrow a scale; everything else must contain
                // its own chord tones so a passing tone never contradicts the chart.
                if (chord.family === 'power') {
                    continue;
                }
                expect(chord.scale, `C${quality}`).toContain(mod12(n));
            }
        }
    });
});
