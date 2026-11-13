/**
 * The held ending (#1482): a performance that ends resolves a final turnaround to the tonic,
 * in the style's own quality, and bass, comp and the lead's last note all play it. A chart
 * that already ends on the tonic, a written fermata and a last-chorus coda end as written.
 * Every case is a real chart through `compileTimeline` and `performPass`, as the host and the
 * export play it.
 */
import type { ScoreDirection, SemanticScore } from '../../core/songbook/score-types.js';
import {
    type BandEvent,
    type BandSettings,
    DEFAULT_SETTINGS,
    type PitchedNote,
    PPQ,
    type StyleId,
} from '../core/types.js';
import { chordAt, chorusBars, compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { BASS, lowestRoot } from '../players/bass/line.js';
import { BUTTON_LIFT, dyn, ENDING_STRIKE, readLine, STEP } from '../players/grid.js';
import { endWithTheBand } from '../players/lead/idiom.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import type { BarContext, EndingGesture } from '../styles/types.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { type ChordFacts, chordPcs } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import { heldEnding } from './ending.js';
import { fullWindow, planBars } from './plan.js';

const SEEDS = ['a', 'b', 'c'];

function settingsFor(style: StyleId, seed: string): BandSettings {
    return {
        ...DEFAULT_SETTINGS,
        style,
        seed,
        comp: STYLES[style].prefers,
        lanes: { drums: true, bass: true, comp: true, lead: !!STYLES[style].lead },
        lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
    };
}

/** A short ending strike (a stop, a hit, the button): an eighth, in ticks. */
const SHORT = 2 * STEP;
/** The gestures whose last strike is short (#2017). */
const SHORT_KINDS = new Set<EndingGesture['kind']>(['stop']);
/** The gestures in which a chord before home rings into it (`| G7 C |`'s V held to the I). */
const RINGS_INTO_HOME = new Set<EndingGesture['kind']>(['hold', 'soft', 'button']);

/**
 * Where an ending strikes home, as steps of a 4/4 bar, written out by gesture kind (#2017)
 * rather than read back from the engine: home's own strike (`arrival`), then the button's
 * short hit on the "and" of 4, or the hits' beats (quarters, in 4/4) measured from home, as
 * many as fit.
 */
function homeSteps(style: StyleId, arrival: number): number[] {
    const gesture = STYLES[style].endingGesture;
    if (gesture.kind === 'button') {
        return arrival < 14 ? [arrival, 14] : [arrival];
    }
    if (gesture.kind === 'hits') {
        return [...new Set([0, ...(gesture.at ?? [])])]
            .map((beat) => beat * 4 + arrival)
            .filter((step) => step < 16);
    }
    return [arrival];
}

/**
 * Each style's last bar on the kit (`DrumBook.ending`, #2017), written out by hand: the book's
 * lines, which the kit plays as written on a bar that is home on its downbeat.
 */
const ENDING_DRUMS: Record<StyleId, Record<string, string>> = {
    rock: { crash: 'X', kick: 'X', tomLow: 'X' },
    metal: { crash: '........X', kick: 'X...X...X', snare: 'X...X...X' },
    funk: { kick: 'X', snare: 'X', hat: 'X' },
    disco: { crash: 'X', kick: 'X', snare: 'X', shaker: 'x' },
    hiphop: { kick: 'X' },
    blues: { crash: 'X', kick: 'X' },
    jazz: { ride: 'X', kick: 'x.............X.', snare: '..............X.' },
    bossa: { rim: 'x', kick: 'o' },
    neosoul: { kick: 'o', hatOpen: 'o' },
    acoustic: { kick: 'o', snare: 'o' },
    country: { crash: 'X', kick: 'X' },
    reggae: { kick: 'X', rim: 'X' },
    skapunk: { crash: 'X', kick: 'X', snare: 'X' },
};
/**
 * The styles whose books play the same last bar (their why-comments say so). Blues and country
 * end on the same kick and crash: no country-only last hit was found to write (#2017). A
 * country ending is told instead by the bass's walk-up into the one and the guitar's stinger
 * (#2177, below), not by its last drum bar.
 */
const SHARED_ENDINGS = [['blues', 'country']];

/**
 * The pieces a book's last bar strikes where home lands (`arrival`), sorted: its downbeat's.
 * In the hits, a bar with room for fewer of them drops the first, so home takes the strokes
 * of the first hit that still fits (the last one alone: metal's crash).
 */
function homeStrokesOf(style: StyleId, arrival: number) {
    const gesture = STYLES[style].endingGesture;
    const beats = [...new Set([0, ...(gesture.at ?? [])])];
    const step =
        gesture.kind === 'hits' ? 4 * beats[beats.length - homeSteps(style, arrival).length] : 0;
    return Object.entries(ENDING_DRUMS[style])
        .filter(([, line]) => (line[step] ?? '.') !== '.')
        .map(([piece]) => piece)
        .sort();
}

/**
 * The accent a lead's button is floored at (#2212): the comp's strike on that tick, the button's
 * own (`ENDING_STRIKE` + `BUTTON_LIFT` through the plan's energy), as the band rendered it.
 */
function buttonAccent(events: BandEvent[], tick: number): number {
    return Math.min(
        ...events
            .filter((e): e is PitchedNote => e.lane === 'comp' && e.tick === tick)
            .map((e) => e.velocity),
    );
}

/** The pitched notes the pass plays in its last bar, by lane. */
function lastBar(timeline: Timeline, events: BandEvent[]) {
    const index = timeline.bars.length - 1;
    const notes = events.filter((e): e is PitchedNote => e.lane !== 'drums' && e.bar === index);
    const lane = (name: PitchedNote['lane']) => notes.filter((n) => n.lane === name);
    return { bass: lane('bass'), comp: lane('comp'), lead: lane('lead') };
}

/**
 * The pitch classes a lane strikes, in the order first struck: what chord it plays, whatever
 * the ending's rhythm (a button or the hits strike the tonic again, #2017).
 */
const struckPcs = (notes: PitchedNote[]) => [...new Set(notes.map((n) => mod12(n.midi)))];

const pcsOf = (notes: PitchedNote[]) =>
    new Set(notes.filter((n) => !n.muted).map((n) => mod12(n.midi)));

/** The family of the chart's own tonic chord, which the ending keeps (#1502). */
type TonicFamily = 'major' | 'dominant' | 'minor';

/**
 * What each style ends on, written out by hand rather than read back through the chord
 * parser: the tonic chord's intervals above the root, by the family of the chart's own tonic —
 * a major one (`Cmaj7`, `C6`, `C`), a dominant one (a blues's `C7`) and a minor one. A colour
 * never brings a 7th the tonic's family contradicts: funk's I9 is the 6/9 on a major tonic,
 * and a style that ends on a major 7th takes the b7 on a dominant tonic. A triad, a 6th and
 * the blues's own I9 stand on either.
 */
const EXPECTED: Record<StyleId, Record<TonicFamily, number[]>> = {
    rock: { major: [0, 4, 7], dominant: [0, 4, 7], minor: [0, 3, 7] },
    jazz: { major: [0, 4, 7, 9], dominant: [0, 4, 7, 9], minor: [0, 3, 7, 9] },
    funk: { major: [0, 4, 7, 9, 14], dominant: [0, 4, 7, 10, 14], minor: [0, 3, 7, 10, 14] },
    bossa: { major: [0, 4, 7, 11], dominant: [0, 4, 7, 10, 14], minor: [0, 3, 7, 9] },
    reggae: { major: [0, 4, 7], dominant: [0, 4, 7], minor: [0, 3, 7] },
    blues: { major: [0, 4, 7, 10, 14], dominant: [0, 4, 7, 10, 14], minor: [0, 3, 7, 10, 14] },
    country: { major: [0, 4, 7], dominant: [0, 4, 7], minor: [0, 3, 7] },
    hiphop: { major: [0, 4, 7, 11], dominant: [0, 4, 7, 10], minor: [0, 3, 7, 10] },
    disco: { major: [0, 4, 7, 11], dominant: [0, 4, 7, 10, 14], minor: [0, 3, 7, 10] },
    neosoul: {
        major: [0, 4, 7, 11, 14],
        dominant: [0, 4, 7, 10, 14],
        minor: [0, 3, 7, 10, 14],
    },
    metal: { major: [0, 7], dominant: [0, 7], minor: [0, 7] },
    skapunk: { major: [0, 4, 7], dominant: [0, 4, 7], minor: [0, 3, 7] },
    acoustic: { major: [0, 4, 7], dominant: [0, 4, 7], minor: [0, 3, 7] },
};

/** The table's chord for `style` on `tonic`, as pitch classes and as its defining tones. */
function expectedChord(style: StyleId, tonic: number, family: TonicFamily) {
    const intervals = EXPECTED[style][family];
    const pcs = intervals.map((i) => mod12(tonic + i));
    // The 3rd and the 6th or 7th define the chord; a power chord is its root and 5th.
    const defining = intervals.some((i) => i === 3 || i === 4)
        ? intervals.filter((i) => [3, 4, 9, 10, 11].includes(i))
        : intervals;
    return { pcs, defining: defining.map((i) => mod12(tonic + i)) };
}

/**
 * The ending a style plays: one held bass note on the tonic, a comp chord carrying the
 * style's tonic chord's defining tones (`EXPECTED`) and none of the written chord's foreign
 * tones (`foreign`), and the lead's last note a tone of that chord. Returns whether the lead
 * played a last note, so a caller can tell the lead check was not vacuous.
 */
function expectResolved(
    timeline: Timeline,
    style: StyleId,
    family: TonicFamily,
    events: BandEvent[],
    foreign: number[],
    where: string,
): boolean {
    const bar = timeline.bars.at(-1)!;
    const { pcs, defining } = expectedChord(style, bar.key.tonic, family);
    const { bass, comp, lead } = lastBar(timeline, events);
    expect(struckPcs(bass), `${where}: the bass holds the tonic`).toEqual([bar.key.tonic]);
    const sounding = pcsOf(comp);
    expect(sounding.size, `${where}: the comp plays the last chord`).toBeGreaterThan(0);
    for (const pc of defining) {
        expect(sounding.has(pc), `${where}: the comp sounds ${pc}`).toBe(true);
    }
    for (const pc of foreign) {
        expect(sounding.has(pc), `${where}: the written chord's ${pc} is gone`).toBe(false);
    }
    if (!lead.length) {
        return false;
    }
    expect(pcs, `${where}: the lead's last note`).toContain(mod12(lead.at(-1)!.midi));
    return true;
}

describe('a final turnaround resolves to the tonic', () => {
    // The blues fixture's last bar is the ii–V (`Dm7 G7`) that sends it round again; a pop
    // tune ending on its V7; a minor tune ending on its V7 (E7 in A minor, whose G# the A minor
    // chord replaces with G); a ii over the V's root (`Dm7/G`) and a tonic over its 3rd (`C/E`),
    // which is not home either; and a tritone substitute (`Db7`).
    // Each chart's own tonic is a plain C (major) unless it says otherwise: the blues rests on
    // C7, a dominant.
    const charts: Record<string, { chart: SemanticScore; foreign: number[]; family: TonicFamily }> =
        {
            'ii–V (blues)': { chart: FIXTURES.blues, foreign: [5], family: 'dominant' },
            V7: {
                chart: score([{ label: 'A', bars: 'C | Am7 | Fmaj7 | G7' }]),
                foreign: [5],
                family: 'major',
            },
            'minor V7': {
                chart: score([{ label: 'A', bars: 'Am | Dm7 | Bm7b5 | E7' }], {
                    key: 'A',
                    isMinor: true,
                }),
                foreign: [8],
                family: 'minor',
            },
            'slash ii/V': {
                chart: score([{ label: 'A', bars: 'C | A7 | Dm7 | Dm7/G' }]),
                foreign: [5],
                family: 'major',
            },
            'tonic over its 3rd': {
                chart: score([{ label: 'A', bars: 'F | G7 | Am7 | C/E' }]),
                foreign: [],
                family: 'major',
            },
            'tritone sub': {
                chart: score([{ label: 'A', bars: 'C | Dm7 | Dm7 | Db7' }]),
                foreign: [1, 5],
                family: 'major',
            },
            // On the tonic root but still moving: a suspension wants its 3rd, a diminished 7th
            // is a passing chord. Neither is home.
            'tonic sus4': {
                chart: score([{ label: 'A', bars: 'C | F | G7 | Csus4' }]),
                foreign: [5],
                family: 'major',
            },
            'tonic diminished': {
                chart: score([{ label: 'A', bars: 'C | F | G7 | Co7' }]),
                foreign: [3, 6],
                family: 'major',
            },
        };
    for (const [name, { chart, foreign, family }] of Object.entries(charts)) {
        it(`${name}: every style ends on its tonic`, () => {
            const timeline = compileTimeline(chart);
            let leads = 0;
            for (const style of STYLE_IDS) {
                for (const seed of SEEDS) {
                    const { events } = performPass(timeline, settingsFor(style, seed), {
                        pass: 0,
                        looping: false,
                    });
                    if (
                        expectResolved(timeline, style, family, events, foreign, `${style}/${seed}`)
                    ) {
                        leads++;
                    }
                }
            }
            // The lead's check is not vacuous: plenty of the leads end on a note.
            expect(leads).toBeGreaterThan(STYLE_IDS.length);
        });
    }

    it("in each style's own colour, on the chart's own tonic family (the table, by hand)", () => {
        // The family is the chart's tonic, whatever the key's mode says (#1502): a tune whose
        // home is Cmaj7, a blues on C7, a minor tune in A minor, and a C minor tune typed
        // without its key (it reads as C major, and rests on Cm7).
        const tables: [string, SemanticScore, TonicFamily, number][] = [
            ['major', score([{ label: 'A', bars: 'Cmaj7 | Am7 | Dm7 | G7' }]), 'major', 0],
            ['dominant', FIXTURES.blues, 'dominant', 0],
            [
                'minor',
                score([{ label: 'A', bars: 'Am | Dm7 | Bm7b5 | E7' }], { key: 'A', isMinor: true }),
                'minor',
                9,
            ],
            [
                'minor, keyed major',
                score([{ label: 'A', bars: 'Cm7 | Fm7 | Dm7b5 | G7' }]),
                'minor',
                0,
            ],
            // A dominant vamp's tonic is its I7: the I–IV's `E9` falls a fifth to every A9.
            [
                'dominant vamp',
                score([{ label: 'A', bars: 'E9 | / | A9 | /' }], { key: 'E' }),
                'dominant',
                4,
            ],
            // Chords on the tonic that pass through it don't decide its family: a ii–V heading
            // for Bb (`Cm7 F7`), the V of the iv (`A` → `Dm` in A minor), a borrowed iv-ish
            // `Cm` as long as the C it follows (the key's mode breaks the tie), a V7 of IV
            // (`C7` → `Fmaj7`), alone at the opening or among Cmaj7s.
            [
                'ii–V through the tonic',
                score([{ label: 'A', bars: 'Cmaj7 | Cm7 F7 | Bbmaj7 | Dm7 G7' }]),
                'major',
                0,
            ],
            [
                'V of iv in a minor key',
                score([{ label: 'A', bars: 'Am | A | Dm | E7' }], { key: 'A', isMinor: true }),
                'minor',
                9,
            ],
            [
                'a borrowed minor tonic',
                score([{ label: 'A', bars: 'C | F | Cm | G7' }]),
                'major',
                0,
            ],
            [
                'a V7 of IV among Cmaj7s',
                score([
                    { label: 'A', bars: 'Cmaj7 | Am7 | Dm7 G7 | C7 | Gm7 C7 | Fmaj7 | Dm7 | G7' },
                ]),
                'major',
                0,
            ],
            [
                'a V7 of IV opening',
                score([{ label: 'A', bars: 'C7 | Fmaj7 | Dm7 | G7' }]),
                'major',
                0,
            ],
            // A triad or a 6th says major, not which major (#1521): a blues that states its I
            // once as a plain `C`, or voices it `C6` in bar 11's turnaround, is still a blues,
            // since it rests on its I7 far longer. Only a major 7th on the tonic rules the
            // dominant out; otherwise the dominant has to out-rest the triads and 6ths, so a pop
            // song with one passing `C7` stays major (a tie stays major too), and a tonic of
            // triads and 6ths alone ends major.
            [
                'a blues with a plain I',
                score([
                    {
                        label: 'A',
                        bars: 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C | G7',
                    },
                ]),
                'dominant',
                0,
            ],
            [
                'a jazz blues with an I6 turnaround',
                score([
                    {
                        label: 'A',
                        bars: 'C7 | F7 | C7 | Gm7 C7 | F7 | F7 | C7 | Em7 A7 | Dm7 | G7 | C6 A7 | Dm7 G7',
                    },
                ]),
                'dominant',
                0,
            ],
            [
                'a tonic of triads and 6ths',
                score([{ label: 'A', bars: 'C6 | Am7 | Dm7 G7 | C | F | G7' }]),
                'major',
                0,
            ],
            [
                'a passing I7, a tie',
                score([{ label: 'A', bars: 'C | C7 | Am | F | G7' }]),
                'major',
                0,
            ],
            [
                'a 16-bar song with one I7',
                score([
                    {
                        label: 'A',
                        bars: 'C | Am | F | G | C | Am | F | G | C7 | Am | F | G | C | Am | F | G',
                    },
                ]),
                'major',
                0,
            ],
            [
                'a dominant vamp with a turnaround',
                score([{ label: 'A', bars: 'C9 | C9 | C9 | Dm7 G7' }]),
                'dominant',
                0,
            ],
        ];
        for (const style of STYLE_IDS) {
            for (const [name, chart, family, tonic] of tables) {
                const timeline = compileTimeline(chart);
                const chord = heldEnding(timeline, timeline.bars.length - 1, STYLES[style].ending)
                    ?.spans[0].chord;
                expect(chord?.intervals, `${style} ${name}`).toEqual(EXPECTED[style][family]);
                expect(chord?.root, `${style} ${name}`).toBe(tonic);
            }
        }
    });

    it('funk ends a major tune with no b7 in any lane, and a blues on its I9', () => {
        // `| Cmaj7 | Am7 | Dm7 | G7 |`: the I9's Bb would make the last chord a V7 of IV.
        const tune = compileTimeline(score([{ label: 'A', bars: 'Cmaj7 | Am7 | Dm7 | G7' }]));
        const blues = compileTimeline(FIXTURES.blues);
        for (const comp of ['clav', 'piano', 'organ', 'guitar'] as const) {
            for (const seed of SEEDS) {
                const settings = { ...settingsFor('funk', seed), comp };
                const { events } = performPass(tune, settings, { pass: 0, looping: false });
                const { bass, comp: keys, lead } = lastBar(tune, events);
                const sounding = pcsOf([...bass, ...keys, ...lead]);
                expect(sounding.has(10), `funk/${comp}/${seed}: no Bb`).toBe(false);
                // The 6/9's colour, not a bare triad: its 6th and 9th.
                expect(pcsOf(keys).has(9) || pcsOf(keys).has(2), `funk/${comp}/${seed}`).toBe(true);
                const onBlues = lastBar(
                    blues,
                    performPass(blues, settings, { pass: 0, looping: false }).events,
                );
                const nine = pcsOf(onBlues.comp);
                expect(
                    [4, 10].every((pc) => nine.has(pc)),
                    `funk/${comp}/${seed}: the blues's I9 keeps its E and Bb`,
                ).toBe(true);
            }
        }
    });

    it('a counted chart, played a chorus at a time as the host plays it, ends on the tonic', () => {
        const timeline = compileTimeline(COUNTED_FIXTURES.bluesFour);
        for (const style of STYLE_IDS) {
            const settings = settingsFor(style, 'a');
            const events: BandEvent[] = [];
            let memory: PassMemory | undefined;
            // The host's own chunks (`BandHost.songPlan`): a chorus each, the window running
            // on to the end, each resuming from the memory the one before left.
            for (let from = 0; from < timeline.bars.length; ) {
                const until = chorusBars(timeline, from).end;
                const result = performPass(timeline, settings, {
                    pass: 0,
                    looping: false,
                    window: { from, to: timeline.bars.length, origin: 0 },
                    until,
                    memory,
                });
                events.push(...result.events);
                memory = result.memory;
                from = until;
            }
            const whole = performPass(timeline, settings, { pass: 0, looping: false });
            expect(JSON.stringify(events), style).toBe(JSON.stringify(whole.events));
            expectResolved(timeline, style, 'dominant', events, [5], style);
        }
    });

    it('only the ending resolves: a looping pass plays the turnaround, round to the top', () => {
        const timeline = compileTimeline(FIXTURES.blues);
        const bar = timeline.bars.at(-1)!;
        let offTonic = 0;
        for (const style of STYLE_IDS) {
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: true,
            });
            // The lead sings the turnaround too: somewhere across the styles a note in the last
            // bar is not a tone of the tonic it would resolve to on an ending.
            const { pcs } = expectedChord(style, bar.key.tonic, 'dominant');
            offTonic += lastBar(timeline, events).lead.filter(
                (n) => !pcs.includes(mod12(n.midi)),
            ).length;
            // The bass still plays the written ii–V, D or G under it, to lead round to the top.
            const bass = events.filter(
                (e): e is PitchedNote => e.lane === 'bass' && e.bar === bar.index,
            );
            expect(
                bass.some((n) => [2, 7].includes(mod12(n.midi))),
                style,
            ).toBe(true);
            expect(heldEnding(timeline, bar.index, STYLES[style].ending), style).not.toBeNull();
        }
        expect(offTonic).toBeGreaterThan(0);
    });

    it('the bar before the ending walks into the tonic, not into the chord it replaces', () => {
        // A lone V7 last bar: a walking bass that aimed at G would end a step or a half step
        // from G (F#, Ab, A) and then land a 4th away on C, as if it missed the ending.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | Am7 | Fmaj7 | G7' }]));
        const before = timeline.bars[2];
        for (const seed of SEEDS) {
            const { events } = performPass(timeline, settingsFor('jazz', seed), {
                pass: 0,
                looping: false,
            });
            const walk = events.filter(
                (e): e is PitchedNote => e.lane === 'bass' && e.bar === before.index,
            );
            const last = mod12(walk.at(-1)!.midi);
            const fromC = Math.min(last, 12 - last);
            expect(fromC, `jazz/${seed}: the walk's last note ${last}`).toBeLessThanOrEqual(2);
            // Its harmony is unchanged: the comp still plays Fmaj7 there.
            const comp = pcsOf(
                events.filter((e): e is PitchedNote => e.lane === 'comp' && e.bar === before.index),
            );
            expect(comp.has(9) && comp.has(4), `jazz/${seed}: Fmaj7's A and E`).toBe(true);
        }
    });
});

