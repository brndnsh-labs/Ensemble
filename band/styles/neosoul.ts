// cspell:disable — pattern lines (x/o/g/d/R/5/7/9/O/m/-/.) are not words.
/**
 * Neo-Soul: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * The genre is the pocket: D'Angelo's *Voodoo*, Dilla's MPC, the Soulquarians. The drums are
 * a loop — one or two bars, soft, the kick lazily syncopated — and the bass and the Rhodes
 * sit well behind them, the bass deepest. Harvested from the old engine's by-ear lessons
 * (`public/engine/grooves/neo-soul.ts`, the `neo` bass style, the `neo-soul-rhodes` comp and
 * `GENRE_POCKET`), not its code.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { DrumHit, PitchedNote } from '../core/types.js';
import {
    type ApproachKind,
    approach,
    BASS,
    bassNote,
    bassPc,
    type LineMemory,
    nextChord,
} from '../players/bass/line.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { type VoicingKind, voicingTones } from '../players/comp/voicing.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from '../players/drums/kit.js';
import { barSteps, dyn, isCommonTime, pulses, STEP, spanSteps } from '../players/grid.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, DrumIdiom, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
/**
 * Kick patterns, chosen once per section so the loop repeats. The old engine's motifs:
 * boom-bap (the One and the "and" of 3), the ghost-heavy motif's plain 1-and-3 foundation,
 * and the Dilla skip (1, the "a" of 2, the "and" of 3, the "a" of 4). Two more lazy 16ths
 * complete the vocabulary: the pickup on the "a" of 2 that stumbles into beat 3's "and", and
 * the stumble on the "a" of 1 right after the One. The old engine held the expressive
 * patterns (Dilla skips) back until 0.7 energy, so a quiet section reads as laid-back, not
 * busy — the high tier here.
 */
const NEO_KICKS: readonly [string, Record<EnergyTier, number>][] = [
    ['x.........x.....', { low: 3, mid: 3, high: 1 }],
    ['x.......x.......', { low: 2, mid: 2, high: 1 }],
    ['x......x..x.....', { low: 0, mid: 2, high: 2 }],
    ['x..x......x.....', { low: 0, mid: 1, high: 2 }],
    ['x......x..x....x', { low: 0, mid: 0, high: 3 }],
];

/**
 * Snare ghost positions, one set per section. Every ghost sits on an "e" or "a" next to a
 * backbeat or the One — the drag into and out of 2 and 4 that is the pocket's texture — and
 * energy only adds to the set: the high tier plays the mid tier's ghosts plus more. A quiet
 * section plays none (the old engine's quiet motifs were backbeat-only).
 */
const NEO_GHOSTS: readonly Record<'mid' | 'high', number[]>[] = [
    // The "a"s: every beat dragged into, the old ghost-heavy motif.
    { mid: [7, 11, 15], high: [3, 7, 9, 11, 15] },
    // Leading into each backbeat, and the "a" of 4 into the One.
    { mid: [3, 10, 15], high: [3, 6, 10, 11, 15] },
    // Out of the backbeat on the "e", then into the next beat on the "a".
    { mid: [5, 7, 15], high: [2, 5, 7, 13, 15] },
];

const line16 = (steps: number[], char: string) =>
    Array.from({ length: 16 }, (_, s) => (steps.includes(s) ? char : '.')).join('');

/**
 * A displaced snare, not a drag: in a section that chooses it, the backbeat on 4 moves a
 * whole sixteenth late, to the "e" of 4 (≈165–195 ms at neo-soul tempos), on the second bar of
 * each pair — the loop is two bars long, like a sampled two-bar break, and the displaced
 * snare is its turnaround, a written variation in the beat. A quiet section (cross-stick)
 * keeps the backbeat straight: the displacement needs weight behind it to read as a figure,
 * not a mistake. It is not the old engine's Dilla drag (a +6–18 ms snare offset, ten times
 * smaller): drums are the clock and never lean, so a drag on one drum isn't available here,
 * and this doesn't pretend to be one.
 */
