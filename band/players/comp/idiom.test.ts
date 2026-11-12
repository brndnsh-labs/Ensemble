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

/**
 * An instrument (the organ unless said) playing bar `index` of `bars` with a book that strikes
 * at `steps`: the steps it sounds, in order.
 */
function struck(
    bars: string,
    index: number,
    steps: (number | Hit)[],
    options: {
        comp?: 'organ' | 'piano';
        pushInBar?: true | 'restrike';
        push?: boolean;
        memory?: CompMemory;
    } = {},
) {
    return sounded(bars, index, steps, options).map(([step]) => step);
}

/**
 * The same, with each sounding's end: `[step, end]` pairs, one per onset (a chord's notes
 * share both).
 */
function sounded(
    bars: string,
    index: number,
    steps: (number | Hit)[],
    {
        comp = 'organ',
        pushInBar = true,
        push = false,
        memory,
    }: {
        comp?: 'organ' | 'piano';
        pushInBar?: true | 'restrike';
        push?: boolean;
        memory?: CompMemory;
    } = {},
): [number, number][] {
    // A bare step is a sixteenth-long hit.
    const hits = steps.map(
        (s): Hit => (typeof s === 'number' ? { step: s, length: 1, velocity: 80 } : s),
    );
    const book = compIdiom({
        name: `test ${comp}`,
        kind: 'close',
        // The strike an eighth before a mid-bar change plays the new chord.
        pushInBar,
        // The barline push: the last strike before a change plays the next chord, when asked.
        push: push ? { low: 1, mid: 1, high: 1 } : { low: 0, mid: 0, high: 0 },
        rhythm: (_ctx, { from, to }) => hits.filter((h) => h.step >= from && h.step < to),
    });
    const timeline = compileTimeline(score([{ label: 'A', bars }]));
    const settings = { ...DEFAULT_SETTINGS, comp };
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
        next: {
            bar: next,
            plan: plans[next.index],
            wraps: next.index !== index + 1,
            rng: (purpose) => rng('test', next.index, purpose),
        },
        heard: { drums: [], bass: [], lead: [] },
        instrument: COMP_INSTRUMENTS[comp],
        lead: LEAD_INSTRUMENTS[settings.lead],
        pass: 0,
        looping: true,
        guideToneHead: false,
        ending: null,
        rng: (purpose) => rng('test', index, purpose),
    };
    const { events } = book.play(ctx, memory ?? book.init());
    const byOnset = new Map<number, number>();
    for (const e of events as PitchedNote[]) {
        byOnset.set(e.tick - bar.start, e.tick + e.dur - bar.start);
    }
    return [...byOnset].map(([tick, end]) => [tick / 120, end / 120]);
}

/** The organ playing bar `index` of `bars` with a book that strikes at `steps`. */
const organ = (bars: string, index: number, steps: number[], memory?: CompMemory) =>
    struck(bars, index, steps, { memory });

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

describe('a mid-bar push ties over the change (#2171)', () => {
    // `C F`, strikes on 0, 6 and 8: the strike on 6 plays the F arriving on 8, tied over it.
    it("the chord's own strike on the change is dropped under the tie", () => {
        expect(struck('C F', 0, [0, 6, 8], { comp: 'piano' })).toEqual([0, 6]);
    });

    it('a strike past the tie plays', () => {
        expect(struck('C F', 0, [0, 6, 10], { comp: 'piano' })).toEqual([0, 6, 10]);
    });

    it('a book that restrikes keeps it, and plays the push as written (the boogie pump)', () => {
        expect(sounded('C F', 0, [0, 6, 8], { comp: 'piano', pushInBar: 'restrike' })).toEqual([
            [0, 1],
            [6, 7],
            [8, 9],
        ]);
    });

    it('a restriking book with nothing on the change ties over like any other', () => {
        // The line's next pick is on the "e" after the change, not the beat: the pair before
        // the change is the arrival, and rings into that pick.
        expect(sounded('C F', 0, [0, 6, 9], { comp: 'piano', pushInBar: 'restrike' })).toEqual([
            [0, 1],
            [6, 9],
            [9, 10],
        ]);
    });

    it('the push holds for as long as the dropped strike would have', () => {
        // The figure held the F from 8 to 14: the push, which replaces it, holds to 14.
        const held = { step: 8, length: 6, velocity: 80 };
        expect(sounded('C F', 0, [0, 6, held], { comp: 'piano' })).toEqual([
            [0, 1],
            [6, 14],
        ]);
    });

    it('a stab stays a stab', () => {
        // Without the drop a push an eighth before the change ties an eighth over it (to 10).
        expect(sounded('C F', 0, [0, 6, 8], { comp: 'piano' })).toEqual([
            [0, 1],
            [6, 10],
        ]);
    });
});

describe('a barline push holds as long as the downbeat strike it replaces (#2183)', () => {
    // `C | F`, strikes on 14 (the push into F) and on 0 of each bar: the bar after the push
    // drops its downbeat strike under the tie, and the push rings for that strike's length. The
    // figure is the same in both bars, so the strike on 14 is also the next played strike there.
    const pushOf = (
        bars: string,
        downbeat: Hit,
        extra: Hit[] = [],
        options: { pushInBar?: true | 'restrike' } = {},
    ) =>
        sounded(bars, 0, [downbeat, { step: 14, length: 1, velocity: 80 }, ...extra], {
            comp: 'piano',
            push: true,
            ...options,
        }).find(([step]) => step === 14);

    it('a held downbeat chord is held by the push, to where it was written', () => {
        // Held to step 12 of the next bar: the push rings from 14 to 16 + 12. Where it stops
        // is what the listener hears of "lay it down and let it breathe".
        expect(pushOf('C | F', { step: 0, length: 12, velocity: 80 })).toEqual([14, 28]);
    });

    it('a short stab stays the eighth the tie gives it (never shorter)', () => {
        expect(pushOf('C | F', { step: 0, length: 1.5, velocity: 80 })).toEqual([14, 18]);
    });

    it('a book that restrikes plays the push as before', () => {
        expect(
            pushOf('C | F', { step: 0, length: 12, velocity: 80 }, [], { pushInBar: 'restrike' }),
        ).toEqual([14, 18]);
    });

    it('stops at the next strike the next bar plays: one hand, one chord at a time', () => {
        // A strike on step 8 of the next bar cuts the held chord there.
        expect(
            pushOf('C | F', { step: 0, length: 14, velocity: 80 }, [
                { step: 8, length: 2, velocity: 80 },
            ]),
        ).toEqual([14, 24]);
    });

    it("stops at the chord's own span end: a hold written past a change is the change's", () => {
        // `F:2 C:2`: the F's first half lasts to step 8, the figure's hold of 16 is cut there.
        expect(pushOf('C | F:2 C:2', { step: 0, length: 16, velocity: 80 })).toEqual([14, 24]);
    });
});