describe('an ending already home, or written, is played as written', () => {
    const LAST_CHORUS: ScoreDirection = {
        kind: 'last-chorus',
        destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
    };
    // Rhythm changes closes on its tonic 6th (Bb6), the counted blues with a coda on C7 (a
    // blues's tonic is a dominant), the minor groove on Em9, a Picardy third on E in E minor.
    const home = {
        'rhythm changes (Bb6)': { chart: FIXTURES.rhythmChanges, written: [10, 2, 5, 7] },
        'a blues on its I7': {
            chart: score([{ label: 'A', bars: 'C7 | F7 | G7 | C7' }]),
            written: [0, 4, 10],
        },
        'minor groove (Em9)': {
            chart: minorGroove(),
            written: [4, 7, 2],
        },
        'Picardy third': {
            chart: score([{ label: 'A', bars: 'Em | Am | B7 | E' }], { key: 'E', isMinor: true }),
            written: [4, 8],
        },
    };
    for (const [name, { chart, written }] of Object.entries(home)) {
        it(`${name}: every style holds the written chord`, () => {
            const timeline = compileTimeline(chart);
            const last = timeline.bars.at(-1)!;
            const chord = last.spans[0].chord!;
            for (const style of STYLE_IDS) {
                expect(heldEnding(timeline, last.index, STYLES[style].ending), style).toBeNull();
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                const { bass, comp } = lastBar(timeline, events);
                expect(struckPcs(bass), style).toEqual([chord.bass]);
                // The comp sounds the written chord's own tones (its colour kept), within the
                // tones the chart writes there.
                const sounding = pcsOf(comp);
                expect(
                    [...sounding].every(
                        (pc) =>
                            chordPcs(chord).includes(pc) ||
                            chord.scale.map((s) => mod12(chord.root + s)).includes(pc),
                    ),
                    style,
                ).toBe(true);
                expect(
                    written.some((pc) => sounding.has(pc)),
                    style,
                ).toBe(true);
            }
        });
    }

    it('a fermata on the last chord is a written ending', () => {
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | Dm7 | G7', fermataBars: [3] }]),
        );
        for (const style of STYLE_IDS) {
            expect(heldEnding(timeline, 3, STYLES[style].ending), style).toBeNull();
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: false,
            });
            const { bass } = lastBar(timeline, events);
            expect(new Set(bass.map((n) => mod12(n.midi))), style).toEqual(new Set([7]));
        }
    });

    it('a last bar that reaches home itself strikes what comes first, and holds home from where it is written', () => {
        // `G7 C` and `Csus4 Cmaj7` resolve on their own: the band ends on what the chart
        // writes there, not on the style's default tonic — and, as a band reading the bar
        // plays it, strikes the V (or the sus) on 1 and holds the I from 3 (#1502).
        let leads = 0;
        for (const [bars, first, symbol, line] of [
            ['C | F | Dm7 | G7 C', 'G7', 'C', [7, 0]],
            // The I arriving on beat 4 instead: the lead's plan is keyed by where it arrives.
            ['C | F | Dm7 | G7:3 C:1', 'G7', 'C', [7, 0]],
            // The resolution is above the same root: the bass holds its C through it.
            ['C | F | G7 | Csus4 Cmaj7', 'Csus4', 'Cmaj7', [0]],
            ['Am | Dm7 | E7 | E7 Am6', 'E7', 'Am6', [4, 9]],
        ] as const) {
            const minor = symbol === 'Am6';
            const timeline = compileTimeline(
                score([{ label: 'A', bars }], minor ? { key: 'A', isMinor: true } : {}),
            );
            const bar = timeline.bars[3];
            const [struck, home] = bar.spans;
            const end = bar.start + bar.meter.barTicks;
            for (const style of STYLE_IDS) {
                const ending = heldEnding(timeline, 3, STYLES[style].ending);
                expect(
                    ending?.spans.map((span) => span.chord?.symbol),
                    `${style} ${bars}`,
                ).toEqual([first, symbol]);
                for (const comp of new Set([
                    STYLES[style].prefers,
                    'piano',
                    'organ',
                    'guitar',
                ] as const)) {
                    for (const seed of SEEDS) {
                        const where = `${style}/${comp}/${seed} ${bars}`;
                        const { events } = performPass(
                            timeline,
                            { ...settingsFor(style, seed), comp },
                            { pass: 0, looping: false },
                        );
                        const played = lastBar(timeline, events);
                        // Home is struck in the style's gesture (#2017): its button or hits
                        // strike it again after the I lands. An ending that rings holds the sus's
                        // root through its resolution; a short one strikes the C again under it.
                        const { kind } = STYLES[style].endingGesture;
                        const again = homeSteps(style, (home.start - bar.start) / STEP).length - 1;
                        const merged = line.length === 1 && RINGS_INTO_HOME.has(kind);
                        expect(
                            played.bass.map((n) => mod12(n.midi)),
                            `${where}: the bass`,
                        ).toEqual([line[0], ...Array(again + (merged ? 0 : 1)).fill(line.at(-1))]);
                        const ticks = played.bass.map((n) => n.tick);
                        expect(ticks[0], `${where}: the V on 1`).toBe(bar.start);
                        if (!merged) {
                            expect(ticks[1], `${where}: the I where it is written`).toBe(
                                home.start,
                            );
                        }
                        expect(
                            ticks.slice(merged ? 1 : 2).every((t) => t > home.start),
                            `${where}: home struck again after it lands`,
                        ).toBe(true);
                        // The bass's last note rings to the end of the bar (an eighth, in a short
                        // ending), its first (when it moves) up to the change.
                        const final = played.bass.at(-1)!;
                        expect(final.tick + final.dur, where).toBe(
                            SHORT_KINDS.has(kind) ? final.tick + SHORT : end,
                        );
                        if (line.length > 1) {
                            expect(played.bass[0].dur, where).toBe(
                                RINGS_INTO_HOME.has(kind) ? home.start - bar.start : SHORT,
                            );
                        }
                        const chords = played.comp.filter((n) => !n.muted);
                        const at1 = chords.filter((n) => n.tick === bar.start);
                        const at3 = chords.filter((n) => n.tick === home.start);
                        const later = chords.filter((n) => n.tick > home.start);
                        expect(
                            at1.length + at3.length + later.length,
                            `${where}: struck on 1, where home lands, and after it`,
                        ).toBe(chords.length);
                        expect(
                            new Set(later.map((n) => n.tick)).size,
                            `${where}: home's strikes after it lands`,
                        ).toBe(again);
                        const tones = (chord: typeof struck.chord) =>
                            new Set([
                                ...chordPcs(chord!),
                                ...chord!.scale.map((s) => mod12(chord!.root + s)),
                            ]);
                        expect(
                            [...pcsOf(at1)].every((pc) => tones(struck.chord).has(pc)),
                            `${where}: the comp strikes ${first} on 1`,
                        ).toBe(true);
                        expect(
                            [...pcsOf(at3)].every(
                                (pc) =>
                                    chordPcs(home.chord!).includes(pc) || tones(home.chord).has(pc),
                            ),
                            `${where}: the comp holds ${symbol} from 3`,
                        ).toBe(true);
                        expect(at1.length && at3.length, `${where}: both struck`).toBeTruthy();
                        // The first chord stops where home is struck; home rings to the end.
                        for (const n of at1) {
                            expect(n.tick + n.dur, where).toBeLessThanOrEqual(home.start);
                        }
                        // The 3rd of the chord that arrives sounds in the comp (a power chord
                        // has none).
                        if (style !== 'metal') {
                            expect(
                                pcsOf(at3).has(mod12(home.chord!.root + home.chord!.third!)),
                                `${where}: ${symbol}'s 3rd`,
                            ).toBe(true);
                        }
                        // The drummer catches the arrival with the band: the book's last bar
                        // moves to where the I lands (no crash under the V), and a kick alone
                        // catches the V.
                        const kit = events.filter((e) => e.lane === 'drums' && e.bar === bar.index);
                        expect(
                            kit
                                .filter((e) => e.tick < home.start)
                                .map((e) => e.lane === 'drums' && e.piece),
                            `${where}: the kick alone under the V`,
                        ).toEqual(['kick']);
                        expect(
                            kit
                                .filter((e) => e.tick === home.start)
                                .map((e) => e.lane === 'drums' && e.piece)
                                .sort(),
                            `${where}: the book's downbeat, where the I lands`,
                        ).toEqual(homeStrokesOf(style, (home.start - bar.start) / STEP));
                        expect(
                            kit.some(
                                (e) =>
                                    e.lane === 'drums' &&
                                    e.piece === 'kick' &&
                                    e.tick === bar.start,
                            ),
                            `${where}: a kick under the V`,
                        ).toBe(true);
                        // The lead resolves with the band: its last note is struck where the I
                        // arrives (or rings into it), on a tone of the I, held to the end.
                        // In a stop it lets go with the band's eighth (#2017); in the button
                        // and the hits it plays the band's last strike, ringing to the end.
                        const sung = played.lead.at(-1);
                        if (sung) {
                            leads++;
                            expect(
                                sung.tick + sung.dur,
                                `${where}: the lead ends with the band`,
                            ).toBe(SHORT_KINDS.has(kind) ? home.start + SHORT : end);
                            expect(
                                sung.tick + sung.dur > home.start &&
                                    chordPcs(home.chord!).includes(mod12(sung.midi)),
                                `${where}: the lead's last note, ${sung.midi}, rests on ${symbol}`,
                            ).toBe(true);
                            // A landing is an arrival, never ghosted: no further under the line
                            // (the middle of its last eight notes) than a ghost's 10 drop.
                            if (sung.tick === home.start) {
                                const line = events
                                    .filter(
                                        (e): e is PitchedNote =>
                                            e.lane === 'lead' && e.tick < home.start,
                                    )
                                    .slice(-8)
                                    .map((n) => n.velocity)
                                    .sort((a, b) => a - b);
                                const middle = line[line.length >> 1] ?? sung.velocity;
                                expect(
                                    sung.velocity,
                                    `${where}: the landing's velocity`,
                                ).toBeGreaterThanOrEqual(middle - 10);
                            }
                        }
                    }
                }
            }
        }
        // The lead's check is not vacuous: every style with a lead sang into most endings.
        expect(leads).toBeGreaterThan(40);
    });

    it('a last bar of one chord, resolved or home, is struck from its downbeat, only where its gesture strikes', () => {
        // `| … | G7 |` resolves to the tonic, `| … | C |` is home: neither is split. The
        // gesture strikes home again only on its button or its hits (#2017). Straight, so the
        // button's "and" of 4 is on the grid.
        for (const bars of ['C | Am7 | Dm7 | G7', 'C | Am7 | Dm7 | C']) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const bar = timeline.bars[3];
            for (const style of STYLE_IDS) {
                const { events } = performPass(
                    timeline,
                    { ...settingsFor(style, 'a'), swing: 0 },
                    { pass: 0, looping: false },
                );
                const played = lastBar(timeline, events);
                expect(
                    new Set([...played.bass, ...played.comp].map((n) => n.tick)),
                    `${style} ${bars}`,
                ).toEqual(new Set(homeSteps(style, 0).map((at) => bar.start + at * STEP)));
                expect(
                    events.filter((e) => e.lane === 'drums' && e.bar === 3).map((e) => e.tick),
                    `${style} ${bars}`,
                ).toEqual(
                    Object.values(ENDING_DRUMS[style])
                        .flatMap((line) => readLine(line).map(([at]) => bar.start + at * STEP))
                        .sort((a, b) => a - b),
                );
            }
        }
    });

    it("an N.C. on the last downbeat is the chart's own ending", () => {
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | F | Dm7 G7 | N.C.' }]));
        for (const style of STYLE_IDS) {
            expect(heldEnding(timeline, 3, STYLES[style].ending), style).toBeNull();
        }
    });

    it('a stop later in the last bar: the V resolves, and the tonic sounds up to the rest', () => {
        // `G7:2 N.C.:2`: the band still resolves the V on the downbeat, and stops where the
        // chart writes its rest, instead of holding anything through it.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7:2 N.C.:2' }]),
        );
        const bar = timeline.bars[3];
        const rest = bar.start + bar.meter.barTicks / 2;
        for (const style of STYLE_IDS) {
            const ending = heldEnding(timeline, 3, STYLES[style].ending);
            expect(ending?.spans[0].chord?.root, style).toBe(0);
            expect(ending?.spans[0].end, style).toBe(rest);
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: false,
            });
            const { bass, comp, lead } = lastBar(timeline, events);
            expect(struckPcs(bass), style).toEqual([0]);
            for (const n of [...bass, ...comp, ...lead]) {
                // Struck before the rest, and silent by it (a strum's roll may land a hair
                // late; the note still ends at the rest).
                expect(n.tick + n.dur, `${style} ${n.lane}`).toBeLessThanOrEqual(rest + 1);
            }
            // Nor does the kit strike in the rest: metal's third stab and jazz's button fall
            // inside it, and are not played (#2017).
            expect(
                events.filter((e) => e.lane === 'drums' && e.bar === bar.index && e.tick >= rest),
                `${style} drums`,
            ).toEqual([]);
        }
    });

    it('a key the chart never rests on is not one to end in', () => {
        // Typed without setting the key, a chart reads as C major. Nothing in these rests on C,
        // and none ends on a V7 of a resting opening: a Bb tune that opens on its V7 (`F7 →
        // Bbmaj7` moves) and ends on a ii–V of that V7, and a G tune opening on its V7. Each
        // holds its written chord. A ii–V is not an arrival: the `C7` after its `Gm7` is not
        // held as a resolution (`arrivalAt` wants a V7 before the I).
        // An F blues keyed C, ended at its bar 4: a C7 heading to Gm7 rests there, as written.
        for (const bars of [
            'F7 | Bbmaj7 | Am7 D7 | Gm7 C7',
            'D7 | G | D7 | A7',
            'F7 | Bb7 | F7 | C7 | Gm7 C7',
        ]) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const written = timeline.bars[3].spans[0].chord!;
            for (const style of STYLE_IDS) {
                expect(
                    heldEnding(timeline, 3, STYLES[style].ending),
                    `${style} ${bars}`,
                ).toBeNull();
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                // The F blues runs on to its bar 5, `Gm7 C7`: that C7 is the V7 of the F7 it
                // opens on, and it ends on F (#1521; it used to resolve into C).
                expect(struckPcs(lastBar(timeline, events).bass), `${style} ${bars}`).toEqual([
                    timeline.bars.length === 4 ? written.bass : 5,
                ]);
            }
        }
        // An F tune ending on its ii–V and an A minor tune ending on E7 used to hold their
        // written last chord, the ii and the V7 (#1521): each V7 points back to the chart's
        // resting opening, so the band ends there, in its family.
        for (const [bars, root, family] of [
            ['F | Gm7 C7 | F | Gm7 C7', 5, 'major'],
            ['Am | Dm7 | Bm7b5 | E7', 9, 'minor'],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            for (const style of STYLE_IDS) {
                const chord = heldEnding(timeline, 3, STYLES[style].ending)?.spans[0].chord;
                expect(chord?.root, `${style} ${bars}`).toBe(root);
                expect(chord?.intervals, `${style} ${bars}`).toEqual(EXPECTED[style][family]);
            }
        }
        // Past the opening, a C7 that goes anywhere but F (here to G7) is a tonic, and backs C.
        const blues = compileTimeline(score([{ label: 'A', bars: 'F7 | C7 | G7 | Dm7 G7' }]));
        expect(heldEnding(blues, 3, STYLES.blues.ending)?.spans[0].chord?.root).toBe(0);
    });

    it('typed without its key, a tune that ends where it opens is home there (#1516)', () => {
        // Read as C major, `G | C | D | G` used to end on C (its IV backed the key), and so
        // did `F | Bb | C | F` (its V). A tune that opens and ends on its I is home.
        for (const [bars, root] of [
            ['G | C | D | G', 7],
            ['F | Bb | C | F', 5],
            // A G minor groove ending on its G7#9: the same root, another colour.
            ['Gm11 | Gm11 | C9 | C13 | F13 | Ebmaj7 | Dm11 | G7#9', 7],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                expect(
                    heldEnding(timeline, last, STYLES[style].ending),
                    `${style} ${bars}`,
                ).toBeNull();
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                expect(struckPcs(lastBar(timeline, events).bass), `${style} ${bars}`).toEqual([
                    root,
                ]);
            }
        }
        // A tune that opens on its V doesn't end at home on it: `G7 | C | F | G7` in C resolves.
        const onV = compileTimeline(score([{ label: 'A', bars: 'G7 | C | Am | G7' }]));
        expect(heldEnding(onV, 3, STYLES.jazz.ending)?.spans[0].chord?.root).toBe(0);
    });

    it('a last bar that moves off the opening chord is a turnaround, and resolves (#1516)', () => {
        // Each opens on its IV or V and ends on a turnaround from that chord (`F G7`, `G D7`):
        // the bar leaves home, so the band resolves it to the key's tonic, in C.
        for (const bars of [
            'F | G | Em | Am | F | G7 | C | F G7',
            'G | Am | Dm7 | C | G | Am | Dm7 | G D7',
        ]) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                const ending = heldEnding(timeline, last, STYLES[style].ending);
                expect(
                    ending?.spans.map((span) => span.chord?.root),
                    `${style} ${bars}`,
                ).toEqual([0]);
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                expect(struckPcs(lastBar(timeline, events).bass), `${style} ${bars}`).toEqual([0]);
            }
        }
        // One that reaches the opening chord later in the bar gets home itself: `D7 G` strikes
        // the D7 and holds the G, as `G7 C` does.
        const later = compileTimeline(score([{ label: 'A', bars: 'G | C | D | D7 G' }]));
        expect(
            heldEnding(later, 3, STYLES.jazz.ending)?.spans.map((span) => span.chord?.symbol),
        ).toEqual(['D7', 'G']);
    });

    it('a ii–V on the tonic of a major key does not back it (#1516)', () => {
        // Autumn Leaves (G minor) opens on `Cm7 F7`; rhythm changes passes through it. With the
        // key left at C, neither is in C. Autumn Leaves's last bar is played as written; rhythm
        // changes' last `Cm7 F7` is not a home on C either (#1521: held as one, the band sat on
        // the Cm7 and dropped the F7), and its F7 sends it back to its Bbmaj7, where it ends.
        for (const [bars, root, resolved] of [
            ['Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6', 7, false],
            ['Bbmaj7 Gm7 | Cm7 F7 | Dm7 G7 | Cm7 F7', 10, true],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                const ending = heldEnding(timeline, last, STYLES[style].ending);
                expect(ending?.spans[0].chord?.root ?? null, `${style} ${bars}`).toBe(
                    resolved ? root : null,
                );
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                expect(struckPcs(lastBar(timeline, events).bass), `${style} ${bars}`).toEqual([
                    root,
                ]);
            }
        }
        // A minor key's dorian i7–IV7 is its tonic: `Em7 | A7` in E minor ends on Em.
        const dorian = compileTimeline(
            score([{ label: 'A', bars: 'Em7 | A7 | Em7 | A7' }], { key: 'E', isMinor: true }),
        );
        expect(heldEnding(dorian, 3, STYLES.funk.ending)?.spans[0].chord?.intervals).toEqual(
            EXPECTED.funk.minor,
        );
    });

    it('a dominant I–IV vamp is in I: it opens there, and its last IV resolves', () => {
        // Every I7 falls a fifth to the IV7, but a chart that opens on its I is in I.
        for (const [bars, key, tonic] of [
            ['E9 | / | A9 | /', 'E', 4],
            ['C7 | F7', 'C', 0],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }], { key }));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                expect(
                    heldEnding(timeline, last, STYLES[style].ending)?.spans[0].chord?.root,
                    `${style} ${bars}`,
                ).toBe(tonic);
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                expect(struckPcs(lastBar(timeline, events).bass), `${style} ${bars}`).toEqual([
                    tonic,
                ]);
            }
        }
    });

    it('a D.C. al Coda ends the way its coda is written', () => {
        // An uncounted chart: the export plays the form, goes back to the top, takes the coda
        // and ends there, off the tonic as written.
        const timeline = compileTimeline(
            score([
                {
                    label: 'A',
                    bars: 'Cmaj7 | A7 | Dm7 | G7',
                    end: {
                        1: [{ kind: 'coda', label: 'to-coda' }],
                        3: [
                            {
                                kind: 'jump',
                                from: 'start',
                                destination: { kind: 'coda', via: 'to-coda', target: 'coda' },
                                repeats: 'skip',
                            },
                        ],
                    },
                },
                {
                    label: 'Coda',
                    bars: 'Dm7 G7 | Ab7 | Dbmaj7#11',
                    start: { 0: [{ kind: 'coda', label: 'coda' }] },
                },
            ]),
        );
        expect(timeline.coda).toBe(true);
        expect(timeline.bars.at(-1)!.visit.label).toBe('Coda');
        const last = timeline.bars.length - 1;
        for (const style of STYLE_IDS) {
            expect(heldEnding(timeline, last, STYLES[style].ending), style).toBeNull();
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: false,
            });
            expect(struckPcs(lastBar(timeline, events).bass), style).toEqual([1]);
        }
    });

    it('a last-chorus coda ends the way the chart writes it, even off the tonic', () => {
        const chart = {
            ...score([
                {
                    label: 'A',
                    bars: 'C | A7 | Dm7 | G7',
                    end: { 3: [{ kind: 'coda', label: 'to-coda' }, LAST_CHORUS] },
                },
                {
                    label: 'Coda',
                    bars: 'Dm7 G7 | Ab7',
                    start: { 0: [{ kind: 'coda', label: 'coda' }] },
                },
            ]),
            choruses: 2,
        };
        const timeline = compileTimeline(chart);
        expect(timeline.coda).toBe(true);
        expect(timeline.bars.at(-1)!.visit.label).toBe('Coda');
        for (const style of STYLE_IDS) {
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: false,
            });
            const { bass } = lastBar(timeline, events);
            expect(struckPcs(bass), style).toEqual([8]);
        }
        // The same chart uncounted never takes its coda, so it has no written ending: an
        // export's last bar is the form's G7, resolved.
        const { choruses: _, ...once } = chart;
        const uncounted = compileTimeline(once);
        expect(uncounted.coda).toBeUndefined();
        expect(heldEnding(uncounted, uncounted.bars.length - 1, STYLES.jazz.ending)).not.toBeNull();
    });
});