function displacedFour(ctx: BarContext, tier: EnergyTier): boolean {
    return (
        tier !== 'low' && ctx.bar.barInVisit % 2 === 1 && ctx.rng('lazy', 'section').chance(0.35)
    );
}

const neoKit = drumIdiom({
    name: 'neo-soul pocket',
    timekeeper: ['hat', 'hatOpen'],
    // The loop barely fills: a phrase end plays through below high energy, and even a new
    // section gets only a beat or two of pickup. A busy fill breaks the loop's spell.
    fillLength: { phrase: { low: 0, mid: 0, high: 2 }, section: { low: 2, mid: 2, high: 4 } },
    groove(ctx, tier) {
        const kick = ctx.rng('kick', 'section').weighted(NEO_KICKS.map(([k, w]) => [k, w[tier]]));
        const ghostSet = ctx.rng('ghost', 'section').pick(NEO_GHOSTS);
        const ghosts = tier === 'low' ? [] : ghostSet[tier];
        const backbeat = displacedFour(ctx, tier) ? [4, 13] : [4, 12];
        // The backbeat wins where a ghost would fall on it.
        const snare = Array.from({ length: 16 }, (_, s) =>
            backbeat.includes(s) ? 'X' : ghosts.includes(s) ? 'g' : '.',
        ).join('');
        // Soft swung sixteenths, the "e" and "a" ghosted under the beat and the "and" (the
        // old engine's 0.83 / 0.67 / 0.4 hat levels). A quiet section keeps only the eighths
        // (the old engine went to sixteenths above ~0.58 energy).
        const hat = tier === 'low' ? 'o.g.o.g.o.g.o.g.' : 'xgogxgogxgogxgog';
        const lines: Lines = { kick, hat };
        if (ctx.plan.energy < 0.35) {
            // Below 0.35 the old engine played cross-stick: the backbeat whispered.
            lines.rim = line16(backbeat, 'x');
        } else {
            lines.snare = snare;
        }
        // At high energy the loop breathes at its turnaround: an open hat on the "and" of 2
        // or of 4 (the section's choice, the old engine's release accent), on the second bar
        // of each pair.
        if (tier === 'high' && ctx.bar.barInVisit % 2 === 1) {
            const open = ctx.rng('release', 'section').pick([6, 14]);
            lines.hat = `${hat.slice(0, open)}.${hat.slice(open + 1)}`;
            lines.hatOpen = line16([open], 'x');
        }
        return lines;
    },
    cells(ctx, tier) {
        const hat = tier === 'low' ? 'o.g.' : 'xgog';
        const back: Lines = ctx.plan.energy < 0.35 ? { rim: 'x...', hat } : { snare: 'X...', hat };
        return {
            down: { kick: 'x...', hat },
            back,
            // A secondary downbeat gets the kick lazily, on its "and".
            strong: { kick: '..x.', hat },
        };
    },
    fill: (_ctx, steps, rng) =>
        steps <= 2 ? { snare: snareFigure(steps, rng) } : tomRun(steps, rng, 2),
});

/**
 * The feather touch. Questlove rides the hat light so the kick and snare speak through it:
 * the old engine damped the whole kit (×0.65–0.8) and the hat most of all. Here the hat
 * plays at 80% of the written level, the rest of the kit as written.
 */
function featherHat(idiom: DrumIdiom): DrumIdiom {
    return {
        ...idiom,
        play(ctx, memory) {
            const out = idiom.play(ctx, memory);
            const events = out.events.map((e: DrumHit) =>
                e.piece === 'hat'
                    ? { ...e, velocity: Math.max(1, Math.round(e.velocity * 0.8)) }
                    : e,
            );
            return { events, memory: out.memory };
        },
    };
}

const neoDrums = featherHat(neoKit);

