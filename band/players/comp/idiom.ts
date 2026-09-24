/**
 * The comping machinery, for keyboards and guitars. A style's book supplies a *rhythm* (where
 * the hand plays in a chord span); `compIdiom` does the rest the same way for every style:
 * voicing with voice leading (a keyboard voicing or a fretboard grip), anticipations that
 * tie the next bar's chord over the barline, N.C. rests, the ending.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { at, barSteps, dyn, STEP, spanSteps } from '../grid.js';
import { type GripShape, grip } from './fretboard.js';
import { type VoicingKind, voice } from './voicing.js';

export interface Hit {
    step: number;
    /** Length in sixteenths. */
    length: number;
    velocity: number;
    /** A strummed hit's direction (guitar books). */
    stroke?: 'down' | 'up';
    /** A muted scratch: the hand deadens the strings of the grip it's holding. */
    muted?: boolean;
    /** Palm-muted: the grip sounds, damped at the bridge (see `PitchedNote.palm`). */
    palm?: boolean;
}

/** An anticipation ties over the barline for this many sixteenths (an eighth). */
const TIE_STEPS = 2;

interface CompMemory {
    voicing: number[] | null;
    /** The chord the hand last struck (its symbol), for an instrument that holds it. */
    chord?: string | null;
    /** The next bar's first chord was already played as an anticipation. */
    pushed: boolean;
}

export interface CompBook {
    name: string;
    /**
     * The voicing kind, or a choice of kind per chord: a book whose colour depends on what
     * each chord's scale owns (neo-soul's 6/9 over a triad, rootless over a seventh chord)
     * decides it chord by chord, so one chord never costs its neighbour its colour.
     */
    kind: VoicingKind | ((chord: ChordFacts) => VoicingKind);
    /** Guitar books: the grip shape. Without it, chords are voiced for a keyboard. */
    grip?: GripShape;
    /**
     * The grip shape when no bass is playing: the guitar is the band's bottom now, so it
     * plays full, root-position chords down on the low strings.
     */
    alone?: GripShape;
    /** Hits for one chord span, in bar steps [from, to). */
    rhythm(
        ctx: BarContext,
        span: { from: number; to: number; attack: boolean; index: number },
        tier: EnergyTier,
        rng: Rng,
    ): Hit[];
    /** Chance that the last hit before a barline anticipates the next chord. */
    push: Record<EnergyTier, number>;
    /** A hit an eighth before a mid-bar chord change plays the new chord (bossa). */
    pushInBar?: boolean;
    /**
     * The rhythm is the part even on a sustaining instrument: the organ plays the book's hits
     * as written, short, instead of pressing once per chord and holding (the reggae bubble).
     */
    percussive?: boolean;
}

