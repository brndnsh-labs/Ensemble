/**
 * The organ's presses (`compIdiom`'s legato path), on a book written for the case: an
 * anticipation is one press however many strikes fall in its eighth (#1510), and only there —
 * the same chord pushed again a bar's half later is a new arrival, pressed anew.
 */
import { fullWindow, planBars } from '../../arrange/plan.js';
import { rng } from '../../core/random.js';
import { DEFAULT_SETTINGS, type PitchedNote } from '../../core/types.js';
import { compileTimeline } from '../../form/timeline.js';
import type { BarContext } from '../../styles/types.js';
import { score } from '../../test/scores.js';
import { LEAD_INSTRUMENTS } from '../lead/instruments.js';
import { compIdiom, type Hit, tiedFromPush } from './idiom.js';
import { COMP_INSTRUMENTS } from './instruments.js';

/** The organ playing bar `index` of `bars` with a book that strikes at `steps`. */
function organ(bars: string, index: number, steps: number[], memory?: CompMemory) {
    const book = compIdiom({
        name: 'test organ',
        kind: 'close',
        // The strike an eighth before a mid-bar change plays the new chord.
        pushInBar: true,
        push: { low: 0, mid: 0, high: 0 },
        rhythm: (_ctx, { from, to }) =>
            steps
                .filter((step) => step >= from && step < to)
                .map((step): Hit => ({ step, length: 1, velocity: 80 })),
    });
    const timeline = compileTimeline(score([{ label: 'A', bars }]));
    const settings = { ...DEFAULT_SETTINGS, comp: 'organ' as const };
    const plans = planBars(timeline, settings, {
        pass: 0,
        looping: true,
        window: fullWindow(timeline),
    });
    const bar = timeline.bars[index];
    const next = timeline.bars[index + 1] ?? timeline.bars[0];
    const ctx: BarContext = {
        timeline,
        bar,
        plan: plans[index],
        next: { bar: next, plan: plans[next.index], wraps: next.index !== index + 1 },
        heard: { drums: [], bass: [], lead: [] },
        instrument: COMP_INSTRUMENTS.organ,
        lead: LEAD_INSTRUMENTS[settings.lead],
        pass: 0,
        looping: true,
        ending: null,
        rng: (purpose) => rng('test', index, purpose),
    };
    const { events } = book.play(ctx, memory ?? book.init());
    const presses = [...new Set((events as PitchedNote[]).map((e) => e.tick - bar.start))];
    return presses.map((tick) => tick / 120);
}

/** What the organ remembers on leaving a bar; `compIdiom` keeps the type to itself. */
type CompMemory = ReturnType<ReturnType<typeof compIdiom>['init']>;

describe('a chord pushed over the barline is tied in only when the bar opens on it (#1507)', () => {
    const [bar] = compileTimeline(score([{ label: 'A', bars: 'F C' }])).bars;

    it('the chord the bar opens on rings in', () => {
        expect(tiedFromPush({ pushed: 'F' }, bar)).toBe(true);
    });

    it("a push aimed at another chord is not this bar's", () => {
        expect(tiedFromPush({ pushed: 'C' }, bar)).toBe(false);
    });

    it('nothing pushed, nothing tied', () => {
        expect(tiedFromPush({ pushed: null }, bar)).toBe(false);
        expect(tiedFromPush({}, bar)).toBe(false);
    });
});

describe('the organ presses its chord again once the hand has let go', () => {
    // Bar 3 of four on one chord: no phrase top, no change, so only the hold decides.
    const held = (from: number) =>
        organ('C | C | C | C', 2, [0], { voicing: null, pushed: null, chord: 'C', bar: from });

    it('holds a chord it struck in the bar before', () => {
        expect(held(1)).toEqual([]);
    });

    it('presses it after bars it sat out', () => {
        // A drummer's four in a trade, say: `sustain` ended the hold, so nothing sounds.
        expect(held(0)).toEqual([0]);
    });
});

describe('the organ presses an anticipation once (#1510)', () => {
    it('two strikes in the eighth before a change are one push', () => {
        // Strikes on 6 and 7 both push the F arriving on 8: pressed on 6, not again on 7.
        expect(organ('C F', 0, [0, 6, 7])).toEqual([0, 6]);
    });

    it('the same chord pushed again further on is pressed again', () => {
        // `C:1 F:1 C:1 F:1`, strikes on 3 and 11 only: each pushes an F, half a bar apart, with
        // the C between them pressed on its own beat. Both pushes are presses.
        expect(organ('C:1 F:1 C:1 F:1', 0, [0, 3, 11])).toEqual([0, 3, 8, 11]);
    });
});