describe('a chart typed without its key, read one chord at a time (#1521)', () => {
    /** The pitch class the bass holds at the end of the last bar, in a style's pass. */
    function heldBass(timeline: Timeline, style: StyleId, seed = 'a') {
        const { events } = performPass(timeline, settingsFor(style, seed), {
            pass: 0,
            looping: false,
        });
        return mod12(lastBar(timeline, events).bass.at(-1)!.midi);
    }

    it('a last bar that writes its own V7–I holds the I, when no key backs another', () => {
        // Read as C major, nothing in either rests on C: an A minor tune ending `E7 Am` and a G
        // tune opening on its ii and ending `Am7 D7 G`. Played as written, the band used to hold
        // the bar's first chord (the E7, the Am7) and drop the I the chart writes.
        for (const [bars, written, arrival] of [
            ['Dm | G | E7 | E7 Am', ['E7', 'Am'], 1],
            ['Am7 | D7 | Gmaj7 | Em7 | Am7 | D7 | Bm7 E7 | Am7:1 D7:1 G:2', ['Am7', 'D7', 'G'], 2],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const bar = timeline.bars.at(-1)!;
            const home = bar.spans[arrival];
            for (const style of STYLE_IDS) {
                const ending = heldEnding(timeline, bar.index, STYLES[style].ending);
                expect(
                    ending?.spans.map((span) => span.chord?.symbol),
                    `${style} ${bars}`,
                ).toEqual(written);
                for (const seed of ['a', 'b']) {
                    const where = `${style}/${seed} ${bars}`;
                    const { events } = performPass(timeline, settingsFor(style, seed), {
                        pass: 0,
                        looping: false,
                    });
                    const { bass, comp } = lastBar(timeline, events);
                    // The V is struck under the dominant, and the I from where it is written,
                    // ringing to the end of the bar.
                    const dominant = bar.spans[arrival - 1];
                    expect(
                        bass.some(
                            (n) =>
                                n.tick === dominant.start && mod12(n.midi) === dominant.chord!.root,
                        ),
                        `${where}: the V in the bass`,
                    ).toBe(true);
                    // The I struck where it is written (and, in a button or the hits, again
                    // after it: #2017), its last note ringing to the end of the bar, or an
                    // eighth in a short ending.
                    const held = bass.find((n) => n.tick >= home.start)!;
                    expect([held.tick, mod12(held.midi)], `${where}: the I`).toEqual([
                        home.start,
                        home.chord!.root,
                    ]);
                    const final = bass.at(-1)!;
                    expect(final.tick + final.dur, where).toBe(
                        SHORT_KINDS.has(STYLES[style].endingGesture.kind)
                            ? final.tick + SHORT
                            : bar.start + bar.meter.barTicks,
                    );
                    expect(
                        comp.some((n) => !n.muted && n.tick === home.start),
                        `${where}: the comp strikes the I`,
                    ).toBe(true);
                }
            }
        }
    });

    it('a written V–I off the tonic of a key the chart rests on still resolves to the tonic', () => {
        // `D7 G` in a C tune is the turnaround's V of V and V: the band ends on C, as before.
        for (const bars of ['C | Am | F | D7 G', 'G7 | C | F | D7 G']) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            for (const style of STYLE_IDS) {
                const ending = heldEnding(timeline, 3, STYLES[style].ending);
                expect(
                    ending?.spans.map((span) => span.chord?.root),
                    `${style} ${bars}`,
                ).toEqual([0]);
                expect(heldBass(timeline, style), `${style} ${bars}`).toBe(0);
            }
        }
    });

    it('a final V7 of the opening chord resolves to it, when the opening is where the tune rests', () => {
        // Left on C, an 8-bar blues in G holds its IV7 two bars (`C7 | C7`), rhythm changes its
        // bridge's `C7 | C7`, and a blues in F its V7: a C7 is no C home. The last V7 sends the
        // form back to its opening, which rests longer than any C7, and the band ends there, in
        // the opening's family: the blues on their dominant colour, rhythm changes on its major
        // one, a minor tune typed without its key on its minor one. A G tune that never touches
        // C ends on G rather than holding its last `D7`.
        const charts: [string, SemanticScore, number, TonicFamily][] = [
            [
                '8-bar blues',
                score([{ label: 'A', bars: 'G7 | D7 | C7 | C7 | G7 | D7 | G7 | D7' }]),
                7,
                'dominant',
            ],
            [
                '8-bar blues, I I IV IV',
                score([{ label: 'A', bars: 'G7 | G7 | C7 | C7 | G7 | D7 | G7 | D7' }]),
                7,
                'dominant',
            ],
            [
                '8-bar blues, quick change',
                score([{ label: 'A', bars: 'G7 | C7 | G7 | E7 | A7 | D7 | G7 C7 | G7 D7' }]),
                7,
                'dominant',
            ],
            [
                // Its I7 falls onto its IV7, which goes back to the I7: a blues, not a chain.
                '12-bar quick-change blues in G',
                score([
                    {
                        label: 'A',
                        bars: 'G7 | C7 | G7 | G7 | C7 | C7 | G7 | E7 | A7 | D7 | G7 E7 | A7 D7',
                    },
                ]),
                7,
                'dominant',
            ],
            [
                // The A-Train shape in Bb: its `C7 | C7 | Cm7` is a II7 on its way, no C home.
                'a Bb tune with a II7',
                score([{ label: 'A', bars: 'Bb6 | Bb6 | C7 | C7 | Cm7 | F7 | Bb6 | Cm7 F7' }]),
                10,
                'major',
            ],
            [
                '12-bar blues in F',
                score([
                    {
                        label: 'A',
                        bars: 'F7 | Bb7 | F7 | F7 | Bb7 | Bb7 | F7 | F7 | C7 | Bb7 | F7 | C7',
                    },
                ]),
                5,
                'dominant',
            ],
            [
                '8-bar blues in F',
                score([{ label: 'A', bars: 'F7 | C7 | Bb7 | Bb7 | F7 | C7 | F7 | C7' }]),
                5,
                'dominant',
            ],
            [
                // Its last `Cm7 F7` is a ii–V, not a home on C (`isHome`).
                'jazz blues in Bb',
                score([
                    {
                        label: 'A',
                        bars: 'Bb7 | Eb7 | Bb7 | Bb7 | Eb7 | Eb7 | Bb7 | G7 | Cm7 | F7 | Bb6 G7 | Cm7 F7',
                    },
                ]),
                10,
                'dominant',
            ],
            [
                'minor blues in A',
                score([
                    {
                        label: 'A',
                        bars: 'Am7 | Am7 | Am7 | Am7 | Dm7 | Dm7 | Am7 | Am7 | F7 | E7 | Am7 | E7',
                    },
                ]),
                9,
                'minor',
            ],
            [
                // Its `C7` (the bVI7) rests a bar, but the tune rests on Em7 far longer.
                'minor blues in E',
                score([
                    {
                        label: 'A',
                        bars: 'Em7 | Am7 | Em7 | Em7 | Am7 | Am7 | Em7 | Em7 | C7 | B7 | Em7 | B7',
                    },
                ]),
                4,
                'minor',
            ],
            [
                'rhythm changes',
                {
                    ...FIXTURES.rhythmChanges,
                    key: 'C',
                    sections: FIXTURES.rhythmChanges.sections.map((section, s, all) =>
                        s === all.length - 1
                            ? {
                                  ...section,
                                  measures: [...section.measures.slice(0, -1), turnaround()],
                              }
                            : section,
                    ),
                },
                10,
                'major',
            ],
            ['no C at all', score([{ label: 'A', bars: 'G | Em | Am | D7' }]), 7, 'major'],
        ];
        for (const [name, chart, root, family] of charts) {
            const timeline = compileTimeline(chart);
            const last = timeline.bars.length - 1;
            expect(timeline.bars[last].key.tonic, name).toBe(0);
            for (const style of STYLE_IDS) {
                const chord = heldEnding(timeline, last, STYLES[style].ending)?.spans[0].chord;
                expect(chord?.root, `${style} ${name}`).toBe(root);
                expect(chord?.intervals, `${style} ${name}`).toEqual(EXPECTED[style][family]);
                expect(heldBass(timeline, style), `${style} ${name}`).toBe(root);
            }
        }
    });

    it('a key the chart states as home keeps its tonic over the opening chord', () => {
        // A triad, a power chord or a maj7 on the key's tonic states it as home, and is never
        // outweighed: a C tune that opens on its V triad (#1516's `G D7` turnaround), a rock tune
        // stating C as `C5`, a tune in Ab that opens on its vi (All The Things You Are's shape,
        // its last `C7b9` the V of `Fm7`), and a C tune opening on its IV whose last `C7` is the
        // key's own V7 of IV. A set key whose tonic is only a C7 keeps it when the opening rests
        // no longer than that C7: a circle of dominants (`D7 | G7 | C7 | A7`), once or twice, in
        // C and in D.
        for (const [bars, key, tonic] of [
            ['G | Am | Dm7 | C | G | Am | Dm7 | D7', 'C', 0],
            ['G | F | C5 | D7', 'C', 0],
            ['Fm7 | Bbm7 | Eb7 | Abmaj7 | Dbmaj7 | Dm7 G7 | Cmaj7 | Gm7b5 C7b9', 'Ab', 8],
            ['F | G7 | C | C7', 'C', 0],
            ['D7 | G7 | C7 | A7', 'C', 0],
            ['D7 | G7 | C7 | A7 | D7 | G7 | C7 | A7', 'C', 0],
            ['E7 | A7 | D7 | B7', 'D', 2],
        ] as const) {
            const timeline = compileTimeline(score([{ label: 'A', bars }], { key }));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                expect(
                    heldEnding(timeline, last, STYLES[style].ending)?.spans[0].chord?.root,
                    `${style} ${bars}`,
                ).toBe(tonic);
                expect(heldBass(timeline, style), `${style} ${bars}`).toBe(tonic);
            }
        }
    });

    it("a last V7 on a root the tune rests on is that home turning round, not the opening's V", () => {
        // A D tune that opens on its IV and ends `D D7`, left on C: the D7 is its I picking up a
        // 7th to go round to the G at the top, not the V of G. The tune rests on D longer than
        // on G, so the band does not end on G; nothing backs C, so the bar is played as written.
        // `G | A7 | D | D7` rests on G and on D a bar each: a tie keeps the written ending.
        for (const bars of ['G | D | A7 | D | G | D | A7 | D D7', 'G | A7 | D | D7']) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                expect(heldEnding(timeline, last, STYLES[style].ending), style).toBeNull();
                expect(heldBass(timeline, style), style).toBe(2);
            }
        }
    });

    it('an opening that is not home is not taken: a chain, a power chord, a set minor key', () => {
        // Each ends on a V7 of its opening chord, with nothing resting on C, and each is played
        // as written, as main played it:
        // - a G tune opening on its V of V, `A7 → D7 → G` (`dominantChain`): its A7 falls onto a
        //   D7 that falls again, so it is a chain of dominants, not a blues's I7 → IV7;
        // - a power-chord riff (`E5 | A5 | E5 | B7`): no third to say which E to end on;
        // - a key set to A minor (a new chart's key is C major, so a minor key was set): `Dm |
        //   Bb | C | A7` is its iv, bII, bIII and the I7 of A phrygian dominant, and ends on A7;
        // - a Bb tune opening on its IV, left on C: its `C7 → Cm7` is a II7 turning into the ii
        //   of a ii–V (`dominantMoves`), not a C that rests, so nothing backs C and the bar is
        //   played as written, on its `Cm7`.
        for (const [bars, key, minor, written] of [
            ['A7 | D7 | G7 | E7', 'C', false, 4],
            ['A7 | D7 | G | E7', 'C', false, 4],
            ['E5 | A5 | E5 | B7', 'C', false, 11],
            ['Dm | Bb | C | A7', 'A', true, 9],
            [
                'Ebmaj7 | Ebm7 Ab7 | Bbmaj7 | Bbmaj7 | Gm7 C7 | Cm7 F7 | Bbmaj7 | Cm7 F7',
                'C',
                false,
                0,
            ],
        ] as const) {
            const timeline = compileTimeline(
                score([{ label: 'A', bars }], { key, isMinor: minor }),
            );
            const last = timeline.bars.length - 1;
            for (const style of STYLE_IDS) {
                expect(
                    heldEnding(timeline, last, STYLES[style].ending),
                    `${style} ${bars}`,
                ).toBeNull();
                expect(heldBass(timeline, style), `${style} ${bars}`).toBe(written);
            }
        }
    });

    it('known miss (#1521, options B and C): `G | C | D | D7` left on C ends on C', () => {
        // The same evidence as a C tune that opens on its V (`G | Am | Dm7 | C | … | D7`, above):
        // a C triad that rests, a G opening, a last V7 of G. Whether it is a G tune left on C is
        // for the whole chart, or a key known to be set, to say. Pinned so a fix shows up here.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'G | C | D | D7' }]));
        for (const style of STYLE_IDS) {
            expect(heldBass(timeline, style), style).toBe(0);
        }
    });
});

