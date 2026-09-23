/** Shared bass-line craft: register, octave choice, approach notes. */
import type { Rng } from '../../core/random.js';
import type { PitchedNote } from '../../core/types.js';
import type { Bar, BarSpan } from '../../form/timeline.js';
import type { BarContext } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12, nearestMidi } from '../../theory/pitch.js';
import { at, STEP } from '../grid.js';

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
            return clampIn(target - 1);
        case 'chromatic-above':
            return clampIn(target + 1);
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
 * The chord the line is heading to after this bar's spans: the next bar's first chord,
 * wrapping when the song loops. Null when the next bar starts on N.C. or the song ends.
 */
export function nextChord(ctx: BarContext): ChordFacts | null {
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