// ================================================================ bass
/**
 * One-bar lines as sixteenth codes, chosen once per section: `R` the chord's bass, `5` its
 * fifth, `7` its seventh (the b7 on a minor or dominant chord), `9` a hammer-on to the 2nd,
 * `O` the octave, `m` a dead note; `-` holds the note before, `.` is silence. The rests are
 * written as carefully as the notes — Pino Palladino on *Voodoo* lets the kick speak — and
 * the offbeat entries sit on the "e"s and "a"s. Weights by energy tier.
 */
const NEO_RIFFS: readonly [string, Record<EnergyTier, number>][] = [
    // A long root and a fifth on the "and" of 4 leading on: mostly space.
    ['R-----------..5-', { low: 3, mid: 1, high: 0 }],
    // A half note, a breath, then the fifth on the "a" of 3 and the seventh on the "e" of 4.
    ['R-------...5-7-.', { low: 2, mid: 3, high: 1 }],
    // The lazy re-strike: the root again on the "a" of 2, dragging into 3; the fifth on its
    // "and"; the seventh on the "and" of 4.
    ['R-----.R--5-..7-', { low: 0, mid: 3, high: 2 }],
    // The hammer-on: root, the 2nd hammered on the "a" of 1, back to the root on the "and" of
    // 2, the octave on the "a" of 3 falling to the fifth (the old engine's "hammer-ons").
    ['R--9-.R-...O-5-.', { low: 0, mid: 1, high: 3 }],
    // Dead-note chatter around the backbeat (the old engine's ghost notes, at high energy).
    ['R-.mR---..5-m7-.', { low: 0, mid: 0, high: 2 }],
];

/**
 * The bass register for the whole tune: deep. The old engine held neo-soul at the bottom of
 * the neck regardless of energy (its register drift was zeroed for this genre), so the
 * anchor is the song's, not the section's. It also makes every root's place a pure function
 * of its pitch class — the next bar will put its root exactly where an approach aims.
 */
function rootPlace(ctx: BarContext, pc: number): number {
    const anchor = 33 + ctx.rng('register', 'song').int(4);
    return nearestMidi(pc, anchor, BASS.lo, BASS.hi);
}

/**
 * A riff code's pitch. `root` is the placed bass note; `prev` the note before in the line.
 * The fifth and seventh are placed nearest the note before, so the line moves by the
 * smallest interval: from the root they fall below it (the 5th a 4th under, the b7 a step
 * under), the deep neo-soul shape. Colour comes only from the chord's own scale: the
 * hammer-on's 2nd sounds only where `chord.scale` has one (not over a b9), else the root.
 */
function riffPitch(code: string, root: number, prev: number, chord: ChordFacts): number {
    const near = (interval: number) =>
        nearestMidi(mod12(chord.root + interval), prev, BASS.lo, BASS.hi);
    switch (code) {
        case '5':
            return near(fifthOf(chord));
        case '7':
            // A triad has no 7th, and a b7 would turn it into a dominant the chart didn't
            // write: it takes the 6th its scale owns (the major 6th, Pino's colour), else the
            // root.
            return near(chord.seventh ?? (chord.sixth || chord.scale.includes(9) ? 9 : 0));
        case '9':
            return chord.bass === chord.root && chord.scale.includes(2) ? root + 2 : root;
        case 'O':
            return root + 12 <= BASS.hi ? root + 12 : root;
        case 'm':
            return prev;
        default:
            return root;
    }
}

/** A line for any other meter: the root on each strong pulse, a fifth leading on. */
function oddRiff(ctx: BarContext): string {
    const total = barSteps(ctx.bar);
    const line = Array.from({ length: total }, () => '-');
    for (const p of pulses(ctx.bar)) {
        if (p.role !== 'back') {
            line[p.step] = 'R';
        }
    }
    if (total >= 6) {
        line[total - 2] = '5';
        line[total - 3] = '.';
    }
    return line.join('');
}

