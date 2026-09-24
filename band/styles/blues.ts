// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Blues: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * Everything here writes on the eighth-note grid and lets the feel pass swing it into the
 * shuffle. A sixteenth "e" or "a" would land between triplet positions once swung and read
 * as a flam, so no part of the blues uses them.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { DrumHit, PitchedNote } from '../core/types.js';
import {
    approach,
    BASS,
    bassNote,
    type LineMemory,
    nextChord,
    pickApproach,
} from '../players/bass/line.js';
import { type GripShape, grip } from '../players/comp/fretboard.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, tomRun } from '../players/drums/kit.js';
import { at, dyn, isCommonTime, pulses, STEP, spanSteps } from '../players/grid.js';
import type { ChordFacts } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, DrumIdiom, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// The kick grounds 1 and 3 in every bar: the old blues critique held the drummer to it
// without exception. What a section chooses is the shuffle push on the swung "and" of 4,
// which kicks the band into the next bar. High energy always pushes.
const BLUES_KICKS: readonly [string, Record<EnergyTier, number>][] = [
    ['x.......x.......', { low: 3, mid: 2, high: 0 }],
    ['x.......x.....o.', { low: 1, mid: 3, high: 1 }],
];

// High-energy snare parts: the plain backbeat; ghosted lopes on the "and"s of 2 and 4 that
// roll into 3 and 1; or the Texas shuffle, a light snare on every swung "and" under the
// backbeat so the snare shuffles with the hat.
const BLUES_HIGH_SNARES: readonly [string, number][] = [
    ['....X.......X...', 2],
    ['....X.g.....X.g.', 2],
    ['..g.X.g...g.X.g.', 1],
];

/** A snare pickup over the last `steps` sixteenths: the beat kept, the last "and" accented. */
function pickup(steps: number): string {
    return Array.from({ length: steps }, (_, i) =>
        i === steps - 2 ? 'X' : i % 4 === 0 ? 'x' : '.',
    ).join('');
}

const shuffleKit = drumIdiom({
    name: 'blues shuffle',
    timekeeper: ['hat', 'ride', 'hatOpen'],
    // A quiet blues plays through its phrase ends; a turnaround gets a snare pickup, a new
    // chorus a bar-end run.
    fillLength: { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 2, mid: 4, high: 8 } },
    groove(ctx, tier) {
        const kick = ctx.rng('kick', 'section').weighted(BLUES_KICKS.map(([k, w]) => [k, w[tier]]));
        if (tier === 'low') {
            // Hat on every swung eighth, the "and"s at half weight (the lope). A very quiet
            // band plays cross-stick instead of a full backbeat.
            return {
                hat: 'o.g.o.g.o.g.o.g.',
                kick,
                ...(ctx.plan.energy < 0.3
                    ? { rim: '....x.......x...' }
                    : { snare: '....x.......x...' }),
            };
        }
        // Every second bar of a pair, a section that chooses to opens the hat on the "and" of
        // 4: the turnaround breath before the next pair (more often when the band digs in).
        const opens =
            ctx.bar.barInVisit % 2 === 1 &&
            ctx.rng('open', 'section').chance(tier === 'high' ? 0.6 : 0.35);
        const hat = (line: string) =>
            opens ? { hat: `${line.slice(0, 14)}..`, hatOpen: '..............o.' } : { hat: line };
        if (tier === 'mid') {
            // Some sections ghost the "and" of 4, a lope into the one.
            const ghost = ctx.rng('ghost', 'section').chance(0.3);
            return {
                ...hat('x.o.x.o.x.o.x.o.'),
                kick,
                snare: ghost ? '....X.......X.g.' : '....X.......X...',
            };
        }
        const snare = ctx.rng('snare', 'section').weighted(BLUES_HIGH_SNARES);
        // A driving section feathers the kick on 2 and 4 under the backbeat (felt more than
        // heard: four on the floor without stepping on the snare).
        const feather = ctx.rng('feather', 'section').chance(0.6);
        const drive = feather ? `${kick.slice(0, 4)}g${kick.slice(5, 12)}g${kick.slice(13)}` : kick;
        // Half the high sections move the shuffle to the ride, hat foot on 2 and 4.
        return ctx.rng('ride', 'section').chance(0.5)
            ? { ride: 'x.o.x.o.x.o.x.o.', hatPedal: '....x.......x...', kick: drive, snare }
            : { ...hat('X.o.X.o.X.o.X.o.'), kick: drive, snare };
    },
    cells: (ctx, tier) => {
        const hat = tier === 'low' ? 'o.g.' : 'x.o.';
        const back = tier === 'low' && ctx.plan.energy < 0.3 ? { rim: 'x...' } : { snare: 'X...' };
        return {
            down: { kick: 'x...', hat },
            back: { ...back, hat },
            strong: { kick: 'x...', hat },
        };
    },
    // Fills stay on the eighths too. A short one is a snare pickup that keeps the backbeat on
    // 4 and accents the "and" into the one (a dropped backbeat in a two-beat fill reads as a
    // mistake, not a fill); a longer one runs down the toms on the swung eighths.
    fill: (_ctx, steps, rng) => (steps <= 4 ? { snare: pickup(steps) } : tomRun(steps, rng, 2)),
});

