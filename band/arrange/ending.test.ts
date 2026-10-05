/**
 * The held ending (#1482): a performance that ends resolves a final turnaround to the tonic,
 * in the style's own quality, and bass, comp and the lead's last note all play it. A chart
 * that already ends on the tonic, a written fermata and a last-chorus coda end as written.
 * Every case is a real chart through `compileTimeline` and `performPass`, as the host and the
 * export play it.
 */
import type { ScoreDirection, SemanticScore } from '../../public/songbook/score-types.js';
import {
    type BandEvent,
    type BandSettings,
    DEFAULT_SETTINGS,
    type PitchedNote,
    type StyleId,
} from '../core/types.js';
import { chorusBars, compileTimeline, type Timeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { STYLE_IDS, STYLES } from '../styles/index.js';
import { COUNTED_FIXTURES, FIXTURES, score } from '../test/scores.js';
import { chordPcs } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import { heldEnding } from './ending.js';

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

/** The pitched notes the pass plays in its last bar, by lane. */
function lastBar(timeline: Timeline, events: BandEvent[]) {
    const index = timeline.bars.length - 1;
    const notes = events.filter((e): e is PitchedNote => e.lane !== 'drums' && e.bar === index);
    const lane = (name: PitchedNote['lane']) => notes.filter((n) => n.lane === name);
    return { bass: lane('bass'), comp: lane('comp'), lead: lane('lead') };
}

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
    expect(
        bass.map((n) => mod12(n.midi)),
        `${where}: the bass holds the tonic`,
    ).toEqual([bar.key.tonic]);
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
                    window: { from, to: timeline.bars.length, wrapTo: 0, origin: 0 },
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
                expect(
                    bass.map((n) => mod12(n.midi)),
                    style,
                ).toEqual([chord.bass]);
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
                        // Funk's ending is short hits (a half note at most), so its bass strikes
                        // the C again under the resolution rather than letting it stop short.
                        const notes =
                            style === 'funk' && line.length === 1 ? [line[0], line[0]] : line;
                        expect(
                            played.bass.map((n) => [n.tick, mod12(n.midi)]),
                            `${where}: the bass`,
                        ).toEqual(notes.map((pc, k) => [k === 0 ? bar.start : home.start, pc]));
                        // The bass's last note rings to the end of the bar, its first (when it
                        // moves) up to the change.
                        expect(played.bass.at(-1)!.tick + played.bass.at(-1)!.dur, where).toBe(end);
                        if (notes.length > 1) {
                            // (Funk's ending hits last a half note at most.)
                            expect(played.bass[0].dur, where).toBe(
                                Math.min(home.start - bar.start, style === 'funk' ? 960 : Infinity),
                            );
                        }
                        const chords = played.comp.filter((n) => !n.muted);
                        const at1 = chords.filter((n) => n.tick === bar.start);
                        const at3 = chords.filter((n) => n.tick === home.start);
                        expect(at1.length + at3.length, `${where}: only two strikes`).toBe(
                            chords.length,
                        );
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
                        // The drummer catches the arrival with the band: one crash, where the I
                        // lands, and a kick under the V.
                        const kit = events.filter((e) => e.lane === 'drums' && e.bar === bar.index);
                        expect(
                            kit
                                .filter((e) => e.lane === 'drums' && e.piece === 'crash')
                                .map((e) => e.tick),
                            `${where}: one crash, on 3`,
                        ).toEqual([home.start]);
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
                        const sung = played.lead.at(-1);
                        if (sung) {
                            leads++;
                            expect(
                                sung.tick + sung.dur,
                                `${where}: the lead ends with the bar`,
                            ).toBe(end);
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

    it('a last bar of one chord, resolved or home, is struck once on its downbeat', () => {
        // `| … | G7 |` resolves to the tonic, `| … | C |` is home: neither is split.
        for (const bars of ['C | Am7 | Dm7 | G7', 'C | Am7 | Dm7 | C']) {
            const timeline = compileTimeline(score([{ label: 'A', bars }]));
            const bar = timeline.bars[3];
            for (const style of STYLE_IDS) {
                const { events } = performPass(timeline, settingsFor(style, 'a'), {
                    pass: 0,
                    looping: false,
                });
                const played = lastBar(timeline, events);
                expect(
                    new Set([...played.bass, ...played.comp].map((n) => n.tick)),
                    `${style} ${bars}`,
                ).toEqual(new Set([bar.start]));
                expect(
                    events.filter((e) => e.lane === 'drums' && e.bar === 3).map((e) => e.tick),
                    `${style} ${bars}`,
                ).toEqual([bar.start, bar.start]);
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
            expect(
                bass.map((n) => mod12(n.midi)),
                style,
            ).toEqual([0]);
            for (const n of [...bass, ...comp, ...lead]) {
                // Struck before the rest, and silent by it (a strum's roll may land a hair
                // late; the note still ends at the rest).
                expect(n.tick + n.dur, `${style} ${n.lane}`).toBeLessThanOrEqual(rest + 1);
            }
        }
    });

    it('a key the chart never rests on is not one to end in', () => {
        // Typed without setting the key, a chart reads as C major. An F tune ending on its
        // ii–V (C7 is its V, resolving to F, not a tonic) and an A minor tune ending on E7 hold
        // their written chord: nothing in either rests on C.
        // An F blues keyed C: its C7s all fall to F7, and it opens on F7, not on C.
        for (const bars of [
            'F | Gm7 C7 | F | Gm7 C7',
            'Am | Dm7 | Bm7b5 | E7',
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
                expect(
                    lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                    `${style} ${bars}`,
                ).toEqual([written.bass]);
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
                expect(
                    lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                    `${style} ${bars}`,
                ).toEqual([root]);
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
                expect(
                    lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                    `${style} ${bars}`,
                ).toEqual([0]);
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
        // key left at C, neither is in C: their last bars are played as written.
        for (const [bars, written] of [
            ['Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm6 | Gm6', 7],
            ['Bbmaj7 Gm7 | Cm7 F7 | Dm7 G7 | Cm7 F7', 0],
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
                expect(
                    lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                    `${style} ${bars}`,
                ).toEqual([written]);
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
                expect(
                    lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                    `${style} ${bars}`,
                ).toEqual([tonic]);
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
            expect(
                lastBar(timeline, events).bass.map((n) => mod12(n.midi)),
                style,
            ).toEqual([1]);
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
            expect(
                bass.map((n) => mod12(n.midi)),
                style,
            ).toEqual([8]);
        }
        // The same chart uncounted never takes its coda, so it has no written ending: an
        // export's last bar is the form's G7, resolved.
        const { choruses: _, ...once } = chart;
        const uncounted = compileTimeline(once);
        expect(uncounted.coda).toBeUndefined();
        expect(heldEnding(uncounted, uncounted.bars.length - 1, STYLES.jazz.ending)).not.toBeNull();
    });
});

/** A minor groove ending on its tonic minor ninth. */
function minorGroove() {
    return score([{ label: 'Groove', bars: 'Em9 | A13 | Cmaj7 B7#9 | Em9' }], {
        key: 'E',
        isMinor: true,
    });
}