/**
 * How the line leads into a change, when it does. why: Pino slides *up* into a root far more
 * than he falls onto it from the b9 above, so the half step from below leads (half the
 * lead-ins); a step of the outgoing chord's own scale into it and the target's fifth (a V→I in
 * miniature) keep the lead-ins from all being one gesture (a fifth each); the half step from
 * above, an outside note the ear hears as a b9 of the target, is the rare one (a tenth).
 */
const NEO_APPROACHES: readonly [ApproachKind, number][] = [
    ['chromatic-below', 5],
    ['scale', 2],
    ['dominant', 2],
    ['chromatic-above', 1],
];

/**
 * A lead-in of `kind` into `target` — the exact note the next chord will be played on (its
 * root placed the same way this one is) — so a half step resolves by a half step *in pitch*,
 * not just in pitch class. Only when the line is within a fifth of the target: a bassist leads
 * in from where the hand is, and an approach reached by an octave leap is a jump, not a
 * lead-in. A half step that would leave the register, or repeat the note before, comes from
 * the other side; a scale step that folds out of reach is played as the half step below; the
 * fifth is taken in the octave nearest the hand. Null when the line is too far away.
 */
function approachInto(
    kind: ApproachKind,
    target: number,
    prev: number,
    chord: ChordFacts,
): number | null {
    if (Math.abs(prev - target) > 7) {
        return null;
    }
    const below = target - 1;
    const above = target + 1;
    const usable = (m: number) => m >= BASS.lo && m <= BASS.hi && m !== prev;
    const halfStep = (fromBelow: boolean) => {
        const sides = fromBelow ? [below, above] : [above, below];
        return sides.find(usable) ?? null;
    };
    switch (kind) {
        case 'chromatic-below':
            return halfStep(true);
        case 'chromatic-above':
            return halfStep(false);
        case 'scale': {
            const step = approach(target, chord, 'scale');
            return Math.abs(step - target) <= 2 ? step : halfStep(true);
        }
        case 'dominant': {
            const fifth = approach(target, chord, 'dominant');
            const other = fifth > target ? fifth - 12 : fifth + 12;
            const inRange = [fifth, other].filter((m) => m >= BASS.lo && m <= BASS.hi);
            return inRange.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev))[0] ?? null;
        }
    }
}