/** Rhythm changes' last bar written as a turnaround back to the top: `Bb^7 F7`. */
function turnaround() {
    const bar = score([{ label: 'A', bars: 'Bb^7 F7' }]).sections[0].measures[0];
    return { ...bar, id: 'turnaround' };
}

/** A minor groove ending on its tonic minor ninth. */
function minorGroove() {
    return score([{ label: 'Groove', bars: 'Em9 | A13 | Cmaj7 B7#9 | Em9' }], {
        key: 'E',
        isMinor: true,
    });
}

describe('every style ends in its own gesture, set up or not (#2017)', () => {
    // The blues fixture's last bar is a turnaround the band resolves, home on its downbeat.
    // Straight and unhumanized, so every strike sits on the grid the players write on.
    const timeline = compileTimeline(FIXTURES.blues);
    const bar = timeline.bars.at(-1)!;
    const before = timeline.bars.at(-2)!;
    const straight = (style: StyleId, seed: string): BandSettings => ({
        ...settingsFor(style, seed),
        swing: 0,
        humanize: 0,
    });
    const planOf = (style: StyleId, looping: boolean) =>
        planBars(timeline, straight(style, 'a'), {
            pass: 0,
            looping,
            window: fullWindow(timeline),
            endingGesture: STYLES[style].endingGesture,
            keepsHighLine: STYLES[style].keepsHighLine,
        });
    const kitIn = (events: BandEvent[], index: number) =>
        events
            .filter((e) => e.lane === 'drums' && e.bar === index)
            .map((e) => [e.lane === 'drums' ? e.piece : '', e.tick, e.velocity] as const)
            .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    const step = (tick: number) => Math.round((tick - bar.start) / STEP);

    it.each(STYLE_IDS)("%s: the kit's last bar is its book's ending", (style) => {
        // Catches a kit that ignores the book (the crash and kick every style shared before
        // #2017) and a book whose line drifts from the table above.
        const { energy } = planOf(style, false)[bar.index];
        const expected = Object.entries(ENDING_DRUMS[style])
            .flatMap(([piece, line]) =>
                readLine(line).map(
                    ([at, velocity]) =>
                        [piece, bar.start + at * STEP, dyn(velocity, energy)] as const,
                ),
            )
            .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
        for (const seed of SEEDS) {
            const { events } = performPass(timeline, straight(style, seed), {
                pass: 0,
                looping: false,
            });
            expect(kitIn(events, bar.index), `${style}/${seed}`).toEqual(expected);
        }
    });

    it('no two styles end on the same drum bar, but the two that say so; a soft end crashes nowhere', () => {
        // Catches two books collapsing into one ending (the issue's bossa on metal's crash), and
        // a soft ending that crashes.
        const key = (style: StyleId) => JSON.stringify(Object.entries(ENDING_DRUMS[style]).sort());
        for (const [i, a] of STYLE_IDS.entries()) {
            for (const b of STYLE_IDS.slice(i + 1)) {
                const shared = SHARED_ENDINGS.some((pair) => pair.includes(a) && pair.includes(b));
                expect(key(a) === key(b), `${a} and ${b}`).toBe(shared);
            }
            if (STYLES[a].endingGesture.kind === 'soft') {
                expect(Object.keys(ENDING_DRUMS[a]), a).not.toContain('crash');
            }
        }
    });

    it.each(STYLE_IDS)('%s: bass and comp strike the last chord in its gesture', (style) => {
        // Catches a lane that holds every ending (the bass or the comp ignoring the gesture),
        // and a sustaining organ ringing a short ending out (`sustain` in perform.ts).
        const gesture = STYLES[style].endingGesture;
        // [onset, end] steps of each strike, written out by kind.
        const expected =
            gesture.kind === 'stop'
                ? [[0, 2]]
                : gesture.kind === 'button'
                  ? [
                        [0, 14],
                        [14, 16],
                    ]
                  : gesture.kind === 'hits'
                    ? homeSteps(style, 0).map((at, k, all) => [
                          at,
                          k === all.length - 1 ? 16 : at + 2,
                      ])
                    : [[0, 16]];
        const { energy } = planOf(style, false)[bar.index];
        for (const comp of new Set([STYLES[style].prefers, 'organ'] as const)) {
            for (const seed of SEEDS) {
                const where = `${style}/${comp}/${seed}`;
                const { events } = performPass(
                    timeline,
                    { ...straight(style, seed), comp },
                    { pass: 0, looping: false },
                );
                const played = lastBar(timeline, events);
                const strikes = (notes: PitchedNote[]) => [
                    ...new Map(
                        notes
                            .filter((n) => !n.muted)
                            .map((n) => [step(n.tick), [step(n.tick), step(n.tick + n.dur)]]),
                    ).values(),
                ];
                expect(
                    played.bass.map((n) => [step(n.tick), step(n.tick + n.dur)]),
                    `${where}: the bass`,
                ).toEqual(expected);
                expect(strikes(played.comp), `${where}: the comp's strikes`).toEqual(expected);
                for (const n of played.comp.filter((c) => !c.muted)) {
                    // Every voice of a strike lasts as the strike does.
                    expect(
                        expected.some(
                            ([from, to]) => from === step(n.tick) && to === step(n.tick + n.dur),
                        ),
                        `${where}: comp ${n.midi}@${step(n.tick)}`,
                    ).toBe(true);
                }
                if (gesture.kind === 'button') {
                    // The button is the accent: struck harder than the chord it ends.
                    const [chord, button] = expected.map(([from]) =>
                        played.comp.filter((n) => !n.muted && step(n.tick) === from),
                    );
                    for (const n of button) {
                        expect(n.velocity, `${where}: the comp's button`).toBe(dyn(104, energy));
                    }
                    expect(chord[0].velocity, `${where}: the held chord`).toBe(dyn(92, energy));
                    expect(played.bass[1].velocity, `${where}: the bass's button`).toBe(
                        played.bass[0].velocity + 12,
                    );
                }
                if (gesture.kind === 'soft') {
                    // Quietly: the comp at 72 where a held ending strikes at 92, the bass at
                    // four fifths of what its style ends on (none ends louder than 96).
                    for (const n of played.comp.filter((c) => !c.muted)) {
                        expect(n.velocity, `${where}: the comp lets go`).toBe(dyn(72, energy));
                    }
                    expect(played.bass[0].velocity, `${where}: the bass`).toBeLessThanOrEqual(
                        Math.round(dyn(96, energy) * 0.8),
                    );
                }
            }
        }
    });

    it.each(STYLE_IDS)('%s: the bar before sets the ending up, or plays its time', (style) => {
        // Catches a set-up that never comes (`fillAt` ignoring `setup`), and one played in a
        // style that ends without it.
        const fill = (events: BandEvent[]) =>
            new Set(
                events
                    .filter(
                        (e) =>
                            e.lane === 'drums' &&
                            e.bar === before.index &&
                            /^(snare|ghost|tom)/.test(e.piece) &&
                            e.tick >= before.start + 12 * STEP,
                    )
                    .map((e) => (e.lane === 'drums' ? `${e.piece}@${e.tick}` : '')),
            );
        // The bar before plays its time when the song goes round: there is nothing to set up.
        expect(planOf(style, true)[before.index].fill, style).toBe('none');
        for (const seed of SEEDS) {
            const where = `${style}/${seed}`;
            const ending = performPass(timeline, straight(style, seed), {
                pass: 0,
                looping: false,
            });
            const looping = performPass(timeline, straight(style, seed), {
                pass: 0,
                looping: true,
            });
            if (STYLES[style].endingGesture.setup) {
                expect(planOf(style, false)[before.index].fill, where).toBe('section');
                const time = fill(looping.events);
                expect(
                    [...fill(ending.events)].some((hit) => !time.has(hit)),
                    `${where}: a snare or tom figure into the end`,
                ).toBe(true);
            } else {
                expect(kitIn(ending.events, before.index), `${where}: its time`).toEqual(
                    kitIn(looping.events, before.index),
                );
            }
        }
    });
});

describe('a button needs room before it (#2017)', () => {
    it('home arriving on the last eighth rings alone, struck once', () => {
        // Catches a button laid on top of the I's own strike (two strikes on one tick, the
        // first lasting nothing) when the I lands where the button would. In 7/8 the bar's
        // last eighth is its seventh: `G7:6 C:1` brings C home there.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | Dm7 | G7:6 C:1' }], { meter: '7/8' }),
        );
        const bar = timeline.bars[3];
        const home = bar.spans[1];
        const { events } = performPass(
            timeline,
            { ...settingsFor('jazz', 'a'), swing: 0 },
            { pass: 0, looping: false },
        );
        const { bass, comp } = lastBar(timeline, events);
        for (const notes of [bass, comp.filter((n) => !n.muted)]) {
            const atHome = notes.filter((n) => n.tick >= home.start);
            expect(new Set(atHome.map((n) => n.tick))).toEqual(new Set([home.start]));
            for (const n of atHome) {
                expect(n.tick + n.dur).toBe(bar.start + bar.meter.barTicks);
            }
        }
    });
});

describe('the whole band ends together (#2017)', () => {
    const straight = (style: StyleId, seed: string): BandSettings => ({
        ...settingsFor(style, seed),
        lanes: { drums: true, bass: true, comp: true, lead: true },
        swing: 0,
        humanize: 0,
    });

    it.each(['funk', 'metal', 'jazz'] as const)('%s: the lead lets go with the band', (style) => {
        // Catches a lead holding a note over the band's silence (a half note over a funk stop,
        // over the silence after its stab on the V of `G7:2 C:2`, or between metal's stabs),
        // and a lead that misses the button it is holding into.
        const gesture = STYLES[style].endingGesture;
        let restrikes = 0;
        for (const bars of [
            FIXTURES.blues,
            score([{ label: 'A', bars: 'C | F | Dm7 | G7 C' }]),
            score([{ label: 'A', bars: 'C | F | Dm7 | G7:2 C:2' }]),
        ]) {
            const timeline = compileTimeline(bars);
            const bar = timeline.bars.at(-1)!;
            const home = (heldEnding(timeline, bar.index, STYLES[style].ending) ?? bar).spans
                .filter((span) => span.chord)
                .at(-1)!;
            const arrival = (home.start - bar.start) / STEP;
            const hits = homeSteps(style, arrival).map((at) => bar.start + at * STEP);
            const end = bar.start + bar.meter.barTicks;
            for (const seed of SEEDS) {
                const where = `${style}/${seed} ${bar.index + 1} bars`;
                const { events } = performPass(timeline, straight(style, seed), {
                    pass: 0,
                    looping: false,
                });
                const { bass, lead } = lastBar(timeline, events);
                const sung = lead.filter((n) => n.tick + n.dur > home.start);
                if (gesture.kind !== 'button') {
                    // Each lead note lets go where the band's strike it sounds under does (the
                    // bass strikes with the band); one struck in a silence between strikes is
                    // an eighth at most.
                    for (const n of lead) {
                        const under = bass.filter((b) => b.tick <= n.tick).at(-1);
                        expect(
                            n.tick + n.dur,
                            `${where}: lead ${n.midi}@${n.tick}`,
                        ).toBeLessThanOrEqual(
                            Math.max(under ? under.tick + under.dur : 0, n.tick + SHORT),
                        );
                    }
                }
                if (gesture.kind === 'stop') {
                    // Nothing sounds past the band's eighth.
                    for (const n of lead) {
                        expect(n.tick + n.dur, where).toBeLessThanOrEqual(home.start + SHORT);
                    }
                } else if (gesture.kind === 'hits') {
                    // A note struck on a stab lets go with it; the last rings with the last hit.
                    for (const n of lead.filter((l) => hits.slice(0, -1).includes(l.tick))) {
                        expect(n.tick + n.dur, where).toBeLessThanOrEqual(n.tick + SHORT);
                    }
                    // A lead in on the first stab is in on every one after it (a horn that hit
                    // 1 and 3 but not 2 missed the arrival; found by #2017's taste review).
                    const inOnFirst = lead.some(
                        (l) => l.tick <= hits[0] + 1 && l.tick + l.dur > hits[0] + 1,
                    );
                    if (inOnFirst) {
                        for (const hit of hits.slice(1)) {
                            expect(
                                lead.some((l) => Math.abs(l.tick - hit) < 1),
                                `${where}: the lead on the stab at ${hit}`,
                            ).toBe(true);
                        }
                    }
                    const final = lead.at(-1);
                    if (final && final.tick + final.dur > hits.at(-1)!) {
                        expect([final.tick, final.tick + final.dur], where).toEqual([
                            hits.at(-1),
                            end,
                        ]);
                        restrikes++;
                    }
                } else {
                    // Nothing crosses the button: a lead sounding there plays it, accented; one
                    // that let go before it plays it too (#2178), from the note it let go of.
                    const button = hits.at(-1)!;
                    for (const n of lead) {
                        expect(n.tick < button && n.tick + n.dur > button, where).toBe(false);
                    }
                    const struck = lead.find((n) => n.tick === button);
                    const before = struck ? lead[lead.indexOf(struck) - 1] : undefined;
                    if (struck && before) {
                        expect([struck.dur, struck.midi], where).toEqual([SHORT, before.midi]);
                        expect(struck.velocity, where).toBe(
                            Math.min(
                                127,
                                Math.max(before.velocity + 12, buttonAccent(events, button)),
                            ),
                        );
                        // Rung up to the button where it had let go on home (#2178).
                        expect(before.tick + before.dur, where).toBe(button);
                        restrikes++;
                    }
                }
                expect(sung.length, `${where}: the lead sings the ending`).toBeGreaterThan(0);
            }
        }
        // The last hit and the button are not vacuous: the lead plays them.
        if (gesture.kind !== 'stop') {
            expect(restrikes, style).toBeGreaterThan(0);
        }
    });

    it('the kick under the V is never louder than where the I lands', () => {
        // Catches a fixed loud kick catching the V of a soft ending (a bossa's v110 kick
        // under the V, against the I's rim and soft surdo).
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | F | Dm7 | G7:2 C:2' }]));
        const bar = timeline.bars[3];
        const home = bar.spans[1].start;
        for (const style of STYLE_IDS) {
            const { events } = performPass(timeline, straight(style, 'a'), {
                pass: 0,
                looping: false,
            });
            const kit = events.filter((e) => e.lane === 'drums' && e.bar === bar.index);
            const loudest = (hits: typeof kit) => Math.max(...hits.map((e) => e.velocity));
            expect(loudest(kit.filter((e) => e.tick < home)), style).toBeLessThanOrEqual(
                loudest(kit.filter((e) => e.tick === home)),
            );
        }
    });

    it("metal's hits are the beats of the bar, in 6/8 too", () => {
        // Catches hits written as 4/4 sixteenths falling across a 6/8's two dotted-quarter
        // beats, and a bar too short for three hits losing the last one's crash.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | Am7 | Dm7 | G7', meter: '6/8' }]),
        );
        const bar = timeline.bars[3];
        const steps = (notes: { tick: number }[]) => [
            ...new Set(notes.map((n) => Math.round((n.tick - bar.start) / STEP))),
        ];
        for (const seed of SEEDS) {
            const { events } = performPass(timeline, straight('metal', seed), {
                pass: 0,
                looping: false,
            });
            const { bass, comp } = lastBar(timeline, events);
            const kit = events.filter((e) => e.lane === 'drums' && e.bar === bar.index);
            expect(steps(bass), seed).toEqual([0, 6]);
            expect(steps(comp.filter((n) => !n.muted)), seed).toEqual([0, 6]);
            expect(steps(kit), seed).toEqual([0, 6]);
            expect(
                steps(kit.filter((e) => e.lane === 'drums' && e.piece === 'crash')),
                seed,
            ).toEqual([6]);
        }
    });

    it('the set-up is the biggest section fill, however quiet the band', () => {
        // Catches a set-up sized by the bar's energy: a quiet song's last arrival ticking a
        // two-step pickup into it.
        const timeline = compileTimeline(FIXTURES.blues);
        const before = timeline.bars.at(-2)!;
        let shorter = 0;
        for (const style of STYLE_IDS.filter((id) => STYLES[id].endingGesture.setup)) {
            const start = (intensity: number, ending: boolean) => {
                const settings = { ...straight(style, 'a'), intensity };
                const plans = planBars(timeline, settings, {
                    pass: 0,
                    looping: false,
                    window: fullWindow(timeline),
                    endingGesture: STYLES[style].endingGesture,
                });
                const next = plans[before.index + 1];
                return STYLES[style].drums.fillStart({
                    bar: before,
                    plan: plans[before.index],
                    next: {
                        bar: timeline.bars.at(-1)!,
                        plan: ending ? next : { ...next, ending: null },
                    },
                } as unknown as BarContext);
            };
            expect(start(0.1, true), style).toBe(start(1, true));
            // A plain section fill at that level would be shorter, for some styles.
            if ((start(0.1, false) ?? 16) > (start(1, true) ?? 16)) {
                shorter++;
            }
        }
        expect(shorter).toBeGreaterThan(0);
    });
});

