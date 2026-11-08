import { DEFAULT_SETTINGS, type PitchedNote, type StyleId } from '../../core/types.js';
import { chordAt, compileTimeline } from '../../form/timeline.js';
import { performPass } from '../../perform.js';
import { STYLES } from '../../styles/index.js';
import { GUIDE_METRICS } from '../../test/critique/guide-head.js';
import { FIXTURES, score } from '../../test/scores.js';
import { mod12 } from '../../theory/pitch.js';
import { guidePitchClasses, guideToneLine } from './guide-tones.js';
import { LEAD_INSTRUMENTS } from './instruments.js';

/** #2027: a known standard's head is its guide-tone line. */

// Autumn Leaves (`web/lib/standards.ts`), in G minor: two A sections, then B.
const AUTUMN = score(
    [
        { label: 'A', bars: 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7' },
        { label: 'A', bars: 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7' },
        { label: 'B', bars: 'Am7b5 | D7 | Gm7 | Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7' },
    ],
    { key: 'G', isMinor: true },
);
const SAX: readonly [number, number] = [53, 82];
const BAR = 1920;

const lead = (head: 'guide-tones' | null, pass = 0) =>
    performPass(
        compileTimeline(AUTUMN),
        {
            ...DEFAULT_SETTINGS,
            style: 'jazz',
            lead: 'sax',
            lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
            head,
        },
        { pass, looping: true },
    ).events.filter((e): e is PitchedNote => e.lane === 'lead');

describe('the guide-tone line', () => {
    const timeline = compileTimeline(AUTUMN);
    const line = guideToneLine(timeline, timeline.bars[0], 67, SAX);

    it('plays each chord its 3rd or 7th, struck as the chord arrives', () => {
        for (const note of line) {
            expect(guidePitchClasses(note.chord, note.key)).toContain(mod12(note.midi));
            expect(chordAt(timeline, note.tick)).toBe(note.chord);
        }
    });

    it('is voice-led: each guide tone steps to the next chord’s, a common tone held', () => {
        // The textbook line: Cm7's Bb falls to F7's A, which is Bbmaj7's 7th (held), and on to
        // Ebmaj7's G; Am7b5's G (struck again: a new phrase) falls to D7's F# and Gm7's F.
        const firstA = line.filter((n) => n.tick < 8 * BAR);
        expect(firstA.map((n) => [n.tick / BAR, n.midi])).toEqual([
            [0, 70],
            [1, 69],
            [3, 67],
            [4, 67],
            [5, 66],
            [6, 65],
        ]);
        // Inside a phrase no move is wider than a minor 3rd.
        for (let i = 1; i < line.length; i++) {
            const top = timeline.bars.find((b) => b.start === line[i].tick)?.phrase.bar === 0;
            if (!top) {
                expect(Math.abs(line[i].midi - line[i - 1].midi)).toBeLessThanOrEqual(3);
            }
        }
    });

    it('opens near home: on the 3rd when it lies close, else the nearest guide tone', () => {
        // Cm7's Eb is four under the sax's G: it opens on the Bb instead.
        expect(line[0].midi).toBe(70);
        const t = compileTimeline(score([{ label: 'A', bars: 'Dm7 | G7 | Cmaj7 | Cmaj7' }]));
        expect(guideToneLine(t, t.bars[0], 67, SAX)[0].midi).toBe(65); // Dm7's F
    });

    it('stays over the comp and out of the bass: a phrase that sank starts again near home', () => {
        for (const note of line) {
            expect(note.midi).toBeGreaterThanOrEqual(67 - 5);
        }
    });

    it('never holds a note across a phrase’s first barline, and breathes before it', () => {
        for (const note of line) {
            const end = note.tick + note.dur;
            const phraseTop = (tick: number) =>
                timeline.bars.some((b) => b.start === tick && b.phrase.bar === 0);
            for (let t = note.tick + 1; t < end; t++) {
                if (t % BAR === 0) {
                    expect(phraseTop(t), `note at ${note.tick} crosses ${t}`).toBe(false);
                }
            }
        }
        // Ebmaj7's G ends its phrase an eighth early.
        expect(line[2].tick + line[2].dur).toBe(4 * BAR - 240);
    });

    it('strikes every phrase, even when one chord or a common tone runs across it', () => {
        // One chord held over the phrase line (bars 1–4), then a common tone into the next.
        const t = compileTimeline(
            score([{ label: 'A', bars: 'Dm7 | Cmaj7 | Cmaj7 | Cmaj7 | Cmaj7 | G7 | C | C' }]),
        );
        const held = guideToneLine(t, t.bars[0], 67, SAX);
        for (const top of [0, 4]) {
            expect(held.some((n) => n.tick === top * BAR)).toBe(true);
        }
    });

    it('strikes a chord held past two bars again on the same tone, never leaping', () => {
        const t = compileTimeline(score([{ label: 'A', bars: 'G7 | G7 | G7 | G7' }]));
        const held = guideToneLine(t, t.bars[0], 67, SAX);
        expect(held.map((n) => n.tick)).toEqual([0, 2 * BAR]);
        expect(held[1].midi).toBe(held[0].midi);
    });

    it('reads a triad’s 7th from what it does', () => {
        const C = { tonic: 0, minor: false };
        const t = compileTimeline(score([{ label: 'A', bars: 'C | G | D | Bdim' }]));
        const at = (bar: number) => chordAt(t, bar * BAR)!;
        expect(guidePitchClasses(at(0), C)).toEqual([4, 11]); // the I: E and its major 7th
        expect(guidePitchClasses(at(1), C)).toEqual([11, 5]); // the V: B and the b7
        // D falling a fifth to G is V of V: F# and C, not C#.
        expect(guidePitchClasses(at(2), C, at(1))).toEqual([6, 0]);
        // But the tonic going to IV stays the tonic: C to F is not V of IV.
        const f = compileTimeline(score([{ label: 'A', bars: 'F | F | F | F' }]));
        expect(guidePitchClasses(at(0), C, chordAt(f, 0))).toEqual([4, 11]);
        // A diminished triad is heard as a diminished 7th.
        expect(guidePitchClasses(at(3), C)).toEqual([2, 8]);
        // In a minor key the V triad is a dominant too: D in G minor takes C, not C#.
        const g = compileTimeline(
            score([{ label: 'A', bars: 'Gm | D | Gm | Gm' }], { key: 'G', isMinor: true }),
        );
        expect(guidePitchClasses(chordAt(g, BAR)!, { tonic: 7, minor: true })).toEqual([6, 0]);
    });
});

describe('the band plays it for the head only (#2027)', () => {
    it('as the head of a standard: the guide tones, sung in a tune’s rhythm (#2111)', () => {
        const timeline = compileTimeline(AUTUMN);
        const head = lead('guide-tones').filter((n) => n.bar < 24);
        // Two or three notes a bar, not one long note a chord.
        expect(head.length).toBeGreaterThan(24 * 1.5);
        // Every chord's first note is one of its guide tones: sounding as it arrives (struck
        // on it, or pushed into it), or landed an eighth late (a swung eighth: within a beat).
        for (let bar = 0; bar < 24; bar++) {
            const at = bar * BAR;
            const chord = chordAt(timeline, at)!;
            if (bar > 0 && chordAt(timeline, at - 1)?.symbol === chord.symbol) {
                continue; // no change here
            }
            const struck =
                head.find((n) => n.tick <= at && n.tick + n.dur > at) ??
                head.find((n) => n.tick > at && n.tick < at + 480);
            expect(struck, `bar ${bar}`).toBeDefined();
            expect(guidePitchClasses(chord, timeline.bars[bar].key)).toContain(mod12(struck!.midi));
        }
        // One long note a phrase at most (three beats or more), and it is the phrase's arrival:
        // it sounds in the phrase's last bar (struck there, or pushed into it).
        for (let phrase = 0; phrase < 6; phrase++) {
            const longs = head.filter(
                (n) => Math.floor(n.bar / 4) === phrase && n.dur >= (BAR * 3) / 4,
            );
            expect(longs.length, `phrase ${phrase}`).toBeLessThanOrEqual(1);
            for (const n of longs) {
                expect(n.tick + n.dur, `phrase ${phrase}`).toBeGreaterThan((phrase * 4 + 3) * BAR);
            }
        }
        // The second A comes back in the first A's rhythm.
        const rhythm = (from: number) =>
            head.filter((n) => n.bar >= from && n.bar < from + 8).map((n) => n.tick - from * BAR);
        expect(rhythm(8)).toEqual(rhythm(0));
        // The B (the contrast) is another rhythm, and lifts from where the A ended — by a 4th
        // at most.
        expect(rhythm(16)).not.toEqual(rhythm(0));
        const k = head.findIndex((n) => n.bar >= 16);
        const lift = head[k].midi - head[k - 1].midi;
        expect(lift).toBeGreaterThanOrEqual(2);
        expect(lift).toBeLessThanOrEqual(5);
    });

    it('ties a common tone across a barline instead of striking it again (#2111)', () => {
        // Rhythm Changes' A as the shelf writes it: Gm7's Bb is Cm7's 7th across the barline.
        const rc = compileTimeline(
            score(
                [
                    {
                        label: 'A',
                        bars: 'Bbmaj7 Gm7 | Cm7 F7 | Bbmaj7 Gm7 | Cm7 F7 | Bbmaj7 Bb7 | Ebmaj7 Ebm7 | Bbmaj7 F7 | Bbmaj7 F7',
                    },
                ],
                { key: 'Bb' },
            ),
        );
        for (const seed of ['one', 'two', 'three', 'four']) {
            const notes = performPass(
                rc,
                {
                    ...DEFAULT_SETTINGS,
                    style: 'jazz',
                    lead: 'sax',
                    seed,
                    swing: 0,
                    lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
                    head: 'guide-tones',
                },
                { pass: 0, looping: true },
            ).events.filter((e): e is PitchedNote => e.lane === 'lead');
            for (let i = 1; i < notes.length; i++) {
                const [a, b] = [notes[i - 1], notes[i]];
                if (a.bar !== b.bar && b.tick - (a.tick + a.dur) < 480) {
                    expect(b.midi, `${seed} bar ${b.bar}`).not.toBe(a.midi);
                }
            }
        }
    });

    it('sings a twelve-bar head as a blues even with a vamp after it (#2111)', () => {
        const blues = compileTimeline(
            score([
                {
                    label: 'Head',
                    bars: 'C7 | C7 | C7 | C7 | F7 | F7 | C7 | C7 | G7 | F7 | C7 | C7',
                },
                { label: 'Vamp', bars: 'C7 | C7 | C7 | C7' },
            ]),
        );
        const notes = performPass(
            blues,
            {
                ...DEFAULT_SETTINGS,
                style: 'jazz',
                lead: 'sax',
                swing: 0,
                lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
                head: 'guide-tones',
            },
            { pass: 0, looping: true },
        ).events.filter((e): e is PitchedNote => e.lane === 'lead');
        const rhythm = (from: number) =>
            notes.filter((n) => n.bar >= from && n.bar < from + 4).map((n) => n.tick - from * BAR);
        // The call, the call again over the IV, and a different answer.
        expect(rhythm(4)).toEqual(rhythm(0));
        expect(rhythm(8)).not.toEqual(rhythm(0));
    });

    it('is the same head every time it comes round', () => {
        // The notes, not their levels: a later pass plays at its own energy.
        const notes = (pass: number) =>
            lead('guide-tones', pass).map(({ tick, dur, midi }) => [tick, dur, midi]);
        expect(notes(4)).toEqual(notes(0));
    });

    it('not on any other chart: the lead invents the head', () => {
        expect(lead(null).filter((n) => n.bar < 24).length).toBeGreaterThan(40);
    });

    it('lands a guide tone held into a held ending on a tone of the chord the band holds', () => {
        // Dm7's F is G7's 7th, held through it; the ending holds C in the last bar instead.
        const t = compileTimeline(
            score([{ label: 'A', bars: 'Cmaj7 | Am7 | Dm7 | G7 | Cmaj7 | A7 | Dm7 | G7' }]),
        );
        const { events } = performPass(
            t,
            {
                ...DEFAULT_SETTINGS,
                style: 'jazz',
                lead: 'sax',
                lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
                head: 'guide-tones',
            },
            { pass: 0, looping: false },
        );
        const notes = events.filter((e): e is PitchedNote => e.lane === 'lead');
        const final = notes.filter((n) => n.bar === 7);
        expect(final.length).toBeGreaterThan(0);
        // Nothing sounds the F over the held C, from this bar or carried into it.
        for (const n of notes.filter((n) => n.tick + n.dur > 7 * BAR)) {
            expect(mod12(n.midi), `${n.tick}`).not.toBe(5);
        }
    });

    it('leaves the solos as they were', () => {
        expect(JSON.stringify(lead('guide-tones', 1))).toBe(JSON.stringify(lead(null, 1)));
    });
});

describe('every style hands the bridge back to the last A (#2122)', () => {
    // Autumn Leaves with its last A written out as C: the bridge closes on a turn that hands on.
    const A = 'Cm7 | F7 | Bbmaj7 | Ebmaj7 | Am7b5 | D7 | Gm7 | Gm7';
    const handBack = compileTimeline(
        score(
            [
                { label: 'A', bars: A },
                { label: 'A', bars: A },
                { label: 'B', bars: 'Am7b5 | D7 | Gm7 | Gm7 | Cm7 | F7 | Bbmaj7 | Ebmaj7' },
                {
                    label: 'C',
                    bars: 'Am7b5 | D7 | Gm7 Gb7 | Fm7 E7 | Ebmaj7 | Am7b5 D7 | Gm7 | Gm7',
                },
            ],
            { key: 'G', isMinor: true },
        ),
    );
    it.each(Object.keys(STYLES) as StyleId[])(
        '%s never strikes a tone twice over one chord',
        (style) => {
            for (const seed of ['one', 'two', 'three', 'four']) {
                const { events } = performPass(
                    handBack,
                    {
                        ...DEFAULT_SETTINGS,
                        style,
                        lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
                        seed,
                        swing: 0,
                        lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
                        head: 'guide-tones',
                    },
                    { pass: 0, looping: true },
                );
                // The turn's last note leads into the last A's first guide tone, rather than
                // restating the one it turned from (G4 ... G4 over Ebmaj7, the beat before the C).
                expect(
                    GUIDE_METRICS.leadSameChordRestrike([{ timeline: handBack, events }]),
                    `seed ${seed}`,
                ).toBe(0);
            }
        },
    );
});

describe('the bridge lifts in every key, and on the shelf (#2123)', () => {
    const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    /** A chart's chord roots (and slash basses) moved up `n` semitones. */
    const up = (bars: string, n: number) =>
        bars.replace(/(^|[\s|/])([A-G])([b#]?)/g, (_m, before, letter, accidental) => {
            const shift = accidental === 'b' ? -1 : accidental === '#' ? 1 : 0;
            return before + NAMES[mod12(LETTER[letter] + shift + n)];
        });
    const keyUp = (key: string, n: number) => NAMES[mod12(NAMES.indexOf(key) + n)];
    // The critique's two charts with a bridge (`FIXTURES` in `test/scores.ts`), as text.
    const RHYTHM_A = 'Bb^7 G7 | Cm7 F7 | Dm7 G7 | Cm7 F7 | Bb^7 Bb7 | Eb^7 Eo7 | Dm7 G7 | Cm7 F7';
    const rhythm = (n: number, bridge = 'D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7') =>
        score(
            [
                { label: 'A', bars: up(RHYTHM_A, n), repeat: 2 },
                { label: bridge.startsWith('D7') ? 'B' : 'A', bars: up(bridge, n) },
                { label: 'A', bars: up(RHYTHM_A, n) },
            ],
            { key: keyUp('Bb', n) },
        );
    const minorFunk = (n: number) =>
        score(
            [
                {
                    label: 'Groove',
                    bars: up('Em9 | Em9 | Em9 | A13 | Em9 | Em9 | Cmaj7 B7#9 | Em9', n),
                },
                { label: 'Bridge', bars: up('Am9 | Am9 | Cmaj7 | B7alt', n) },
            ],
            { key: keyUp('E', n), isMinor: true },
        );
    // Two tunes off the shelf (`web/lib/standards.ts`) whose bridge fell from the A: Rhythm
    // Changes, where the A before the bridge resolves to Bbmaj7 (disco, reggae and acoustic fell
    // a step: the lift's aim lay a tritone up, out of a seam's reach), and Night and Day, whose
    // Bb7 7th resolved a half step down into the bridge's Ebmaj7 (rock, metal and the sax and
    // nylon books fell a half step: its other guide tone was a tritone up).
    const SHELF_A = 'Bbmaj7 Gm7 | Cm7 F7 | Bbmaj7 Gm7 | Cm7 F7 | Bbmaj7 Bb7 | Ebmaj7 Ebm7';
    const shelfRhythm = score(
        [
            { label: 'A', bars: `${SHELF_A} | Bbmaj7 F7 | Bbmaj7 F7` },
            { label: 'A', bars: `${SHELF_A} | Bbmaj7 F7 | Bbmaj7` },
            { label: 'Bridge', bars: 'D7 | D7 | G7 | G7 | C7 | C7 | F7 | F7' },
            { label: 'A', bars: `${SHELF_A} | Bbmaj7 F7 | Bbmaj7 F7` },
        ],
        { key: 'Bb' },
    );
    const STELLA_A = 'Abmaj7 | G7 | Cmaj7 | Cmaj7 | Abmaj7 | G7 | Cmaj7 | Cmaj7';
    const B = 'F#m7b5 | Fm7 | Em7 | Ebdim7 | Dm7 | G7';
    const nightAndDay = score(
        [
            { label: 'A', bars: STELLA_A },
            { label: 'B', bars: `${B} | Cmaj7 | Cmaj7` },
            { label: 'A', bars: STELLA_A },
            { label: 'B', bars: `${B} | Cmaj7 | Bb7` },
            {
                label: 'Bridge',
                bars: 'Ebmaj7 | Ebmaj7 | Cmaj7 | Cmaj7 | Ebmaj7 | Ebmaj7 | Cmaj7 | Cmaj7',
            },
            { label: 'B', bars: `${B} | C6 | C6` },
        ],
        { key: 'C' },
    );
    const headOf = (style: StyleId, chart: ReturnType<typeof score>) => {
        const timeline = compileTimeline(chart);
        const { events } = performPass(
            timeline,
            {
                ...DEFAULT_SETTINGS,
                style,
                lead: STYLES[style].lead?.prefers ?? DEFAULT_SETTINGS.lead,
                seed: 'one',
                swing: 0,
                lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
                head: 'guide-tones',
            },
            { pass: 0, looping: true },
        );
        return { timeline, events, pass: 0 };
    };
    const liftOf = (style: StyleId, chart: ReturnType<typeof score>) =>
        GUIDE_METRICS.leadBridgeLift([headOf(style, chart)]);

    it.each(Object.keys(STYLES) as StyleId[])(
        '%s lifts both bridges at least a whole step, in all twelve keys',
        (style) => {
            // The critique's charts lift 3 and 5 in every style and key. Before #2123 the minor
            // funk in E (its own key) fell 2 for the sax and nylon books: their line sat at the
            // ceiling the lift was capped by, and only that key's guide tones met it.
            for (let n = 0; n < 12; n++) {
                expect(liftOf(style, rhythm(n)), `Rhythm Changes +${n}`).toBeGreaterThanOrEqual(2);
                expect(liftOf(style, minorFunk(n)), `minor funk +${n}`).toBeGreaterThanOrEqual(2);
            }
        },
    );

    it.each(Object.keys(STYLES) as StyleId[])(
        '%s lifts the bridges of Rhythm Changes and Night and Day off the shelf',
        (style) => {
            // 3 or 4, and 5, in every style.
            expect(liftOf(style, shelfRhythm), 'Rhythm Changes').toBeGreaterThanOrEqual(2);
            expect(liftOf(style, nightAndDay), 'Night and Day').toBeGreaterThanOrEqual(2);
        },
    );

    it.each(Object.keys(STYLES) as StyleId[])(
        '%s never sings the head over the top note its solo peaks on',
        (style) => {
            // The head is sung under the book's solo top (`bookReach`: its `peak` over home, or
            // a step under the instrument's top). Before, the walk over a bridge's line ran on
            // to the range's top: disco and reggae's sax to Bb5 (reggae's book: "a lift, not a
            // scream", A5), the nylon to the 17th fret its book keeps off, hip hop's hook to the
            // guitar's top.
            const lead = STYLES[style].lead;
            if (!lead) {
                return;
            }
            const { top } = lead.idiom.register(LEAD_INSTRUMENTS[lead.prefers]);
            const charts = [
                ...Object.values(FIXTURES),
                shelfRhythm,
                nightAndDay,
                ...Array.from({ length: 12 }, (_, n) => [rhythm(n), minorFunk(n)]).flat(),
            ];
            for (const chart of charts) {
                const notes = headOf(style, chart).events.filter(
                    (e): e is PitchedNote => e.lane === 'lead',
                );
                expect(Math.max(...notes.map((e) => e.midi))).toBeLessThanOrEqual(top);
            }
        },
    );

    it('never moves the line wider than a 5th, at any book’s reach', () => {
        // A phrase top re-centres by a 5th at most (`RECENTRE`), a seam by a 4th, and inside a
        // phrase the nearest guide tone is a minor 3rd away. Under a book's solo top a phrase
        // top's window can hold only one of a chord's guide tones; the other, folded out of it,
        // once won on nearness: hip hop's pop song fell from F5 to B4 into its verse and sang
        // the verse a 4th low.
        const charts = [
            ...Object.values(FIXTURES),
            shelfRhythm,
            nightAndDay,
            ...Array.from({ length: 12 }, (_, n) => [rhythm(n), minorFunk(n)]).flat(),
        ];
        for (const style of Object.keys(STYLES) as StyleId[]) {
            const lead = STYLES[style].lead;
            if (!lead) {
                continue;
            }
            const instrument = LEAD_INSTRUMENTS[lead.prefers];
            const { home, top } = lead.idiom.register(instrument);
            for (const chart of charts) {
                const t = compileTimeline(chart);
                const line = guideToneLine(t, t.bars[0], home, [instrument.range[0], top]);
                for (let i = 1; i < line.length; i++) {
                    expect(
                        Math.abs(line[i].midi - line[i - 1].midi),
                        `${style}, ${line[i].chord.symbol} at ${line[i].tick}`,
                    ).toBeLessThanOrEqual(7);
                }
            }
        }
    });

    it('never reseats the A for the bridge: its line is the one it has with no bridge after it', () => {
        // The bridge climbs into the headroom over the A, up to the book's solo top; the A stays
        // where its book seats it. Seating it lower to make room put the sax a 4th to a 6th under
        // the comp on the shelf (#2123's first try). A sax or nylon book's home (71: 67 + 4,
        // 66 + 5) and head (to its solo top: the sax's A5, the nylon's Ab5).
        for (const range of [[53, 81] as const, [52, 80] as const]) {
            for (let n = 0; n < 12; n++) {
                const firstA = (chart: ReturnType<typeof score>) => {
                    const t = compileTimeline(chart);
                    return guideToneLine(t, t.bars[0], 71, range)
                        .filter((note) => note.tick < 8 * BAR)
                        .map((note) => note.midi);
                };
                expect(firstA(rhythm(n)), `+${n}`).toEqual(firstA(rhythm(n, RHYTHM_A)));
            }
        }
    });
});
