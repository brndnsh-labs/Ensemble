import { DEFAULT_SETTINGS, type PitchedNote } from '../../core/types.js';
import { chordAt, compileTimeline } from '../../form/timeline.js';
import { performPass } from '../../perform.js';
import { score } from '../../test/scores.js';
import { mod12 } from '../../theory/pitch.js';
import { guidePitchClasses, guideToneLine } from './guide-tones.js';

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
    it('as the head of a standard: one long note a chord, not a tune', () => {
        const head = lead('guide-tones').filter((n) => n.bar < 24);
        expect(head.length).toBeLessThanOrEqual(24);
        expect(head.every((n) => n.dur >= 960)).toBe(true);
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
