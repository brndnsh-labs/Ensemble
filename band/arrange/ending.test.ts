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
    type StyleId,
} from '../core/types.js';
import { chorusBars, compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { dyn, readLine, STEP } from '../players/grid.js';
import { endWithTheBand } from '../players/lead/idiom.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import type { BarContext, EndingGesture } from '../styles/types.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { chordPcs } from '../theory/chord.js';
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
 * end on the same kick and crash: no country-only last hit was found to write (#2017), so this
 * pair waits on the ear rather than an invented difference.
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
                    // Nothing crosses the button: a lead sounding there plays it, accented.
                    const button = hits.at(-1)!;
                    for (const n of lead) {
                        expect(n.tick < button && n.tick + n.dur > button, where).toBe(false);
                    }
                    const struck = lead.find((n) => n.tick === button);
                    if (struck) {
                        const before = lead[lead.indexOf(struck) - 1];
                        expect([struck.dur, struck.midi], where).toEqual([SHORT, before.midi]);
                        expect(struck.velocity, where).toBe(Math.min(127, before.velocity + 12));
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