export function compIdiom(book: CompBook): PitchedIdiom {
    return {
        name: book.name,
        percussive: book.percussive,
        init: (): CompMemory => ({ voicing: null, pushed: false }),
        play(ctx, memory: CompMemory) {
            const { bar, plan } = ctx;
            const shape = !plan.lanes.bass && book.alone ? book.alone : book.grip;
            const kindOf = (chord: ChordFacts) =>
                typeof book.kind === 'function' ? book.kind(chord) : book.kind;
            const place = (chord: ChordFacts, prev: number[] | null) =>
                shape ? grip(chord, kindOf(chord), shape, prev) : voice(chord, kindOf(chord), prev);
            const tier = energyTier(plan.energy);
            const total = barSteps(bar);
            const events: PitchedNote[] = [];
            let prev = memory.voicing;
            const chordAt = (
                midi: number[],
                step: number,
                length: number,
                velocity: number,
                hit?: { stroke?: 'down' | 'up'; muted?: boolean; palm?: boolean },
            ) => {
                for (const m of midi) {
                    const note: PitchedNote = {
                        lane: 'comp',
                        tick: at(bar, step),
                        dur: Math.max(STEP / 2, length * STEP),
                        midi: m,
                        velocity: dyn(velocity, plan.energy),
                        offsetMs: 0,
                        bar: bar.index,
                    };
                    if (hit?.stroke) {
                        note.stroke = hit.stroke;
                    }
                    if (hit?.muted) {
                        note.muted = true;
                    }
                    if (hit?.palm) {
                        note.palm = true;
                    }
                    events.push(note);
                }
            };
            if (plan.ending) {
                const chord = bar.spans[0]?.chord;
                if (chord) {
                    prev = place(chord, prev);
                    chordAt(prev, 0, total, 92, shape && { stroke: 'down' });
                }
                return {
                    events,
                    memory: { voicing: prev, pushed: false, chord: chord?.symbol ?? null },
                };
            }
            const nextFirst = ctx.next?.bar.spans[0];
            let pushed = false;
            // `early`: the hit plays the next chord ahead of its arrival (an anticipation).
            const planned: (Hit & { chord: ChordFacts; early?: boolean })[] = [];
            const spans = spanSteps(bar);
            spans.forEach(({ span, from, to }, index) => {
                const chord = span.chord;
                if (!chord) {
                    return;
                }
                const rng = ctx.rng(`comp${index}`);
                let hits = book.rhythm(ctx, { from, to, attack: span.attack, index }, tier, rng);
                if (span.fermata) {
                    hits = [{ step: from, length: to - from, velocity: 84, stroke: 'down' }];
                }
                // The previous bar already played this chord early and tied it over its
                // first eighth.
                if (memory.pushed && index === 0) {
                    hits = hits.filter((h) => h.step >= TIE_STEPS);
                }
                const isLastSpan = to >= total;
                for (const hit of hits) {
                    let target = chord;
                    let length = Math.min(hit.length, to - hit.step);
                    const anticipates =
                        !hit.muted &&
                        isLastSpan &&
                        hit.step >= total - 2 &&
                        nextFirst?.attack &&
                        nextFirst.chord &&
                        nextFirst.chord.symbol !== chord.symbol &&
                        !span.fermata &&
                        // The final chord lands on its downbeat, never early.
                        !ctx.next?.plan.ending &&
                        rng.chance(book.push[tier]);
                    if (anticipates && nextFirst?.chord) {
                        target = nextFirst.chord;
                        length = total - hit.step + TIE_STEPS;
                        pushed = true;
                    }
                    planned.push({ ...hit, length, chord: target, early: target !== chord });
                }
            });
            spans.forEach(({ span, from }, index) => {
                if (!span.chord || index === 0) {
                    return;
                }
                // Anticipate a mid-bar change: the hit an eighth before it plays the new chord.
                if (book.pushInBar) {
                    for (const hit of planned) {
                        if (!hit.muted && hit.step >= from - TIE_STEPS && hit.step < from) {
                            hit.chord = span.chord;
                            hit.early = true;
                            hit.length = Math.max(hit.length, from - hit.step + TIE_STEPS);
                        }
                    }
                }
            });
            // Every chord the chart writes is struck at least once — a comping figure may
            // skip beats, but never a chord.
            spans.forEach(({ span, from, to }, index) => {
                const chord = span.chord;
                const tiedIn = index === 0 && (memory.pushed || !span.attack);
                if (!chord || tiedIn || span.fermata) {
                    return;
                }
                const struck = planned.some(
                    (h) =>
                        !h.muted && h.chord === chord && h.step >= from - TIE_STEPS && h.step < to,
                );
                if (!struck) {
                    // A scratch already on the chord's arrival gives way to the strike.
                    const clash = planned.findIndex((h) => h.step === from);
                    if (clash >= 0) {
                        planned.splice(clash, 1);
                    }
                    planned.push({
                        step: from,
                        length: Math.min(4, to - from),
                        velocity: 80,
                        stroke: shape ? 'down' : undefined,
                        chord,
                    });
                }
            });
            planned.sort((a, b) => a.step - b.step);
            const legato = ctx.instrument.legato && !book.percussive;
            if (legato) {
                // An organist holds a chord and presses again only when it changes: the comping
                // rhythm is for a struck instrument, and re-pressing a held organ chord on every
                // hit is a stutter, not a groove. So the organ presses on each chord's arrival
                // (or on a push just before it) and holds; `sustain` in perform.ts carries it
                // across barlines. An N.C. lets go, so the next chord is pressed anew.
                const kept = planned.filter((h) => h.early);
                let last = memory.pushed ? null : (memory.chord ?? null);
                spans.forEach(({ span, from, to }, index) => {
                    const chord = span.chord;
                    if (!chord) {
                        last = null;
                        return;
                    }
                    const tiedIn = index === 0 && (memory.pushed || !span.attack);
                    const pushed = kept.some(
                        (h) => h.chord === chord && h.step >= from - TIE_STEPS && h.step < from,
                    );
                    if (!tiedIn && !pushed && chord.symbol !== last && !span.fermata) {
                        kept.push({ step: from, length: to - from, velocity: 80, chord });
                    }
                    last = chord.symbol;
                });
                if (spans.some(({ span }) => span.fermata)) {
                    // A fermata's single held chord was planned above; keep it as it is.
                    kept.push(
                        ...planned.filter(
                            (h) =>
                                !h.early &&
                                spans.some(({ span, from }) => span.fermata && h.step === from),
                        ),
                    );
                }
                planned.splice(0, planned.length, ...kept.sort((a, b) => a.step - b.step));
            }
            let held: ChordFacts | null = null;
            let ahead = false;
            planned.forEach((hit, i) => {
                // A new strike cuts the chord before it: one hand, one chord at a time. A
                // sustaining instrument (the organ) holds each chord until that next strike.
                const next = planned[i + 1];
                // Only an anticipation rings over the barline (it is tied into the next bar);
                // anything else stops there, and the next bar decides what sounds.
                const room = next
                    ? next.step - hit.step
                    : hit.early
                      ? hit.length
                      : total - hit.step;
                const length = legato ? room : Math.min(hit.length, room);
                if (!shape) {
                    // A pianist re-voices every strike, leading from the last one.
                    prev = place(hit.chord, prev);
                } else if (!prev || (hit.chord !== held && (!hit.muted || !ahead))) {
                    // A guitarist holds a grip and moves to the next as its chord arrives, so a
                    // scratch on that chord's first sixteenth deadens the new shape. After an
                    // anticipation the hand already holds the next chord: a scratch deadens
                    // that, it never jumps back to the old shape for one sixteenth.
                    prev = place(hit.chord, prev);
                    held = hit.chord;
                }
                if (!hit.muted) {
                    ahead = !!hit.early;
                }
                if (hit.muted) {
                    chordAt(prev, hit.step, Math.min(length, 0.5), hit.velocity, hit);
                    return;
                }
                // An upstroke catches the top three strings; the downstroke carries the chord.
                const notes = hit.stroke === 'up' && prev.length > 3 ? prev.slice(-3) : prev;
                chordAt(notes, hit.step, length, hit.velocity, hit);
            });
            // What the hand holds going into the next bar: the last chord struck, unless the
            // bar ends in an N.C.
            const endsInRest = !bar.spans[bar.spans.length - 1]?.chord;
            const struck = planned.filter((h) => !h.muted).at(-1)?.chord.symbol ?? memory.chord;
            return {
                events,
                memory: { voicing: prev, pushed, chord: endsInRest ? null : (struck ?? null) },
            };
        },
    };
}

