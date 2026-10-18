import { durationToSteps, scoreDuration, scoreMeter } from '@core/songbook/score-duration';
import { parseChordBar } from '@core/songbook/score-text';

/**
 * The bar menu's beat ruler (#1725): a bar's chords as spans of its counts, and the text that
 * writes them back. Lengths are held in HALF counts — the finest length the old edit panel's
 * per-chord selects offered — so the ruler can show any bar those selects could make. Pure: the
 * menu draws it, `parseChordBar` stays the one reader.
 */

/** One chord's share of the bar: its text as typed (`Bb7`, `C[Am]`, `N.C.`) and its length in
 * half counts. A hold (`/`) is not a span of its own: it extends the chord before it. */
export interface RulerSpan {
    text: string;
    halves: number;
}

export interface Ruler {
    spans: RulerSpan[];
    /** The bar's length in half counts: twice the meter's counts. */
    total: number;
    counts: number;
    /** The smallest length a split may leave, in half counts: 1 where half a count is on the
     * band's step grid (every meter up to x/8), else 2 (a whole count). */
    grain: 1 | 2;
}

/** A length in counts as the parser reads it after a colon: `3`, or `3/2` for a half. */
function countsText(halves: number): string {
    const [n, d] = scoreDuration(halves, 2);
    return d === 1 ? String(n) : `${n}/${d}`;
}

/**
 * The ruler for a bar's chord text in `meter`, or null where it cannot show it: the text does
 * not read (a typo mid-edit), or a chord's length is finer than half a count (a triplet).
 *
 * `fermata`: the bar's last event holds (the "Hold last chord" toggle). Then the holds that end
 * the bar stay a span of their own, `/`, rather than folding into the chord before them: the band
 * stretches only the bar's LAST event (`band/form/timeline.ts`), so `Gm7 C7 / /` with a fermata
 * holds the hold, and a ruler move must not turn that into C7 held (#1725 review).
 */
export function readRuler(text: string, meter: string, fermata = false): Ruler | null {
    const parsed = parseChordBar(text, meter);
    if (parsed.kind !== 'ok') {
        return null;
    }
    const { counts, unit } = scoreMeter(meter);
    const spans: RulerSpan[] = [];
    let lastSounding = parsed.value.length - 1;
    while (lastSounding >= 0 && parsed.value[lastSounding].kind === 'hold') {
        lastSounding -= 1;
    }
    for (const [index, event] of parsed.value.entries()) {
        // A duration in quarter units, as half counts of this meter: n/d quarters × unit/4
        // counts per quarter × 2.
        const halves = (event.duration[0] * unit) / (2 * event.duration[1]);
        if (!Number.isInteger(halves)) {
            return null;
        }
        const previous = spans.at(-1);
        const finalHold = fermata && index > lastSounding && previous?.text !== '/';
        if (event.kind === 'hold' && previous && !finalHold) {
            // `Gm7 / / C7`: the slashes are Gm7 held, so the ruler draws one Gm7 over three.
            previous.halves += halves;
            continue;
        }
        spans.push({
            text:
                event.kind === 'chord'
                    ? event.symbol + (event.alternates ? `[${event.alternates.join(',')}]` : '')
                    : event.kind === 'hold'
                      ? '/'
                      : 'N.C.',
            halves,
        });
    }
    const half = durationToSteps(scoreDuration(4, unit * 2)) !== null;
    return { spans, total: counts * 2, counts, grain: half ? 1 : 2 };
}

/**
 * The text that gives `spans` their lengths: the plain `C Dm G7` when they share the bar
 * equally (most bars need no length syntax), else every chord with its count, `Gm7:3 C7:1`.
 */
export function rulerText(spans: readonly RulerSpan[]): string {
    if (spans.every((span) => span.halves === spans[0].halves)) {
        return spans.map((span) => span.text).join(' ');
    }
    return spans.map((span) => `${span.text}:${countsText(span.halves)}`).join(' ');
}

/** Where split `index` (between span `index` and the next) sits, in half counts from the start. */
export function splitAt(ruler: Ruler, index: number): number {
    return ruler.spans.slice(0, index + 1).reduce((sum, span) => sum + span.halves, 0);
}

/** How far split `index` can move: each chord beside it keeps at least `grain`. */
export function splitRange(ruler: Ruler, index: number): { min: number; max: number } {
    const before = splitAt(ruler, index) - ruler.spans[index].halves;
    const after = splitAt(ruler, index) + ruler.spans[index + 1].halves;
    return { min: before + ruler.grain, max: after - ruler.grain };
}

/** The places split `index` may land: whole counts, or with `fine` every half count the grid
 * allows. Falls back to the fine places when no whole count lies between its neighbours. */
function places(ruler: Ruler, index: number, fine: boolean): number[] {
    const { min, max } = splitRange(ruler, index);
    const all = (step: number) => {
        const out: number[] = [];
        for (let at = Math.ceil(min / step) * step; at <= max; at += step) {
            out.push(at);
        }
        return out;
    };
    const coarse = fine ? [] : all(2);
    return coarse.length ? coarse : all(ruler.grain);
}

/** The place nearest `raw` (half counts, as a pointer reads it) that split `index` may take. */
export function snapSplit(ruler: Ruler, index: number, raw: number, fine = false): number {
    const options = places(ruler, index, fine);
    return options.reduce(
        (best, at) => (Math.abs(at - raw) < Math.abs(best - raw) ? at : best),
        options[0] ?? splitAt(ruler, index),
    );
}

/** The next place along from where split `index` sits now (an arrow key), or the end it
 * stops at (`Home`, `End`). Unchanged when there is nowhere further to go. */
export function stepSplit(
    ruler: Ruler,
    index: number,
    move: -1 | 1 | 'start' | 'end',
    fine = false,
): number {
    const now = splitAt(ruler, index);
    const options = places(ruler, index, fine);
    if (move === 'start' || move === 'end') {
        return (move === 'start' ? options[0] : options.at(-1)) ?? now;
    }
    const along = options.filter((at) => (move > 0 ? at > now : at < now));
    return (move > 0 ? along[0] : along.at(-1)) ?? now;
}

/** `ruler`'s spans with split `index` moved to `at`: the chords either side trade length. */
export function movedSplit(ruler: Ruler, index: number, at: number): RulerSpan[] {
    const start = splitAt(ruler, index) - ruler.spans[index].halves;
    const pair = ruler.spans[index].halves + ruler.spans[index + 1].halves;
    return ruler.spans.map((span, i) =>
        i === index
            ? { ...span, halves: at - start }
            : i === index + 1
              ? { ...span, halves: pair - (at - start) }
              : span,
    );
}

/** A length in half counts for a reader: "3", "1½". */
export function countsLabel(halves: number): string {
    const whole = Math.floor(halves / 2);
    return halves % 2 ? `${whole || ''}½` : String(whole);
}