const neoBass: PitchedIdiom = {
    name: 'neo-soul line',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                const root = rootPlace(ctx, bassPc(chord));
                events.push(bassNote(bar, 0, root, 16, dyn(96, plan.energy)));
                last = root;
            }
            return { events, memory: { last } };
        }
        const line = isCommonTime(bar)
            ? ctx.rng('riff', 'section').weighted(NEO_RIFFS.map(([r, w]) => [r, w[tier]]))
            : oddRiff(ctx);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        // The last bar of a phrase turns into the next: the line always leads into that
        // change, even when the riff has nothing in its last beat, with a sixteenth pickup
        // (when the line is near enough to lead in, see `approachInto`).
        const phraseEnd = bar.phrase.bar === bar.phrase.length - 1;
        // why: inside a phrase, a lead-in on every change is a mannerism, and it writes over
        // the riff's own last-beat fifth or seventh. So it is the section's choice (the
        // bassist's habit for that verse or chorus, as disco's `walks`): half the sections
        // lead into their changes, the rest let the riff's written ending carry them.
        const leadsIn = ctx.rng('approach', 'section').chance(0.5);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            const root = rootPlace(ctx, bassPc(chord));
            if (span.fermata) {
                if (span.attack) {
                    events.push(bassNote(bar, from, root, to - from, dyn(96, plan.energy)));
                    last = root;
                }
                return;
            }
            const codes = new Map<number, string>();
            for (let s = from; s < to; s++) {
                const c = line[s] ?? '.';
                if (c !== '.' && c !== '-') {
                    codes.set(s, c);
                }
            }
            // A chord is stated on its arrival: its bass note (the octave counts as the root).
            if (span.attack && codes.get(from) !== 'O') {
                codes.set(from, 'R');
            }
            const steps = [...codes.keys()].sort((a, b) => a - b);
            const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const turn = phraseEnd && i === spans.length - 1;
            const change =
                following && following.bass !== chord.bass && (leadsIn || turn) ? following : null;
            // The approach slot: the riff's last note in the span's final beat (never the
            // arrival itself), or at a phrase end a pickup on the last sixteenth.
            let approachAt: number | null = null;
            if (change) {
                const tail = steps.at(-1);
                if (
                    tail !== undefined &&
                    tail > from &&
                    to - tail <= 4 &&
                    codes.get(tail) !== 'm'
                ) {
                    approachAt = tail;
                } else if (turn && to - 1 > (tail ?? from)) {
                    approachAt = to - 1;
                    codes.set(to - 1, 'a');
                    steps.push(to - 1);
                }
            }
            let prev = last ?? root;
            steps.forEach((step, k) => {
                const code = codes.get(step)!;
                let midi = riffPitch(code, root, prev, chord);
                if (step === approachAt && change) {
                    const kind = ctx.rng(`approach${i}`).weighted(NEO_APPROACHES);
                    const lead = approachInto(kind, rootPlace(ctx, bassPc(change)), prev, chord);
                    if (lead !== null) {
                        midi = lead;
                    } else if (code === 'a') {
                        // Too far from the target to lead into it: the pickup isn't played.
                        return;
                    }
                }
                // A note lasts through its ties, never past the next note or the chord.
                let end = step + 1;
                while (end < to && line[end] === '-' && !codes.has(end)) {
                    end++;
                }
                const until = Math.min(end, steps[k + 1] ?? to);
                const muted = code === 'm';
                // Warm, not punchy: the arrival leans, the beats sit, the lazy sixteenths and
                // the approach are lighter, a dead note is a thud.
                const velocity = muted
                    ? 50
                    : step === from
                      ? 100
                      : step % 4 === 0
                        ? 90
                        : code === 'a' || step === approachAt
                          ? 80
                          : 84;
                const length = muted ? 0.5 : (until - step) * 0.92;
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy), muted));
                if (!muted) {
                    prev = midi;
                    last = midi;
                }
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * Which voicing kind the comp may use for a chord: only one whose every tone the chord's own
 * scale owns. One chord authority — a secondary dominant resolving to minor carries its
 * implied b9/b13 (`timeline.ts`), a iii chord is phrygian — so a colour the scale lacks
 * (a natural 9 over a phrygian minor 7th, a 6th over an aeolian triad) is never voiced.
 */
const ownsColour = (chord: ChordFacts, kind: VoicingKind) =>
    voicingTones(chord, kind).every((t) => chord.scale.includes(mod12(t)));

const plainTriad = (chord: ChordFacts) =>
    (chord.family === 'major' || chord.family === 'minor') &&
    chord.seventh === null &&
    !chord.sixth &&
    chord.tensions.length === 0;

type ColourKind = Extract<VoicingKind, 'drop2' | 'rootless' | 'close'>;

/**
 * The voicing kind for one chord, in order of preference: over a plain triad the open 6/9
 * (the `drop2` kind: 3-5-6-9 spread into 4ths and 5ths, E-A-D-G over C — the quartal colour);
 * over a seventh chord the rootless 3-7-9-13 (the Rhodes left hand of Poyser and Glasper, with
 * the chart's written 11ths and 13ths seated); and where the scale owns neither colour, the
 * plain close chord. Chosen per chord, so a chord whose scale can't afford a colour never
 * costs its neighbours theirs, and an anticipation is voiced for the chord it plays. Reused
 * kinds, not a new one: between them they already are the neo-soul keyboard's colours.
 */
function colourKind(chord: ChordFacts, prefer: ColourKind[]): ColourKind {
    const order: ColourKind[] = plainTriad(chord) ? ['drop2', ...prefer] : prefer;
    return order.find((kind) => ownsColour(chord, kind)) ?? 'close';
}

