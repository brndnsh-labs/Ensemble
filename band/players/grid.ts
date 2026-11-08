/**
 * The sixteenth-note grid players write on. Every meter the chart codec accepts has a bar
 * length that is a whole number of sixteenths, so a bar is always `steps` sixteenths long;
 * pulses are 4 sixteenths (a quarter) or 6 (a dotted quarter), or 4 for a 2-eighth group.
 */
import { PPQ } from '../core/types.js';
import type { Bar } from '../form/timeline.js';
import type { BarContext, EndingGesture } from '../styles/types.js';

export const STEP = PPQ / 4;

export function barSteps(bar: Bar): number {
    return Math.round(bar.meter.barTicks / STEP);
}

/** True for plain 4/4 — the meter idioms write whole-bar patterns for. */
export function isCommonTime(bar: Bar): boolean {
    return bar.meter.name === '4/4' || (bar.meter.quarterPulse && bar.meter.pulses.length === 4);
}

export interface Pulse {
    /** First sixteenth step of the pulse within the bar. */
    step: number;
    /** Length in sixteenths. */
    steps: number;
    role: 'down' | 'back' | 'strong';
    index: number;
}

export function pulses(bar: Bar): Pulse[] {
    return bar.meter.pulses.map((tick, index) => ({
        step: Math.round(tick / STEP),
        steps: Math.round(bar.meter.pulseTicks[index] / STEP),
        role: bar.meter.roles[index],
        index,
    }));
}

/** Absolute tick of a step in a bar. */
export const at = (bar: Bar, step: number): number => bar.start + step * STEP;

/** The bar's chord spans that begin with an attack, with their step range in the bar. */
export function spanSteps(bar: Bar) {
    return bar.spans.map((span) => ({
        span,
        from: Math.round((span.start - bar.start) / STEP),
        to: Math.round((span.end - bar.start) / STEP),
    }));
}

/**
 * The chords a held ending strikes (`plan.ending`), with their step ranges. A bar the band
 * resolves (`ctx.ending`, `arrange/ending.ts`) is played as that bar says: the resolved tonic
 * alone, or a bar that gets home itself, `| G7 C |`'s V on 1 and its I from 3 (#1502). A last
 * bar played as written (already home on its downbeat, a coda's) holds its first chord.
 */
export function endingSpans(ctx: BarContext) {
    const spans = spanSteps(ctx.bar);
    return ctx.ending?.index === ctx.bar.index ? spans : spans.slice(0, 1);
}

/** Where a button's short hit is written in a 4/4 bar: the "and" of 4. */
const BUTTON_STEP = 14;
/** How long a short ending strike sounds (a stop, a hit, the button): an eighth. */
export const ENDING_SHORT = 2;
/**
 * How much harder the button is struck than the chord it ends (#2017). why: in the swing
 * ending's "doo-bop" the short note is the accent, the band's last word: the bass, the comp
 * and the lead play it about a velocity step over the held chord.
 */
export const BUTTON_LIFT = 12;

/** A gesture's hit beats, counted from 0, in order: home's own strike first. */
const hitBeats = (gesture: EndingGesture) =>
    [...new Set([0, ...(gesture.at ?? [])])].sort((a, b) => a - b);

/**
 * The steps a gesture's hits are struck at in `bar` (#2017): its beats (`EndingGesture.at`)
 * are the bar's pulses (`pulses`), so metal's hits on 1, 2 and 3 are the beats of any meter,
 * the dotted quarters of a 6/8 among them, measured from home's own strike (`arrival`). The
 * hits that fit before `end` (the bar's end, or a written rest) are kept; a bar with room
 * for fewer keeps the first of them (`endingStep` gives the last one's strokes to the last
 * that fits).
 */
function endingHits(gesture: EndingGesture, arrival: number, bar: Bar, end: number): number[] {
    const beats = pulses(bar);
    return hitBeats(gesture)
        .map((beat) => (beats[beat] ? beats[beat].step + arrival : null))
        .filter((step): step is number => step !== null && step < Math.min(end, barSteps(bar)));
}

/**
 * Where a step of an ending gesture lands in the bar the band ends on (#2017). A gesture is
 * written for a 4/4 bar that is home on its downbeat (`DrumBook.ending`'s lines). It moves
 * with the chord it ends on: `arrival` is the step that chord is struck at, 0, or 8 in a
 * `| G7 C |` (#1502), so every lane's last hit lands with the I. A line's stroke on one of
 * the gesture's hit beats is played on a hit the bar keeps (`endingHits`, before `end`),
 * counted back from the last: in a bar with room for fewer hits the first drop out, and the
 * last hit (the ringing one, metal's crash) is always played. The button's short hit is the
 * exception: it is the "and" of the bar's last beat wherever home arrived (its distance from
 * the barline, in any meter). A step that falls past the bar (or, for a button, on or past
 * its own hit) is not played: null.
 */
