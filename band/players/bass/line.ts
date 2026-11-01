/** Shared bass-line craft: register, octave choice, approach notes. */
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { Bar, BarSpan } from '../../form/timeline.js';
import type { BarContext } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12, nearestMidi } from '../../theory/pitch.js';
import { at, barSteps, endingSpans, STEP } from '../grid.js';

/**
 * The bass register (MIDI). Hard limits sit inside the band's slot (23–57); `home` is the
 * middle of a 4-string bass, where lines return after climbing or diving.
 */
export const BASS = { lo: 28, hi: 52, home: 38 } as const;

/** The sounding bass pitch class of a chord: the slash note when there is one. */
export const bassPc = (chord: ChordFacts): number => chord.bass;

/** Place a pitch class near the previous note, drifting back toward home when far away. */
export function place(pc: number, prev: number | null): number {
    const anchor = prev === null ? BASS.home : prev + (BASS.home - prev) * 0.35;
    return nearestMidi(pc, Math.round(anchor), BASS.lo, BASS.hi);
}

/**
 * Place a root for an ostinato line (rock, funk, bossa): in one register for the whole
 * section, so a riff keeps its octave from bar to bar instead of drifting with the last note.
 */
export function sectionPlace(ctx: BarContext, pc: number): number {
    const anchor = BASS.home - 2 + ctx.rng('register', 'section').int(5);
    return nearestMidi(pc, anchor, BASS.lo, BASS.hi);
}

export type ApproachKind = 'chromatic-below' | 'chromatic-above' | 'dominant' | 'scale';

/**
 * A note one beat before `target` that leads into it: a half step below or above, the
 * target's fifth (a V→I in miniature), or the scale tone of the current chord nearest it.
 */
export function approach(target: number, chord: ChordFacts | null, kind: ApproachKind): number {
    const clampIn = (m: number) => (m < BASS.lo ? m + 12 : m > BASS.hi ? m - 12 : m);
    switch (kind) {
        case 'chromatic-below':
            // At the floor the half step below would wrap an octave up: lead in from above.
            return target - 1 < BASS.lo ? target + 1 : clampIn(target - 1);
        case 'chromatic-above':
            return target + 1 > BASS.hi ? target - 1 : clampIn(target + 1);
        case 'dominant':
            return clampIn(target + 7 > BASS.hi ? target - 5 : target + 7);
        case 'scale': {
            if (!chord) {
                return clampIn(target - 2);
            }
            const candidates = [target - 2, target - 1, target + 1, target + 2].filter((m) =>
                chord.scale.includes(mod12(m - chord.root)),
            );
            return clampIn(candidates[0] ?? target - 2);
        }
    }
}

export function pickApproach(rng: Rng, jazz: boolean): ApproachKind {
    return rng.weighted<ApproachKind>([
        ['chromatic-below', jazz ? 4 : 2],
        ['chromatic-above', jazz ? 3 : 1],
        ['dominant', jazz ? 2 : 3],
        ['scale', jazz ? 3 : 3],
    ]);
}

/** The top of the bass lane's register slot. */
export const BASS_SLOT_HI = 57;

export function bassNote(
    bar: Bar,
    step: number,
    pitch: number,
    steps: number,
    velocity: number,
    muted = false,
): PitchedNote {
    // Octave pops and fifths above a high root fold back into the slot.
    let midi = pitch;
    while (midi > BASS_SLOT_HI) {
        midi -= 12;
    }
    while (midi < 23) {
        midi += 12;
    }
    return {
        lane: 'bass',
        tick: at(bar, step),
        dur: Math.max(STEP / 2, steps * STEP),
        midi,
        velocity,
        offsetMs: 0,
        bar: bar.index,
        ...(muted ? { muted: true } : {}),
    };
}

/**
 * The held ending's bass (`plan.ending`, `arrange/ending.ts`): one note on each chord the
 * ending bar strikes (`endingSpans`), held to the next — the resolved tonic alone on the
 * downbeat, or a written `| G7 C |`'s V on 1 and its I from 3 (#1502). A chord on the same
 * bass note as the one before (`Csus4 Cmaj7`) is no new note: the bass holds its root while
 * the chord resolves above it. `pitch` places a chord's bass note as the style's line would
 * (near `prev`, the note before it); `steps` caps how long a note rings (funk's short ending).
 * Returns the notes and the last pitch placed.
 */