/**
 * The shuffle's circular dynamics: the swung "and" after a backbeat (the "and" of 2 and of
 * 4) is lighter still than the other "and"s, so the cymbal lopes in a two-beat circle
 * instead of ticking evenly. Harvested from the old engine's hat, which the old critique
 * held to it.
 */
function withLope(idiom: DrumIdiom): DrumIdiom {
    return {
        ...idiom,
        play(ctx, memory) {
            const out = idiom.play(ctx, memory);
            if (!isCommonTime(ctx.bar)) {
                return out;
            }
            const events = out.events.map((e: DrumHit) => {
                const step = Math.round((e.tick - ctx.bar.start) / STEP);
                const cymbal = e.piece === 'hat' || e.piece === 'ride';
                return cymbal && (step === 6 || step === 14)
                    ? { ...e, velocity: Math.max(1, Math.round(e.velocity * 0.8)) }
                    : e;
            });
            return { events, memory: out.memory };
        },
    };
}

const bluesDrums = withLope(shuffleKit);

// ================================================================ bass
/**
 * The boogie's rocking tone above a chord's 5th: the major 6th on any major or dominant chord
 * (the box is the dominant's, whatever the chord resolves to: a VI7 heading to a minor ii
 * still rocks to its major 6th), the Dorian 6th on a minor chord whose scale has one, and
 * the b6 of an Aeolian minor (the minor boogie). Null where there is no plain 5th to rock
 * from, or no 6th to rock to.
 */
function rockingSixth(chord: ChordFacts): 9 | 8 | null {
    if ((chord.fifth ?? 7) !== 7) {
        return null;
    }
    if (chord.third === 4 || chord.sixth || chord.scale.includes(9)) {
        return 9;
    }
    return chord.third === 3 && chord.scale.includes(8) ? 8 : null;
}

/**
 * The boogie box for one chord, in semitones above the chord's bass note: an ascending half
 * (R-3-5-6) and a descending half (b7-6-5-3) that together fill two bars on one chord. Each
 * half's last note leads on: the 6 steps up to the b7, and the 3 is a half step under the
 * IV, which is why the box walks the I-IV of a blues by itself.
 *
 * Fitted to the chord: the b7 only where the chord has one (a major or 6th chord turns at
 * the octave); a minor chord whose scale has no natural 6th (Aeolian) plays the minor-
 * pentatonic box R-b3-4-5; a chord with an altered 5th keeps its own 5th and 7th. A slash
 * chord's bass note is the point, so the line pedals on it.
 */