describe('a lead held from over the V into home (#2017)', () => {
    it('is struck again on the home chord, not on the V note it held', () => {
        // Catches a re-strike that repeats the held pitch: a B held from over G7 struck again
        // on the band's last hit, a major 7th against the C. No chart reaches it today (the
        // landing moves a note crossing into home first, `landOnHeld`), so the seam is
        // driven directly: metal's hits on `| G7 C |`, the lead holding B through the bar.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | F | Dm7 | G7 C' }]));
        const bar = heldEnding(timeline, 3, STYLES.metal.ending)!;
        const plan = planBars(
            timeline,
            { ...DEFAULT_SETTINGS, style: 'metal' },
            {
                pass: 0,
                looping: false,
                window: fullWindow(timeline),
                endingGesture: STYLES.metal.endingGesture,
            },
        )[3];
        const home = bar.spans[1].chord!;
        // A book that settles on the chord's root, third and fifth, in that order.
        const book = {
            vibrato: 4,
            settle: (chord: typeof home) =>
                [0, chord.third ?? 4, 7].map((i) => mod12(chord.root + i)),
        } as unknown as Parameters<typeof endWithTheBand>[2];
        const ctx = {
            timeline,
            bar,
            plan,
            ending: bar,
            lead: { range: [55, 84] },
        } as unknown as BarContext;
        const held: PitchedNote = {
            lane: 'lead',
            tick: bar.start,
            dur: bar.meter.barTicks,
            midi: 71,
            velocity: 90,
            offsetMs: 0,
            bar: 3,
        };
        const out = endWithTheBand(ctx, [held], book);
        // Cut with the V's stab, struck again with each of home's hits (beat 3 short, beat 4
        // ringing): in on the stabs, the lead plays every one after it.
        expect(out.map((n) => [Math.round((n.tick - bar.start) / STEP), n.dur / STEP])).toEqual([
            [0, 2],
            [8, 2],
            [12, 4],
        ]);
        expect(out[0].midi).toBe(71);
        expect(chordPcs(home)).toContain(mod12(out[1].midi));
        expect(out[1].midi).toBe(72);
    });
});

describe('a fermata on the last bar holds the gesture, not the shared crash (#2175)', () => {
    // A written fermata on the last bar is a written ending (`heldEnding` is null), and the
    // lanes play it in the style's gesture; `holdFermatas` once wrote the crash and kick every
    // fermata shares over that, so a bossa ended on a crash it never plays otherwise.
    // Straight and unhumanized, so every strike sits on the grid the players write on.
    const timeline = compileTimeline(
        score([{ label: 'A', bars: 'C | F | Dm7 | G7', fermataBars: [3] }]),
    );
    const bar = timeline.bars.at(-1)!;
    const end = bar.start + bar.meter.barTicks;
    const straight = (style: StyleId, seed: string): BandSettings => ({
        ...settingsFor(style, seed),
        swing: 0,
        humanize: 0,
    });
    const step = (tick: number) => Math.round((tick - bar.start) / STEP);
    const strikesOf = (notes: PitchedNote[]) =>
        [
            ...new Set(
                notes.filter((n) => !n.muted).map((n) => `${step(n.tick)}-${step(n.tick + n.dur)}`),
            ),
        ]
            .map((s) => s.split('-').map(Number))
            .sort((a, b) => a[0] - b[0]);
    /**
     * The gesture's strikes in a 4/4 bar with the fermata holding the last one to the bar's
     * end, written out by kind: a hold or soft ending as it was, a stop's eighth held, the
     * button held, the hits short but the last.
     */
    const heldStrikes = (style: StyleId) => {
        const gesture = STYLES[style].endingGesture;
        if (gesture.kind === 'button') {
            return [
                [0, 14],
                [14, 16],
            ];
        }
        if (gesture.kind === 'hits') {
            return homeSteps(style, 0).map((at, k, all) => [
                at,
                k === all.length - 1 ? 16 : at + 2,
            ]);
        }
        return [[0, 16]];
    };

    it.each(STYLE_IDS)(
        "%s: the kit plays its book's ending, and the last strike is held",
        (style) => {
            // Catches `holdFermatas` writing the shared crash and kick over the book's line, one
            // bass note and one comp chord where the gesture strikes more (jazz's button, metal's
            // hits), and a stop's eighth left short under a fermata.
            const { energy } = planBars(timeline, straight(style, 'a'), {
                pass: 0,
                looping: false,
                window: fullWindow(timeline),
                endingGesture: STYLES[style].endingGesture,
                keepsHighLine: STYLES[style].keepsHighLine,
            })[bar.index];
            const kit = Object.entries(ENDING_DRUMS[style])
                .flatMap(([piece, line]) =>
                    readLine(line).map(
                        ([at, velocity]) =>
                            [piece, bar.start + at * STEP, dyn(velocity, energy)] as const,
                    ),
                )
                .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
            let sung = 0;
            for (const seed of SEEDS) {
                const where = `${style}/${seed}`;
                const { events } = performPass(timeline, straight(style, seed), {
                    pass: 0,
                    looping: false,
                });
                const drums = events
                    .filter((e) => e.lane === 'drums' && e.bar === bar.index)
                    .map((e) => [e.lane === 'drums' ? e.piece : '', e.tick, e.velocity] as const)
                    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
                expect(drums, where).toEqual(kit);
                const { bass, comp, lead } = lastBar(timeline, events);
                expect(strikesOf(bass), `${where}: the bass`).toEqual(heldStrikes(style));
                expect(strikesOf(comp), `${where}: the comp`).toEqual(heldStrikes(style));
                // The lead lets go with the band (`endWithTheBand`) and its last note is held
                // with the fermata; nothing sounds past the bar.
                for (const n of lead) {
                    expect(
                        n.tick + n.dur,
                        `${where}: lead ${n.midi}@${n.tick}`,
                    ).toBeLessThanOrEqual(end);
                }
                const final = lead.at(-1);
                if (final) {
                    expect(final.tick + final.dur, `${where}: the lead's last note`).toBe(end);
                    sung++;
                }
            }
            // Not vacuous where the hold changes the lead: the three leads the whole-band
            // test above proves sing the last bar (a stop's note held, the button, the hits).
            // Reggae's, the blues's and hip hop's leads rest this short chart's last bar.
            if (style === 'funk' || style === 'metal' || style === 'jazz') {
                expect(sung, `${style}: the lead sings the ending`).toBeGreaterThan(0);
            }
        },
    );

    it.each(['rock', 'funk', 'bossa'] as const)(
        '%s: a fermata on a later chord holds that chord from where it is written',
        (style) => {
            // `| G7 C(fermata) |`: the C is the chart's own ending, held from beat 3 as a bar
            // that gets home itself is (#1502), the G7 struck as written before it. Catches
            // `heldEnding` reading any fermata as "play the first chord": the band then holds
            // the G7 to the end and the written C never sounds.
            const chart = compileTimeline(
                score([{ label: 'A', bars: 'C | F | Dm7 | G7 C', fermataBars: [3] }]),
            );
            const last = chart.bars.at(-1)!;
            const barEnd = last.start + last.meter.barTicks;
            const held = heldEnding(chart, last.index, STYLES[style].ending);
            expect(
                held?.spans.map((s) => s.chord?.symbol),
                style,
            ).toEqual(['G7', 'C']);
            const stepIn = (tick: number) => Math.round((tick - last.start) / STEP);
            // The G7's strike keeps the gesture's shape (an eighth in funk's stop, held to
            // the C otherwise); the C is struck on 3 and held to the bar's end.
            const expected =
                STYLES[style].endingGesture.kind === 'stop'
                    ? [
                          [0, 2],
                          [8, 16],
                      ]
                    : [
                          [0, 8],
                          [8, 16],
                      ];
            for (const seed of SEEDS) {
                const where = `${style}/${seed}`;
                const { events } = performPass(chart, straight(style, seed), {
                    pass: 0,
                    looping: false,
                });
                const { bass, comp, lead } = lastBar(chart, events);
                const shape = (notes: PitchedNote[]) =>
                    [
                        ...new Set(
                            notes
                                .filter((n) => !n.muted)
                                .map((n) => `${stepIn(n.tick)}-${stepIn(n.tick + n.dur)}`),
                        ),
                    ]
                        .map((s) => s.split('-').map(Number))
                        .sort((a, b) => a[0] - b[0]);
                expect(shape(bass), `${where}: the bass`).toEqual(expected);
                expect(shape(comp), `${where}: the comp`).toEqual(expected);
                expect(struckPcs(bass), `${where}: G, then C`).toEqual([7, 0]);
                // The comp on 3 is the written C in the style's own colour (bossa's 6/9):
                // its tones within the chord's own and its scale's, the 3rd or root among them.
                const c = held!.spans[1].chord!;
                const onC = pcsOf(comp.filter((n) => n.tick >= last.start + 8 * STEP));
                expect(
                    [...onC].every(
                        (pc) =>
                            chordPcs(c).includes(pc) ||
                            c.scale.map((s) => mod12(c.root + s)).includes(pc),
                    ),
                    `${where}: C on 3`,
                ).toBe(true);
                expect(onC.has(0) || onC.has(4), `${where}: the C's root or 3rd`).toBe(true);
                const final = lead.at(-1);
                expect(final, `${where}: the lead lands on the C`).toBeDefined();
                expect(final!.tick + final!.dur, where).toBe(barEnd);
                expect([0, 4, 7], where).toContain(mod12(final!.midi));
            }
        },
    );

    it.each(['funk', 'skapunk'] as const)(
        "%s: the lead's note held through a stop's fermata sings with vibrato",
        (style) => {
            // `endWithTheBand` cuts the lead to the band's eighth and strips its vibrato; the
            // fermata then holds that eighth a whole bar. Catches a bar-long straight tone.
            for (const seed of SEEDS) {
                const { events } = performPass(timeline, straight(style, seed), {
                    pass: 0,
                    looping: false,
                });
                const final = lastBar(timeline, events).lead.at(-1);
                expect(final, `${style}/${seed}`).toBeDefined();
                expect(
                    [final!.tick, final!.tick + final!.dur, final!.vibrato],
                    `${style}/${seed}`,
                ).toEqual([bar.start, end, true]);
            }
        },
    );

    it('a soft ending under a fermata crashes nowhere', () => {
        // Catches the issue itself: bossa (and neo-soul, acoustic) with a fermata on the last
        // bar ending on a crash none of them plays.
        const soft = STYLE_IDS.filter((style) => STYLES[style].endingGesture.kind === 'soft');
        expect(soft).toContain('bossa');
        for (const style of soft) {
            for (const seed of SEEDS) {
                const { events } = performPass(timeline, straight(style, seed), {
                    pass: 0,
                    looping: false,
                });
                const crashes = events.filter((e) => e.lane === 'drums' && e.piece === 'crash');
                expect(crashes, `${style}/${seed}`).toEqual([]);
            }
        }
    });
});

describe('a lead note tied into the ending bar lets go with the band (#2176)', () => {
    // The guide-tone head ties its "and" of 4 into the downbeat (`guideOnsets`), the ending
    // bar's too: a note struck in the bar before and held through the last bar, which the
    // ending bar's own cut never saw (it was emitted a bar earlier). The seeds are ones where
    // the head ties in on the pop song; the first expectation keeps each case non-vacuous.
    const tiedIn = (style: StyleId, seed: string) => {
        const timeline = compileTimeline(FIXTURES.popSong);
        const bar = timeline.bars.at(-1)!;
        const { events } = performPass(
            timeline,
            {
                ...settingsFor(style, seed),
                head: 'guide-tones',
                lanes: { drums: true, bass: true, comp: true, lead: true },
                swing: 0,
                humanize: 0,
            },
            { pass: 0, looping: false },
        );
        const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
        const tied = lead.filter((n) => n.bar === bar.index - 1 && n.tick + n.dur > bar.start);
        expect(tied, `${style}/${seed}: the head ties into the last bar`).toHaveLength(1);
        return { bar, events, tied: tied[0], inBar: lead.filter((n) => n.bar === bar.index) };
    };

    it("funk: a stop cuts it at the band's eighth, and it is not struck again on the one", () => {
        const { bar, tied, inBar } = tiedIn('funk', 'a');
        expect(tied.tick).toBeLessThan(bar.start);
        expect(tied.tick + tied.dur).toBe(bar.start + SHORT);
        expect(inBar).toEqual([]);
    });

    it('jazz: held to the button, it plays the button with the band, at the accent at least (#2212)', () => {
        const { bar, events, tied, inBar } = tiedIn('jazz', 'f');
        const button = bar.start + 14 * STEP;
        expect(tied.tick + tied.dur).toBe(button);
        expect(inBar.map((n) => [n.tick, n.dur, n.midi, n.velocity, n.bar])).toEqual([
            [
                button,
                SHORT,
                tied.midi,
                Math.min(127, Math.max(tied.velocity + 12, buttonAccent(events, button))),
                bar.index,
            ],
        ]);
    });

    it('bossa: a soft ending lets it ring to the end, as planned', () => {
        const { bar, tied, inBar } = tiedIn('bossa', 'a');
        expect(tied.tick + tied.dur).toBe(bar.start + bar.meter.barTicks);
        expect(inBar).toEqual([]);
    });

    it('funk: under a written fermata on the last bar the band holds, and so does the tie', () => {
        // The fermata is the chart's own ending (`holdFermatas`), not the style's gesture: the
        // bar before leaves the tie ringing to the bar's end, and the ending bar strikes
        // nothing again. Seed d is one where the head ties in on this chart.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | Dm7 G7 | C', fermataBars: [3] }]),
        );
        const bar = timeline.bars.at(-1)!;
        const { events } = performPass(
            timeline,
            {
                ...settingsFor('funk', 'd'),
                head: 'guide-tones',
                lanes: { drums: true, bass: true, comp: true, lead: true },
                swing: 0,
                humanize: 0,
            },
            { pass: 0, looping: false },
        );
        const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
        const tied = lead.filter((n) => n.bar === bar.index - 1 && n.tick + n.dur > bar.start);
        expect(tied, 'the head ties into the last bar').toHaveLength(1);
        expect(tied[0].tick + tied[0].dur).toBe(bar.start + bar.meter.barTicks);
        expect(lead.filter((n) => n.bar === bar.index)).toEqual([]);
    });

    it('jazz: under a written fermata the tie is cut at the button, and the button ends the bar', () => {
        // A fermata on the ending bar holds the gesture's last strike (#2175): the button is
        // played as written, so the tie lets go at 14 and the lead's button note is what the
        // hold rings on, ending the bar with the band. Seed k is one where the head ties in.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | Dm7 G7 | C', fermataBars: [3] }]),
        );
        const bar = timeline.bars.at(-1)!;
        const { events } = performPass(
            timeline,
            {
                ...settingsFor('jazz', 'k'),
                head: 'guide-tones',
                lanes: { drums: true, bass: true, comp: true, lead: true },
                swing: 0,
                humanize: 0,
            },
            { pass: 0, looping: false },
        );
        const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
        const tied = lead.filter((n) => n.bar === bar.index - 1 && n.tick + n.dur > bar.start);
        expect(tied, 'the head ties into the last bar').toHaveLength(1);
        const button = bar.start + 14 * STEP;
        expect(tied[0].tick + tied[0].dur).toBe(button);
        const inBar = lead.filter((n) => n.bar === bar.index);
        expect(inBar.map((n) => [n.tick, n.tick + n.dur, n.midi, n.velocity])).toEqual([
            [
                button,
                bar.start + bar.meter.barTicks,
                tied[0].midi,
                Math.min(127, Math.max(tied[0].velocity + 12, buttonAccent(events, button))),
            ],
        ]);
    });

    it('metal: cut with the first hit, then in on every hit after it (the seam)', () => {
        // No metal chart ties into its last bar today, so the seam is driven directly: a G
        // struck on the "and" of 4 of the bar before `| G7 |`'s resolved C5 and held through
        // the bar. It counts as struck on the barline: it lets go with the first hit, is not
        // struck again there, and plays the hits on 2 and 3, the last ringing to the end.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | F | Dm7 | G7' }]));
        const bar = heldEnding(timeline, 3, STYLES.metal.ending)!;
        const plan = planBars(
            timeline,
            { ...DEFAULT_SETTINGS, style: 'metal' },
            {
                pass: 0,
                looping: false,
                window: fullWindow(timeline),
                endingGesture: STYLES.metal.endingGesture,
            },
        )[3];
        const book = {
            vibrato: 4,
            settle: (chord: { root: number }) => [chord.root, mod12(chord.root + 7)],
        } as unknown as Parameters<typeof endWithTheBand>[2];
        const ctx = {
            timeline,
            bar,
            plan,
            ending: bar,
            lead: { range: [55, 84] },
        } as unknown as BarContext;
        const tied: PitchedNote = {
            lane: 'lead',
            tick: bar.start - 2 * STEP,
            dur: 18 * STEP,
            midi: 67,
            velocity: 90,
            offsetMs: 0,
            bar: 2,
        };
        const out = endWithTheBand(ctx, [tied], book);
        expect(
            out.map((n) => [Math.round((n.tick - bar.start) / STEP), n.dur / STEP, n.midi, n.bar]),
        ).toEqual([
            [-2, 4, 67, 2],
            [4, 2, 67, 3],
            [8, 8, 67, 3],
        ]);
    });
});

