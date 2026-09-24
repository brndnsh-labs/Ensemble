// cspell:disable — pattern lines (x/o/g/X/.) are not words.
/**
 * Ska-Punk: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * The genre is a switch. Verses are ska: the upstroke skank on every "and", a walking bass,
 * the kick on 1 and 3 under a backbeat. Choruses are punk: the skate beat, driving root
 * eighths, down-picked chords. One function (`modeOf`) decides which a bar plays, from the
 * form and the band's energy — never from a coin flip — and every lane asks it, so the whole
 * band changes gear together at the section line.
 *
 * The frame is the fast count (~150–200 bpm): the skank is an eighth-note offbeat, and the
 * hand that plays it swings in eighths.
 */
import { type BarPlan, type EnergyTier, energyTier } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type { PitchedNote } from '../core/types.js';
import type { Bar } from '../form/timeline.js';
import { BASS, bassNote, bassPc, nextChord, place } from '../players/bass/line.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, snareFigure } from '../players/drums/kit.js';
import { barSteps, dyn, pulses, spanSteps } from '../players/grid.js';
import { type ChordFacts, chordPcs } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ the switch
type Mode = 'ska' | 'punk';

const CHORUS = /^(chorus|hook|refrain)/i;

/**
 * Ska or punk, for one bar. The chorus is punk at any energy — the verse/chorus contrast *is*
 * the genre, so even a quiet chorus kicks into the punk gear. Anywhere else the band plays
 * ska until it is driving hard (the high tier), where every section goes punk. Energy is
 * bar-stable inside a section (the plan only lifts a section's last bar into a bigger one),
 * so a section keeps its gear; a verse already near the top may drop into the punk beat for
 * its last bar, which is how a band kicks into a chorus.
 */
function modeOf(bar: Bar, plan: BarPlan): Mode {
    return CHORUS.test(bar.visit.label.trim()) || energyTier(plan.energy) === 'high'
        ? 'punk'
        : 'ska';
}

const modeAt = (ctx: BarContext): Mode => modeOf(ctx.bar, ctx.plan);

/** Each pulse's last eighth, its offbeat: a 4/4 beat's "and" (a 6/8 group's third eighth). */
const offbeats = (bar: Bar): number[] => pulses(bar).map((p) => p.step + p.steps - 2);

// ================================================================ drums
/**
 * Ska time. The kick on 1 and 3 and the backbeat on 2 and 4 are the frame; what a section
 * chooses is the hat (its motif, kept every time the section comes round):
 * - skank: the hat only on the "and"s, pushing the offbeat the guitar chops on;
 * - driving: every eighth, the "and"s leaned on and the beats light (the old engine's
 *   offbeat hat was ~1.6x its on-beat), so the time drives but still skanks;
 * - two-step: the kick on all four beats under the offbeat hat, the ska two-step.
 */
const SKA_TIME: readonly [Lines, number][] = [
    [{ kick: 'x.......x.......', snare: '....X.......X...', hat: '..X...X...X...X.' }, 3],
    [{ kick: 'x.......x.......', snare: '....X.......X...', hat: 'o.X.o.X.o.X.o.X.' }, 3],
    [{ kick: 'x...x...x...x...', snare: '....X.......X...', hat: '..X...X...X...X.' }, 2],
];

/**
 * Punk time.
 * - skate: the fast punk beat ("polka"): the kick on every beat, the snare on every "and",
 *   the hat on every eighth — the chorus's gear once the band is driving;
 * - drive: the eighth-note rock beat, the backbeat on 2 and 4 and a pushed "and" of 3 —
 *   for a punk verse (a hot band) and a quiet chorus, so the skate beat stays the peak.
 */
const SKATE: Lines = {
    kick: 'x...x...x...x...',
    snare: '..X...X...X...X.',
    hat: 'x.x.x.x.x.x.x.x.',
};
const DRIVE: Record<EnergyTier, Lines> = {
    low: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'o.g.o.g.o.g.o.g.' },
    mid: { kick: 'x.......x.x.....', snare: '....X.......X...', hat: 'x.o.x.o.x.o.x.o.' },
    high: { kick: 'x.......x.x.....', snare: '....X.......X...', hat: 'X.x.X.x.X.x.X.x.' },
};

/** Punk with crashes: a driving band hits the crash on the One of every second bar. */
function withCrash(lines: Lines): Lines {
    const hat = lines.hat ?? '';
    return { ...lines, hat: `.${hat.slice(1)}`, crash: 'X...............' };
}