function boogieBox(chord: ChordFacts): { up: number[]; down: number[] } {
    if (chord.bass !== chord.root) {
        return { up: [0, 0, 0, 0], down: [0, 0, 0, 0] };
    }
    const has = (n: number) => chord.intervals.some((i) => mod12(i) === n);
    const fifth = chord.fifth ?? 7;
    // Sus chords take their 4th (or 2nd) where the 3rd would be; a power chord has none.
    const third = chord.third ?? (has(5) ? 5 : has(2) ? 2 : null);
    const top = chord.seventh === 10 || chord.seventh === 9 ? chord.seventh : 12;
    // The box walks through a major 6th only; an Aeolian minor takes the pentatonic box.
    const sixth = rockingSixth(chord) === 9 ? 9 : null;
    if (third === null) {
        // R-5-6-5, the Chuck Berry figure on a power chord.
        return { up: [0, fifth, 9, fifth], down: [top, 9, fifth, 9] };
    }
    if (sixth !== null) {
        return { up: [0, third, fifth, sixth], down: [top, sixth, fifth, third] };
    }
    if (chord.third === 3 && fifth === 7) {
        return { up: [0, 3, 5, 7], down: [top, 7, 5, 3] };
    }
    return { up: [0, third, fifth, top], down: [top, fifth, third, fifth] };
}

/**
 * How many whole bars in a row this section has already spent on `chord` before this one
 * (0 = it arrives here). Keyed on the timeline, not on what was generated, so any bar
 * regenerates the same half of the box.
 */
function barsOnChord(ctx: BarContext, chord: ChordFacts): number {
    let run = 0;
    for (let i = ctx.bar.index - 1; i >= 0; i--) {
        const bar = ctx.timeline.bars[i];
        if (bar.visit.ordinal !== ctx.bar.visit.ordinal || bar.spans.length > 1) {
            break;
        }
        if (bar.spans[0]?.chord?.symbol !== chord.symbol) {
            break;
        }
        run++;
    }
    return run;
}

// Which beats of a bar get the shuffle lope (the note re-struck on the swung "and"), as a
// section's choice at mid energy: none (the box walked in quarters), the "and" of 4 (a
// pickup into the next bar), or 2 and 4 (half the shuffle). High energy lopes every beat.
const MID_LOPES: readonly [number[], number][] = [
    [[], 2],
    [[3], 2],
    [[1, 3], 1],
];

/**
 * The shuffle bass, by energy. Low: a two-feel, root and fifth, with an approach on 4 into a
 * change. Mid: the boogie box in quarter notes. High: the box as a shuffle — every quarter
 * re-struck on the swung "and", long-short, da-DUM. The old engine's lesson: the lope
 * repeats the beat's pitch, it never moves on the "and".
 */