describe('country ends on a walk-up and a stinger (#2177)', () => {
    // Country shares the blues's last drum bar (`SHARED_ENDINGS`); what is its own is the bass's
    // walk into the one and the guitar's stinger over the last chord.
    // Straight and unhumanized, so every note sits on the grid the players write on.
    const straight = (seed: string, intensity: number | null = null): BandSettings => ({
        ...settingsFor('country', seed),
        swing: 0,
        humanize: 0,
        intensity,
    });
    const bassIn = (events: BandEvent[], index: number) =>
        events.filter((e): e is PitchedNote => e.lane === 'bass' && e.bar === index);
    const inC = (bars: string) => score([{ label: 'A', bars }]);
    /**
     * Each chart's bar before the end, written out by hand: from the step its last chord is
     * struck, each bass note's step and its distance in semitones from the root the ending
     * lands on.
     */
    const walkUps: Record<
        string,
        {
            chart: SemanticScore;
            walk: [number, number][];
            /** A second shape the bar may take, from the register the line reached it in. */
            or?: [number, number][];
            seeds?: string[];
        }
    > = {
        // Over the V: "G, A-B → C", the G held through 2.
        V: {
            chart: inC('C | F | G7 | Dm7 G7'),
            walk: [
                [0, -5],
                [8, -3],
                [12, -1],
            ],
        },
        // The same into a last bar already home.
        'V, home written': {
            chart: inC('C | F | G7 | C'),
            walk: [
                [0, -5],
                [8, -3],
                [12, -1],
            ],
        },
        // Over the I: its root, the fifth below on 2, then the run: C, G A B → C.
        I: {
            chart: inC('C | F | C | Dm7 G7'),
            walk: [
                [0, 0],
                [4, -5],
                [8, -3],
                [12, -1],
            ],
        },
        // From the IV it walks down the fourth: F, E-D → C.
        IV: {
            chart: inC('C | Am7 | Fmaj7 | G7'),
            walk: [
                [0, 5],
                [8, 4],
                [12, 2],
            ],
        },
        // In E: A, G#-F# → E.
        'IV in E': {
            chart: score([{ label: 'A', bars: 'E | B7 | A | B7' }], { key: 'E' }),
            walk: [
                [0, 5],
                [8, 4],
                [12, 2],
            ],
        },
        // The vi's root is inside the run: the boom, root and fifth, then B on 4: A, E, B → C.
        vi: {
            chart: inC('C | F | Am | Dm7 G7'),
            walk: [
                [0, -3],
                [8, -8],
                [12, -1],
            ],
        },
        // The bVII (country rock's cadence) is the run's b7 already: the boom, then the
        // leading tone walks in chromatically, Bb, F, B → C.
        bVII: {
            chart: inC('C | F | Bb | Dm7 G7'),
            walk: [
                [0, -2],
                [8, -7],
                [12, -1],
            ],
        },
        // Over the ii: D, then G A B → C. The run sits under the low C the band ends on
        // (#2178), and the D, already nearest that C, stays a step above it.
        ii: {
            chart: inC('C | F | Dm7 | Dm7 G7'),
            walk: [
                [0, 2],
                [4, -5],
                [8, -3],
                [12, -1],
            ],
        },
        // In E the low root has no 5 under it, so the run takes the lowest octave it fits in
        // (#2178): F#2, then B1 C#2 D#2 → E2, never up to E3. The landing is where the walk
        // pointed: placed from the D# alone it could fall an octave.
        'ii in E': {
            chart: score([{ label: 'A', bars: 'E | A | F#m7 | B7' }], { key: 'E' }),
            walk: [
                [0, 2],
                [4, -5],
                [8, -3],
                [12, -1],
            ],
        },
        // `C7 A7`: the A7 struck on 3 keeps its root there and goes down into the low C by
        // one note (#2178, #2198: a country bassist never ends on the top string). From a
        // line that sat low it walks up with the leading tone (A7's 9th): A1, B1 → C2; from a
        // C3 a lead-in had placed, the A2 boom steps to the landing's 5 and drops the fifth:
        // A2, G2 → C2 — never the C3 the old own-register walk ended on.
        'two-beat A7': {
            chart: FIXTURES.blues,
            walk: [
                [8, -3],
                [12, -1],
            ],
            or: [
                [8, 9],
                [12, 7],
            ],
        },
        // In A minor, over E7: E, F#-G# → A.
        'minor V': {
            chart: score([{ label: 'A', bars: 'Am | Dm7 | E7 | E7' }], { key: 'A', isMinor: true }),
            walk: [
                [0, -5],
                [8, -3],
                [12, -1],
            ],
        },
    };

    it.each(Object.entries(walkUps))(
        '%s: the bass walks into the root on the one, at any energy',
        (name, { chart, walk, or, seeds = SEEDS }) => {
            // Catches a walk-up left to the line's coin toss (the regular walk plays about half
            // the time, never in the ballad), one aimed at the chord the ending replaces, a
            // line that turns round under a root already inside the run, and a landing an
            // octave off the walk.
            const timeline = compileTimeline(chart);
            const bar = timeline.bars.at(-1)!;
            const before = timeline.bars.at(-2)!;
            const from = walk[0][0];
            for (const intensity of [null, 0.1, 0.9]) {
                for (const seed of seeds) {
                    const where = `${name}/${seed}/${intensity}`;
                    const { events } = performPass(timeline, straight(seed, intensity), {
                        pass: 0,
                        looping: false,
                    });
                    const landing = bassIn(events, bar.index)[0];
                    expect(landing.tick, `${where}: the root on the one`).toBe(bar.start);
                    expect(mod12(landing.midi), `${where}: the root`).toBe(bar.key.tonic);
                    // The landing is the accent: struck at least as hard as the note into it.
                    expect(
                        landing.velocity,
                        `${where}: the landing's weight`,
                    ).toBeGreaterThanOrEqual(bassIn(events, before.index).at(-1)!.velocity);
                    const shape = bassIn(events, before.index)
                        .filter((n) => n.tick >= before.start + from * STEP)
                        .map((n) => [
                            Math.round((n.tick - before.start) / STEP),
                            n.midi - landing.midi,
                        ]);
                    expect([walk, ...(or ? [or] : [])], `${where}: the walk-up`).toContainEqual(
                        shape,
                    );
                }
            }
        },
    );

    // A V struck on 3 (`Dm7 G7`) into the ending, by key. The low root is the lowest note of
    // its class on the bass (E1 is MIDI 28); a landing goes down to it only where the E string
    // has a 5 under it, so A to Eb land on A1 to Eb2 but E to Ab, with no 5 under their low
    // root, land an octave above it. Written out by hand (MIDI), not read back from
    // `lowestRoot`. On these charts seed `a` is the one whose boom sits on the landing's 5
    // (D3 over G2), the case the rule is about; the other seeds' booms sit under the landing
    // and walked in before #2201 too.
    const twoBeatInto: [string, SemanticScore, number][] = [
        [
            'E (no 5 under its low E)',
            score([{ label: 'A', bars: 'E | A | F#m7 B7 | E' }], { key: 'E' }),
            40,
        ],
        [
            'F (no 5 under its low F)',
            score([{ label: 'A', bars: 'F | Bb | Gm7 C7 | F' }], { key: 'F' }),
            41,
        ],
        [
            'G (no 5 under its low G)',
            score([{ label: 'A', bars: 'G | F | F | Am7 D7 | G' }], { key: 'G' }),
            43,
        ],
        [
            'Ab (no 5 under its low Ab)',
            score([{ label: 'A', bars: 'Ab | Gb | Gb | Bbm7 Eb7 | Ab' }], { key: 'Ab' }),
            44,
        ],
    ];

    it.each(twoBeatInto)(
        '%s: a two-beat turnaround keeps its walk-in under the landing',
        (_name, chart, landingMidi) => {
            // Catches #2178's fifth drop played where the landing stays in the line's octave:
            // the V's boom on the landing's own 5 (D3 over G2) fell to it with nothing leading
            // in (`D3 — | G2`), where the country move is the step under the root (D3, F#2 →
            // G2). Every seed: the bar's last note is on 4, the leading tone under the landing
            // (a major V has no note a whole step under it: that would be F under D7's F#).
            const timeline = compileTimeline(chart);
            const bar = timeline.bars.at(-1)!;
            const before = timeline.bars.at(-2)!;
            for (const seed of SEEDS) {
                const { events } = performPass(timeline, straight(seed), {
                    pass: 0,
                    looping: false,
                });
                expect(bassIn(events, bar.index)[0].midi, `${seed}: the landing`).toBe(landingMidi);
                const last = bassIn(events, before.index).at(-1)!;
                expect(
                    Math.round((last.tick - before.start) / STEP),
                    `${seed}: the walk-in is on 4`,
                ).toBe(12);
                expect(last.midi, `${seed}: the walk-in is the leading tone`).toBe(landingMidi - 1);
            }
        },
    );

    // A (33) and Eb (39) are the lowest and highest landings that go low: the keys either side
    // of the E to Ab that walk in.
    it.each([
        ['A', 'A | D | Bm7 E7 | A', 33],
        ['C', 'C | F | Dm7 G7 | C', 36],
        ['D', 'D | G | Em7 A7 | D', 38],
        ['Eb', 'Eb | Ab | Fm7 Bb7 | Eb', 39],
    ])(
        '%s: a two-beat turnaround into a low landing drops the fifth, no walk-in',
        (key, bars, low) => {
            // Catches the walk-in kept where the landing goes low: the V's boom a fifth over the low
            // root (G2 over C2) drops to it as a V does (#2178), the bar's last note the boom.
            const timeline = compileTimeline(score([{ label: 'A', bars }], { key }));
            const bar = timeline.bars.at(-1)!;
            const before = timeline.bars.at(-2)!;
            const { events } = performPass(timeline, straight('a'), { pass: 0, looping: false });
            expect(bassIn(events, bar.index)[0].midi, 'the low landing').toBe(low);
            const last = bassIn(events, before.index).at(-1)!;
            expect(last.midi, 'the boom, a fifth over the landing').toBe(low + 7);
            expect(Math.round((last.tick - before.start) / STEP), 'on 3').toBe(8);
        },
    );

    it('a chord struck on 3 that is not the V still steps down into a landing in E to Ab', () => {
        // Catches the walk-in given to every beat-3 chord in the keys that land an octave up:
        // `Am7 Bm | G` walks 3-2-1 (B2, A2 → G2), and a 7 there would drop a fourth to F#2 and
        // turn back. Only the boom on the landing's 5 differs by key (#2201).
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'G | F | F | Am7 Bm | G' }], { key: 'G' }),
        );
        const bar = timeline.bars.at(-1)!;
        const before = timeline.bars.at(-2)!;
        const { events } = performPass(timeline, straight('a'), { pass: 0, looping: false });
        expect(bassIn(events, bar.index)[0].midi, 'the landing, G2').toBe(43);
        const last = bassIn(events, before.index).at(-1)!;
        expect(Math.round((last.tick - before.start) / STEP), 'on 4').toBe(12);
        expect(last.midi, 'A2, the step between the B and the G').toBe(45);
    });

    it('a pass that goes round plays its own line there, not the walk-up', () => {
        // Catches the walk-up played into a chord the band does not end on. The chart ends home
        // on its C either way; a ballad's line never walks, so its bar before strikes nothing on
        // beat 4, where the walk-up always does.
        const timeline = compileTimeline(walkUps['V, home written'].chart);
        const before = timeline.bars.at(-2)!;
        for (const seed of SEEDS) {
            const fourth = (looping: boolean) =>
                bassIn(
                    performPass(timeline, straight(seed, 0.1), { pass: 0, looping }).events,
                    before.index,
                ).filter((n) => n.tick >= before.start + 12 * STEP);
            expect(fourth(false).length, `${seed}: the walk-up`).toBe(1);
            expect(fourth(true), `${seed}: going round`).toEqual([]);
        }
    });

    /** Open strings, low E to high E: a stung grip below is written string by string. */
    const OPEN: Record<string, number> = { E: 40, A: 45, D: 50, G: 55, B: 59, e: 64 };
    /** A string and fret (`e12`) as a pitch. */
    const fretted = (at: string) => OPEN[at[0]] + Number(at.slice(1));
    /**
     * The stung last chord in each key, written out by hand as the hand holds it, one note per
     * string: the chord struck on the one with the 6th in it, and the string and fret its 5th is
     * pulled off to. Null: the grip has no sting (open C's top G at e3 can't reach the A at e5
     * over B1 inside the hand's span, the stretch off pending #2195; open D's only 5th is an
     * inner voice and no string on top reaches one; G without a bassist frets its picked G2 at
     * E3, out of reach of the high fall, #2191).
     */
    const stung: Record<
        string,
        { chart: SemanticScore; bass: [string, string] | null; alone: [string, string] | null }
    > = {
        C: { chart: inC('C | F | G7 | Dm7 G7'), bass: null, alone: null },
        // Open G holds its only 5th at the bottom (D0): the fall takes the doubled top G's
        // string, high over the open strings, E5 → D5.
        G: {
            chart: score([{ label: 'A', bars: 'G | C | D7 | D7' }], { key: 'G' }),
            bass: ['D0 G0 B0 e12', 'e10'],
            alone: null,
        },
        D: {
            chart: score([{ label: 'A', bars: 'D | G | A7 | A7' }], { key: 'D' }),
            bass: null,
            alone: null,
        },
        // The B string's C# pulled off to the open B, under the open top E.
        E: {
            chart: score([{ label: 'A', bars: 'E | A | B7 | B7' }], { key: 'E' }),
            bass: ['D2 G1 B2 e0', 'B0'],
            alone: ['E0 D2 G1 B2 e0', 'B0'],
        },
        // The b6 on the top string pulled off to the open E.
        'A minor': {
            chart: score([{ label: 'A', bars: 'Am | Dm7 | E7 | E7' }], { key: 'A', isMinor: true }),
            bass: ['D2 G2 B1 e1', 'e0'],
            alone: ['A0 D2 G2 B1 e1', 'e0'],
        },
    };

    it.each(Object.entries(stung))(
        '%s: the guitar stings the last chord on one string, on top',
        (name, { chart, bass, alone }) => {
            // Catches a stinger that never plays, one buried under the chord, one that takes a
            // string the chord is already sounding (five notes on G's four-string grip: its B
            // string can't ring the open B and the fretted E at once), one out of the hand's reach,
            // a 6th that rings on over the 5th, and a pull-off as loud as the strum.
            const timeline = compileTimeline(chart);
            const bar = timeline.bars.at(-1)!;
            const end = bar.start + bar.meter.barTicks;
            const fall = bar.start + 2 * STEP;
            for (const [withBass, shape] of [
                [true, bass],
                [false, alone],
            ] as const) {
                for (const comp of ['guitar', 'nylon'] as const) {
                    for (const seed of SEEDS) {
                        const where = `${name}/${comp}/${withBass ? 'bass' : 'no bass'}/${seed}`;
                        const settings = {
                            ...straight(seed),
                            comp,
                            // No lead: a grip leaves out a voice on the lead's pitch, which would
                            // make the written shapes depend on the solo's last note.
                            lanes: {
                                ...settingsFor('country', seed).lanes,
                                bass: withBass,
                                lead: false,
                            },
                        };
                        const { events } = performPass(timeline, settings, {
                            pass: 0,
                            looping: false,
                        });
                        const comped = lastBar(timeline, events).comp.filter((n) => !n.muted);
                        const hit = comped.filter((n) => n.tick === bar.start);
                        const after = comped.filter((n) => n.tick > bar.start);
                        if (!shape) {
                            expect(after, `${where}: no stinger`).toEqual([]);
                            continue;
                        }
                        const [held, to] = shape;
                        const strings = held.split(' ');
                        expect(
                            hit.map((n) => n.midi).sort((x, y) => x - y),
                            `${where}: the chord, one note per string`,
                        ).toEqual(strings.map(fretted).sort((x, y) => x - y));
                        // The 6th is the note on the fall's own string, struck for an eighth.
                        const six = hit.find(
                            (n) => n.midi === fretted(strings.find((at) => at[0] === to[0])!),
                        )!;
                        expect(six.tick + six.dur, `${where}: the 6th lets go`).toBe(fall);
                        expect(
                            mod12(six.midi - fretted(to)) === 2 ||
                                mod12(six.midi - fretted(to)) === 1,
                            `${where}: a 6th over its 5th`,
                        ).toBe(true);
                        expect(
                            after.map((n) => [n.tick, n.midi, n.tick + n.dur, n.velocity]),
                            `${where}: pulled off to the 5th, ringing, a tenth softer`,
                        ).toEqual([[fall, fretted(to), end, Math.round(six.velocity * 0.9)]]);
                        expect(mod12(fretted(to) - bar.key.tonic), `${where}: the 5th`).toBe(7);
                        expect(
                            hit.filter((n) => n !== six && n.midi > fretted(to)).length,
                            `${where}: in the top two voices`,
                        ).toBeLessThanOrEqual(1);
                    }
                }
            }
        },
    );

    it.each(['G7', 'G'])(
        'no stinger where the band does not end home: a written %s under a fermata',
        (last) => {
            // Catches a sting on a chord that is not the tonic: G7's 6th, E, under its F, and the
            // plain V's, a 6th with nothing to rub that is still not where the band comes home.
            const timeline = compileTimeline(
                score([{ label: 'A', bars: `C | F | Dm7 | ${last}`, fermataBars: [3] }]),
            );
            const bar = timeline.bars.at(-1)!;
            for (const seed of SEEDS) {
                const { events } = performPass(
                    timeline,
                    { ...straight(seed), comp: 'guitar' },
                    { pass: 0, looping: false },
                );
                const comped = lastBar(timeline, events).comp.filter((n) => !n.muted);
                expect(comped.length, seed).toBeGreaterThan(0);
                expect(new Set(comped.map((n) => n.tick)), seed).toEqual(new Set([bar.start]));
            }
        },
    );
});