const skaPunkDrums = drumIdiom({
    name: 'ska-punk',
    // `crash` keeps time too: on an arrival the kit's own crash replaces the written one.
    timekeeper: ['hat', 'hatOpen', 'crash'],
    // Fast snare rolls: a beat of sixteenths into a phrase, two beats (or a bar-half at full
    // tilt) into a new section.
    fillLength: { phrase: { low: 2, mid: 4, high: 4 }, section: { low: 4, mid: 4, high: 8 } },
    groove(ctx, tier) {
        if (modeAt(ctx) === 'punk') {
            const chorus = CHORUS.test(ctx.bar.visit.label.trim());
            const lines = chorus && tier === 'high' ? SKATE : DRIVE[tier];
            return tier === 'high' && ctx.bar.barInVisit % 2 === 0 ? withCrash(lines) : lines;
        }
        if (tier === 'low') {
            // Quiet ska: the frame and a light offbeat hat. The quietest band plays cross-stick
            // (the old engine's sidestick below 0.3): a full snare there reads as punk.
            return {
                kick: 'x.......x.......',
                hat: '..o...o...o...o.',
                ...(ctx.plan.energy < 0.3
                    ? { rim: '....x.......x...' }
                    : { snare: '....x.......x...' }),
            };
        }
        return ctx.rng('time', 'section').weighted(SKA_TIME);
    },
    cells(ctx, tier) {
        const punk = modeAt(ctx) === 'punk';
        const hat = punk ? (tier === 'low' ? 'o.o.' : 'x.x.') : tier === 'low' ? '..o.' : '..X.';
        return {
            down: { kick: 'x...', hat },
            back: { snare: tier === 'low' ? 'x...' : 'X...', hat },
            strong: { kick: 'x...', hat },
        };
    },
    // Snare only, sixteenths, crescendo into the downbeat; the kick keeps its part under it.
    fill: (_ctx, steps, rng) => ({ snare: snareFigure(steps, rng, 1) }),
});

// ================================================================ bass
interface SkaBassMemory {
    last: number | null;
    /**
     * The exact pitch the line chose for the next chord's arrival. Each bar decides where the
     * next root sits (and leads into it from there), and the next bar arrives exactly there —
     * so an approach resolves by a half step *in pitch*, in either gear and across the switch.
     */
    land: number | null;
}

/**
 * A root where the line has nothing to lead from (the top of the tune, after an N.C.): the
 * tune's one register, song-scoped, around the middle of the neck.
 */
function songRoot(ctx: BarContext, pc: number): number {
    const anchor = BASS.home - 1 + ctx.rng('register', 'song').int(4);
    return nearestMidi(pc, anchor, BASS.lo, BASS.hi);
}

/** Cost of a move in a walking line: steps are free, thirds cost, a leap past a fourth is out. */
function moveCost(a: number, b: number): number {
    const d = Math.abs(a - b);
    if (d === 0 || d > 7) {
        return Infinity;
    }
    return d <= 2 ? 0 : d <= 4 ? 1.5 : d === 5 ? 3 : 5;
}

/** An arrival the walk may aim at, and what aiming there costs (its distance from home). */
interface Target {
    midi: number;
    cost: number;
}

/**
 * The ska walk over one chord: quarter notes that move by step. Beat one is the arrival
 * (`first`); when a chord follows, the last beat is its approach — a half step from the
 * arrival it points at, from below or above — and the beats between walk the chord's scale
 * to it, chord tones preferred on the strong beat, never touching the next chord's bass note
 * early. A line keeps its direction (a walk runs up or down; turning back costs), so it
 * reads as a line and not a trill. Found as the cheapest path (a small dynamic programme over
 * the bass register and the line's direction), with a seeded nudge so equal lines vary from
 * bar to bar. Returns the line and the arrival its approach points at.
 */
