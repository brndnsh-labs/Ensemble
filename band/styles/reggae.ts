// cspell:disable — pattern lines (x/o/X/R/5/O/-/.) are not words.
/**
 * Reggae: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * The frame is the slow count (~60–90 bpm): the one drop lands on beat 3 of a 4/4 bar, the
 * skank on 2 and 4, the organ bubbles on the sixteenths between. A chart written in the fast
 * count (skank on every "and") hears the same music at double the written tempo.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import {
    approach,
    BASS,
    BASS_SLOT_HI,
    bassNote,
    bassPc,
    kickSteps,
    type LineMemory,
    nextChord,
    pickApproach,
    place,
    targetAfter,
} from '../players/bass/line.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from '../players/drums/kit.js';
import { barSteps, dyn, isCommonTime, type Pulse, pulses, spanSteps } from '../players/grid.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// Hi-hat time for the one drop: straight eighths with the beat leaned on, or Carlton
// Barrett's shuffled sixteenths — each beat's "a" is a pickup into the next, which the
// style's light sixteenth swing pushes late into a lope.
const ONE_DROP_HATS = ['x.o.x.o.x.o.x.o.', 'x.oox.oox.oox.oo'];

/**
 * The high-energy riddims. Both keep the drop on 3 — the rimshot there is the genre's
 * signature at any energy — and put the kick back on the One:
 * - steppers: four on the floor, the insistent march of roots-and-culture militancy, with an
 *   open hat barking on every "and";
 * - rockers: kick on 1 and 3 (Sly Dunbar's driving pulse), shuffled sixteenths on the hat.
 */
const RIDDIMS: Record<'steppers' | 'rockers', Lines> = {
    steppers: {
        kick: 'x...x...x...x...',
        snare: '........X.......',
        hat: 'x...x...x...x...',
        hatOpen: '..x...x...x...x.',
    },
    rockers: {
        kick: 'x.......x.......',
        snare: '........X.......',
        hat: 'x.oox.oox.oox.oo',
    },
};

/** Put an open hat on `step` and take the closed hat off it (one hand, one cymbal). */
function openAt(hat: string, step: number): Lines {
    return {
        hat: `${hat.slice(0, step)}.${hat.slice(step + 1)}`,
        hatOpen: `${'.'.repeat(step)}x${'.'.repeat(15 - step)}`,
    };
}

const reggaeDrums = drumIdiom({
    name: 'reggae one drop',
    timekeeper: ['hat', 'hatOpen'],
    // Reggae fills are short and late: a quiet band barely fills at all, and even a section
    // change is a beat of rimshots or toms, never a bar-long run.
    fillLength: { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 2, mid: 4, high: 4 } },
    groove(ctx, tier) {
        if (tier === 'high') {
            const riddim = ctx.rng('riddim', 'section').pick(['steppers', 'rockers'] as const);
            return RIDDIMS[riddim];
        }
        if (tier === 'low') {
            // Sparse: a soft one drop under quiet eighths, no lift, no pickups.
            return {
                hat: 'o.g.o.g.o.g.o.g.',
                kick: '........o.......',
                rim: '........x.......',
            };
        }
        // The one drop: beat 1 is the hole that defines the genre — no kick, no snare —
        // and the kick and the cross-stick land together on 3.
        const hat = ctx.rng('hats', 'section').weighted([
            [ONE_DROP_HATS[0], 55],
            [ONE_DROP_HATS[1], 45],
        ]);
        // The open-hat lift on the "and" of 4 lifts the bar into the next: a section's
        // choice (kept every bar), and always in the bar before a new section.
        const lift =
            (ctx.plan.fill === 'none' && ctx.next?.plan.crash) ||
            ctx.rng('lift', 'section').chance(0.4);
        return {
            ...(lift ? openAt(hat, 14) : { hat }),
            kick: '........X.......',
            rim: '........X.......',
        };
    },
    cells(ctx, tier) {
        const hat = tier === 'low' ? 'o.g.' : 'x.o.';
        const drop: Lines = { kick: tier === 'low' ? 'o...' : 'x...', rim: 'X...', hat };
        // The drop lands on the bar's secondary downbeat when it has one (5/4's third pulse),
        // else on its backbeats (6/8's second pulse). The One stays empty below high energy.
        const strong = ctx.bar.meter.roles.includes('strong');
        return {
            down: tier === 'high' ? { kick: 'x...', hat } : { hat },
            back: strong ? { hat } : drop,
            strong: drop,
        };
    },
    fill: (_ctx, steps, rng) =>
        steps <= 2 ? { snare: snareFigure(steps, rng) } : tomRun(steps, rng, 2),
});

