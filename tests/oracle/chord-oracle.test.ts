/**
 * The chord-symbol oracle. Two questions the band's own tests cannot ask, because they take
 * `band/theory/chord.ts` as the truth:
 *
 * 1. Does the band read each chord symbol the way an outside dictionary does?
 * 2. Does the comp ever play a note the symbol rules out?
 *
 * Question 1 anchors everything else: once the band's chord facts are shown to match the
 * reference, the invariant suite's guide-tone and chord-tone rules (which read those facts)
 * are checked against the outside world too, with no second copy of them here.
 *
 * The bass and the lead are not held to question 2. A walking line and a solo reach wrong
 * notes on purpose (approach notes, enclosures, blue notes), and telling a good one from a bad
 * one is Brandon's ear, not a rule.
 */

import {
    type BandSettings,
    type CompInstrument,
    DEFAULT_SETTINGS,
    type PitchedNote,
} from '../../band/core/types.js';
import { compileTimeline, type Timeline } from '../../band/form/timeline.js';
import { performPass } from '../../band/perform.js';
import { STYLE_IDS, STYLES } from '../../band/styles/index.js';
import { score } from '../../band/test/scores.js';
import { type ChordFacts, KNOWN_QUALITIES, parseChord } from '../../band/theory/chord.js';
import { mod12 } from '../../band/theory/pitch.js';
import { STYLE_FOR_GENRE } from '../../prototypes/v2/lib/band-voices.js';
import { buildStandardDocument, STANDARDS } from '../../prototypes/v2/lib/standards.js';
import { SCORE_CHORD_QUALITIES } from '../../public/songbook/score-text.js';
import { clashNotes } from './chord-clash.js';
import {
    ALIASES,
    COMPOSED,
    libraryKnows,
    type ReferenceChord,
    referenceQuality,
    referenceRoot,
} from './chord-reference.js';

const KEY = { tonic: 0, minor: false };
const DEGREES = ['1', '♭9', '9', '♭3', '3', '11', '♭5', '5', '♭6', '6', '♭7', '7'];
const ROOTS = [
    'C',
    'C#',
    'Db',
    'D',
    'D#',
    'Eb',
    'E',
    'F',
    'F#',
    'Gb',
    'G',
    'G#',
    'Ab',
    'A',
    'A#',
    'Bb',
    'B',
];

/**
 * Where the band and the dictionary read a symbol differently, and why the band's reading
 * stands. Pinned note for note (semitones above the root), so a change on either side fails
 * here and gets looked at. An empty table would be the ideal; a new row needs a reason a
 * player would recognise, never "the band plays it that way".
 */
const DIVERGENCES: Readonly<
    Record<string, { bandOnly: number[]; referenceOnly: number[]; why: string }>
> = {
    '7b13': {
        bandOnly: [7],
        referenceOnly: [],
        why: 'A ♭13 is a colour above the chord, which still has its 5th (the ♯5 chord is written 7#5). The dictionary drops the 5th.',
    },
    '7#9b5': {
        bandOnly: [],
        referenceOnly: [7],
        why: 'A written ♭5 replaces the 5th. The dictionary files this spelling under 7#9#11, which keeps it.',
    },
    '7b9b5': {
        bandOnly: [],
        referenceOnly: [7],
        why: 'A written ♭5 replaces the 5th. The dictionary files this spelling under 7b9#11, which keeps it.',
    },
    '7alt': {
        bandOnly: [1],
        referenceOnly: [],
        why: 'An altered dominant carries both altered 9ths (the altered scale has ♭9 and ♯9). The dictionary lists one voicing of it: ♯5 and ♯9.',
    },
    alt: { bandOnly: [1], referenceOnly: [], why: 'The same chord as 7alt.' },
};

function reference(quality: string): ReferenceChord {
    const chord = referenceQuality(quality);
    if (!chord) {
        throw new Error(
            `no reference for the quality '${quality}': add it to ALIASES (the dictionary's name for it) or COMPOSED in chord-reference.ts`,
        );
    }
    return chord;
}

/**
 * The reading the comp is held to: the reference, except where a pinned difference says the
 * dictionary misfiles the symbol. It reads a written ♭5 as a ♯11 over a natural 5th; the comp is
 * held to the ♭5 the chart wrote, as it is on a plain 7b5.
 */
