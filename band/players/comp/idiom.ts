/**
 * The comping machinery, for keyboards and guitars. A style's book supplies a *rhythm* (where
 * the hand plays in a chord span); `compIdiom` does the rest the same way for every style:
 * voicing with voice leading (a keyboard voicing or a fretboard grip), anticipations that
 * tie the next bar's chord over the barline, N.C. rests, the ending.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { Bar } from '../../form/timeline.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { at, barSteps, dyn, endingSpans, STEP, spanSteps } from '../grid.js';
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
    /** Where the last lead note heard ends (a tick): a note held over the barline. */
    leadUntil?: number;
    /** The chord the hand last struck (its symbol), for an instrument that holds it. */
    chord?: string | null;
    /**
     * The chord (its symbol) the bar's last strike anticipated, tied over the barline into the
     * next bar's first eighth; null when it pushed nothing. Kept as the chord, not a flag, so
     * a bar that turns out to play another chord (a practice loop released into the bar after
     * it, where the push was aimed at the loop's top) is not mistaken for tied in (#1507).
     */
    pushed: string | null;
    /** The bar this memory was left by (its index), to tell a bar that follows on from one
     * that doesn't (a loop's wrap, the bars the comp sat out). */
    bar?: number;
    /** A sustaining instrument struck its last chord after that bar's downbeat: it has been
     * held for less than a bar. */
    fresh?: boolean;
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
    /**
     * A conversational comp answers the lead (see `Answer`). A book without one is a groove:
     * its figure is the part, lead or no lead.
     */
    answer?: Answer;
}

/**
 * How a comper converses with a soloist: out of the way while the line moves, in the holes
 * when it breathes. Only a style whose comp is a conversation (jazz, a Rhodes, a blues
 * pianist) has one; a strummed or chopped groove keeps its figure under the lead.
 */
export interface Answer {
    /** Chance that a strike under a sounding lead note lays out (never a chord's arrival). */
    layOut: number;
    /** Chance of a stab in a breath the lead leaves that the figure left empty. */
    fill: number;
    /**
     * A strike that lays out lets the one before ring on instead (a Rhodes holds its chord
     * under the singer); without it the hand simply doesn't play (a pianist's short stabs).
     */
    hold?: boolean;
    /**
     * The fewest strikes lay-out leaves in a bar: a comper who is down to the chord's
     * arrival alone has stopped keeping time (a sparse figure thins to nothing otherwise).
     */
    keep?: number;
}

/** A breath worth answering: a dotted quarter without the lead (in sixteenths). */
const BREATH_STEPS = 6;
/** How much louder a strike answering the lead plays: it speaks up in the hole. */
const ANSWER_LIFT = 8;