function walk(
    chord: ChordFacts,
    first: number,
    strong: boolean[],
    targets: Target[] | null,
    rng: Rng,
): { line: number[]; land: number | null } {
    const count = strong.length;
    if (count === 1) {
        return { line: [first], land: null };
    }
    const tones = new Set(chordPcs(chord));
    const inScale = (m: number) =>
        tones.has(mod12(m)) || chord.scale.includes(mod12(m - chord.root));
    const avoid = targets ? mod12(targets[0].midi) : null;
    // A state is a pitch and the direction the line arrived at it from (0 at the start).
    type Cell = {
        midi: number;
        dir: number;
        cost: number;
        from: string | null;
        land: number | null;
        /** The pitch before this one: a walk doesn't step out and straight back. */
        prev: number | null;
    };
    let layer = new Map<string, Cell>([
        [`${first}:0`, { midi: first, dir: 0, cost: 0, from: null, land: null, prev: null }],
    ]);
    const layers: Map<string, Cell>[] = [layer];
    for (let k = 1; k < count; k++) {
        // Candidates for this beat: [pitch, its own cost, the arrival it aims at].
        const options: [number, number, number | null][] = [];
        if (k === count - 1 && targets) {
            for (const t of targets) {
                for (const m of [t.midi - 1, t.midi + 1]) {
                    if (m >= BASS.lo && m <= BASS.hi) {
                        options.push([m, t.cost, t.midi]);
                    }
                }
            }
        } else {
            for (let m = BASS.lo; m <= BASS.hi; m++) {
                if (!inScale(m) || mod12(m) === avoid) {
                    continue;
                }
                // Chord tones on the strong beat (beat 3), passing tones between.
                const colour = strong[k] && !tones.has(mod12(m)) ? 1.2 : 0;
                options.push([m, colour + rng.next() * 0.6, null]);
            }
        }
        const next = new Map<string, Cell>();
        for (const [m, own, land] of options) {
            for (const [key, cell] of layer) {
                const dir = Math.sign(m - cell.midi);
                const turn = cell.dir !== 0 && dir !== cell.dir ? 0.9 : 0;
                const back = m === cell.prev ? 2 : 0;
                const cost = cell.cost + moveCost(cell.midi, m) + own + turn + back;
                const at = `${m}:${dir}`;
                if (cost < Infinity && cost < (next.get(at)?.cost ?? Infinity)) {
                    next.set(at, { midi: m, dir, cost, from: key, land, prev: cell.midi });
                }
            }
        }
        if (!next.size) {
            // No walk fits (a short span into a far chord): hold the arrival.
            return { line: Array.from({ length: count }, () => first), land: null };
        }
        layer = next;
        layers.push(layer);
    }
    let end: Cell | null = null;
    for (const cell of layer.values()) {
        if (cell.cost < (end?.cost ?? Infinity)) {
            end = cell;
        }
    }
    const line: number[] = [];
    for (let k = count - 1, cell = end; k >= 0 && cell; k--) {
        line.unshift(cell.midi);
        cell = cell.from === null ? null : (layers[k - 1].get(cell.from) ?? null);
    }
    return { line, land: end?.land ?? null };
}

/**
 * The bass: a ska walking line in ska bars, driving root eighths in punk bars. Both honour
 * `land`, the exact pitch the bar before led into, so every approach resolves by a half step
 * in pitch, across the switch too.
 */
