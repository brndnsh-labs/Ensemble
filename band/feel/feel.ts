/**
 * The timing law as code (see `docs/design/timing-model.md`). Players write on a straight
 * grid; this pass alone moves notes in time, in three tiers:
 *
 *   1. Grid   — swing is grid *geometry*: an offbeat moves within its beat, tempo unchanged.
 *   2. Lean   — one per-lane constant: bass and keys against the drums. Drums never lean,
 *               so the lean is audible (a shift applied to everyone is just latency).
 *   3. Character — seeded human placement keyed on (bar position, lane, voice), so a lane's
 *               push at a given sixteenth repeats every bar and reads as a settled pocket
 *               rather than per-note noise; velocity varies per hit.
 *
 * A strum is articulation, not feel, but it is still *time*, so it lives here too: a stroked
 * chord rolls across its strings (low→high down, high→low up) at the instrument's speed, and
 * takes its tier-3 placement as one gesture, so the roll is never scrambled.
 */
import { hashKey, rng } from '../core/random.js';
import { type BandEvent, PPQ } from '../core/types.js';
import type { Timeline } from '../form/timeline.js';
import type { Feel } from '../styles/types.js';

/** Largest tier-3 placement offset at humanize 100, in ms. */
export const MAX_CHARACTER_MS = 9;
/** Largest velocity variation at humanize 100. */
const MAX_VELOCITY_JITTER = 10;

/** Swing 0–100 → where the offbeat lands as a fraction of its pair (0.5 straight, ⅔ triplet). */
export function swingRatio(swing: number): number {
    return 0.5 + (Math.min(100, Math.max(0, swing)) / 100) * (1 / 6);
}

/** Warp a within-beat tick position for swung pairs of length `pair` ticks. */
function warp(offset: number, pair: number, ratio: number): number {
    const inPair = offset % pair;
    const base = offset - inPair;
    const half = pair / 2;
    return (
        base +
        (inPair < half
            ? (inPair / half) * ratio * pair
            : ratio * pair + ((inPair - half) / half) * (1 - ratio) * pair)
    );
}

export interface FeelSettings {
    swing: number | null;
    swingGrid?: 8 | 16 | null;
    humanize: number | null;
    seed: string;
    /** Milliseconds between adjacent strings of a stroked chord (0: no roll). */
    strumMs?: number;
}

/** Each stroked comp note's place in its strum (0 = the first string hit). */
function strumOrder(events: BandEvent[]): Map<BandEvent, number> {
    const chords = new Map<number, BandEvent[]>();
    for (const e of events) {
        if (e.lane === 'comp' && e.stroke) {
            const chord = chords.get(e.tick) ?? [];
            chord.push(e);
            chords.set(e.tick, chord);
        }
    }
    const order = new Map<BandEvent, number>();
    for (const chord of chords.values()) {
        const up = chord[0].lane === 'comp' && chord[0].stroke === 'up';
        const sorted = [...chord].sort(
            (a, b) => (a.lane === 'drums' ? 0 : a.midi) - (b.lane === 'drums' ? 0 : b.midi),
        );
        (up ? sorted.reverse() : sorted).forEach((e, i) => order.set(e, i));
    }
    return order;
}

export function applyFeel(
    events: BandEvent[],
    timeline: Timeline,
    feel: Feel,
    settings: FeelSettings,
): BandEvent[] {
    const ratio = swingRatio(settings.swing ?? feel.swing);
    const pair = (settings.swingGrid ?? feel.swingGrid) === 8 ? PPQ : PPQ / 2;
    const human = (settings.humanize ?? feel.humanize) / 100;
    const strumMs = settings.strumMs ?? 0;
    const strum = strumMs ? strumOrder(events) : null;
    return events.map((event) => {
        const bar = timeline.bars[event.bar];
        let { tick } = event;
        let dur = event.lane === 'drums' ? 0 : event.dur;
        if (bar.meter.quarterPulse && ratio !== 0.5) {
            const offset = tick - bar.start;
            const swung = bar.start + warp(offset, pair, ratio);
            if (dur) {
                const end = warp(offset + dur, pair, ratio) + bar.start;
                dur = Math.max(1, end - swung);
            }
            tick = swung;
        }
        const rank = strum?.get(event);
        const voice =
            event.lane === 'drums'
                ? event.piece
                : event.lane === 'bass'
                  ? 0
                  : rank !== undefined
                    ? 'strum'
                    : event.midi;
        const position = Math.round(event.tick - bar.start);
        // Tier 3: placement keyed on bar position, not bar index (settled, repeating).
        const place = rng(settings.seed, 'place', event.lane, voice, position).bipolar();
        const lean = event.lane === 'drums' ? 0 : feel.lean[event.lane];
        const offsetMs =
            event.offsetMs + lean + place * MAX_CHARACTER_MS * human + (rank ?? 0) * strumMs;
        const jitter = rng(
            hashKey(settings.seed),
            'vel',
            event.lane,
            voice,
            event.bar,
            position,
        ).bipolar();
        const velocity = Math.round(
            Math.min(127, Math.max(1, event.velocity + jitter * MAX_VELOCITY_JITTER * human)),
        );
        return event.lane === 'drums'
            ? { ...event, tick, offsetMs, velocity }
            : { ...event, tick, dur, offsetMs, velocity };
    });
}