const shuffleBass: PitchedIdiom = {
    name: 'boogie shuffle',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                const root = nearestMidi(chord.bass, last ?? BASS.home, BASS.lo, BASS.hi);
                events.push(bassNote(bar, 0, root, 16, dyn(100, plan.energy)));
            }
            return { events, memory: { last } };
        }
        const common = isCommonTime(bar);
        // One register for the section, low enough that the box's b7 stays under the slot's
        // ceiling (a root no higher than A2).
        const anchor = BASS.home - 2 + ctx.rng('register', 'section').int(5);
        const boxRoot = (pc: number) => nearestMidi(pc, anchor, BASS.lo, 45);
        const lopes = new Set(
            tier === 'high'
                ? [0, 1, 2, 3]
                : tier === 'mid'
                  ? ctx.rng('lope', 'section').weighted(MID_LOPES)
                  : [],
        );
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            const root = boxRoot(chord.bass);
            const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const change = following && following.bass !== chord.bass ? following : null;
            const rng = ctx.rng(`shuffle${i}`);
            const beats = pulses(bar)
                .map((p) => p.step)
                .filter((s) => s >= from && s < to);
            // A chord that arrives off the beat is still struck where it arrives.
            if (span.attack && !beats.includes(from)) {
                beats.unshift(from);
            }
            const notes: { step: number; midi: number; length: number; velocity: number }[] = [];

            if (tier === 'low' && common) {
                // Two-feel: the chord's bass on its arrival, the fifth on 3 (below the root when
                // the root sits high, so the line stays down). A change after a half note may
                // take a quarter-note approach on 4 (35%: a push, not a habit).
                const up = chord.root + (chord.fifth ?? 7);
                const fifth = nearestMidi(mod12(up), root + 4, BASS.lo, BASS.hi);
                const halves = beats.filter((s, k) => k === 0 || s % 8 === 0);
                halves.forEach((step, k) => {
                    notes.push({
                        step,
                        midi: k === 0 ? root : fifth,
                        length: 0,
                        velocity: k === 0 ? 98 : 88,
                    });
                });
                const tail = notes[notes.length - 1];
                if (change && tail && to - tail.step >= 8 && rng.chance(0.35)) {
                    // Aim at the octave the next chord will actually be played in.
                    const target = boxRoot(change.bass);
                    let note = approach(target, chord, pickApproach(rng, false));
                    if (note === tail.midi || note === target) {
                        note = approach(target, chord, 'chromatic-below');
                    }
                    notes.push({ step: to - 4, midi: note, length: 0, velocity: 84 });
                }
                notes.forEach((n, k) => {
                    n.length = ((notes[k + 1]?.step ?? to) - n.step) * 0.92;
                });
            } else {
                // The box: ascending on the bar a chord arrives, descending on the bar after
                // (and so on, two bars to a box). A chord that starts mid-bar walks up. Odd
                // meters walk the ascending half on their pulses.
                const box = boogieBox(chord);
                const descend = common && from === 0 && barsOnChord(ctx, chord) % 2 === 1;
                const degrees = descend ? box.down : box.up;
                beats.forEach((step, k) => {
                    let midi = root + degrees[k % degrees.length];
                    // The box's last note before a change that already *is* the next chord's
                    // bass would sound the arrival a beat early: lead in from a half step under.
                    if (k === beats.length - 1 && change && mod12(midi) === change.bass) {
                        midi = approach(midi, chord, 'chromatic-below');
                    }
                    const gap = (beats[k + 1] ?? to) - step;
                    const lope = common && lopes.has(step / 4) && gap >= 4;
                    const accent = k === 0 ? 100 : step % 8 === 0 ? 94 : 88;
                    // Long-short: with a lope the beat note stops short of the swung "and";
                    // without one, the quarter is played full but detached.
                    notes.push({ step, midi, length: lope ? 1.8 : gap * 0.85, velocity: accent });
                    if (lope) {
                        notes.push({ step: step + 2, midi, length: 0.8, velocity: 70 });
                    }
                });
            }
            for (const n of notes) {
                events.push(bassNote(bar, n.step, n.midi, n.length, dyn(n.velocity, plan.energy)));
                last = n.midi;
            }
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
// Keyboard figures, one per section, as bar positions on the eighth grid. Low energy holds
// the chord (with a push on the "and" of 4, or a Charleston lean). Mid energy chops on 2 and
// 4 like a second snare, or pushes on the "and"s. High energy pumps every swung eighth, the
// boogie piano's right hand — or leans on 2, 4 and the "and"s after them.
const KEYS_FIGURES: Record<EnergyTier, readonly [number[], number][]> = {
    low: [
        [[0], 3],
        [[0, 14], 2],
        [[0, 6], 1],
    ],
    mid: [
        [[4, 12], 3],
        [[0, 6], 2],
        [[6, 14], 2],
        [[4, 10, 14], 1],
    ],
    high: [
        [[0, 2, 4, 6, 8, 10, 12, 14], 2],
        [[4, 6, 12, 14], 2],
        [[0, 6, 10, 14], 1],
    ],
};

function bluesKeysRhythm(
    ctx: BarContext,
    { from, to }: { from: number; to: number },
    tier: EnergyTier,
): Hit[] {
    const figure = ctx.rng('figure', 'section').weighted(KEYS_FIGURES[tier]);
    const pump = figure.length === 8;
    const steps = figure.filter((s) => s >= from && s < to);
    return steps.map((step, k) => {
        const offbeat = step % 4 !== 0;
        if (tier === 'low') {
            // Held until the next strike: the pad breathes, it doesn't chop.
            return {
                step,
                length: ((steps[k + 1] ?? to) - step) * 0.95,
                velocity: offbeat ? 80 : 74,
            };
        }
        if (pump) {
            // Long on the beat, short and light on the "and": the same long-short as the bass.
            return offbeat
                ? { step, length: 1, velocity: 66 }
                : { step, length: 1.5, velocity: 84 };
        }
        // Stabs; the chop on 2 and 4 and the pushes on the "and"s are the accented ones.
        const chop = step % 8 === 4;
        return { step, length: 1.5, velocity: offbeat || chop ? 90 : 78 };
    });
}

