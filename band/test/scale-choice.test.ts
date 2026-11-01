/**
 * #2011: two chord-scale slips, measured over whole performances of the app's own charts.
 * The scale decisions themselves are unit-tested in `form/timeline.test.ts`; this holds the
 * players to them — no lead or comp note on a pitch class the chart's harmony rules out.
 */

import { type BandEvent, DEFAULT_SETTINGS, type PitchedNote, type StyleId } from '../core/types.js';
import { chordAt, compileTimeline } from '../form/timeline.js';
import { type PassMemory, performPass } from '../perform.js';
import { mod12 } from '../theory/pitch.js';
import { score } from './scores.js';

const SEEDS = ['one', 'two', 'three', 'four'];

/** Funk (i-IV) and Blue Bossa, as `web/lib/standards.ts` writes them. */
const FUNK_I_IV = score([{ label: 'Main', bars: 'Em7 | A7 | Em7 | A7' }], {
    key: 'E',
    isMinor: true,
});
const BLUE_BOSSA = score(
    [
        { label: 'A', bars: 'Cm7 | Cm7 | Fm7 | Fm7 | Dm7b5 | G7b9 | Cm7 | Cm7' },
        { label: 'B', bars: 'Ebm7 | Ab7 | Dbmaj7 | Dbmaj7 | Dm7b5 | G7b9 | Cm7 | Dm7b5 G7b9' },
    ],
    { key: 'C', isMinor: true },
);

/** Every pitched lead/comp note of a few seeded passes (head and solos), with its chord. */
function notesOver(style: StyleId, chart: ReturnType<typeof score>) {
    const timeline = compileTimeline(chart);
    const out: { note: PitchedNote; symbol: string; pc: number }[] = [];
    for (const seed of SEEDS) {
        let memory: PassMemory | undefined;
        for (let pass = 0; pass < 4; pass++) {
            const settings = {
                ...DEFAULT_SETTINGS,
                style,
                seed,
                swing: 0,
                lanes: { ...DEFAULT_SETTINGS.lanes, lead: true },
            };
            const result = performPass(timeline, settings, { pass, looping: true, memory });
            memory = result.memory;
            for (const e of result.events as BandEvent[]) {
                if ((e.lane !== 'lead' && e.lane !== 'comp') || e.muted) {
                    continue;
                }
                const chord = chordAt(timeline, e.tick);
                if (chord) {
                    out.push({ note: e, symbol: chord.symbol, pc: mod12(e.midi) });
                }
            }
        }
    }
    return out;
}

describe('chord-scale choice (#2011)', () => {
    it('Funk (i-IV): no C natural over Em7 from the lead or the comp', () => {
        const notes = notesOver('funk', FUNK_I_IV).filter((n) => n.symbol === 'Em7');
        expect(notes.length).toBeGreaterThan(50);
        // A chromatic approach into the A7's C# (the last beats of the bar) may brush it; the body of the bar may not.
        expect(notes.filter((n) => n.pc === 0 && n.note.tick % 1920 < 960)).toEqual([]);
    });

    it('Blue Bossa: no E natural (the target Cm7 has Eb) over G7b9', () => {
        const notes = notesOver('bossa', BLUE_BOSSA).filter((n) => n.symbol === 'G7b9');
        expect(notes.length).toBeGreaterThan(50);
        expect(notes.filter((n) => n.pc === 4).length).toBe(0);
    });
});