function heldTo(quality: string): ReferenceChord {
    const chord = reference(quality);
    if (quality !== '7#9b5' && quality !== '7b9b5') {
        return chord;
    }
    const intervals = new Set([...chord.intervals].filter((i) => i !== '5P' && i !== '11A'));
    intervals.add('5d');
    return { ...chord, intervals };
}

/** The quality spelling of a note-name symbol: `Bbm7b5/Ab` → `m7b5`. */
function qualityOf(symbol: string): string {
    const tail = symbol.replace(/^[A-G][#b]?/, '');
    if (KNOWN_QUALITIES.has(tail)) {
        return tail;
    }
    const cut = tail.slice(0, Math.max(0, tail.lastIndexOf('/')));
    if (!KNOWN_QUALITIES.has(cut)) {
        throw new Error(`cannot read a quality out of '${symbol}'`);
    }
    return cut;
}

describe('the chord table against the reference', () => {
    it('every quality the band knows has a reference reading', () => {
        const missing = [...KNOWN_QUALITIES].filter((quality) => !referenceQuality(quality));
        expect(missing).toEqual([]);
    });

    it('the band reads every quality as the reference does, bar the pinned differences', () => {
        const problems: string[] = [];
        for (const quality of KNOWN_QUALITIES) {
            const band = new Set(parseChord(`C${quality}`, KEY)?.intervals.map(mod12));
            const tones = referenceQuality(quality)?.tones ?? new Set<number>();
            const bandOnly = [...band].filter((n) => !tones.has(n)).sort((a, b) => a - b);
            const referenceOnly = [...tones].filter((n) => !band.has(n)).sort((a, b) => a - b);
            const pinned = Object.hasOwn(DIVERGENCES, quality)
                ? DIVERGENCES[quality]
                : { bandOnly: [], referenceOnly: [] };
            if (
                bandOnly.join() !== pinned.bandOnly.join() ||
                referenceOnly.join() !== pinned.referenceOnly.join()
            ) {
                const names = (ns: number[]) => ns.map((n) => DEGREES[n]).join(' ') || 'nothing';
                problems.push(
                    `C${quality}: only the band has ${names(bandOnly)}; only the reference has ${names(referenceOnly)}`,
                );
            }
        }
        expect(problems).toEqual([]);
    });

    it('the band finds every root and slash bass where the reference does', () => {
        const problems: string[] = [];
        for (const root of ROOTS) {
            for (const quality of ['', 'm7', 'maj7', '7', 'm7b5']) {
                for (const bass of ['', ...ROOTS]) {
                    const symbol = `${root}${quality}${bass && `/${bass}`}`;
                    const band = parseChord(symbol, KEY);
                    const expected = referenceRoot(symbol);
                    if (!expected) {
                        problems.push(`${symbol}: the reference cannot read it`);
                    } else if (band?.root !== expected.root || band.bass !== expected.bass) {
                        problems.push(
                            `${symbol}: band root ${band?.root} bass ${band?.bass}, reference root ${expected.root} bass ${expected.bass}`,
                        );
                    }
                }
            }
        }
        expect(problems.slice(0, 10)).toEqual([]);
    });

    it('the reference tables hold no dead or needless rows', () => {
        const rows = [
            ...Object.keys(ALIASES),
            ...Object.keys(COMPOSED),
            ...Object.keys(DIVERGENCES),
        ];
        expect(rows.filter((quality) => !KNOWN_QUALITIES.has(quality))).toEqual([]);
        // A chord the dictionary already knows must be read from it, not composed by hand.
        expect(Object.keys(COMPOSED).filter(libraryKnows)).toEqual([]);
        expect(Object.keys(ALIASES).filter((quality) => Object.hasOwn(COMPOSED, quality))).toEqual(
            [],
        );
    });
});

/** The comp instruments that voice differently (as the invariant suite has them). */
const INSTRUMENTS: CompInstrument[] = ['piano', 'organ', 'guitar', 'nylon'];
/** An anticipation plays the next chord early by an eighth: the comp's `TIE_STEPS`. */
const ANTICIPATION_TICKS = 240;

/**
 * Every comp chord of two passes, held to the reference: a chord may not contain a note its
 * symbol rules out. A chord struck in the last beat before a change may be the next chord
 * played early, so it passes if it is clean against either.
 */
function compClashes(timeline: Timeline, settings: BandSettings, where: string): string[] {
    const problems: string[] = [];
    const clashesWith = (notes: PitchedNote[], chord: ChordFacts | null | undefined) => {
        if (!chord) {
            return null;
        }
        const ruledOut = clashNotes(heldTo(qualityOf(chord.symbol)));
        return notes
            .filter((n) => ruledOut.has(mod12(n.midi - chord.root)))
            .map(
                (n) => `${ruledOut.get(mod12(n.midi - chord.root))} (${n.midi}) on ${chord.symbol}`,
            );
    };
    const first = performPass(timeline, settings, { pass: 0, looping: true });
    const second = performPass(timeline, settings, {
        pass: 1,
        looping: true,
        memory: first.memory,
    });
    for (const [pass, events] of [first.events, second.events].entries()) {
        const strikes = new Map<number, PitchedNote[]>();
        for (const e of events) {
            if (e.lane === 'comp' && !e.muted) {
                strikes.set(e.tick, [...(strikes.get(e.tick) ?? []), e]);
            }
        }
        for (const [tick, notes] of strikes) {
            const bar = timeline.bars[notes[0].bar];
            const index = bar.spans.findIndex((s) => s.start <= tick && tick < s.end);
            const span = bar.spans[index];
            const here = clashesWith(notes, span?.chord);
            if (!here?.length) {
                continue;
            }
            const next =
                bar.spans[index + 1]?.chord ??
                timeline.bars[(bar.index + 1) % timeline.bars.length].spans[0]?.chord;
            const early = span.end - tick <= ANTICIPATION_TICKS && clashesWith(notes, next);
            if (early && early.length === 0) {
                continue;
            }
            problems.push(
                `${where} pass ${pass} bar ${bar.index} @${tick - bar.start}: ${here.join(', ')}`,
            );
        }
    }
    return problems;
}

function settingsFor(
    style: BandSettings['style'],
    comp: CompInstrument,
    seed: string,
): BandSettings {
    return {
        ...DEFAULT_SETTINGS,
        style,
        comp,
        seed,
        lanes: { drums: true, bass: true, comp: true, lead: !!STYLES[style].lead },
        lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
    };
}

/**
 * One bar of every chord quality a chart can hold, the roots moving round the cycle of
 * fourths so each chord is also approached and left as a real progression would. The rare
 * qualities are where a voicing rule written for 7ths and 9ths goes wrong unnoticed.
 */
const CYCLE = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G'];
const EVERY_QUALITY = compileTimeline(
    score([
        {
            label: 'A',
            bars: [...SCORE_CHORD_QUALITIES]
                .map((quality, i) => `${CYCLE[i % CYCLE.length]}${quality}`)
                .join(' | '),
        },
    ]),
);

describe('the comp against the reference', () => {
    it.each(STANDARDS.map((entry) => [entry.id, entry] as const))(
        '%s: no comp chord holds a note its symbol rules out',
        (_id, entry) => {
            const timeline = compileTimeline(buildStandardDocument(entry).chart.score);
            const style = STYLE_FOR_GENRE[entry.genre];
            const problems: string[] = [];
            for (const comp of new Set([STYLES[style].prefers, ...INSTRUMENTS])) {
                for (const seed of ['a', 'b', 'c', 'd']) {
                    problems.push(
                        ...compClashes(timeline, settingsFor(style, comp, seed), `${comp}/${seed}`),
                    );
                }
            }
            expect(problems.slice(0, 10)).toEqual([]);
        },
    );

    it.each(STYLE_IDS)('%s: every chord quality, on every comp instrument', (style) => {
        const problems: string[] = [];
        for (const comp of INSTRUMENTS) {
            for (const seed of ['a', 'b']) {
                problems.push(
                    ...compClashes(
                        EVERY_QUALITY,
                        settingsFor(style, comp, seed),
                        `${comp}/${seed}`,
                    ),
                );
            }
        }
        expect(problems.slice(0, 10)).toEqual([]);
    });
});