const bluesKeys = compIdiom({
    name: 'blues comp',
    // Rootless: the 3rd and b7 with the 9th and 13th over a dominant — the blues' home chord
    // with its colours, and the bass has the root.
    kind: 'rootless',
    // Anticipating the next chord on the "and" of 4 (into the IV, the V, the turnaround) is
    // the blues pianist's push; it grows with the band.
    push: { low: 0.3, mid: 0.4, high: 0.5 },
    rhythm: (ctx, span, tier) => bluesKeysRhythm(ctx, span, tier),
});

// ---------------------------------------------------------------- guitar
// Strum lines on the eighth-note pendulum (`-` a muted scratch). With a bass in the band the
// shuffle guitarist chops: short strokes on 2 and 4 with the snare; the hand keeps the lope
// with a muted scratch on the "and"; or the chuck, strummed beats with scratched "and"s.
const GUITAR_MID: readonly [string, number][] = [
    ['....X.-.....X.-.', 2],
    ['x.-.X.-.x.-.X.-.', 1],
];

const shuffleGuitar = compIdiom({
    name: 'blues rhythm guitar',
    // Four-string 7th and 6th grips (a written 13 takes the 5th's seat), off the bass's low
    // strings. No open strings: a chop is damped by releasing the fretting hand, and an open
    // string would ring on through it.
    kind: 'close',
    grip: { strings: 4, slot: { lo: 50, hi: 76, top: 64 }, open: false },
    // No bassist, low energy: the same chops, full root-position chords on five strings.
    alone: { strings: 5, slot: { lo: 40, hi: 76, top: 64 }, rootBottom: true, open: false },
    // A shuffle guitar marks time; only the full strum at high energy anticipates a change
    // (its upstroke on the "and" of 4).
    push: { low: 0, mid: 0, high: 0.2 },
    rhythm(ctx, { from, to }, tier) {
        if (!isCommonTime(ctx.bar)) {
            // Odd meters: a short stroke on each pulse after the first (the backbeats of the
            // meter), the chord's arrival struck by the machinery.
            return pulses(ctx.bar)
                .filter((p) => p.index > 0 && p.step >= from && p.step < to)
                .map((p) => ({ step: p.step, length: 1.2, velocity: 84, stroke: 'down' as const }));
        }
        if (tier === 'low') {
            return strums('....x.......x...', from, to, 2, 1.2);
        }
        if (tier === 'mid') {
            return strums(ctx.rng('strum', 'section').weighted(GUITAR_MID), from, to, 2, 1.2);
        }
        // The full shuffle strum: down on every beat, a light upstroke on every swung "and".
        return strums('x.x.X.x.x.x.X.x.', from, to, 2, 1.6);
    },
});

/**
 * The comp's memory, as `compIdiom` keeps it. The boogie below plays some bars in its place,
 * and hands the same memory back so the book picks up where the boogie left off.
 */
interface HandMemory {
    voicing: number[] | null;
    chord?: string | null;
    pushed: boolean;
}

/** The boogie's arrival chord: a full root-position grip whose bottom string is the boogie's. */
const BOOGIE_GRIP: GripShape = {
    strings: 5,
    slot: { lo: 40, hi: 72, top: 60 },
    rootBottom: true,
    open: true,
};

/**
 * The Jimmy Reed boogie, for a guitarist with no bassist: the guitar is the bottom now. The
 * root on the low string on every beat, and the string above it on the swung "and", 5th then
 * 6th (R-5, R-6, the boogie's rock), reaching up to the b7 on beat 3 at high energy on a
 * dominant chord (R-5, R-6, R-b7, R-6). Each chord's arrival is the whole chord, root on the
 * same bottom string, so the harmony is stated before the boogie implies it.
 *
 * Jimmy Reed strikes the two strings together as a dyad. Here the pick alternates between
 * them, root on the downstroke and the upper string on the upstroke: a two-note chord would
 * be a chord without its 3rd and 7th, which the band's comp never plays, while one string at
 * a time is the bass role (as the bossa thumb is).
 */