/**
 * Keyboard figures, one per section: `x` a strike, `-` holding it, `.` silence. The Rhodes
 * holds its chords — a funk stab lasts under a sixteenth, these ring for beats — and
 * re-strikes them lazily off the beat: on the "a" of 2 dragging into 3, on the "e" of 1
 * letting the bass have the One. Where the chord changes mid-bar, a strike in the eighth
 * before the change plays the new chord and ties over into it (`pushInBar`): the "a" of 2
 * drags beat 3's chord in early, it never stabs the outgoing chord for a sixteenth. A strike
 * in the last eighth may anticipate the next bar's chord (the machinery's push). Energy adds
 * strikes; no hold is shorter than a dotted eighth unless the next strike cuts it.
 *
 * Not yet rolled: a roll is time, so it belongs to the feel pass, which rolls only stroked
 * chords at the instrument's `strumMs` — 0 for every keyboard. A rolled Rhodes needs a
 * keyboard roll there, not a workaround here.
 */
const KEYS_FIGURES: Record<EnergyTier, readonly [string, number][]> = {
    low: [
        ['x-------------..', 3],
        ['x--------.x-----', 2],
        ['.x------------..', 1],
    ],
    mid: [
        ['x-----.x------x-', 3],
        ['.x-------.x---x-', 2],
        ['x--...x-----.x--', 2],
    ],
    high: [
        ['x--x---x--x---x-', 2],
        ['.x----x---x--x--', 2],
        ['x-----.x--x---.x', 1],
    ],
};

function keysRhythm(
    ctx: BarContext,
    { from, to }: { from: number; to: number },
    tier: EnergyTier,
): Hit[] {
    if (!isCommonTime(ctx.bar)) {
        // Other meters: the chord on each pulse, held to the next.
        return pulses(ctx.bar)
            .filter((p) => p.step >= from && p.step < to)
            .map((p) => ({ step: p.step, length: p.steps, velocity: p.index === 0 ? 74 : 80 }));
    }
    const figure = ctx.rng('keys', 'section').weighted(KEYS_FIGURES[tier]);
    const hits: Hit[] = [];
    for (let step = from; step < to; step++) {
        if (figure[step] !== 'x') {
            continue;
        }
        let length = 1;
        while (figure[step + length] === '-') {
            length++;
        }
        // The lazy re-strikes lean a little; a chord on the beat is laid in softly.
        hits.push({ step, length, velocity: step % 4 === 0 ? 72 : 80 });
    }
    return hits;
}

// A Rhodes player lays a chord over the barline now and then; more as the band opens up.
const KEYS_PUSH: Record<EnergyTier, number> = { low: 0.1, mid: 0.25, high: 0.35 };

/**
 * The Rhodes: one rhythm, each chord voiced with the richest colour its scale allows (see
 * `colourKind`).
 */
const neoKeys: PitchedIdiom = compIdiom({
    name: 'neo-soul rhodes',
    kind: (chord) => colourKind(chord, ['rootless']),
    push: KEYS_PUSH,
    // A lazy re-strike in the eighth before a mid-bar change is the new chord arriving early
    // and tied over the change: the drag the figures are written for (see `KEYS_FIGURES`).
    pushInBar: true,
    rhythm: (ctx, span, tier) => keysRhythm(ctx, span, tier),
});

// ---------------------------------------------------------------- guitar
/**
 * Soul guitar lines, one per section, on the sixteenth pendulum (at these tempos the hand
 * swings in sixteenths, so an "e" or "a" comes up and everything else goes down): `x` the
 * whole grip, an extended chord hit (`X` accented); `d` a double-stop, two strings picked out
 * of the grip the hand is holding — Curtis Mayfield and Ernie Isley hold the chord shape and
 * play pairs from it. No scratches: this guitar is clean and gentle, every stroke sounds.
 * The whole grip always falls on a down position: an upstroke catches only the top strings,
 * so a full chord hit on an "e" or "a" would lose its bottom string, often the 3rd. A line
 * that leaves the bass the One strikes the grip on the "and" of 1.
 */
