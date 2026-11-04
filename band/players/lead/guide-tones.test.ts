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
            expect(guidePitchClasses(note.chord)).toContain(mod12(note.midi));
            expect(chordAt(timeline, note.tick)).toBe(note.chord);
        }
    });

    it('is voice-led: a ii-V-I falls by half steps, and a common tone is held', () => {
        // Cm7's Bb → F7's A (held: it is Bbmaj7's 7th) → Ebmaj7's G → Am7b5's G (struck again:
        // a new phrase) → D7's F# → Gm7's F, held through both bars.
        expect(line.map((n) => n.midi)).toEqual([70, 69, 67, 67, 66, 65]);
        expect(line[1].dur).toBe(2 * 1920);
        for (let i = 1; i < line.length; i++) {
            expect(Math.abs(line[i].midi - line[i - 1].midi)).toBeLessThanOrEqual(2);
        }
    });

    it('breathes at the end of each phrase', () => {
        // The Ebmaj7's G and the last Gm7's F end their phrases an eighth early.
        expect(line[2].tick + line[2].dur).toBe(4 * 1920 - 240);
        expect(line.at(-1)!.tick + line.at(-1)!.dur).toBe(8 * 1920 - 240);
    });

    it('gives a triad the 7th of its key', () => {
        const t = compileTimeline(score([{ label: 'A', bars: 'C | G | C | C' }]));
        expect(guidePitchClasses(chordAt(t, 0)!)).toEqual([4, 11]); // E and B over C
        expect(guidePitchClasses(chordAt(t, 1920)!)).toEqual([11, 5]); // B and F over G
    });

    it('moves to the other guide tone on a chord held past two bars', () => {
        const t = compileTimeline(score([{ label: 'A', bars: 'Cmaj7 | / | / | /' }]));
        const held = guideToneLine(t, t.bars[0], 67, SAX);
        expect(held.map((n) => n.tick)).toEqual([0, 2 * 1920]);
        expect(held[0].midi).not.toBe(held[1].midi);
    });
});

describe('the band plays it for the head only (#2027)', () => {
    it('as the head of a standard: the line, every A alike', () => {
        const notes = lead('guide-tones');
        const head = notes.filter((n) => n.bar < 24);
        // One long note a chord (or fewer, where a common tone is held), not a tune.
        expect(head.length).toBeLessThanOrEqual(24);
        const firstA = head.filter((n) => n.bar < 8).map((n) => [n.bar, n.midi]);
        const secondA = head
            .filter((n) => n.bar >= 8 && n.bar < 16)
            .map((n) => [n.bar - 8, n.midi]);
        expect(secondA).toEqual(firstA);
    });

    it('not on any other chart: the lead invents the head', () => {
        expect(lead(null).filter((n) => n.bar < 24).length).toBeGreaterThan(40);
    });

    it('leaves the solos as they were', () => {
        expect(JSON.stringify(lead('guide-tones', 1))).toBe(JSON.stringify(lead(null, 1)));
    });
});