// ================================================================ guitars
// A guitarist's strumming hand swings like a pendulum on the grid it strums — down on the
// beat side of each pair, up on the offbeat — whether or not the pick touches the strings.
// That's why a strum's direction is a function of *where* it lands, not a choice.
export const pendulum = (step: number, grid: 1 | 2): 'down' | 'up' =>
    step % (2 * grid) === 0 ? 'down' : 'up';

/**
 * Reads a strum line, one char per sixteenth: `x` a strum (`X` accented), `-` a muted
 * scratch, `.` the hand passing without touching the strings. Directions come from the
 * pendulum, so a line can never ask for an impossible hand.
 */
export function strums(line: string, from: number, to: number, grid: 1 | 2, ring: number): Hit[] {
    const hits: Hit[] = [];
    for (let s = from; s < to && s < line.length; s++) {
        const c = line[s];
        if (c === '.') {
            continue;
        }
        if (c === '-') {
            // A muted scratch is still the pendulum's hand: a downstroke digs in with the
            // arm's weight, an upstroke is a lighter flick. The 14-point gap matches the
            // sounded strokes below (86 vs 72), centered on the old flat 44 so a style that
            // doesn't otherwise vary its scratch reads at the same average loudness (I3).
            hits.push({
                step: s,
                length: 0.5,
                velocity: pendulum(s, grid) === 'down' ? 50 : 36,
                stroke: pendulum(s, grid),
                muted: true,
            });
            continue;
        }
        const accent = c === 'X';
        hits.push({
            step: s,
            // How long a strum sounds before the hand releases it (a new strum cuts it anyway).
            length: ring,
            velocity: accent ? 100 : pendulum(s, grid) === 'down' ? 86 : 72,
            stroke: pendulum(s, grid),
        });
    }
    return hits;
}
