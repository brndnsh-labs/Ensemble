/**
 * The held ending (#1482): a performance that ends resolves a final turnaround to the tonic,
 * in the style's own quality, and bass, comp and the lead's last note all play it. A chart
 * that already ends on the tonic, a written fermata and a last-chorus coda end as written.
 * Every case is a real chart through `compileTimeline` and `performPass`, as the host and the
 * export play it.
 */
import type { ScoreDirection } from '../../public/songbook/score-types.js';
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
import { chordPcs, parseChord } from '../theory/chord.js';
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

/**
 * The ending a style plays on `chart`: one held bass note on `tonic`, a comp chord carrying
 * the tonic chord's guide tones (`quality` is the style's own ending suffix) and none of the
 * written chord's foreign tones (`foreign`), and the lead's last note a tone of that chord.
 */
function expectResolved(
    timeline: Timeline,
    style: StyleId,
    events: BandEvent[],
    foreign: number[],
    where: string,
) {
    const bar = timeline.bars.at(-1)!;
    const { tonic, minor } = bar.key;
    const quality = STYLES[style].ending[minor ? 'minor' : 'major'];
    const chord = parseChord(`I${quality}`, bar.key)!;
    const { bass, comp, lead } = lastBar(timeline, events);
    expect(
        bass.map((n) => mod12(n.midi)),
        `${where}: the bass holds the tonic`,
    ).toEqual([tonic]);
    const sounding = pcsOf(comp);
    expect(sounding.size, `${where}: the comp plays the last chord`).toBeGreaterThan(0);
    for (const guide of chord.guides) {
        expect(sounding.has(mod12(chord.root + guide)), `${where}: guide ${guide}`).toBe(true);
    }
    for (const pc of foreign) {
        expect(sounding.has(pc), `${where}: the written chord's ${pc} is gone`).toBe(false);
    }
    if (lead.length) {
        expect(chordPcs(chord), `${where}: the lead's last note`).toContain(
            mod12(lead.at(-1)!.midi),
        );
    }
}

describe('a final turnaround resolves to the tonic', () => {
    // The blues fixture's last bar is the ii–V (`Dm7 G7`) that sends it round again; a pop
    // tune ending on its V7; a minor tune ending on its V7 (E7 in A minor, whose G# the A minor
    // chord replaces with G); a ii over the V's root (`Dm7/G`) and a tonic over its 3rd (`C/E`),
    // which is not home either; and a tritone substitute (`Db7`).
    const charts = {
        'ii–V (blues)': { chart: FIXTURES.blues, foreign: [5] },
        V7: { chart: score([{ label: 'A', bars: 'C | Am7 | Fmaj7 | G7' }]), foreign: [5] },
        'minor V7': {
            chart: score([{ label: 'A', bars: 'Am | Dm7 | Bm7b5 | E7' }], {
                key: 'A',
                isMinor: true,
            }),
            foreign: [8],
        },
        'slash ii/V': {
            chart: score([{ label: 'A', bars: 'C | A7 | Dm7 | Dm7/G' }]),
            foreign: [5],
        },
        'tonic over its 3rd': {
            chart: score([{ label: 'A', bars: 'F | G7 | Am7 | C/E' }]),
            foreign: [],
        },
        'tritone sub': {
            chart: score([{ label: 'A', bars: 'C | Dm7 | Dm7 | Db7' }]),
            foreign: [1, 5],
        },
    };
    for (const [name, { chart, foreign }] of Object.entries(charts)) {
        it(`${name}: every style ends on its tonic`, () => {
            const timeline = compileTimeline(chart);
            for (const style of STYLE_IDS) {
                for (const seed of SEEDS) {
                    const { events } = performPass(timeline, settingsFor(style, seed), {
                        pass: 0,
                        looping: false,
                    });
                    expectResolved(timeline, style, events, foreign, `${style}/${seed}`);
                }
            }
        });
    }

    it("in the style's own quality: I6 in jazz, I9 in the blues, the triad in rock, im6 in minor jazz", () => {
        const blues = compileTimeline(FIXTURES.blues);
        const minor = compileTimeline(
            score([{ label: 'A', bars: 'Am | Dm7 | Bm7b5 | E7' }], { key: 'A', isMinor: true }),
        );
        const quality = (timeline: Timeline, style: StyleId) =>
            heldEnding(timeline, timeline.bars.length - 1, STYLES[style].ending)?.spans[0].chord
                ?.intervals;
        expect(quality(blues, 'jazz')).toEqual([0, 4, 7, 9]);
        expect(quality(blues, 'blues')).toEqual([0, 4, 7, 10, 14]);
        expect(quality(blues, 'rock')).toEqual([0, 4, 7]);
        expect(quality(minor, 'jazz')).toEqual([0, 3, 7, 9]);
        // The tonic is the key's: C in the blues, A in A minor.
        expect(heldEnding(minor, 3, STYLES.jazz.ending)?.spans[0].chord?.root).toBe(9);
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
            expectResolved(timeline, style, events, [5], style);
        }
    });

    it('only the ending resolves: a looping pass plays the turnaround, round to the top', () => {
        const timeline = compileTimeline(FIXTURES.blues);
        const bar = timeline.bars.at(-1)!;
        for (const style of STYLE_IDS) {
            const { events } = performPass(timeline, settingsFor(style, 'a'), {
                pass: 0,
                looping: true,
            });
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