const GUITAR_LINES: Record<EnergyTier, readonly [string, number][]> = {
    low: [
        ['x.........d.....', 2],
        ['x.......d.......', 1],
    ],
    mid: [
        ['x......d..d.....', 3],
        ['..x...d....d..d.', 2],
        ['x.....d..d...d..', 2],
    ],
    high: [
        ['x..d..d.x..d.d..', 2],
        ['X.....d.d.d...d.', 2],
        ['..x.d..dx..d..d.', 1],
    ],
};

function guitarLine(ctx: BarContext, tier: EnergyTier): string {
    if (!isCommonTime(ctx.bar)) {
        // Other meters: the grip on the first pulse, a double-stop on each pulse after it.
        const total = barSteps(ctx.bar);
        return Array.from({ length: total }, (_, s) =>
            pulses(ctx.bar).some((p) => p.step === s) ? (s === 0 ? 'x' : 'd') : '.',
        ).join('');
    }
    return ctx.rng('guitar', 'section').weighted(GUITAR_LINES[tier]);
}

/**
 * The guitar's colour, per chord: the rootless extended grip wherever the chord's scale owns
 * it — over a triad that is the add9 (3-5-R-9), which any scale owning the keyboard's 6/9 also
 * owns — else the plain close chord.
 */
const guitarKind = (chord: ChordFacts): ColourKind =>
    ownsColour(chord, 'rootless') ? 'rootless' : 'close';

const guitarBook = compIdiom({
    name: 'neo-soul guitar',
    kind: guitarKind,
    // Four strings, clean, in the middle of the neck — off the bass, under the singer.
    grip: { strings: 4, slot: { lo: 52, hi: 79, top: 69 } },
    // Without a bassist the grip takes the chord's root on its bottom string.
    alone: { strings: 5, slot: { lo: 40, hi: 76, top: 67 }, rootBottom: true },
    push: { low: 0, mid: 0.1, high: 0.2 },
    // A pair picked just before a mid-bar change belongs to the new chord, tied over it,
    // rather than the old chord's pair clipped after a sixteenth (as the Rhodes does).
    pushInBar: true,
    rhythm(ctx, { from, to }, tier) {
        const line = guitarLine(ctx, tier).replaceAll('d', 'x');
        // A clean grip rings for a beat; the pick is gentle — softer than the strummed
        // styles' strokes (100/86/72), never a dig.
        return strums(line, from, to, 1, 4).map((h) => ({
            ...h,
            velocity: Math.round(h.velocity * 0.85),
        }));
    },
});

/** Soul-guitar double-stop intervals: 3rds and 6ths (a 10th reads as a 3rd). */
const SWEET = new Set([3, 4, 8, 9]);

/**
 * The double-stop: two strings picked out of the grip struck on a `d` step. Curtis Mayfield
 * and Ernie Isley play 3rds on adjacent strings and 6ths with a string skipped between (the
 * soul sixths on G and E, D and B), so the pair is chosen from the strings the stroke caught,
 * adjacent or one apart. It carries a guide tone (the 3rd, or the 7th or 6th) whenever the
 * strings caught hold one, so the pair still names the chord; among those, a 3rd or 6th
 * first, then higher on the neck (a double-stop sits on the top strings). A grip with no 3rd
 * or 6th holding a guide tone falls back to its best guide-tone pair (the 3-7 shell). The
 * chord is the one the grip was voiced
 * for: the first of `candidates` whose voicing it spells (its bass note counted, for the
 * grip that carries it without a bassist).
 */