// ================================================================ bass
/**
 * One-bar riffs as sixteenth lines: R root, O octave, 5 fifth, 3 third, 6 the scale's sixth
 * (a passing tone); `-` holds the note before, `.` is silence. Reggae bass is
 * heavy and melodic *with space*: the rests are as written as the notes. Weights by tier.
 */
const RIFFS: readonly [string, Record<EnergyTier, number>][] = [
    // Leaves the One open, enters on the "and", climbs to the octave on the drop, then walks
    // down the arpeggio into the next bar.
    ['..R-R-.5O---5-3.', { low: 0, mid: 3, high: 3 }],
    // Plays the One and rests through 2 — the space after it is the riff — then answers.
    ['R---....R-5-O-5.', { low: 1, mid: 3, high: 2 }],
    // The hole on 1, a pickup third into the drop, and a scale step leading on.
    ['..R-..3-R---5-6-', { low: 0, mid: 2, high: 2 }],
    // Heavy halves: root with the drop, a fifth pickup (the quiet band's line).
    ['R-------R-----5-', { low: 3, mid: 1, high: 0 }],
    // Just the drop: the bass lands with kick and rim on 3 and holds.
    ['........R-------', { low: 2, mid: 0, high: 0 }],
];

/** The bass's section register: deep — a reggae line lives in the lowest octave. */
function deepRoot(ctx: BarContext, pc: number): number {
    const anchor = 33 + ctx.rng('register', 'section').int(4);
    return nearestMidi(pc, anchor, BASS.lo, BASS.hi);
}

/**
 * A riff code's pitch. `root` is the placed bass note (the slash note under a slash chord);
 * the other codes are the *chord's* tones, placed above it — over C/E the fifth is G.
 */
function riffPitch(code: string, root: number, chord: ChordFacts): number {
    const up = (interval: number) => {
        const m = root + mod12(chord.root + interval - root);
        return m > BASS.hi ? m - 12 : m;
    };
    switch (code) {
        case 'O':
            return root + 12 <= BASS_SLOT_HI ? root + 12 : root;
        case '5':
            return up(fifthOf(chord));
        case '3':
            // A sus chord's 4th stands in for its 3rd.
            return up(chord.third ?? (chord.intervals.includes(5) ? 5 : 7));
        case '6': {
            // The scale's sixth (major or minor), a passing tone on its way somewhere.
            const sixth = chord.scale.includes(9) ? 9 : chord.scale.includes(8) ? 8 : 7;
            return up(sixth);
        }
        default:
            return root;
    }
}

/** The riff for any other meter: the root on the drop pulse(s), a fifth leading on. */
function oddRiff(ps: Pulse[], total: number): string {
    const line = Array.from({ length: total }, () => '.');
    const strong = ps.some((p) => p.role === 'strong');
    for (const p of ps) {
        if (p.role === (strong ? 'strong' : 'back')) {
            line[p.step] = 'R';
            for (let s = p.step + 1; s < p.step + p.steps; s++) {
                line[s] = '-';
            }
        }
    }
    if (total >= 4) {
        line[total - 2] = '5';
    }
    return line.join('');
}