export function endingStep(
    gesture: EndingGesture,
    step: number,
    arrival: number,
    bar: Bar,
    end: number,
): number | null {
    const total = barSteps(bar);
    const button = gesture.kind === 'button';
    if (button && step >= BUTTON_STEP) {
        const placed = total - (16 - step);
        return placed > arrival ? placed : null;
    }
    const beat = hitBeats(gesture).indexOf(step / 4);
    if (gesture.kind === 'hits' && beat >= 0) {
        const kept = endingHits(gesture, arrival, bar, end);
        return kept[beat - (hitBeats(gesture).length - kept.length)] ?? null;
    }
    const placed = step + arrival;
    return placed < (button ? total - (16 - BUTTON_STEP) : total) ? placed : null;
}

/** One strike of a pitched lane's ending: the span's chord, from step `from` to `to`. */
export interface EndingStrike {
    span: ReturnType<typeof spanSteps>[number]['span'];
    from: number;
    to: number;
    /** The span's first strike (a chord change), not a re-strike of the chord it holds. */
    first: boolean;
    /** The button: struck harder than the chord it ends (`BUTTON_LIFT`). */
    accent: boolean;
}

/**
 * The strikes bass and comp play the ending in (#2017): every chord `endingSpans` gives,
 * shaped by the style's gesture (`plan.ending`). A chord before home (`| G7 C |`'s V) is
 * struck where it is written, ringing into home in an ending that rings, an eighth in a short
 * one. Home takes the gesture from where it is struck: held to the bar's end (hold, soft);
 * an eighth (stop); held to the button, then the button, an eighth, accented (button); a
 * short hit on each of the gesture's beats, the last ringing to the end (hits). A strike never
 * starts in a written rest after home (`G7:2 N.C.:2`); a ring into one is cut there
 * (`perform.ts`).
 */
export function endingStrikes(ctx: BarContext): EndingStrike[] {
    const gesture = ctx.plan.ending;
    const total = barSteps(ctx.bar);
    const spans = endingSpans(ctx);
    const home = spans.reduce((last, { span }, i) => (span.chord ? i : last), -1);
    // why: stop and hits are the band's short endings, every strike an eighth (the hits' last
    // one excepted); hold, soft and the button ring.
    const short = gesture?.kind === 'stop' || gesture?.kind === 'hits';
    const out: EndingStrike[] = [];
    spans.forEach(({ span, from, to }, i) => {
        if (!span.chord) {
            return;
        }
        // The last chord rings on to the bar's end (the band's last barline), cut short only by
        // a written stop (`perform.ts`); a chord before it rings until the next is struck.
        const until = spans[i + 1]?.span.chord ? to : total;
        const strike = (start: number, end: number, first = false, accent = false) =>
            out.push({ span, from: start, to: end, first, accent });
        if (i !== home || !gesture) {
            strike(from, short ? Math.min(until, from + ENDING_SHORT) : until, true);
            return;
        }
        if (gesture.kind === 'button') {
            const button = endingStep(gesture, BUTTON_STEP, from, ctx.bar, to);
            if (button !== null && button < to) {
                strike(from, button, true);
                strike(button, button + ENDING_SHORT, false, true);
            } else {
                strike(from, until, true);
            }
            return;
        }
        if (gesture.kind === 'hits') {
            const steps = endingHits(gesture, from, ctx.bar, to);
            steps.forEach((step, k) => {
                strike(
                    step,
                    k === steps.length - 1 ? until : Math.min(until, step + ENDING_SHORT),
                    k === 0,
                );
            });
            return;
        }
        strike(from, short ? Math.min(until, from + ENDING_SHORT) : until, true);
    });
    return out;
}

/**
 * A pattern line: one char per step. `X` accent, `x` normal, `o` soft, `g` ghost, `.` rest.
 * Returns [step, velocity] pairs.
 */
const LEVEL: Record<string, number> = { X: 118, x: 96, o: 72, g: 36 };

export function readLine(line: string): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < line.length; i++) {
        const v = LEVEL[line[i]];
        if (v) {
            out.push([i, v]);
        }
    }
    return out;
}

/**
 * Stretch or fit a 4-step pulse cell onto a pulse of any length. A compound (6-step)
 * pulse keeps the cell's downbeat, maps its "&" to the last eighth of the group, and
 * fills eighths for a continuous line (a cell with every "&" and beat filled).
 */
export function fitCell(cell: string, steps: number): string {
    if (cell.length === steps) {
        return cell;
    }
    if (steps === 6 && cell.length === 4) {
        const continuous = cell[0] !== '.' && cell[2] !== '.';
        if (continuous) {
            return `${cell[0]}.${cell[2]}.${cell[2]}.`;
        }
        return `${cell[0]}...${cell[2]}.`;
    }
    return cell.padEnd(steps, '.').slice(0, steps);
}

/** Scale a velocity by energy: quieter bands play softer, not just sparser. */
export function dyn(velocity: number, energy: number): number {
    return Math.round(Math.min(127, Math.max(1, velocity * (0.72 + 0.4 * energy))));
}