const skaPunkBass: PitchedIdiom = {
    name: 'ska walk / punk drive',
    init: (): SkaBassMemory => ({ last: null, land: null }),
    play(ctx, memory: SkaBassMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let { last, land } = memory;
        const arrive = (chord: ChordFacts) =>
            land !== null && mod12(land) === bassPc(chord) ? land : songRoot(ctx, bassPc(chord));
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                const root = arrive(chord);
                events.push(bassNote(bar, 0, root, 16, dyn(104, plan.energy)));
                last = root;
            }
            return { events, memory: { last, land: null } };
        }
        const mode = modeAt(ctx);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        const beats = pulses(bar);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                land = null;
                return;
            }
            const first = arrive(chord);
            land = null;
            if (span.fermata) {
                events.push(bassNote(bar, from, first, (to - from) * 0.95, dyn(96, plan.energy)));
                last = first;
                return;
            }
            const isLast = i === spans.length - 1;
            const following = spans[i + 1]?.span.chord ?? (isLast ? next : null);
            // Where the next chord's root sits by default: its nearest octave, drifting home.
            const home = following ? place(bassPc(following), first) : null;

            if (mode === 'punk') {
                // Driving root eighths (quarters when the band is quiet), picked even and
                // detached, the beats a touch harder. The last eighth leads into a change by a
                // half step from the side the line is on — into every change in a section whose
                // bassist walks them (its choice), and always into a new section.
                const every = tier === 'low' ? 4 : 2;
                const steps: number[] = [];
                for (let s = from; s < to; s += every) {
                    steps.push(s);
                }
                const newSection = isLast && ctx.next?.bar.barInVisit === 0;
                const leads = newSection || ctx.rng('lead', 'section').chance(0.5);
                steps.forEach((step, k) => {
                    let midi = first;
                    const tail = k === steps.length - 1 && to - step <= 2;
                    if (tail && leads && home !== null && Math.abs(home - first) > 1) {
                        midi = home > first ? home - 1 : home + 1;
                    }
                    const gap = (steps[k + 1] ?? to) - step;
                    const velocity = step % 4 === 0 ? 100 : 88;
                    events.push(bassNote(bar, step, midi, gap * 0.8, dyn(velocity, plan.energy)));
                    last = midi;
                });
                land = home;
                return;
            }

            // Ska: the walk, a note on every beat of the chord (from its arrival). A quiet ska
            // band walks in two: half notes on the arrival and the strong beat, and a chord
            // held for a whole bar keeps its approach on the last beat. A two-beat chord is a
            // half note, and the next one arrives from it.
            let steps = beats.map((b) => b.step).filter((s) => s >= from && s < to);
            if (!steps.includes(from)) {
                steps.unshift(from);
            }
            const isStrong = (s: number) => beats.some((b) => b.step === s && b.role !== 'back');
            if (tier === 'low') {
                const long = steps.length > 2;
                steps = steps.filter(
                    (s, k) =>
                        k === 0 || isStrong(s) || (long && k === steps.length - 1 && following),
                );
            }
            const strong = steps.map((s, k) => k > 0 && isStrong(s));
            // The walk may aim at any octave of the next root; one away from its default costs
            // (the line may climb, but it comes home).
            const targets =
                home === null
                    ? null
                    : [home - 12, home, home + 12]
                          .filter((t) => t > BASS.lo && t < BASS.hi)
                          .map((t) => ({ midi: t, cost: Math.abs(t - home) * 0.25 }));
            const { line, land: aim } = walk(chord, first, strong, targets, ctx.rng(`walk${i}`));
            line.forEach((midi, k) => {
                const gap = (steps[k + 1] ?? to) - steps[k];
                // Bouncy, not legato: a ska line is plucked short; the arrival leans in and the
                // approach pushes into the change.
                const approach = k === line.length - 1 && aim !== null;
                const velocity = k === 0 ? 100 : approach ? 94 : 86;
                events.push(bassNote(bar, steps[k], midi, gap * 0.8, dyn(velocity, plan.energy)));
                last = midi;
            });
            land = aim ?? home;
        });
        return { events, memory: { last, land } satisfies SkaBassMemory };
    },
};

// ================================================================ comp
/** A skank line: a chop on every offbeat of the bar, `X` (or a lighter `x` when quiet). */
function skankLine(bar: Bar, tier: EnergyTier): string {
    const line = Array.from({ length: barSteps(bar) }, () => '.');
    for (const s of offbeats(bar)) {
        line[s] = tier === 'low' ? 'x' : 'X';
    }
    return line.join('');
}

/** The punk hand: a downstroke on every eighth, the beats accented when the band drives. */
function driveLine(bar: Bar, tier: EnergyTier): string {
    const beats = new Set(pulses(bar).map((p) => p.step));
    return Array.from({ length: barSteps(bar) }, (_, s) => {
        if (tier === 'low') {
            return beats.has(s) ? 'x' : '.';
        }
        if (s % 2 !== 0) {
            return '.';
        }
        return tier === 'high' && beats.has(s) ? 'X' : 'x';
    }).join('');
}

const skaPunkKeys = compIdiom({
    name: 'ska-punk organ skank',
    // Tight three-note chords (the triad, or root-3rd-7th): a chop, and a fuller voicing muds it.
    kind: 'shell',
    // Chopped in both gears, never held (see `CompBook.percussive`). The old engine's ska comp
    // cut the sustain pedal and clamped every chord to a sixteenth at every intensity: the
    // Hammond skank is a staccato part, and in a punk chorus it drives the eighths the same
    // way rather than turning into a pad under the guitars.
    percussive: true,
    // The skank never anticipates: it is the clock's offbeat, and a push would smear it.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to }, tier) {
        const hits: Hit[] = [];
        if (modeAt(ctx) === 'ska') {
            // The skank: a chop on every "and", damped at once — the silence after it is the beat.
            for (const s of offbeats(ctx.bar)) {
                if (s >= from && s < to) {
                    hits.push({ step: s, length: 0.9, velocity: tier === 'low' ? 80 : 96 });
                }
            }
            return hits;
        }
        // Punk: chopped eighths. The old engine's ska keys only ever added downbeats as the
        // band got louder, keeping the "and"s on top — so the "and" stays the accent, and the
        // part is still a skank inside the drive.
        for (let s = from - (from % 2); s < to; s += 2) {
            if (s >= from) {
                hits.push({ step: s, length: 1.2, velocity: s % 4 === 2 ? 96 : 82 });
            }
        }
        return hits;
    },
});