function boogie(ctx: BarContext, memory: HandMemory, tier: EnergyTier) {
    const { bar, plan } = ctx;
    const events: PitchedNote[] = [];
    let voicing = memory.voicing;
    let held = memory.chord ?? null;
    const note = (step: number, midi: number, length: number, velocity: number, up: boolean) => ({
        lane: 'comp' as const,
        tick: at(bar, step),
        dur: length * STEP,
        midi,
        velocity: dyn(velocity, plan.energy),
        offsetMs: 0,
        bar: bar.index,
        stroke: up ? ('up' as const) : ('down' as const),
    });
    spanSteps(bar).forEach(({ span, from, to }, index) => {
        const chord = span.chord;
        if (!chord) {
            held = null;
            return;
        }
        // The previous bar anticipated this chord (or it is held over from it): the hand is
        // already on it, ringing over the barline, so the arrival is not struck again.
        const tiedIn = index === 0 && (memory.pushed || !span.attack);
        const shape = grip(chord, 'close', BOOGIE_GRIP, voicing);
        const low = shape[0];
        const root = low !== undefined && low <= 52 ? low : nearestMidi(chord.bass, 45, 40, 52);
        const fifth = chord.fifth ?? 7;
        // A chord with nothing to rock to stays on its 5th.
        const sixth = rockingSixth(chord) ?? fifth;
        const reach = tier === 'high' && chord.seventh === 10;
        // The beats of the span, plus the chord's arrival when it lands off the beat.
        const beats = [0, 4, 8, 12].filter((s) => s >= from && s < to);
        if (!beats.includes(from)) {
            beats.unshift(from);
        }
        for (const step of beats) {
            const beat = Math.floor(step / 4);
            if (step === from && !tiedIn) {
                events.push(...shape.map((m) => note(step, m, 1.8, 92, false)));
            } else if (!(step === 0 && memory.pushed)) {
                events.push(note(step, root, 1.8, beat % 2 === 0 ? 92 : 86, false));
            }
            // The upper string on the swung "and" (none after an off-beat arrival: the next
            // beat is already there).
            if (step % 4 === 0 && step + 2 < to) {
                const upper = beat % 2 === 0 ? (reach && beat === 2 ? 10 : fifth) : sixth;
                events.push(note(step + 2, root + upper, 0.8, 72, true));
            }
        }
        voicing = shape;
        held = chord.symbol;
    });
    return { events, memory: { voicing, pushed: false, chord: held } satisfies HandMemory };
}

const bluesGuitar: PitchedIdiom = {
    name: shuffleGuitar.name,
    init: shuffleGuitar.init,
    play(ctx, memory: HandMemory) {
        const tier = energyTier(ctx.plan.energy);
        // The boogie takes over only where it is the idiom: no bassist, the band moving, a 4/4
        // bar with no fermata, no slash chord (its bass note is not a boogie root), not the end.
        const boogieBar =
            !ctx.plan.lanes.bass &&
            tier !== 'low' &&
            !ctx.plan.ending &&
            isCommonTime(ctx.bar) &&
            ctx.bar.spans.every((s) => !s.fermata && (!s.chord || s.chord.bass === s.chord.root));
        return boogieBar ? boogie(ctx, memory, tier) : shuffleGuitar.play(ctx, memory);
    },
};

export const blues: Style = {
    id: 'blues',
    name: 'Blues',
    // A shuffle: swung eighths at 90 (the offbeat at ~65% of the beat, next to a hard
    // triplet), the old engine's Blues setting and well past jazz's lighter 72. The blues sits
    // back: the bass a hair behind the drums for weight, the keys further back, lazy. The
    // rhythm guitar's chops sit with the snare, and alone its boogie is the band's bottom, so
    // it leans only as much as the bass.
    feel: {
        swing: 90,
        swingGrid: 8,
        lean: { bass: 2, comp: 6 },
        compLean: { guitar: 2 },
        humanize: 35,
    },
    drums: bluesDrums,
    bass: shuffleBass,
    comp: { keyboard: bluesKeys, guitar: bluesGuitar },
    // The Hammond organ, as the old engine chose. With no soloist yet the comp is the only
    // voice above the bass: the organ's held rootless 9ths and 13ths fill the space a lead
    // will take, under a shuffle the drums and bass already carry. The guitar's with-bass
    // part is chops on 2 and 4, which is thin as a band's only harmony.
    prefers: 'organ',
};