describe("the lead plays the band's final hit, and the bass's last note goes low (#2178)", () => {
    // A head's last phrase mostly sings into the ending bar; a solo pass's sparse shapes (pass
    // 1–3) rest the form's last bar, and some books rest it in the head too (reggae's, hip
    // hop's, the blues's). Every case is a real chart through `performPass`, straight and
    // unhumanized; the looping pass of the same seed, which plays no ending, shows what the
    // phrase did on its own: a lead resting the last bar there had let go before the ending,
    // so what it plays in the ending bar is the gesture's doing, not the phrase's.
    const CHARTS = {
        blues: FIXTURES.blues,
        pop: FIXTURES.popSong,
        roman: FIXTURES.romanNumerals,
        gmaj: score([{ label: 'A', bars: 'G | C | Am7 | D7' }], { key: 'G' }),
        // The low E: the root at the bass's floor, with no 5 or lead-in under it.
        emaj: score([{ label: 'A', bars: 'E | A | F#m7 | B7' }], { key: 'E' }),
        // And in minor, ending on its im9 over the same low E.
        minorFunk: FIXTURES.minorFunk,
    };
    const PASSES = [0, 1, 2, 3];
    const straight = (style: StyleId, seed: string): BandSettings => ({
        ...settingsFor(style, seed),
        lanes: { drums: true, bass: true, comp: true, lead: true },
        swing: 0,
        humanize: 0,
    });
    /** One style's cases: each chart, pass and seed, with the ending pass and the looping pass. */
    function* cases(style: StyleId) {
        for (const [name, chart] of Object.entries(CHARTS)) {
            const timeline = compileTimeline(chart);
            const bar = timeline.bars.at(-1)!;
            const end = bar.start + bar.meter.barTicks;
            // Every chart here is home on the ending bar's downbeat (a resolved turnaround, or
            // a tonic already written there), so the gesture is measured from the barline.
            const home = (heldEnding(timeline, bar.index, STYLES[style].ending) ?? bar).spans
                .filter((span) => span.chord)
                .at(-1)!;
            expect(home.start, name).toBe(bar.start);
            const hits = homeSteps(style, 0).map((at) => bar.start + at * STEP);
            const leadIn = (events: BandEvent[]) =>
                events.filter(
                    (e): e is PitchedNote =>
                        e.lane === 'lead' && e.tick < end && e.tick + e.dur > bar.start + 1,
                );
            for (const pass of PASSES) {
                for (const seed of SEEDS) {
                    const ending = performPass(timeline, straight(style, seed), {
                        pass,
                        looping: false,
                    }).events;
                    const looping = performPass(timeline, straight(style, seed), {
                        pass,
                        looping: true,
                    }).events;
                    yield {
                        where: `${style}/${name}/pass ${pass}/${seed}`,
                        timeline,
                        bar,
                        end,
                        chord: home.chord!,
                        hits,
                        lead: leadIn(ending),
                        comp: ending.filter(
                            (e): e is PitchedNote => e.lane === 'comp' && e.bar === bar.index,
                        ),
                        bass: ending.filter(
                            (e): e is PitchedNote => e.lane === 'bass' && e.bar >= bar.index - 2,
                        ),
                        rested: leadIn(looping).length === 0,
                        // Where the phrase's last note in the bar ended when played on its own.
                        loopEnd: Math.max(...leadIn(looping).map((n) => n.tick + n.dur), -1),
                    };
                }
            }
        }
    }
    const restingTone = (chord: ChordFacts, midi: number) =>
        chordPcs(chord).includes(mod12(midi)) || chord.scale.includes(mod12(midi - chord.root));

    it.each(STYLE_IDS)(
        "%s: the lead ends with the band — on its final hit, or ringing to its last strike's end",
        (style) => {
            // Catches a lead that plays the stop's One, the last stab or the button only when
            // its phrase was still sounding (`endWithTheBand` before #2178: reggae, hip hop and
            // jazz missed it on the blues), a hold or soft ending whose lead stops at beat 3
            // while the band rings to 4, and the over-reach: a lead struck into a chord the
            // band is letting ring. The counts keep the let-go case non-vacuous: at least one
            // case per style where the phrase had let go and the gesture put the lead on the
            // hit (or, ringing, kept it out).
            const gesture = STYLES[style].endingGesture;
            const short =
                gesture.kind === 'stop' || gesture.kind === 'button' || gesture.kind === 'hits';
            let letGo = 0;
            for (const { where, bar, end, chord, hits, lead, rested, loopEnd } of cases(style)) {
                if (short) {
                    const final = hits.at(-1)!;
                    const onHit = lead.filter((n) => Math.abs(n.tick - final) < 1);
                    expect(onHit, `${where}: the lead on the final hit`).toHaveLength(1);
                    expect(onHit[0].tick + onHit[0].dur, `${where}: let go with the band`).toBe(
                        gesture.kind === 'hits' ? end : final + SHORT,
                    );
                    expect(restingTone(chord, onHit[0].midi), `${where}: a resting tone`).toBe(
                        true,
                    );
                    for (const n of lead) {
                        expect(n.tick, `${where}: nothing after the last hit`).toBeLessThanOrEqual(
                            final,
                        );
                    }
                    if (rested) {
                        letGo++;
                        // Silent in the bar, the lead joins every one of the band's hits: the
                        // stabs are unison, the band's (a horn in on 3 alone missed 1 and 2).
                        // In a button it plays the button alone: the chord before it is the
                        // band's to hold, so the lead's one note in the bar is the button.
                        const joined = gesture.kind === 'hits' ? hits : [final];
                        expect(
                            lead.map((n) => n.tick),
                            `${where}: the lead on ${joined.length} hits`,
                        ).toEqual(joined);
                    } else if (gesture.kind === 'button') {
                        // Let go inside the bar, before the button (the phrase's own note ends
                        // at beat 3 on the blues): a note on home is rung up to the button,
                        // "baaah–bop"; the old rule left a beat and a half of silence, then
                        // the bop from nothing.
                        const before = lead.filter((n) => n.tick < final - 1).at(-1);
                        if (before && before.tick >= bar.start) {
                            expect(
                                before.tick + before.dur,
                                `${where}: rung up to the button`,
                            ).toBe(final);
                        }
                        if (before && loopEnd < final - 1) {
                            letGo++;
                        }
                    }
                } else if (rested) {
                    letGo++;
                    expect(
                        lead.filter((n) => n.bar === bar.index),
                        `${where}: a lead that had let go stays out of a ringing chord`,
                    ).toEqual([]);
                } else {
                    const last = lead.at(-1)!;
                    expect(last.tick + last.dur, `${where}: rings to the bar's end`).toBe(end);
                    expect(restingTone(chord, last.midi), `${where}: a resting tone`).toBe(true);
                }
            }
            expect(letGo, `${style}: a case where the phrase had let go`).toBeGreaterThan(0);
        },
    );

    // The gestures whose final hit the lead plays: a hold and a soft ending ring, and play none.
    const JOINS = new Set<EndingGesture['kind']>(['stop', 'hits', 'button']);
    it.each(STYLE_IDS.filter((style) => JOINS.has(STYLES[style].endingGesture.kind)))(
        "%s: a lead striking the band's stab is never under the comp's strike",
        (style) => {
            // Catches a lead that joins the stop's One, the stabs or the button at the level its
            // phrase died away at (72-78 under the band's 88+; #2200), and one that sang into
            // home and then struck the hits after it, or the button, at its phrase's level (#2212:
            // metal's hits 2 and 3 at 70-95 against the comp's 83-92 where a resting lead played
            // them at 95-104), and the phrase's own note struck with home's first hit left under
            // the stabs after it. Every lead note struck with one of home's strikes is held to
            // the comp's strike on the same hit as the band rendered it (the button's lift
            // included), whether it joined from silence or the phrase was sounding. The counts
            // keep both non-vacuous.
            let joined = 0;
            let restruck = 0;
            const button = STYLES[style].endingGesture.kind === 'button';
            for (const { where, lead, comp, rested, hits } of cases(style)) {
                for (const n of lead) {
                    // A button's landing on home (its first strike) is the phrase's note, sung
                    // as the held chord's: the bop alone is the stab.
                    if (button && Math.abs(n.tick - hits.at(-1)!) > 1) {
                        continue;
                    }
                    const band = comp.filter((c) => Math.abs(c.tick - n.tick) < 1);
                    if (!band.length) {
                        continue;
                    }
                    if (rested) {
                        joined++;
                    } else {
                        restruck++;
                    }
                    expect(
                        n.velocity,
                        `${where}: the lead's hit at ${n.tick} under the comp's`,
                    ).toBeGreaterThanOrEqual(Math.min(...band.map((c) => c.velocity)));
                }
            }
            expect(joined, `${style}: a case where the lead joined the hit`).toBeGreaterThan(0);
            if (STYLES[style].endingGesture.kind !== 'stop') {
                expect(
                    restruck,
                    `${style}: a case where the lead struck the hit again`,
                ).toBeGreaterThan(0);
            }
        },
    );

    /**
     * Whether the line sat nearer the octave above the low root as it came into the bar
     * before the ending (that bar's first note; its last is the approach, aimed low): where
     * it did, a placement near the note before (`place`) would take the upper octave, and the
     * low root is the rule's doing.
     */
    const satHigh = (bass: PitchedNote[], barIndex: number, low: number) => {
        const first = bass.find((n) => n.bar === barIndex - 1);
        return !!first && Math.abs(first.midi - (low + 12)) < Math.abs(first.midi - low);
    };

    it.each(STYLE_IDS)("%s: the bass's last note is the lowest root in its range", (style) => {
        // Catches `endingBass` placing the final root where the line was (`pitch(chord, prev)`:
        // an octave up after a line that climbed), and a home chord struck in two octaves (a
        // button or a last hit dropped under the chord it ends). Country's walk-up (#2177) lands
        // where it pointed, by step: on the low root where its run fits under it and nothing
        // had placed its boom, else in its own register (a low E has no 5 under it; a boom a
        // lead-in placed keeps its octave) — so for country the landing is the walk's, and
        // the home chord's strikes all take it.
        // And every line: where its approach into the ending would have dropped more than an
        // octave from the note before it to get low, it aimed at its own octave and the
        // ending lands there (`endingAim`'s promise); where the drop was within an octave,
        // the ending is low.
        for (const { where, bar, bass } of cases(style)) {
            const inBar = bass.filter((n) => n.bar === bar.index);
            const final = inBar.at(-1)!;
            const low = lowestRoot(mod12(final.midi));
            const before = bass.filter((n) => n.bar < bar.index);
            const prev = before.at(-1);
            // The line's note before its lead-in: the last one of another pitch (the blues
            // lope repeats the lead-in on its swung "and").
            const near = before
                .slice(0, -1)
                .reverse()
                .find((n) => n.midi !== prev?.midi);
            const walkedIn =
                style === 'country' && prev !== undefined && Math.abs(prev.midi - final.midi) <= 2;
            const promised =
                near !== undefined && Math.abs(low - near.midi) > 12 && final.midi > low;
            // Ska-punk's walk into a root at the floor (a low E has no lead-in under it) aims
            // at the octave above and lands there: a walk up to E2 that then dropped a
            // seventh to E1 was no walk.
            const floored = style === 'skapunk' && low - 1 < BASS.lo;
            const expected = floored ? low + 12 : walkedIn || promised ? final.midi : low;
            expect(final.midi, `${where}: the last note`).toBe(expected);
            expect(mod12(final.midi), `${where}: the root`).toBe(mod12(low));
            for (const n of inBar.filter((n) => mod12(n.midi) === mod12(low))) {
                expect(n.midi, `${where}: every strike of the home note`).toBe(expected);
            }
        }
    });

    it('the low root is a change for the lines that sat high, not a restatement', () => {
        // Non-vacuous for the test above: styles whose line places near the note before
        // (rock, jazz, funk, the blues) reach the ending bar nearer the octave above in some
        // case, so the voice-led placement would have taken it. Metal's, hip hop's and the
        // pumping lines already sit on the low root.
        const changed = STYLE_IDS.filter((style) =>
            [...cases(style)].some(({ bar, bass }) => {
                const final = bass.filter((n) => n.bar === bar.index).at(-1)!;
                return satHigh(bass, bar.index, lowestRoot(mod12(final.midi)));
            }),
        );
        expect(changed).toEqual(expect.arrayContaining(['rock', 'jazz', 'funk', 'blues']));
    });

    it('reggae: silent before a stop under a written fermata, the lead joins the held One', () => {
        // The fermata holds the gesture's last strike (#2175); a lead that had let go joins the
        // stop's One (#2178), so what the hold rings on is its note too, sung with vibrato.
        const timeline = compileTimeline(
            score([{ label: 'A', bars: 'C | F | Dm7 | G7', fermataBars: [3] }]),
        );
        const bar = timeline.bars.at(-1)!;
        const end = bar.start + bar.meter.barTicks;
        const play = (looping: boolean) =>
            performPass(timeline, straight('reggae', 'a'), { pass: 0, looping }).events.filter(
                (e): e is PitchedNote => e.lane === 'lead' && e.tick + e.dur > bar.start + 1,
            );
        expect(play(true), 'the phrase rests the last bar').toEqual([]);
        const lead = play(false);
        expect(lead.map((n) => [n.tick, n.tick + n.dur, n.vibrato])).toEqual([
            [bar.start, end, true],
        ]);
        // A fermata on the last bar is a written ending: the chord is the bar's own G7.
        expect(restingTone(bar.spans[0].chord!, lead[0].midi)).toBe(true);
    });

    it("skapunk: a horn's fall-off in the bar before is over before the hit it joins", () => {
        // A long fall (`fall.into`) drops into the rest after the note; with the lead now on
        // the stop's One, the fall is cut to the room before it, or dropped (an eighth or less
        // reads as a flat note). Catches a fall running into the hit (the invariant's "falls
        // into the note"). Seed e of rhythm changes' second pass is one where the trumpet falls
        // off the phrase before the last bar.
        const timeline = compileTimeline(FIXTURES.rhythmChanges);
        const bar = timeline.bars.at(-1)!;
        const before = timeline.bars.at(-2)!;
        const play = (looping: boolean) =>
            performPass(timeline, straight('skapunk', 'e'), { pass: 1, looping }).events.filter(
                (e): e is PitchedNote => e.lane === 'lead',
            );
        const planned = play(true)
            .filter((n) => n.bar === before.index)
            .at(-1)!;
        expect(planned.fall?.into, 'the phrase falls off').toBe(true);
        expect(planned.tick + planned.dur + planned.fall!.ticks).toBeGreaterThan(bar.start);
        const lead = play(false);
        const hit = lead.find((n) => n.bar === bar.index)!;
        expect(hit.tick).toBe(bar.start);
        // Long note, fall, HIT: the fall keeps its length and the note gives way to it,
        // ending where the fall has room to finish on the hit.
        const last = lead.filter((n) => n.bar === before.index).at(-1)!;
        expect([last.tick, last.midi, last.fall]).toEqual([
            planned.tick,
            planned.midi,
            planned.fall,
        ]);
        expect(last.tick + last.dur + last.fall!.ticks).toBe(hit.tick);
        expect(last.dur).toBeGreaterThanOrEqual(2 * STEP);
        expect(last.dur).toBeLessThan(planned.dur);
    });

    /**
     * Whether the bass's last note before the ending is a step approach into the final root:
     * a half step from it by class, or a whole step that is not a tone of the chord it sounds
     * over (the V's own 5th a whole step over the tonic is the riff's note, not a lead-in).
     */
    const approachesByStep = (timeline: Timeline, prev: PitchedNote, final: PitchedNote) => {
        const gap = mod12(prev.midi - final.midi);
        if (gap === 1 || gap === 11) {
            return true;
        }
        const chord = chordAt(timeline, prev.tick);
        return (gap === 2 || gap === 10) && !!chord && !chordPcs(chord).includes(mod12(prev.midi));
    };

    it.each(STYLE_IDS)('%s: a step approach into the ending lands by step', (style) => {
        // Catches the bar before aiming its approach at the octave the line would have placed
        // the root in (`place`, `sectionPlace`) while the ending goes low: a half or whole step
        // in pitch class resolving by a leap (rock's F#2 → G1). Every approach a step from the
        // final root's class lands within a step of it.
        for (const { where, timeline, bar, bass } of cases(style)) {
            const final = bass.filter((n) => n.bar === bar.index)[0]!;
            const prev = bass.filter((n) => n.bar < bar.index).at(-1);
            if (prev && approachesByStep(timeline, prev, final)) {
                expect(
                    Math.abs(prev.midi - final.midi),
                    `${where}: ${prev.midi} → ${final.midi}`,
                ).toBeLessThanOrEqual(2);
                // And on the instrument: a lead-in under a low E is folded up, not played
                // under the open string (`meetRoot`).
                expect(prev.midi, `${where}: on the E string`).toBeGreaterThanOrEqual(BASS.lo);
            }
        }
    });

    it.each(STYLE_IDS)("%s: no leap over an octave into the bar before's last note", (style) => {
        // Catches an approach aimed low from a line two octaves up (the blues box climbing A2
        // C3 E3 and jumping to F#1, bossa's anticipated root leaping a 10th): a lead-in
        // reached by such a drop is a leap, not a lead-in, so the line aims at its own
        // octave there and the ending lands on it (`endingAim`'s promise). A lead-in is the
        // last note a step from the final root by class, or that root anticipated; a walk's
        // fifth under the target (jazz's dominant approach) is the walk's own shape.
        for (const { where, bar, bass } of cases(style)) {
            const final = bass.filter((n) => n.bar === bar.index)[0]!;
            const before = bass.filter((n) => n.bar < bar.index);
            const [into, last] = before.slice(-2);
            const gap = last ? mod12(last.midi - final.midi) : 6;
            if (into && last && (gap <= 2 || gap >= 10)) {
                expect(
                    Math.abs(last.midi - into.midi),
                    `${where}: ${into.midi} → ${last.midi} → ${final.midi}`,
                ).toBeLessThanOrEqual(12);
            }
            if (style === 'country') {
                // The walk-up is one line into the end: no note of the bar before leaps more
                // than an octave to the next (a boom placed high walks down to the low root,
                // never drops to its run's 5 and climbs).
                const walk = before.filter((n) => n.bar === bar.index - 1);
                walk.slice(1).forEach((n, k) => {
                    expect(
                        Math.abs(n.midi - walk[k].midi),
                        `${where}: ${walk.map((w) => w.midi).join(',')}`,
                    ).toBeLessThanOrEqual(12);
                });
            }
        }
    });

    it("country: the final root is never above the walk's reach", () => {
        // A country bassist never ends on the top string: the walk-up takes the lowest
        // octave its run fits in (`reach`: the low root, or E2 over a low E), the boom a
        // lead-in placed notwithstanding; a chord struck on 3 keeps its root and goes down into
        // the low root by one note (#2198: the two-beat bar ended on C3 before).
        for (const { where, bar, bass } of cases('country')) {
            const final = bass.filter((n) => n.bar === bar.index)[0]!;
            const low = lowestRoot(mod12(final.midi));
            const reach = low - 5 >= BASS.lo ? low : low + 12;
            expect(final.midi, `${where}: the landing`).toBeLessThanOrEqual(reach);
        }
    });

    it('the lines that approach by step reach the ending that way', () => {
        // Non-vacuous for the test above: the walking and stepping lines (jazz, the blues,
        // ska-punk, country, bossa, rock) approach the final root by step in some case.
        const stepping = STYLE_IDS.filter((style) =>
            [...cases(style)].some(({ timeline, bar, bass }) => {
                const final = bass.filter((n) => n.bar === bar.index)[0]!;
                const prev = bass.filter((n) => n.bar < bar.index).at(-1);
                return !!prev && approachesByStep(timeline, prev, final);
            }),
        );
        expect(stepping).toEqual(
            expect.arrayContaining(['jazz', 'blues', 'skapunk', 'country', 'bossa', 'rock']),
        );
    });

    it("floors every lead note on home's strikes at an accent, never a boost, and leaves the V's alone", () => {
        // Catches the floor turned into a boost (every hit lifted), a floor that never lifts,
        // one that sits at the comp's un-lifted strike, the quietest thing on the hit (#2200),
        // and the strikes it missed (#2212): a re-strike left at the phrase's level (metal's 2
        // and 3, under the comp), the phrase's own note struck with home's first hit left soft
        // under the two stabs after it (80/98/98 against the comp's 86), and the over-reach, the
        // note struck with the V's own strike raised. Metal's hits on `| G7 C |`, driven
        // directly: a lead left off soft joins at the accent (the comp's strike plus the
        // button's lift, through the plan's energy), one left off louder keeps its level.
        const timeline = compileTimeline(score([{ label: 'A', bars: 'C | F | Dm7 | G7 C' }]));
        const bar = heldEnding(timeline, 3, STYLES.metal.ending)!;
        const plan = planBars(
            timeline,
            { ...DEFAULT_SETTINGS, style: 'metal' },
            {
                pass: 0,
                looping: false,
                window: fullWindow(timeline),
                endingGesture: STYLES.metal.endingGesture,
            },
        )[3];
        const book = {
            vibrato: 4,
            settle: (chord: { root: number }) => [chord.root, mod12(chord.root + 7)],
        } as unknown as Parameters<typeof endWithTheBand>[2];
        const ctx = {
            timeline,
            bar,
            plan,
            ending: bar,
            lead: { range: [55, 84] },
        } as unknown as BarContext;
        const strike = dyn(ENDING_STRIKE + BUTTON_LIFT, plan.energy);
        const velocities = (out: PitchedNote[]) => out.map((n) => n.velocity);
        const soft = endWithTheBand(ctx, [], book, { midi: 67, velocity: strike - 20 });
        expect(velocities(soft), 'left off soft: every hit at the accent').toEqual(
            soft.map(() => strike),
        );
        expect(soft.length, 'the lead joins').toBeGreaterThan(0);
        const loud = endWithTheBand(ctx, [], book, { midi: 67, velocity: strike + 15 });
        expect(velocities(loud), 'left off louder: its own level').toEqual(
            loud.map(() => strike + 15),
        );
        const sounding: PitchedNote = {
            lane: 'lead',
            tick: bar.start,
            dur: 2 * STEP,
            midi: 67,
            velocity: strike - 20,
            offsetMs: 0,
            bar: 3,
        };
        const homeTick = bar.start + 8 * STEP;
        const onHome = (out: PitchedNote[]) => out.filter((n) => n.tick >= homeTick);
        // Sounding over the V, struck again with each of home's hits.
        const struckAgain = endWithTheBand(ctx, [sounding], book);
        expect(onHome(struckAgain).length, 'home is struck more than once').toBeGreaterThan(1);
        expect(
            velocities(onHome(struckAgain)),
            'every re-strike on home: the accent, not the phrase',
        ).toEqual(onHome(struckAgain).map(() => strike));
        expect(
            struckAgain.find((n) => n.tick === bar.start)?.velocity,
            "the V's own strike keeps the phrase's level",
        ).toBe(strike - 20);
        // The phrase's own note struck with home's first hit is the first of the stabs.
        const onFirst = endWithTheBand(ctx, [{ ...sounding, tick: homeTick }], book);
        expect(velocities(onHome(onFirst)), 'the note on the first hit: the accent').toEqual(
            onHome(onFirst).map(() => strike),
        );
        // A floor, not a boost: a louder phrase keeps its level on every hit.
        for (const at of [bar.start, homeTick]) {
            const louder = endWithTheBand(
                ctx,
                [{ ...sounding, tick: at, velocity: strike + 15 }],
                book,
            );
            expect(
                velocities(onHome(louder)),
                `a phrase louder than the accent keeps its own level (struck at ${at})`,
            ).toEqual(onHome(louder).map(() => strike + 15));
        }
    });
});