function doubleStop(notes: PitchedNote[], candidates: (ChordFacts | null | undefined)[]) {
    const sorted = [...notes].sort((a, b) => a.midi - b.midi);
    if (sorted.length < 3) {
        return notes;
    }
    const spells = (c: ChordFacts) => {
        const tones = [...voicingTones(c, guitarKind(c)), 0, mod12(c.bass - c.root)];
        return sorted.every((n) => tones.includes(mod12(n.midi - c.root)));
    };
    const chord = candidates.find((c): c is ChordFacts => !!c && spells(c));
    if (!chord) {
        return notes;
    }
    const guide = (n: PitchedNote) => chord.guides.includes(mod12(n.midi - chord.root));
    let best: [PitchedNote, PitchedNote] | null = null;
    let bestScore = -1;
    for (let i = 0; i < sorted.length; i++) {
        for (const j of [i + 1, i + 2]) {
            const [lo, hi] = [sorted[i], sorted[j]];
            if (!hi) {
                continue;
            }
            // why: a guide tone outranks everything (8: the pair must name the chord), then
            // the interval is the idiom (4: a 3rd or 6th), an adjacent-string 3rd is the
            // commoner hand shape than a skip (0.5), and the top strings break ties (the pair
            // sits above the rest of the band). Only an upstroke, which caught the top three
            // strings and may have missed the 3rd, can be left with no guide tone to pick.
            const score =
                (guide(lo) || guide(hi) ? 8 : 0) +
                (SWEET.has(mod12(hi.midi - lo.midi)) ? 4 : 0) +
                (j === i + 1 ? 0.5 : 0) +
                i * 0.1;
            if (score > bestScore) {
                bestScore = score;
                best = [lo, hi];
            }
        }
    }
    return best ?? notes;
}

const neoGuitar: PitchedIdiom = {
    ...guitarBook,
    play(ctx, memory) {
        const tier = energyTier(ctx.plan.energy);
        const out = guitarBook.play(ctx, memory);
        const { bar, plan } = ctx;
        if (plan.ending || bar.spans.some((s) => s.fermata)) {
            return out;
        }
        const line = guitarLine(ctx, tier);
        const total = barSteps(bar);
        const byTick = new Map<number, PitchedNote[]>();
        for (const e of out.events as PitchedNote[]) {
            byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e]);
        }
        const events: PitchedNote[] = [];
        for (const [tick, notes] of byTick) {
            const step = Math.round((tick - bar.start) / STEP);
            if (line[step] !== 'd') {
                events.push(...notes);
                continue;
            }
            const index = bar.spans.findIndex((s) => s.start <= tick && tick < s.end);
            const here = bar.spans[index]?.chord;
            // The chord the hit may play early: `compIdiom` pushes from the eighth before a
            // mid-bar change (`pushInBar`) and may anticipate from the last span's final eighth.
            const following = bar.spans[index + 1];
            const ahead = following
                ? following.start - tick <= 2 * STEP
                    ? following.chord
                    : null
                : step >= total - 2
                  ? ctx.next?.bar.spans[0]?.chord
                  : null;
            events.push(...doubleStop(notes, [ahead, here]));
        }
        return { events, memory: out.memory };
    },
};

export const neosoul: Style = {
    id: 'neosoul',
    name: 'Neo-Soul',
    // Swung sixteenths at 30: the offbeat sixteenth at 55% of its pair, an MPC swing of 55 —
    // Dilla's lazy lilt, the old engine's Neo-Soul setting. The band leans well behind the
    // drums, the deepest pocket in the palette: the Rhodes 25 ms back (the old engine's
    // GENRE_POCKET), the bass deeper still at 32 ms (that 25 plus the old engine's bass
    // residual, 5 + 5 × energy, at verse energy). Humanize at 60 (±5.4 ms of settled
    // placement): the old engine's drunken jitter reached ±7.5 ms off the beat and a third
    // of that on it; one amount for every position sits between the two, drunk without
    // smearing the beat. Bass 32 + 5.4 stays inside the old engine's 40 ms floor.
    feel: { swing: 30, swingGrid: 16, lean: { bass: 32, comp: 25 }, humanize: 60 },
    drums: neoDrums,
    bass: neoBass,
    comp: { keyboard: neoKeys, guitar: neoGuitar },
    // The genre's keyboard is the Rhodes (the old sound map's Neo-Soul chords, `pack:rhodes`).
    prefers: 'rhodes',
};
