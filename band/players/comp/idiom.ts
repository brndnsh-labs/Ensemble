/**
 * The comping machinery, for keyboards and guitars. A style's book supplies a *rhythm* (where
 * the hand plays in a chord span); `compIdiom` does the rest the same way for every style:
 * voicing with voice leading (a keyboard voicing or a fretboard grip), anticipations that
 * tie the next bar's chord over the barline, N.C. rests, the ending.
 */
import { type EnergyTier, energyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import { type PitchedNote, PPQ } from '../../core/types.js';
import type { Bar } from '../../form/timeline.js';
import type { BarContext, PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import {
    at,
    BUTTON_LIFT,
    barSteps,
    dyn,
    ENDING_STRIKE,
    endingStrikes,
    STEP,
    spanSteps,
} from '../grid.js';
import { type GripShape, grip } from './fretboard.js';
import { endingKind, keyboardKind, type LeadOver, type VoicingKind, voice } from './voicing.js';

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
    /**
     * Where the last lead note heard ends (a tick): a note held over the barline, and whether
     * the lead's phrase is still live over the next bar (`keyboardKind`).
     */
    leadUntil?: number;
    /** The chord the hand last struck (its symbol), for an instrument that holds it. */
    chord?: string | null;
    /**
     * The chord (its symbol) the bar's last strike anticipated, tied over the barline into the
     * next bar's first eighth; null when it pushed nothing. Kept as the chord, not a flag, so
     * a bar that opens on another chord is never mistaken for tied in (#1507): a guard, since
     * a push is aimed at the next bar's first chord.
     */
    pushed: string | null;
    /** The bar this memory was left by (its index), to tell a bar that follows on from one
     * that doesn't (a loop's wrap, the bars the comp sat out). */
    bar?: number;
    /** A sustaining instrument struck its last chord after that bar's downbeat: it has been
     * held for less than a bar. */
    fresh?: boolean;
    /** The voicing the hands hold is a keyboard `spread` (two hands), led from its right
     * hand (`cost` in voicing.ts). */
    spread?: true;
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
    /**
     * A hit an eighth before a mid-bar chord change plays the new chord (bossa), tied over the
     * change: the chord's own hits under the tie (every hit, a scratch included) are dropped,
     * as at the barline, and the push holds for as long as the longest of them would have.
     * `'restrike'` keeps them, and the pushing hit plays at its written length when one is
     * there to take over: the figure hammers on through the change (the boogie pump).
     */
    pushInBar?: boolean | 'restrike';
    /**
     * The rhythm is the part even on a sustaining instrument: the organ plays the book's hits
     * as written, short, instead of pressing once per chord and holding (the reggae bubble).
     */
    percussive?: boolean;
    /**
     * A keyboard book that spreads its hands across the soloist's register (`spread`) keeps
     * its whole voicing under the line while the lead's phrase is live (`Placement.under` in
     * voicing.ts): two hands that open up in the soloist's gaps close up under the line, not
     * around it.
     */
    under?: boolean;
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
     * The fewest strikes lay-out leaves in a bar, a push counted as the strike it is: a
     * comper who is down to the chord's arrival alone has stopped keeping time (a sparse
     * figure thins to nothing otherwise).
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
            // The comp hears the lead before it plays (perform.ts), so each placement knows
            // which lead notes will sound over it, from the strike to where the hand lets go
            // (a step range in this bar), and sits under them (#2014).
            const leadFor = (sounds: readonly (readonly [number, number])[]) =>
                leadOver(
                    ctx.heard.lead,
                    sounds.map(([from, to]) => [at(bar, from), at(bar, to)] as const),
                );
            // Whether the keyboard voicing the hand holds is a spread: the next is led from
            // its right hand.
            let spread = !!memory.spread;
            // Whether the lead's phrase is live over this bar (`keyboardKind`): a lead note
            // sounds in it — struck here, or held into it — or sounded in the bar before. The
            // comp hears the whole bar's lead before it plays, so a strike before the line comes
            // in is played as the bar is; the bar before is carried in `leadUntil`.
            const live =
                ctx.heard.lead.length > 0 ||
                (memory.leadUntil !== undefined && memory.leadUntil > barBeforeStart(ctx, memory));
            const place = (
                chord: ChordFacts,
                prev: number[] | null,
                sounds: readonly (readonly [number, number])[] = [],
            ) => {
                const lead = leadFor(sounds);
                if (shape) {
                    return grip(chord, kindOf(chord), shape, prev, lead);
                }
                // why: the hands are chosen once for the bar, by the soloist's phrase, not by
                // each strike (`keyboardKind`): every strike in the bar — a chord struck twice,
                // a push over the barline — is played with the same hands (#2025). The held
                // ending's chord spreads wherever a spread fits under the line (`endingKind`).
                const kind =
                    plan.ending && live
                        ? endingKind(chord, kindOf(chord), lead, book.under)
                        : keyboardKind(chord, kindOf(chord), live);
                const placed = voice(chord, kind, prev, lead, {
                    prevSpread: spread,
                    live,
                    under: book.under,
                });
                spread = kind === 'spread';
                return placed;
            };
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
                chord?: ChordFacts,
            ) => {
                // An organ holds its chord and presses the same shape again (`again`): a voice
                // left out of one press and back in the next would blink, so it keeps them all.
                const holds = ctx.instrument.legato && !book.percussive;
                const sounded =
                    chord && !holds
                        ? leaveTheLeadItsNote(
                              midi,
                              chord,
                              ctx.heard.lead,
                              at(bar, step),
                              at(bar, step) + length * STEP,
                              { stroked: !!hit?.stroke, topOnly: !!shape?.openPosition },
                          )
                        : midi;
                for (const m of sounded) {
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
                // (a written stop cuts it, `perform.ts`). The style's gesture shapes the
                // strikes (`endingStrikes`, #2017): held, an eighth, a button, the hits.
                // why: a soft ending lets the chord go at a gentle 72, every other strikes it
                // with the band's 92 (the held ending's weight since #1482).
                const weight = plan.ending.kind === 'soft' ? 72 : ENDING_STRIKE;
                const strikes = endingStrikes(ctx);
                let held: string | null = null;
                for (const { span, from, to, first, accent } of strikes) {
                    const chord = span.chord!;
                    if (first) {
                        // One voicing a chord, placed under what the lead sings over each of its
                        // strikes; a re-strike (the button, a hit) presses the same shape again.
                        const sounds = strikes
                            .filter((s) => s.span === span)
                            .map((s) => [s.from, s.to] as const);
                        prev = place(chord, prev, sounds);
                    }
                    // The held ending sounds its whole chord: nothing is left to the lead.
                    chordAt(
                        prev!,
                        from,
                        to - from,
                        accent ? weight + BUTTON_LIFT : weight,
                        shape && { stroke: 'down' },
                    );
                    held = chord.symbol;
                }
                return {
                    events,
                    memory: {
                        voicing: prev,
                        pushed: null,
                        chord: held,
                        bar: bar.index,
                        ...(spread ? { spread: true as const } : {}),
                    },
                };
            }
            const legato = ctx.instrument.legato && !book.percussive;
            // The next bar is the next pass's: the looping song's wrap back to its top.
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
                        // The final chord lands on its downbeat, never early; so does a held
                        // one: the band hits a fermata together, on 1, with the crash (#2015
                        // found jazz's push arriving an eighth before the hold).
                        !nextFirst.fermata &&
                        !ctx.next?.plan.ending &&
                        // Nor into a bar the comp sits out (the drummer's four).
                        ctx.next?.plan.lanes.comp !== false &&
                        rng.chance(book.push[tier]) &&
                        // why: nor, on a sustaining instrument, into the next pass (the
                        // looping song's wrap). Its push would ring an eighth into
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
                // Not a held one: a fermata is struck on its beat, together.
                if (book.pushInBar && !span.fermata) {
                    const restrikes = book.pushInBar === 'restrike';
                    // A restriking book's own hit on the change, when its figure has one, is
                    // the arrival: the push is its pickup and plays as written (the pump's
                    // "and" is a short eighth before its beat). With none there the push is the
                    // arrival and ties over the change like any other, until the line's next
                    // pick cuts it (a pair on the "and" rings into one on the "e").
                    const restruck = restrikes && planned.some((h) => h.step === from);
                    const pushes: Planned[] = [];
                    for (const hit of planned) {
                        if (!hit.muted && hit.step >= from - TIE_STEPS && hit.step < from) {
                            hit.chord = span.chord;
                            hit.early = true;
                            if (!restruck) {
                                hit.length = Math.max(hit.length, from - hit.step + TIE_STEPS);
                            }
                            pushes.push(hit);
                        }
                    }
                    // The pushed chord ties over the change, so the span's own hits under the
                    // tie (its first eighth) go, as the barline push drops the next bar's
                    // (`pushedIn`). Struck again on the beat, the push would be a stab cut short
                    // and the chord hit twice, "ba-DAHM" (#2171). The push takes over the
                    // dropped hit's length: a stab stays a stab, and a chord the figure held to
                    // the span's end is held there by the push instead of ringing an eighth and
                    // leaving silence. Unless the book restrikes: a figure that hammers every
                    // eighth (the boogie pump) plays through the change, and a hole on the beat
                    // would break its pump.
                    if (pushes.length && !restrikes) {
                        for (let k = planned.length - 1; k >= 0; k--) {
                            const { step, length } = planned[k];
                            if (step >= from && step < from + TIE_STEPS) {
                                for (const push of pushes) {
                                    push.length = Math.max(push.length, step + length - push.step);
                                }
                                planned.splice(k, 1);
                            }
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
            // How long a planned strike sounds (in steps). A new strike cuts the chord before
            // it: one hand, one chord at a time. A sustaining instrument (the organ) holds each
            // chord until that next strike. Only an anticipation rings over the barline (it is
            // tied into the next bar); anything else stops there, and the next bar decides
            // what sounds.
            const lengthOf = (k: number) => {
                const hit = planned[k];
                const next = planned[k + 1];
                const room = next
                    ? next.step - hit.step
                    : hit.early
                      ? hit.length
                      : total - hit.step;
                return legato ? room : Math.min(hit.length, room);
            };
            // The strikes of one chord from planned hit `i` on, as step ranges: until a strike on
            // another chord (a scratch is pitchless).
            const soundsFrom = (i: number) => {
                const sounds: [number, number][] = [];
                for (let k = i; k < planned.length && planned[k].chord === planned[i].chord; k++) {
                    if (!planned[k].muted) {
                        sounds.push([planned[k].step, planned[k].step + lengthOf(k)]);
                    }
                }
                return sounds;
            };
            planned.forEach((hit, i) => {
                const length = lengthOf(i);
                if (!shape) {
                    // A pianist re-voices every strike, leading from the last one (with the bar's
                    // hands: `place`). An organ re-articulating the chord it holds keeps its
                    // shape.
                    prev =
                        hit.again && prev
                            ? prev
                            : place(hit.chord, prev, [[hit.step, hit.step + length]]);
                } else if (!prev || (hit.chord !== held && (!hit.muted || !ahead))) {
                    // A guitarist holds a grip and moves to the next as its chord arrives, so a
                    // scratch on that chord's first sixteenth deadens the new shape. After an
                    // anticipation the hand already holds the next chord: a scratch deadens
                    // that, it never jumps back to the old shape for one sixteenth.
                    // The grip sounds at each strike until one on another chord: those
                    // strikes are what the lead hears it against (a scratch is pitchless).
                    prev = place(hit.chord, prev, soundsFrom(i));
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
                chordAt(notes, hit.step, length, hit.velocity, hit, hit.chord);
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
                    ...(spread ? { spread: true as const } : {}),
                },
            };
        },
    };
}

/**
 * A strike's voices, less those the lead sits on (#2014): a voice on the lead's very pitch for
 * half the strike, or for a beat, is left out — the soloist is playing that note, and a unison
 * under it smears the line into the chord. The voicing search (`leadCost`) avoids most of
 * them; this takes what it couldn't, when the line moves too much under one chord to clear.
 * A guide tone stays (the chord must still name itself), as does the bottom voice, and at
 * least two voices sound. A guitar just doesn't sound that string: a grip less a string is
 * still a grip — but a strummed open-position chord rings as its shape, so only its top
 * string gives way. (An organ, which holds, keeps every voice: see the caller.)
 *
 * One exception, on a stroked guitar: a three-string chord whose guide tone the lead holds
 * right through the strike becomes a double-stop of the other two, provided they keep the
 * other guide tone (disco's 3-7-9 chuck under a sax holding the 3rd plays its b7 and 9). The
 * grip can't dodge there — high on the neck, the 3rd has nowhere else to go — and the band
 * still sounds the whole chord: the 3rd is in the lead.
 */
function leaveTheLeadItsNote(
    notes: number[],
    chord: ChordFacts,
    lead: readonly PitchedNote[],
    from: number,
    to: number,
    { stroked, topOnly }: { stroked: boolean; topOnly: boolean },
): number[] {
    if (!lead.length || notes.length <= 2) {
        return notes;
    }
    const bottom = Math.min(...notes);
    const guides = new Set(chord.guides.map((g) => mod12(chord.root + g)));
    const unisonOn = (m: number) => {
        let unison = 0;
        for (const l of lead) {
            if (l.midi === m) {
                unison += Math.max(0, Math.min(to, l.tick + l.dur) - Math.max(from, l.tick));
            }
        }
        return unison;
    };
    let kept = notes;
    // Top voice first: the one most in the lead's way.
    for (const m of [...notes].sort((a, b) => b - a)) {
        if (
            kept.length <= 2 ||
            m === bottom ||
            guides.has(mod12(m)) ||
            (topOnly && m !== Math.max(...notes))
        ) {
            continue;
        }
        const unison = unisonOn(m);
        // why: half the strike, or a beat — a lead note that only brushes the chord (a
        // passing eighth across a held strike) leaves the voice where it is; one the line sits
        // on, or holds for a beat under a long chord, takes it.
        if (unison * 2 >= to - from || unison >= PPQ) {
            kept = kept.filter((k) => k !== m);
        }
    }
    if (stroked && !topOnly && kept.length === 3) {
        const held = kept.find((m) => guides.has(mod12(m)) && unisonOn(m) >= to - from);
        const pair = kept.filter((m) => m !== held);
        if (held !== undefined && pair.some((m) => guides.has(mod12(m)))) {
            return pair;
        }
    }
    return kept;
}

/**
 * The lead notes sounding while a placement does (tick ranges: its strikes), each with the
 * share of that time it sounds over it (`leadCost` in voicing.ts). The same pitch struck
 * twice adds up.
 */
function leadOver(
    lead: readonly PitchedNote[],
    sounds: readonly (readonly [number, number])[],
): LeadOver[] {
    const span = sounds.reduce((sum, [from, to]) => sum + Math.max(0, to - from), 0);
    if (span <= 0 || !lead.length) {
        return [];
    }
    const shares = new Map<number, number>();
    for (const l of lead) {
        for (const [from, to] of sounds) {
            const overlap = Math.min(to, l.tick + l.dur) - Math.max(from, l.tick);
            if (overlap > 0) {
                shares.set(l.midi, (shares.get(l.midi) ?? 0) + overlap / span);
            }
        }
    }
    return [...shares].map(([midi, share]) => ({ midi, share }));
}

/**
 * Where the bar before this one in the performance began, in this bar's ticks: the bar the
 * comp's memory was left by (`CompMemory.bar`), its own length back from this barline — so a
 * change of meter at the barline is measured from the bar that was played, and so is a loop's
 * wrap, where `rebase` has moved `leadUntil` into the new lap's ticks and the lap's last bar
 * ends at this one's start. With no bar remembered, this bar's own length back.
 */
function barBeforeStart(ctx: BarContext, memory: CompMemory): number {
    const before = memory.bar === undefined ? undefined : ctx.timeline.bars[memory.bar];
    return ctx.bar.start - (before ?? ctx.bar).meter.barTicks;
}

/**
 * Is the bar's first chord tied in from an anticipation — struck at the end of the bar before
 * and ringing over the barline — so that its downbeat is not struck again? Only when the
 * chord pushed is the chord the bar opens on (#1507): a push aimed at another chord is not
 * this bar's.
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
    const recent = memory.leadUntil !== undefined && memory.leadUntil > barBeforeStart(ctx, memory);
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
            // why: a push is a strike the comper made (the chord is struck, an eighth early),
            // so it counts toward the floor (#2186), and it is never laid out (`hit.early`), so
            // the strike it counts for stays. Counted out, a pushed bar sat a strike above an
            // unpushed one: a barline push is added on top of the figure (`PUSH_SETUP`), so
            // its bar kept one strike more; a mid-bar push takes over its tied-over on-beat hit
            // (#2171), so its bar sat at the floor and could not thin. A chord's first strike
            // stays whatever the count (`firsts`), so no bar empties.
            planned.filter((h) => !h.muted).length <= (book.answer.keep ?? 0)
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
