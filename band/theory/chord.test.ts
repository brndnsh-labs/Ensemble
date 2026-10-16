import { isScoreChord, SCORE_CHORD_QUALITIES } from '../../public/songbook/score-text.js';
import { type CompInstrument, DEFAULT_SETTINGS } from '../core/types.js';
import { compileTimeline } from '../form/timeline.js';
import { performPass } from '../perform.js';
import { COMP_INSTRUMENTS } from '../players/comp/instruments.js';
import { STYLE_IDS } from '../styles/index.js';
import { score } from '../test/scores.js';
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

    it('reads a lowercase numeral with 11 as a minor 11th, and keeps the other 11ths (#1674)', () => {
        // ii11 in C: D F A C E G, a minor third under the 11.
        expect(facts('ii11', C).intervals).toEqual([0, 3, 7, 10, 14, 17]);
        expect(names('ii11')).toBe('D F A C E G');
        expect(facts('i11', C).intervals).toEqual([0, 3, 7, 10, 14, 17]);
        expect(facts('vi11', C).intervals).toEqual(facts('Am11', C).intervals);
        // An accidental or a slash bass does not change the reading.
        expect(facts('bvii11', C).intervals).toEqual([0, 3, 7, 10, 14, 17]);
        expect(facts('ii11/V', C).intervals).toEqual([0, 3, 7, 10, 14, 17]);
        // The dominant 11th (no third) stays for uppercase numerals and letter names.
        for (const symbol of ['V11', 'I11', 'G11', 'C11']) {
            expect(facts(symbol, C).intervals).toEqual([0, 7, 10, 14, 17]);
        }
        expect(facts('Cm11', C).intervals).toEqual([0, 3, 7, 10, 14, 17]);
        // Lowercase 9 and 13 already keep the minor third.
        expect(facts('ii9', C).intervals).toEqual([0, 3, 7, 10, 14]);
        expect(facts('ii13', C).intervals).toEqual([0, 3, 7, 10, 14, 21]);
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

    // #1343: the old engine dropped the written b6 of iReal's min7b6 / min9b6 and then offered
    // a dorian natural 6 a semitone above it. The band keeps the b6, `chordScale` hears it as
    // aeolian on any degree, and `reconcile` would displace a template's 6 behind that.
    it.each(['-b6', 'mb6', 'min7b6', 'min9b6'])(
        '%s keeps its b6 and never offers the natural 6, on every root in both modes',
        (quality) => {
            const roots = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            for (const key of [C, { tonic: 0, minor: true }]) {
                for (const root of roots) {
                    const symbol = `${root}${quality}`;
                    const chord = facts(symbol, key);
                    expect(chord.intervals.map(mod12), symbol).toContain(8);
                    expect(chord.scale, symbol).toContain(8);
                    expect(chord.scale, symbol).not.toContain(9);
                }
            }
        },
    );

    it('gives a b9 over a #5 the altered scale, and over a natural 5th phrygian dominant (#1580)', () => {
        // 7b9#5 has no natural 5th and no 11th for a line to land on; 7b9b13 keeps its 5th.
        expect(facts('G7b9#5', C).scale).toEqual([0, 1, 3, 4, 6, 8, 10]);
        expect(facts('G7b9b13', C).scale).toEqual([0, 1, 4, 5, 7, 8, 10]);
    });

    it('reads both minor 13ths without the 11th (#1580)', () => {
        expect(facts('Dm13', C).intervals).toEqual([0, 3, 7, 10, 14, 21]);
        expect(facts('Dmin13', C).intervals).toEqual([0, 3, 7, 10, 14, 21]);
        expect(facts('Dmin^13', C).intervals).toEqual([0, 3, 7, 11, 14, 21]);
    });
});

/**
 * #1737: three jazz dominants a measure-less chart could hold, added so its conversion keeps
 * them. Their tones come from their names (a ♭13 over a chord that keeps its 5th, as `7b13`
 * does), and the band voices them in every lane's register on every style and comp instrument.
 * The chord-symbol oracle (`tests/oracle/`) holds the comp's notes to the symbols.
 */
describe('the dominants added for the text-chart converter', () => {
    it.each([
        ['G7#9b13', [7, 11, 2, 5, 10, 3]],
        ['G9b13', [7, 11, 2, 5, 9, 3]],
        ['G13b9#11', [7, 11, 2, 5, 8, 1, 4]],
    ])('%s sounds the tones its name spells', (symbol, pcs) => {
        const chord = parseChord(symbol, C);
        expect(chord && new Set(chordPcs(chord))).toEqual(new Set(pcs));
    });

    it('every lane keeps to its register on them, in every style and comp instrument', () => {
        const timeline = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'Dm9 | G7#9b13 | C^9 | A9b13 | Dm9 | G13b9#11 | C^9 | C^9',
                },
            ]),
        );
        const problems: string[] = [];
        for (const style of STYLE_IDS) {
            for (const comp of Object.keys(COMP_INSTRUMENTS) as CompInstrument[]) {
                const settings = {
                    ...DEFAULT_SETTINGS,
                    style,
                    comp,
                    seed: 'widened',
                    lanes: { drums: true, bass: true, comp: true, lead: false },
                };
                const { events } = performPass(timeline, settings, { pass: 0, looping: true });
                const comps = COMP_INSTRUMENTS[comp].range;
                for (const e of events) {
                    if (e.lane !== 'bass' && e.lane !== 'comp') {
                        continue;
                    }
                    const range = e.lane === 'bass' ? [23, 57] : comps;
                    if (e.midi < range[0] || e.midi > range[1]) {
                        problems.push(`${style}/${comp}: ${e.lane} ${e.midi}`);
                    }
                }
                expect(events.some((e) => e.lane === 'comp')).toBe(true);
            }
        }
        expect(problems).toEqual([]);
    });
});