export function endingBass(
    ctx: BarContext,
    pitch: (chord: ChordFacts, prev: number | null) => number,
    prev: number | null,
    velocity: number,
    steps = Number.POSITIVE_INFINITY,
): { events: PitchedNote[]; last: number | null } {
    const { bar } = ctx;
    // Each struck note: where it starts, its pitch, and the step it rings to.
    const notes: { from: number; midi: number; to: number }[] = [];
    let last = prev;
    const spans = endingSpans(ctx);
    spans.forEach(({ span, from, to }, i) => {
        const chord = span.chord;
        if (!chord) {
            return;
        }
        // The last chord rings on to the bar's end (the band's last barline), cut short only by
        // a written stop (`perform.ts`); a chord before it rings until the next is struck.
        const until = spans[i + 1]?.span.chord ? to : barSteps(bar);
        const midi = pitch(chord, last);
        const held = notes.at(-1);
        // (A bass that plays the ending as short hits, funk's, strikes it again instead: held
        // through, its note would stop before the chord it is under resolves.)
        if (
            held &&
            held.to === from &&
            mod12(held.midi) === mod12(midi) &&
            until - held.from <= steps
        ) {
            held.to = until;
            return;
        }
        notes.push({ from, midi, to: until });
        last = midi;
    });
    return {
        events: notes.map((n) =>
            bassNote(bar, n.from, n.midi, Math.min(steps, n.to - n.from), velocity),
        ),
        last,
    };
}

/**
 * The chord the line is heading to after this bar's spans: the next bar's first chord,
 * wrapping when the song loops. Null when the next bar starts on N.C., the song ends, or the
 * band sits the next bar out (the drummer's four): there is nothing to approach. (A guitar
 * with no bassist walks into the next chord itself, so the comp alone still counts.)
 */
export function nextChord(ctx: BarContext): ChordFacts | null {
    if (ctx.next && !ctx.next.plan.lanes.bass && !ctx.next.plan.lanes.comp) {
        return null;
    }
    const first: BarSpan | undefined = ctx.next?.bar.spans[0];
    return first?.chord ?? null;
}

/** Steps where the kick plays in this bar (from what the drummer already played). */
export function kickSteps(ctx: BarContext): Set<number> {
    return new Set(
        ctx.heard.drums
            .filter((h) => h.piece === 'kick' && h.velocity > 45)
            .map((h) => Math.round((h.tick - ctx.bar.start) / STEP)),
    );
}

export interface LineMemory {
    last: number | null;
    /**
     * Where a lead-in across a section change told the next bar to land: the next section
     * places its roots in its own register, which this bar cannot know, so the lead-in
     * promises a pitch and the next bar keeps it (`landingRoot`).
     */
    land?: number | null;
}

/** How a style places a chord's root for its line, in the register of this bar's section. */
export type RootPlacer = (ctx: BarContext, pc: number) => number;

/**
 * The pitch the line will actually play when it reaches the chord after span `i` — the note a
 * lead-in must aim at. The next span (or the next bar, in one section) places its root with
 * the same `placeRoot`; `crossing` marks a section change, where the next bar's register is
 * its own and the caller must hand the target on as `land`.
 */
export function leadTarget(
    ctx: BarContext,
    spans: { span: BarSpan }[],
    i: number,
    next: ChordFacts | null,
    placeRoot: RootPlacer,
): { target: number; crossing: boolean } | null {
    const inBar = spans[i + 1]?.span.chord ?? null;
    const following = inBar ?? (i === spans.length - 1 ? next : null);
    if (!following) {
        return null;
    }
    const crossing =
        inBar === null &&
        ctx.next !== null &&
        ctx.next.bar.visit.sectionIndex !== ctx.bar.visit.sectionIndex;
    return { target: placeRoot(ctx, bassPc(following)), crossing };
}

/** A chord's root for the line: where the last bar's lead-in promised (`land`), else placed. */
export function landingRoot(
    ctx: BarContext,
    memory: LineMemory,
    i: number,
    pc: number,
    placeRoot: RootPlacer,
): number {
    const land = memory.land ?? null;
    return i === 0 && land !== null && mod12(land) === pc ? land : placeRoot(ctx, pc);
}

/** A note a half or whole step (by pitch class) from the root it leads into, not that root's own octave. */
export function isLeadIn(midi: number, target: number): boolean {
    const gap = mod12(midi - target);
    return gap !== 0 && (gap <= 2 || gap >= 10);
}

/**
 * A lead-in more than a fifth from the root it leads into folds an octave to sit beside it.
 * Played where it stands it is a leading tone on paper, yet the ear hears a wrong note or a
 * leap, not a lead-in. Any other note, and the root's own octave (a pump), stays where it is.
 */
export function meetRoot(midi: number, target: number): number {
    if (!isLeadIn(midi, target) || Math.abs(midi - target) <= 7) {
        return midi;
    }
    const gap = mod12(midi - target);
    return target + (gap <= 2 ? gap : gap - 12);
}