export function compIdiom(book: CompBook): PitchedIdiom {
    return {
        name: book.name,
        percussive: book.percussive,
        init: (): CompMemory => ({ voicing: null, pushed: null }),
        // Where the lead's last note ends is a song tick: across a loop's wrap it is moved into
        // the new lap's ticks, so a note that ended just before the wrap ended just before
        // the lap's top, not far in its future (#1492).
        rebase: (memory: CompMemory, ticks: number): CompMemory =>
            memory.leadUntil === undefined
                ? memory
                : { ...memory, leadUntil: memory.leadUntil + ticks },
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
                // The held ending's chord: a final turnaround is already the tonic here, in the
                // style's quality (`arrange/ending.ts`), the same chord the bass holds. A bar
                // that gets home itself (`| G7 C |`) strikes each chord where it is written,
                // the V on 1 and the I held from 3 (#1502); the last rings to the bar's end
                // (a written stop cuts it, `perform.ts`).
                const spans = endingSpans(ctx);
                let held: string | null = null;
                spans.forEach(({ span, from, to }, i) => {
                    if (!span.chord) {
                        return;
                    }
                    prev = place(span.chord, prev);
                    const until = spans[i + 1]?.span.chord ? to : total;
                    chordAt(prev, from, until - from, 92, shape && { stroke: 'down' });
                    held = span.chord.symbol;
                });
                return {
                    events,
                    memory: { voicing: prev, pushed: null, chord: held, bar: bar.index },
                };
            }
            const legato = ctx.instrument.legato && !book.percussive;
            // The next bar is the next pass's: a loop's wrap back to its top, or the song a
            // released loop leads on into.
            const wraps = !!ctx.next?.wraps;
            const nextFirst = ctx.next?.bar.spans[0];
            let pushed: string | null = null;
            // The bar before struck this bar's first chord early: it rings in, tied.
            const pushedIn = tiedFromPush(memory, bar);
            const planned: Planned[] = [];
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
                if (pushedIn && index === 0) {
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
                        // Nor into a bar the comp sits out (the drummer's four).
                        ctx.next?.plan.lanes.comp !== false &&
                        rng.chance(book.push[tier]) &&
                        // why: nor, on a sustaining instrument, into the next pass (a loop's
                        // wrap, or a released loop's song). Its push would ring an eighth into
                        // the next lap and stop (a pass holds nothing past its end), and that
                        // lap, tied in, would press nothing: the top of every lap silent
                        // (#1488). It lands on the downbeat.
                        // (Drawn first, so every other strike's chance is unchanged.)
                        !(legato && wraps);
                    if (anticipates && nextFirst?.chord) {
                        target = nextFirst.chord;
                        length = total - hit.step + TIE_STEPS;
                        pushed = nextFirst.chord.symbol;
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
                const tiedIn = index === 0 && (pushedIn || !span.attack);
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
            let fresh = false;
            const leadUntil = answerLead(ctx, book, planned, spans, memory, legato);
            if (legato) {
                // An organist holds a chord and presses again only when it changes: the comping
                // rhythm is for a struck instrument, and re-pressing a held organ chord on every
                // hit is a stutter, not a groove. So the organ presses on each chord's arrival
                // (or on a push just before it) and holds; `sustain` in perform.ts carries it
                // across barlines. An N.C. lets go, so the next chord is pressed anew. And a
                // chord still held at the top of a phrase is pressed anew (#1488): an organist
                // re-articulates a long vamp at each phrase, and so at each section, at the top
                // of each lap of a loop and of each chorus of a counted chart (#1475), where
                // the form starts over.
                // why: one chord tied silently through a 32-bar vamp is not how the organ is
                // played, and a loop's next lap has nothing else to press it. At the phrase's
                // first bar only (phrases are 3–6 bars), so the hold never runs past a phrase.
                // Only a chord held for a bar or more: one struck after the last bar's downbeat
                // (`fresh`, a change on beat 3, a written anticipation) is still sounding new,
                // and pressing it again a beat or two later is a stutter. Keyed on the bar's
                // place in the form, so lap k and chorus k press in the same bars. The chord
                // the hand already holds is pressed again in the same shape (`again`): lifted
                // and put back down, not re-voiced.
                // An anticipation is one press, held into its chord. A figure with two strikes
                // in the push's eighth (disco's 14 and 15) plays both as pushes of the same chord;
                // why: an organist presses it once and holds it — pressing it again a sixteenth
                // later is the stutter this path exists to avoid (#1510). The first is kept.
                // Only within that eighth: the same chord pushed again further on (a bar that
                // changes to it twice, `C:1 F:1 C:1 F:1`) is a new arrival, pressed anew.
                const kept: Planned[] = [];
                for (const h of planned) {
                    const before = kept.at(-1);
                    const same =
                        before?.chord.symbol === h.chord.symbol && h.step - before.step < TIE_STEPS;
                    if (h.early && !same) {
                        kept.push(h);
                    }
                }
                const phraseTop = ctx.bar.phrase.bar === 0 && !memory.fresh;
                // The hand let go since the last bar it played — a loop's wrap back to its top,
                // or bars the comp sat out, where `sustain` ends the hold: whatever it last
                // struck no longer sounds, so this bar's chord is pressed, changed or not.
                const resumed = memory.bar !== undefined && memory.bar !== bar.index - 1;
                const holding = memory.pushed ? null : (memory.chord ?? null);
                let last = phraseTop || resumed ? null : holding;
                spans.forEach(({ span, from, to }, index) => {
                    const chord = span.chord;
                    if (!chord) {
                        last = null;
                        return;
                    }
                    // A chord held into the bar by a written hold (`/`) is pressed again at a
                    // phrase top too: a vamp written with slashes is the same vamp.
                    const tiedIn =
                        index === 0 && !resumed && (pushedIn || (!span.attack && !phraseTop));
                    const pushed = kept.some(
                        (h) => h.chord === chord && h.step >= from - TIE_STEPS && h.step < from,
                    );
                    if (!tiedIn && !pushed && chord.symbol !== last && !span.fermata) {
                        const again = index === 0 && chord.symbol === holding;
                        kept.push({
                            step: from,
                            length: to - from,
                            velocity: 80,
                            chord,
                            ...(again ? { again } : {}),
                        });
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
                fresh = (planned.at(-1)?.step ?? 0) > 0;
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
                    // A pianist re-voices every strike, leading from the last one. An organ
                    // re-articulating the chord it holds keeps its shape.
                    prev = hit.again && prev ? prev : place(hit.chord, prev);
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
                memory: {
                    voicing: prev,
                    pushed,
                    chord: endsInRest ? null : (struck ?? null),
                    ...(leadUntil !== undefined ? { leadUntil } : {}),
                    bar: bar.index,
                    ...(fresh ? { fresh } : {}),
                },
            };
        },
    };
}

/**
 * Is the bar's first chord tied in from an anticipation — struck at the end of the bar before
 * and ringing over the barline — so that its downbeat is not struck again? Only when the
 * chord pushed is the chord the bar opens on (#1507): a practice loop released into the bar
 * after it carries a push aimed at the loop's top, and that chord is not this bar's.
 */
export function tiedFromPush(memory: { pushed?: string | null }, bar: Bar): boolean {
    return !!memory.pushed && memory.pushed === bar.spans[0]?.chord?.symbol;
}

/**
 * A planned hit: `early` plays the next chord ahead of its arrival (an anticipation); `again`
 * presses the chord the organ already holds once more, in its shape (a phrase's re-press).
 */
type Planned = Hit & { chord: ChordFacts; early?: boolean; again?: boolean };

/**
 * The comp answers the lead, in place on the bar's planned hits: a strike under a note the
 * lead is sounding may lay out, and a breath the lead leaves gets a strike, the figure's own
 * (played up) or a stab on the offbeat after the lead lets go. A chord's first strike is
 * never dropped, so every chord is still struck. Returns where the last lead note heard ends, for
 * the next bars; with no lead, nothing changes and nothing is drawn.
 */
function answerLead(
    ctx: BarContext,
    book: CompBook,
    planned: Planned[],
    spans: ReturnType<typeof spanSteps>,
    memory: CompMemory,
    legato: boolean,
): number | undefined {
    const lead = ctx.heard.lead;
    const { bar } = ctx;
    const carried = memory.leadUntil !== undefined && memory.leadUntil > bar.start;
    // A bar the lead sits out right after it played is a breath too (the classic place to
    // answer); one further on is the lead resting by form (an intro), with nothing to answer.
    const recent =
        memory.leadUntil !== undefined && memory.leadUntil > bar.start - bar.meter.barTicks;
    const leadUntil = lead.length ? Math.max(...lead.map((n) => n.tick + n.dur)) : memory.leadUntil;
    // An organ holds its chords (its presses are the arrivals), and a groove keeps its figure.
    if (!book.answer || legato || (!lead.length && !recent)) {
        return leadUntil;
    }
    const total = barSteps(bar);
    const sounding: boolean[] = Array.from({ length: total }, (_, s) => {
        const from = at(bar, s);
        const to = from + STEP;
        return (
            (carried && (memory.leadUntil ?? 0) > from) ||
            lead.some((n) => n.tick < to && n.tick + n.dur > from)
        );
    });
    const rng = ctx.rng('answer');
    // Each chord's first strike stays, wherever the figure puts it (a reverse Charleston
    // strikes on the "and"): the comp may skip beats, never a chord.
    const firsts = new Set(
        spans.flatMap(({ span }) => {
            const first = planned.find((h) => !h.muted && h.chord === span.chord);
            return first ? [first] : [];
        }),
    );
    // Out of the way while the line moves.
    for (let i = planned.length - 1; i >= 0; i--) {
        const hit = planned[i];
        if (
            hit.muted ||
            hit.early ||
            firsts.has(hit) ||
            !sounding[hit.step] ||
            !rng.chance(book.answer.layOut) ||
            planned.filter((h) => !h.muted && !h.early).length <= (book.answer.keep ?? 0)
        ) {
            continue;
        }
        planned.splice(i, 1);
        if (book.answer.hold) {
            // A held-chord instrument leans back rather than going quiet: the strike before
            // (the same chord) rings on through the one it gave up.
            const before = planned
                .slice(0, i)
                .reverse()
                .find((h) => !h.muted && h.chord === hit.chord);
            if (before) {
                before.length = Math.max(before.length, hit.step + hit.length - before.step);
            }
        }
    }
    // Where a chord changes, the eighth before it belongs to the new chord (a push), so a
    // stab there would strike the old one: the last span's end is the next bar's chord.
    const pushZone = (x: number) =>
        spans.some(({ to }) => x >= to - TIE_STEPS && x < to && to < total) ||
        x >= total - TIE_STEPS;
    // A breath that began in the bar before (the lead let go before the barline) counts its
    // silence there too, so a phrase end across the barline is heard as one breath.
    const before =
        !carried && memory.leadUntil !== undefined
            ? Math.max(0, Math.round((bar.start - memory.leadUntil) / STEP))
            : 0;
    // In the holes when it breathes.
    for (let s = 0; s < total; ) {
        if (sounding[s]) {
            s++;
            continue;
        }
        let end = s;
        while (end < total && !sounding[end]) {
            end++;
        }
        if (end - s + (s === 0 ? before : 0) >= BREATH_STEPS) {
            // A chord's own first strike isn't an answer (it would be there anyway), nor is a
            // push, which is the figure's own accent.
            const inside = planned.filter(
                (h) => !h.muted && !h.early && !firsts.has(h) && h.step >= s && h.step < end,
            );
            if (inside.length) {
                inside[0].velocity += ANSWER_LIFT;
            } else if (rng.chance(book.answer.fill)) {
                // On the first offbeat eighth at least an eighth after the lead lets go, a
                // quarter clear of the strikes already there (an "and" straight after a
                // struck beat is a stutter, not an answer), and never on a change's push.
                const step = Array.from({ length: end - s }, (_, k) => s + k).find(
                    (x) =>
                        x % 4 === 2 &&
                        (s === 0 || x >= s + 2) &&
                        !pushZone(x) &&
                        !planned.some((h) => Math.abs(h.step - x) < 4),
                );
                const chord =
                    step === undefined
                        ? null
                        : spans.find(({ from, to }) => step >= from && step < to)?.span.chord;
                if (step !== undefined && chord) {
                    planned.push({
                        step,
                        length: Math.min(2, end - step),
                        velocity: 84 + ANSWER_LIFT,
                        chord,
                    });
                    planned.sort((a, b) => a.step - b.step);
                }
            }
        }
        s = end;
    }
    return leadUntil;
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
