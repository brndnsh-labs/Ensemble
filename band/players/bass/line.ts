/** Shared bass-line craft: register, octave choice, approach notes. */
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { Bar, BarSpan } from '../../form/timeline.js';
import type { BarContext } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12, nearestMidi } from '../../theory/pitch.js';
import { at, BUTTON_LIFT, endingSpans, endingStrikes, STEP } from '../grid.js';

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
export function approach(
    target: number,
    chord: ChordFacts | null,
    kind: ApproachKind,
    floored = false,
): number {
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
            // why: at the floor (a low E, #2178) the step below is off the instrument, and
            // folded up an octave it is a leap, not a lead-in: `floored`, the first step on
            // the instrument is taken, from above where need be, as the chromatic cases do.
            // Only an ending's approach into the low root asks for it: the lines' own
            // approaches at the floor keep their fold until that is decided for them.
            const played = floored ? candidates.find((m) => m >= BASS.lo && m <= BASS.hi) : null;
            return clampIn(played ?? candidates[0] ?? target - 2);
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
 * The lowest note of pitch class `pc` the bass line plays (`BASS.lo`, the E string open). `pc`
 * is the sounding bass note's class (`bassPc`: a slash chord's slash note, `C/E`'s E), so the
 * "root" here is what the bass stands on, not the chord's.
 */
export function lowestRoot(pc: number): number {
    return BASS.lo + mod12(pc - BASS.lo);
}

/**
 * Where a line aims its approach into an ending (#2178): the low root (`endingRoot`) when the
 * approach to it sits within an octave of the line's note before it (`near`) — why: a
 * chromatic approach reached by a two-octave drop (A2 C3 E3, then F#1 → G1) is a leap, not a
 * lead-in — else the line's own placement (`own`), which the ending then lands on: `promise`
 * is handed on as the style's `land` and to `endingBass` as `promised`. Null where this is not
 * the bar before an ending: the line approaches as it always has, and promises nothing.
 */
export function endingAim(
    ctx: BarContext,
    own: number,
    near: number | null,
): { target: number; promise: number } | null {
    const low = endingRoot(ctx);
    if (low === null) {
        return null;
    }
    const target = near === null || Math.abs(low - near) <= 12 ? low : own;
    return { target, promise: target };
}

/**
 * The root the bar before an ending aims at (#2178): the ending bar's bass note, low
 * (`lowestRoot`), when that bar is the next one (`ctx.next.plan.ending`) and holds its final
 * chord from its downbeat (a resolved turnaround, a last bar already home, a fermata's chord).
 * why: the ending's last note goes low (`endingBass`), so an approach aimed where the line's
 * own placement would put the root (an octave up, `place`) resolved by a leap; aimed here, a
 * step approach lands by step. Null elsewhere: not the bar before an ending, or an ending bar
 * that gets home itself (`| G7 C |`): the V is approached as the line places it, and the I
 * goes low from there.
 */
function endingRoot(ctx: BarContext): number | null {
    const next = ctx.next;
    if (!next?.plan.ending) {
        return null;
    }
    const chords = endingSpans({ ...ctx, bar: next.bar }).filter(({ span }) => span.chord);
    const home = chords.at(-1);
    return home && chords[0] === home && home.from === 0
        ? lowestRoot(bassPc(home.span.chord!))
        : null;
}

/**
 * The held ending's bass (`plan.ending`, `arrange/ending.ts`): one note on each strike of the
 * ending (`endingStrikes`), shaped by the style's gesture (#2017) — the resolved tonic held from
 * the downbeat, cut to an eighth, re-struck on a button or on the hits; a written `| G7 C |`'s
 * V on 1 and its I from 3 (#1502). A chord on the same bass note as the one before (`Csus4
 * Cmaj7`) is no new note in an ending that rings: the bass holds its root while the chord
 * resolves above it (a short ending strikes it again). The button is struck harder. `pitch` places a chord's bass note as
 * the style's line would (near `prev`, the note before it) — every note but the last: the
 * final note is the lowest root in the line's range (`lowestRoot`, #2178), unless a walk into
 * the ending `promised` a pitch of that note (the style's `land`): a line that walked in by
 * step lands by step, where it pointed. Returns the notes and the last pitch placed.
 */
export function endingBass(
    ctx: BarContext,
    pitch: (chord: ChordFacts, prev: number | null) => number,
    prev: number | null,
    velocity: number,
    promised: number | null = null,
): { events: PitchedNote[]; last: number | null } {
    const { bar } = ctx;
    const kind = ctx.plan.ending?.kind ?? 'hold';
    // why: a soft ending is the band letting the last chord go quietly (a bossa's, an acoustic
    // strum's): the bass plays it at about four fifths of the style's own ending weight.
    const weight = kind === 'soft' ? Math.round(velocity * 0.8) : velocity;
    let last = prev;
    const rings = kind === 'hold' || kind === 'soft' || kind === 'button';
    let pitched: { chord: ChordFacts; midi: number } | null = null;
    // Each struck note: where it starts, its pitch, the step it rings to, and whether it is the
    // button (`BUTTON_LIFT`: struck harder than the chord it ends).
    const notes: { from: number; midi: number; to: number; accent: boolean }[] = [];
    for (const { span, from, to, first, accent } of endingStrikes(ctx)) {
        const chord = span.chord!;
        // A re-strike (the button, a hit) plays the note the chord already has.
        const midi: number = !first && pitched?.chord === chord ? pitched.midi : pitch(chord, last);
        pitched = { chord, midi };
        const held = notes.at(-1);
        if (first && rings && held && held.to === from && mod12(held.midi) === mod12(midi)) {
            held.to = to;
            continue;
        }
        notes.push({ from, midi, to, accent });
        last = midi;
    }
    // why: a bassist goes low for the last note of a tune — the root on the low string, under
    // the whole band — where the line's voice-leading (`pitch`, near the note before) may have
    // left it an octave up. The home chord is one note however often the gesture strikes it
    // (a re-strike plays the note the chord already has, above), so the trailing run of
    // strikes on that note goes low together: a button an octave below the chord it ends, or
    // the last of the hits alone, would be a wrong note, not a low one. A chord before home
    // (`| G7 C |`'s V) keeps the line's pitch. The bar before aims its approach at this low
    // root (`endingAim`); where it had to aim at another octave and promised that one
    // (`promised`: a lead-in that would have dropped two octaves to get low, country's walk),
    // the home chord lands on the promise instead — a walk resolves where it points.
    const final = notes.at(-1);
    if (final) {
        const lands =
            promised !== null && mod12(promised) === mod12(final.midi)
                ? promised
                : lowestRoot(mod12(final.midi));
        for (let i = notes.length - 1; i >= 0 && mod12(notes[i].midi) === mod12(lands); i--) {
            notes[i].midi = lands;
        }
        last = lands;
    }
    return {
        events: notes.map((n) =>
            bassNote(bar, n.from, n.midi, n.to - n.from, n.accent ? weight + BUTTON_LIFT : weight),
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
 * lead-in must aim at, placed with the same `placeRoot` the next span or bar uses. Across a
 * section change (`crossing`) it is placed as the next bar places it, in the next section's
 * register, so the new section starts in its own octave rather than carrying the old one for a
 * bar (#2071); the caller still hands the target on as `land`, so the next bar plays exactly
 * the note the lead-in aimed at. Into an ending (`ending`, #2178) the caller re-aims at the
 * band's low root where its approach, from the note before it, stays within an octave
 * (`endingAim`, given this target as the line's own), hands the result on as `land`, and the
 * ending lands there.
 */
export function leadTarget(
    ctx: BarContext,
    spans: { span: BarSpan }[],
    i: number,
    next: ChordFacts | null,
    placeRoot: RootPlacer,
): { target: number; crossing: boolean; ending: boolean } | null {
    const inBar = spans[i + 1]?.span.chord ?? null;
    const following = inBar ?? (i === spans.length - 1 ? next : null);
    if (!following) {
        return null;
    }
    const crossing =
        inBar === null &&
        ctx.next !== null &&
        ctx.next.bar.visit.sectionIndex !== ctx.bar.visit.sectionIndex;
    const own = crossing
        ? placeRoot(
              {
                  ...ctx,
                  bar: ctx.next!.bar,
                  plan: ctx.next!.plan,
                  next: null,
                  rng: ctx.next!.rng,
              },
              bassPc(following),
          )
        : placeRoot(ctx, bassPc(following));
    // `ending`: the chord approached is an ending's, so the approach is re-aimed (`endingAim`),
    // `floored`, and promised.
    return { target: own, crossing, ending: inBar === null && endingRoot(ctx) !== null };
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
 * At the floor (#2178: a low E the ending goes to, `floored`), a lead-in from below has no
 * note to fold to, so it leads in from above instead, as `approach` does there: a D# under
 * the open E string is not on the instrument, and a leap of a seventh is not a lead-in. Only
 * an ending's lead-in asks for it; the line's own at the floor keep their fold for now.
 */
export function meetRoot(midi: number, target: number, floored = false): number {
    if (!isLeadIn(midi, target) || Math.abs(midi - target) <= 7) {
        return midi;
    }
    const gap = mod12(midi - target);
    const folded = target + (gap <= 2 ? gap : gap - 12);
    return floored && folded < BASS.lo ? target + (12 - gap) : folded;
}