describe('a tied fermata on the ending bar keeps one drum hit on the one (#2187)', () => {
    // `| C | /(fermata) |`: the last bar ties the bar before and holds it. Nothing pitched is
    // struck, but the band still ends on a drum hit, once, under the ringing chord.
    const tiedEnding = (bars: string, fermataBars: number[]) =>
        compileTimeline(score([{ label: 'A', bars, fermataBars }]));
    const timeline = tiedEnding('C | F | Dm7 | C | /', [4]);
    const bar = timeline.bars.at(-1)!;
    const before = timeline.bars.at(-2)!;
    const end = bar.start + bar.meter.barTicks;
    const straight = (style: StyleId): BandSettings => ({
        ...settingsFor(style, 'a'),
        swing: 0,
        humanize: 0,
    });
    const drumsIn = (events: BandEvent[], index: number) =>
        events.flatMap((e) => (e.lane === 'drums' && e.bar === index ? [e] : []));
    /** The strokes a book's ending line writes on sixteenth `step`. */
    const strokesAt = (style: StyleId, step: number) =>
        Object.entries(ENDING_DRUMS[style])
            .filter(([, line]) => (line[step] ?? '.') !== '.')
            .map(([piece]) => piece)
            .sort();

    // rock: crash, kick and tom; bossa: a book with no cymbal; hiphop: a lone kick; jazz: the
    // button's kick and snare on the "and" of 4 are not played; metal: three hits become the
    // last one, its crash on the one.
    it.each([
        ['rock', 0],
        ['bossa', 0],
        ['hiphop', 0],
        ['jazz', 0],
        ['metal', 8],
    ] as const)(
        "%s: the kit plays its ending's final strokes once, with the band's push or on the one, the pitched lanes ring on",
        (style, step) => {
            // Catches `holdFermatas`' tied path removing the kit with everything else (the band
            // ended on no drum hit), the kit playing a unison figure alone under the hold (the
            // jazz button, metal's hits at half speed), and a pitched note struck in the bar.
            const { events } = performPass(timeline, straight(style), {
                pass: 0,
                looping: false,
            });
            // The one arrival: with the band's push when it pushes, else on the one.
            const band = heldStrike(events, 'bass', end)[0].tick;
            const kitTick = bar.start - band === PPQ / 2 ? band : bar.start;
            const drums = events.filter((e) => e.lane === 'drums' && e.tick >= kitTick);
            const book = strokesAt(style, step);
            expect(book.length, style).toBeGreaterThan(0);
            expect(
                drums.map((e) => e.tick),
                style,
            ).toEqual(book.map(() => kitTick));
            expect(drums.map((e) => (e as { piece: string }).piece).sort(), style).toEqual(book);
            const pitched = events.filter((e): e is PitchedNote => e.lane !== 'drums');
            expect(
                pitched.filter((e) => e.bar === bar.index),
                style,
            ).toEqual([]);
            for (const lane of ['bass', 'comp'] as const) {
                const notes = pitched.filter((e) => e.lane === lane && e.bar === before.index);
                const last = Math.max(...notes.map((e) => e.tick));
                const ringing = notes.filter((e) => e.tick === last);
                expect(ringing.length, `${style} ${lane}`).toBeGreaterThan(0);
                for (const n of ringing) {
                    expect(n.tick + n.dur, `${style} ${lane}`).toBe(end);
                }
            }
        },
    );

    // The bar before a tied ending played as the approach into an ending, and the tie held
    // that approach (jazz's leading tone, a G) and its last stab (a skank, one picked note).
    // The last strike of bass and comp is played as the ending's arrival and rings (#2210).
    const heldStrike = (events: BandEvent[], lane: 'bass' | 'comp', until: number) => {
        const notes = events.filter(
            (e): e is PitchedNote => e.lane === lane && !e.muted && e.tick + e.dur >= until,
        );
        // Of the notes ringing to the end, the ones of the last strike (the held chord).
        const tick = Math.min(...notes.map((e) => e.tick));
        return notes.filter((e) => e.tick === tick);
    };
    it.each(STYLE_IDS)(
        "%s: the bass holds the chord's root (or its written bass) and the comp a chord",
        (style) => {
            // Catches the tie extending the bar before's last notes as they were: the walk's
            // approach under the final chord, a skank or one picked string as the held comp.
            for (const [bars, bassPc] of [
                ['C | F | Dm7 | C | /', 0],
                ['C | F | Dm7 | C/E | /', 4],
                ['C | F | Dm7 | Cm | /', 0],
            ] as const) {
                const tied = compileTimeline(score([{ label: 'A', bars, fermataBars: [4] }]));
                const finish = tied.bars.at(-1)!.start + tied.bars.at(-1)!.meter.barTicks;
                for (const seed of ['a', 'b', 'c', 'd', 'e']) {
                    const { events } = performPass(
                        tied,
                        { ...straight(style), seed },
                        { pass: 0, looping: false },
                    );
                    const note = `${style} ${bars} ${seed}`;
                    const bass = heldStrike(events, 'bass', finish);
                    expect(
                        bass.map((e) => mod12(e.midi)),
                        note,
                    ).toEqual([bassPc]);
                    // Low, as an ending's last note is (`lowestRoot`, or the octave a walk promised).
                    expect(bass[0].midi - lowestRoot(bassPc), note).toBeLessThanOrEqual(12);
                    const comp = heldStrike(events, 'comp', finish);
                    // A chord, not a stab: metal's power chord is its full chord (root and fifth).
                    expect(
                        new Set(comp.map((e) => mod12(e.midi))).size,
                        note,
                    ).toBeGreaterThanOrEqual(style === 'metal' ? 2 : 3);
                    // Struck in the bar before, at its last strike: nothing new on the downbeat.
                    const last = tied.bars.at(-1)!;
                    for (const n of [...bass, ...comp]) {
                        expect(n.tick, note).toBeLessThan(last.start);
                    }
                }
            }
        },
    );

    // The tied-ending shapes the held notes are measured on: the plain tie with a V-I-ish
    // approach, its minor and slash-bass variants, and the tie that runs on over the last barline.
    const heldShapes: [string, number][] = [
        ['C | F | Dm7 | C | /', 4],
        ['C | F | Dm7 | Cm | /', 4],
        ['C | F | Dm7 | C/E | /', 4],
        ['C | / | /', 1],
        ['C | F | / | /', 2],
    ];
    it.each(STYLE_IDS)(
        '%s: bass and comp land the held chord on one tick, a beat or the "and" of 4 (#2223)',
        (style) => {
            // Catches each lane keeping its own last strike's tick (the bass on the "and" of 4,
            // the comp on the "e", the kit on the one: three attacks for one arrival), a
            // sixteenth or a skank's upbeat as the arrival, and a strike on the fermata bar.
            for (const [bars, fermata] of heldShapes) {
                const tied = compileTimeline(score([{ label: 'A', bars, fermataBars: [fermata] }]));
                const span = tied.spans.find((s) => s.fermata)!;
                const finish = tied.bars.at(-1)!.start + tied.bars.at(-1)!.meter.barTicks;
                for (const seed of ['a', 'b', 'c', 'd', 'e']) {
                    const { events } = performPass(
                        tied,
                        { ...straight(style), seed },
                        { pass: 0, looping: false },
                    );
                    const note = `${style} ${bars} ${seed}`;
                    const bass = heldStrike(events, 'bass', finish);
                    const comp = heldStrike(events, 'comp', finish);
                    const tick = bass[0].tick;
                    expect(tick, note).toBe(comp[0].tick);
                    const early = span.start - tick;
                    // Before the downbeat the tie sits on, on the eighths and no earlier than
                    // the "and" of 3 (a shared tick stays, a beat or the push otherwise).
                    expect(early, note).toBeGreaterThan(0);
                    expect(
                        early <= (PPQ * 5) / 2 && early % (PPQ / 2) === 0,
                        `${note}: ${early}`,
                    ).toBe(true);
                    const bassComp = events.filter(
                        (e): e is PitchedNote =>
                            (e.lane === 'bass' || e.lane === 'comp') && !e.muted,
                    );
                    // The flam goes: no strike of either lane within an eighth before the
                    // arrival (a funk comp's "e" under a push).
                    expect(
                        bassComp.filter((e) => e.tick > tick - PPQ / 2 && e.tick < tick),
                        note,
                    ).toEqual([]);
                    // The clip: nothing of either lane sounds across the arrival's tick but
                    // the arrival itself (a bass quarter on 4 under a root on the "and").
                    expect(
                        bassComp.filter((e) => e.tick < tick && e.tick + e.dur > tick),
                        note,
                    ).toEqual([]);
                    // The kit-bar filter: in the tied span the kit strikes only its arrival,
                    // on the span's start, never the groove of a bar the tie runs through.
                    expect(
                        events
                            .filter(
                                (e) =>
                                    e.lane === 'drums' && e.tick >= span.start && e.tick < span.end,
                            )
                            .filter((e) => e.tick !== span.start),
                        note,
                    ).toEqual([]);
                    expect(
                        events.filter(
                            (e) =>
                                e.lane !== 'drums' &&
                                e.tick === span.start &&
                                !(e as PitchedNote).muted,
                        ),
                        note,
                    ).toEqual([]);
                }
            }
        },
    );

    it.each([
        // rock: the bass's last root is on the "and" of 4 and the comp's chord on 4, so the
        // chord is pushed; country: nothing after 4 in either lane, so it lands on 4.
        ['rock', PPQ / 2],
        ['funk', PPQ / 2],
        ['country', PPQ],
    ] as const)(
        '%s: lands %i ticks before the fermata bar (a push, or the last beat)',
        (style, back) => {
            // Catches the push lost (both lanes pulled back to 4 under a bass that hit the "and")
            // and a push invented for lines that never played one, and the kit's arrival left
            // on the one under a push (or pulled off the one for a landing on a beat): the kit
            // strikes once, with the band, and its fill's tail from the push on is gone.
            const { events } = performPass(timeline, straight(style), { pass: 0, looping: false });
            expect(bar.start - heldStrike(events, 'comp', end)[0].tick, style).toBe(back);
            expect(bar.start - heldStrike(events, 'bass', end)[0].tick, style).toBe(back);
            const push = back === PPQ / 2;
            const kitTick = push ? bar.start - PPQ / 2 : bar.start;
            const kit = events.filter((e) => e.lane === 'drums' && e.tick >= kitTick);
            expect(kit.length, style).toBeGreaterThan(0);
            expect(
                kit.filter((e) => e.tick !== kitTick),
                `${style}: the kit strikes once, with the band`,
            ).toEqual([]);
        },
    );

    it('hiphop: a landing both lanes already share on an eighth stays (the "and" of 3)', () => {
        // Catches a shared tick floored to the beat under it: both lanes were together on
        // the "and" of 3 (with the kick), and snapping moved a band that was already one.
        const over = tiedEnding('C | / | /', [1]);
        const span = over.spans.find((s) => s.fermata)!;
        const { events } = performPass(over, straight('hiphop'), { pass: 0, looping: false });
        const finish = over.bars.at(-1)!.start + over.bars.at(-1)!.meter.barTicks;
        expect(span.start - heldStrike(events, 'bass', finish)[0].tick).toBe((PPQ * 3) / 2);
        expect(span.start - heldStrike(events, 'comp', finish)[0].tick).toBe((PPQ * 3) / 2);
    });

    it.each(STYLE_IDS)(
        '%s: a tie that runs on over the last barline ends on the kit and the held chord (#2223)',
        (style) => {
            // Catches the span's plan being the bar it starts in, which has no ending: both
            // bars were wiped and the band ended on no drum hit and no pitched note.
            const over = tiedEnding('C | / | /', [1]);
            const last = over.bars.at(-1)!;
            const { events } = performPass(over, straight(style), { pass: 0, looping: false });
            // The kit's arrival is at the start of the span, where the held chord begins, or
            // with the band's push before it: never on the last bar, a bar or more into it.
            const span = over.spans.find((s) => s.fermata)!;
            const band = heldStrike(events, 'bass', last.start + last.meter.barTicks)[0].tick;
            const kitTick = span.start - band === PPQ / 2 ? band : span.start;
            const drums = events.filter((e) => e.lane === 'drums' && e.tick >= kitTick);
            expect(drums.length, style).toBeGreaterThan(0);
            expect(
                drums.every((e) => e.tick === kitTick),
                style,
            ).toBe(true);
            // One arrival, not the groove of the bar the tie runs through on top of it: no
            // piece is struck twice on the tick (the kit-bar filter).
            const pieces = drums.map((e) => (e as { piece: string }).piece);
            expect(new Set(pieces).size, style).toBe(pieces.length);
            const finish = last.start + last.meter.barTicks;
            expect(
                heldStrike(events, 'bass', finish).map((e) => mod12(e.midi)),
                style,
            ).toEqual([0]);
            expect(
                new Set(heldStrike(events, 'comp', finish).map((e) => mod12(e.midi))).size,
                style,
            ).toBeGreaterThanOrEqual(style === 'metal' ? 2 : 3);
        },
    );

    it.each(STYLE_IDS)('%s: a tie of a rest holds nothing across it (#2223)', (style) => {
        // Catches the tie extending the last notes before an N.C. through it: the C rang
        // across the written rest. Nothing pitched sounds from the rest's start to the end.
        for (const bars of ['C | N.C. | /', 'C | F | C | N.C. | /']) {
            const rested = tiedEnding(bars, [bars.split('|').length - 1]);
            const rest = rested.spans.find((s) => !s.chord)!;
            for (const looping of [false, true]) {
                const { events } = performPass(rested, straight(style), { pass: 0, looping });
                const sounding = events.filter(
                    (e) =>
                        e.lane !== 'drums' &&
                        !(e as PitchedNote).muted &&
                        e.tick + (e as PitchedNote).dur > rest.start + 1,
                );
                expect(sounding, `${style} ${bars} ${looping}`).toEqual([]);
            }
        }
    });

    it("a tie mid-chart still rings the bar before's last notes as they were", () => {
        // Catches the arrival replacing the last strike of a tie that is not the ending's: the
        // notes held through it are the ones the same bar plays without the fermata.
        const midTied = compileTimeline(
            score([{ label: 'A', bars: 'C | / | Dm7 | G7 | C | /', fermataBars: [1, 5] }]),
        );
        const plain = compileTimeline(
            score([{ label: 'A', bars: 'C | / | Dm7 | G7 | C | /', fermataBars: [5] }]),
        );
        for (const style of ['jazz', 'funk', 'acoustic'] as const) {
            const settings = straight(style);
            const held = performPass(midTied, settings, { pass: 0, looping: false }).events;
            const free = performPass(plain, settings, { pass: 0, looping: false }).events;
            for (const lane of ['bass', 'comp'] as const) {
                const before = (events: BandEvent[]) =>
                    events.filter((e): e is PitchedNote => e.lane === lane && e.bar === 0);
                const strikes = (events: BandEvent[]) => {
                    const notes = before(events).filter((e) => !e.muted);
                    const tick = Math.max(...notes.map((e) => e.tick));
                    return notes.filter((e) => e.tick === tick).map((e) => e.midi);
                };
                expect(strikes(held), `${style} ${lane}`).toEqual(strikes(free));
            }
        }
    });

    it('only the ending bar: a tie earlier in the same pass, and one in a pass that loops, keep no kit', () => {
        // Catches the kit kept on any tied fermata of a pass that ends (not just its last bar),
        // and on a pass that does not end: no ending gesture belongs to either.
        const twice = tiedEnding('C | / | Dm7 | G7 | C | /', [1, 5]);
        const ends = performPass(twice, straight('rock'), { pass: 0, looping: false }).events;
        expect(drumsIn(ends, 1)).toEqual([]);
        const lastBar = twice.bars.at(-1)!;
        expect(
            ends.filter((e) => e.lane === 'drums' && e.tick >= lastBar.start - PPQ / 2).length,
        ).toBeGreaterThan(0);
        const loops = performPass(timeline, straight('rock'), { pass: 0, looping: true }).events;
        expect(drumsIn(loops, bar.index)).toEqual([]);
        // Nor does a tie of a rest: no chord rings, and jazz would play its button alone.
        const rest = tiedEnding('C | F | C | N.C. | /', [4]);
        const silent = performPass(rest, straight('jazz'), { pass: 0, looping: false }).events;
        expect(drumsIn(silent, 4)).toEqual([]);
    });
});