// ---------------------------------------------------------------- guitar
/**
 * The ska skank: an upstroke on every "and", on a small grip high on the neck (the top three
 * strings, a triad or root-3rd-7th), far above the bass. At ska-punk tempos the strumming hand
 * swings in *eighths* — down on the beat, where it passes the strings without touching them,
 * up on the "and" — so the pendulum makes every skank an upstroke (reggae's slow count swings
 * the hand in sixteenths, which is why its 2-and-4 chop is a downstroke; ska's fast count is
 * the other way round). No open strings: the fretting hand damps the chop the instant after it
 * sounds, and an open string would ring on through the release. With no bassist the grip stays
 * up here — the skank is a chop, not a bottom.
 */
const skankGuitar = compIdiom({
    name: 'ska upstroke skank',
    kind: 'shell',
    grip: { strings: 3, slot: { lo: 55, hi: 81, top: 72, pull: 0.8 }, open: false },
    push: { low: 0, mid: 0, high: 0 },
    rhythm: (ctx, { from, to }, tier) => strums(skankLine(ctx.bar, tier), from, to, 2, 0.8),
});

/**
 * The punk hand: down-picked eighths. Every stroke is a downstroke because the hand now swings
 * in sixteenths — down on each eighth, and the up in between misses the strings — the
 * Ramones-style downpicking that gives punk its even, relentless attack. Palm-muted in the
 * middle of the energy range: the heel of the hand chokes each chord to a sixteenth, keeping
 * its pitch (the engine's `muted` flag is a dead scratch with the pitch gone, which a palm mute
 * isn't, so it is written as a choked strum). A driving band lifts the palm and lets each
 * eighth ring into the next, the beats accented; a quiet chorus strums quarters.
 *
 * Open triads rather than power chords: a power chord drops the 3rd, and the band's harmony
 * (the organ's skank, the chart's 7ths) keeps it — a stripped fifth under a sounding third is a
 * different chord. Four strings, the root or fifth doubled, off the bass's low strings; with no
 * bassist, full root-position chords on five strings, down where a punk guitar lives alone.
 */
const punkGuitar = compIdiom({
    name: 'punk downstrokes',
    kind: 'close',
    grip: { strings: 4, slot: { lo: 50, hi: 74, top: 64, pull: 0.6 } },
    alone: { strings: 5, slot: { lo: 40, hi: 76, top: 64 }, rootBottom: true },
    // A push is an ensemble hit; the guitar doesn't jump the band alone.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to }, tier) {
        const ring = tier === 'low' ? 3.6 : tier === 'mid' ? 1 : 2;
        return strums(driveLine(ctx.bar, tier), from, to, 1, ring);
    },
});

/**
 * The guitarist switches hands at the section line: skank in ska bars, downstrokes in punk
 * bars. One hand, one memory: the grip held at the end of a verse is where the chorus's first
 * chord is found from. Spreads the skank idiom, so any flag it carries survives the wrapper.
 */
const skaPunkGuitar: PitchedIdiom = {
    ...skankGuitar,
    name: 'ska-punk guitar',
    play: (ctx, memory) => (modeAt(ctx) === 'punk' ? punkGuitar : skankGuitar).play(ctx, memory),
};

export const skapunk: Style = {
    id: 'skapunk',
    name: 'Ska-Punk',
    // Fast and straight. The drums are the clock; the comp sits a hair ahead of them (the old
    // engine pushed ska 4 ms on top), the urgency that tells ska-punk from reggae's deep
    // pocket. The bass stays on the kick: a walking line that rushed would drag the band.
    // Tight: the old engine held ska-punk's time nearly rigid at these tempos, where a
    // loose hand reads as sloppy rather than human.
    feel: { swing: 0, swingGrid: 8, lean: { bass: 0, comp: -4 }, humanize: 20 },
    drums: skaPunkDrums,
    bass: skaPunkBass,
    comp: { keyboard: skaPunkKeys, guitar: skaPunkGuitar },
    // Guitar, against the old mapping's organ. The band has one comp instrument, and the genre
    // is the switch between two guitar parts: the upstroke skank in the verse and the
    // down-picked chords in the chorus. The organ can play the skank (and does, chopped, in both
    // gears), but it can't play the punk half, so on its own it makes a ska band that speeds up.
    // The old engine chose the organ in a two-channel world, where the chords lane skanked
    // beside a horn section; here the guitar is the part that carries both halves.
    prefers: 'guitar',
};