const reggaeBass: PitchedIdiom = {
    name: 'reggae riff',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                events.push(
                    bassNote(bar, 0, place(bassPc(chord), last), 16, dyn(104, plan.energy)),
                );
            }
            return { events, memory: { last } };
        }
        const total = barSteps(bar);
        // The riff belongs to the section: a verse keeps its line every time round.
        const line = isCommonTime(bar)
            ? ctx.rng('riff', 'section').weighted(RIFFS.map(([r, w]) => [r, w[tier]]))
            : oddRiff(pulses(bar), total);
        const kicks = kickSteps(ctx);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            const root = deepRoot(ctx, bassPc(chord));
            const codes = new Map<number, string>();
            for (let s = from; s < to; s++) {
                const c = line[s] ?? '.';
                if (c !== '.' && c !== '-') {
                    codes.set(s, c);
                }
            }
            // The bass leaves the One open only while the drummer does: when the kick plays
            // it (steppers, rockers, a crash after a fill), the bass lands on it too.
            // Notes the riff didn't write (the One, a mid-bar change) sound for a beat at most.
            const added = new Set<number>();
            if (from === 0 && !codes.has(0) && kicks.has(0)) {
                codes.set(0, 'R');
                added.add(0);
                // The One takes the place of the riff's entry on the "and": root, root is a
                // stutter, not a line.
                if (codes.get(2) === 'R') {
                    codes.delete(2);
                }
            }
            if (span.attack) {
                const arrival = codes.get(from);
                if (arrival !== undefined) {
                    // The chord arrives on its root (the octave is the root too).
                    if (arrival !== 'O') {
                        codes.set(from, 'R');
                    }
                } else if (from > 0) {
                    // A change inside the bar is stated where it happens; the barline change
                    // may keep the riff's hole on the One.
                    codes.set(from, 'R');
                    added.add(from);
                }
            }
            const steps = [...codes.keys()].sort((a, b) => a - b);
            const target = targetAfter(spans, i, next, root);
            const rng = ctx.rng(`reggae${i}`);
            steps.forEach((step, k) => {
                const code = codes.get(step)!;
                let midi = riffPitch(code, root, chord);
                // A note lasts through its ties, never past the next note or the chord.
                let end = added.has(step) ? step + 4 : step + 1;
                while (!added.has(step) && end < to && line[end] === '-' && !codes.has(end)) {
                    end++;
                }
                const until = Math.min(end, steps[k + 1] ?? to);
                // The last note before a change leads into it now and then (a third of the
                // time): a half step, the target's fifth or a scale step.
                const isLast = k === steps.length - 1;
                if (
                    isLast &&
                    step !== from &&
                    target !== null &&
                    mod12(target - root) !== 0 &&
                    to - step <= 2 &&
                    rng.chance(0.35)
                ) {
                    midi = approach(target, chord, pickApproach(rng, false));
                }
                // Heavy on the drop and the arrivals; the pickups lighter.
                const strong = step === from || step % 8 === 0;
                events.push(
                    bassNote(
                        bar,
                        step,
                        midi,
                        (until - step) * 0.92,
                        dyn(strong ? 104 : 88, plan.energy),
                    ),
                );
                last = midi;
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * Skank figures in sixteenths, for the piano and the guitar: `X` the chop, `x` a lighter
 * one. The chop is on 2 and 4 — beats 1 and 3 belong to the bass and the drop.
 * - plain: the one-drop skank;
 * - double: the chop and a sixteenth flick after it ("chk-a"), a busier hand;
 * - ands: a chop on every "and", the rockers/steppers skank (guitar only).
 */
const SKANKS = {
    plain: '....X.......X...',
    double: '....Xx......Xx..',
    ands: '..x...x...x...x.',
} as const;
type Skank = keyof typeof SKANKS;

const SKANK_WEIGHTS: Record<'keyboard' | 'guitar', Record<EnergyTier, [Skank, number][]>> = {
    keyboard: {
        low: [['plain', 1]],
        mid: [
            ['plain', 3],
            ['double', 1],
        ],
        high: [
            ['plain', 1],
            ['double', 2],
        ],
    },
    guitar: {
        low: [['plain', 1]],
        mid: [
            ['plain', 3],
            ['double', 1],
        ],
        high: [
            ['plain', 1],
            ['double', 2],
            ['ands', 2],
        ],
    },
};

/** Where the skank chops in a bar of another meter: the start of every pulse but the first. */
const oddSkank = (ps: Pulse[], total: number): string =>
    Array.from({ length: total }, (_, s) =>
        ps.some((p) => p.index > 0 && p.step === s) ? 'X' : '.',
    ).join('');

function skankLine(ctx: BarContext, tier: EnergyTier, family: 'keyboard' | 'guitar') {
    if (!isCommonTime(ctx.bar)) {
        return { line: oddSkank(pulses(ctx.bar), barSteps(ctx.bar)), skank: 'plain' as Skank };
    }
    const skank = ctx.rng('skank', 'section').weighted(SKANK_WEIGHTS[family][tier]);
    return { line: SKANKS[skank], skank };
}

/**
 * The organ bubble, per beat: a chord on the "and" and a lighter double-tap on the "a" —
 * "chk-a, chk-a" — leaving every beat itself empty. The light sixteenth swing drags the tap
 * late, which is the bubble's lope. A quiet band plays only the "and"s.
 */
function bubble(ctx: BarContext, { from, to }: { from: number; to: number }, tier: EnergyTier) {
    const hits: Hit[] = [];
    for (const p of pulses(ctx.bar)) {
        // The pulse's last eighth is its "and" (a 4/4 beat's step 2, a 6/8 group's step 4).
        const and = p.step + p.steps - 2;
        const cell: [number, number, number][] = [[and, 0.9, 88]];
        if (tier !== 'low') {
            cell.push([and + 1, 0.7, 64]);
        }
        for (const [step, length, velocity] of cell) {
            if (step >= from && step < to) {
                hits.push({ step, length, velocity });
            }
        }
    }
    return hits;
}

const reggaeKeys = compIdiom({
    name: 'reggae skank and bubble',
    // Tight three-note chords: the triad, or root, 3rd and 7th on a seventh chord. A skank
    // is a percussive chop, and a fuller voicing only muddies it.
    kind: 'shell',
    // The bubble *is* the organ part: chopped, never held (see `CompBook.percussive`).
    percussive: true,
    // The skank never anticipates: it is the clock's offbeat, and a push would smear it.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, span, tier) {
        // The organist bubbles; the pianist (Rhodes, clav) doubles the guitar's skank.
        if (ctx.instrument.legato) {
            return bubble(ctx, span, tier);
        }
        const { line } = skankLine(ctx, tier, 'keyboard');
        const hits: Hit[] = [];
        for (let s = span.from; s < span.to; s++) {
            if (line[s] === 'X' || line[s] === 'x') {
                // Damped at once: the skank is a chop, and the silence after it is the beat.
                hits.push({ step: s, length: 0.9, velocity: line[s] === 'X' ? 96 : 72 });
            }
        }
        return hits;
    },
});

// ---------------------------------------------------------------- guitar
const reggaeGuitar = compIdiom({
    name: 'reggae skank guitar',
    kind: 'shell',
    // A small grip high on the neck (the top three strings, a triad or root-3rd-7th), far
    // above the bass. No open strings: the fretting hand damps the chop the instant after
    // it sounds, and an open string would ring on through the release. With no bassist the
    // grip stays up here — the skank is a chop, not a bottom.
    grip: { strings: 3, slot: { lo: 55, hi: 81, top: 72, pull: 0.8 }, open: false },
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to }, tier) {
        const { line, skank } = skankLine(ctx, tier, 'guitar');
        // The pendulum sets each chop's direction: the hand swings in eighths with the hats,
        // so the 2-and-4 chop is a downstroke and a rockers skank on every "and" comes up;
        // a double chop swings in sixteenths, the flick after the chop an upstroke.
        // The hand lets go at once: a chop sounds for under a sixteenth.
        return strums(line, from, to, skank === 'double' ? 1 : 2, 0.8);
    },
});

export const reggae: Style = {
    id: 'reggae',
    name: 'Reggae',
    // A light sixteenth swing (the old engine's 20) lopes the hats, the bubble's tap and the
    // bass pickups without turning them into a shuffle. The drums are the clock; bass and
    // skank sit back behind them — the famously deep, laid-back pocket (the old engine laid
    // the band 8 ms back). The bass drags most; the skank a touch less, so the chop stays
    // crisp against the hat.
    feel: { swing: 20, swingGrid: 16, lean: { bass: 8, comp: 5 }, humanize: 30 },
    drums: reggaeDrums,
    bass: reggaeBass,
    comp: { keyboard: reggaeKeys, guitar: reggaeGuitar },
    // Guitar, against the old mapping's organ. The band has one comp instrument, and it has
    // to carry the genre alone: the chop on 2 and 4 is reggae's non-negotiable comp gesture,
    // and only the skank plays it. The organ bubble is iconic, but on a record it bubbles
    // *between* the skank's chops — alone it is a run of offbeat sixteenths that could be
    // rocksteady or ska. The old engine chose the organ in a two-channel world, where the
    // chords lane skanked and the harmony lane bubbled beside it.
    prefers: 'guitar',
};
