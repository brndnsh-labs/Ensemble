// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Rock: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import {
    approach,
    BASS_SLOT_HI,
    bassNote,
    bassPc,
    kickSteps,
    type LineMemory,
    nextChord,
    pickApproach,
    place,
    sectionPlace,
    targetAfter,
} from '../players/bass/line.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, snareFigure, tomRun } from '../players/drums/kit.js';
import { dyn, isCommonTime, pulses, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { fifthFirst, pentatonicPool, rootFirst } from '../players/lead/palette.js';
import { mod12 } from '../theory/pitch.js';
import type { PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// Kick patterns for 4/4, all keeping 1 and 3 home; weights by tier (low favours the
// plain 1-and-3, high favours the pushed "and of 3" and "and of 4" pickups).
const ROCK_KICKS: readonly [string, Record<EnergyTier, number>][] = [
    ['x.......x.......', { low: 6, mid: 3, high: 1 }],
    ['x.......x.x.....', { low: 2, mid: 4, high: 4 }],
    ['x.....x.x.......', { low: 1, mid: 3, high: 3 }],
    ['x.......x.....x.', { low: 1, mid: 2, high: 3 }],
    ['x.x.....x.x.....', { low: 0, mid: 1, high: 3 }],
];

const rockDrums = drumIdiom({
    name: 'rock backbeat',
    timekeeper: ['hat', 'ride', 'hatOpen'],
    fillLength: { phrase: { low: 2, mid: 4, high: 4 }, section: { low: 4, mid: 4, high: 8 } },
    groove(ctx, tier) {
        const kick = ctx.rng('kick', 'section').weighted(ROCK_KICKS.map(([k, w]) => [k, w[tier]]));
        // A lift in the last bar before a new section: open the hat on the "and of 4".
        const lift = ctx.plan.fill === 'none' && ctx.next?.plan.crash;
        if (tier === 'low') {
            return {
                hat: 'o.g.o.g.o.g.o.g.',
                kick,
                // Very quiet sections play cross-stick instead of a full backbeat.
                ...(ctx.plan.energy < 0.3
                    ? { rim: '....x.......x...' }
                    : { snare: '....x.......x...' }),
            };
        }
        if (tier === 'mid') {
            return {
                hat: lift ? 'x.o.x.o.x.o.x...' : 'x.o.x.o.x.o.x.o.',
                hatOpen: lift ? '..............x.' : '',
                kick,
                snare: '....X.......X...',
            };
        }
        // High energy moves the time to the ride (a chorus sound) with the hat on 2 and 4.
        const rideChorus = ctx.rng('ride', 'section').chance(0.5);
        return rideChorus
            ? {
                  ride: 'x.o.x.o.x.o.x.o.',
                  hatPedal: '....x.......x...',
                  kick,
                  snare: '....X.......X...',
              }
            : { hat: 'X.x.X.x.X.x.X.x.', kick, snare: '....X.......X...' };
    },
    cells: (_ctx, tier) => ({
        down: { kick: 'x...', hat: tier === 'low' ? 'o.o.' : 'x.o.' },
        back: { snare: tier === 'low' ? 'o...' : 'X...', hat: tier === 'low' ? 'o.o.' : 'x.o.' },
        strong: { kick: tier === 'high' ? 'x.x.' : 'x...', hat: 'x.o.' },
    }),
    fill: (_ctx, steps, rng) =>
        steps <= 2 ? { snare: snareFigure(steps, rng) } : tomRun(steps, rng),
});

// ================================================================ bass
const rockBass: PitchedIdiom = {
    name: 'rock roots',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const kicks = kickSteps(ctx);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                events.push(
                    bassNote(bar, 0, place(bassPc(chord), last), 16, dyn(100, plan.energy)),
                );
            }
            return { events, memory: { last } };
        }
        spans.forEach(({ span, from, to }, i) => {
            if (!span.chord) {
                return;
            }
            const root = sectionPlace(ctx, bassPc(span.chord));
            // Rhythm: kick-locked at low energy; driving eighths above it.
            let steps: number[];
            if (tier === 'low') {
                steps = [...kicks].filter((s) => s >= from && s < to);
                if (span.attack && !steps.includes(from)) {
                    steps.unshift(from);
                }
            } else {
                steps = [];
                for (let s = from; s < to; s += 2) {
                    steps.push(s);
                }
            }
            steps.sort((a, b) => a - b);
            const target = targetAfter(spans, i, next, root);
            const rng = ctx.rng(`line${i}`);
            const pops = new Set(ctx.rng('pops', 'section').pick([[], [6], [14], [6, 14], [10]]));
            steps.forEach((step, k) => {
                const isLast = k === steps.length - 1;
                let midi = root;
                // Octave pops at high energy, on offbeat eighths the section chose once, so
                // the part repeats rather than flickering bar to bar.
                if (tier === 'high' && pops.has(step % 16) && root + 12 <= BASS_SLOT_HI) {
                    midi = root + 12;
                }
                // Lead into a chord change with its last eighth (35% mid/high, 20% low).
                if (
                    isLast &&
                    target !== null &&
                    mod12(target - root) !== 0 &&
                    to - step <= 2 &&
                    rng.chance(tier === 'low' ? 0.2 : 0.35)
                ) {
                    midi = approach(target, span.chord, pickApproach(rng, false));
                }
                const gap = (steps[k + 1] ?? to) - step;
                const length = tier === 'low' ? gap * 0.95 : Math.min(gap, 2) * 0.85;
                const accent = step % 4 === 0 ? 102 : 86;
                events.push(bassNote(bar, step, midi, length, dyn(accent, plan.energy)));
                last = midi;
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
const rockKeys = compIdiom({
    name: 'rock keys',
    kind: 'close',
    // In rock a push is an ensemble hit (kick, bass and keys together); keys pushing alone
    // put the next chord over the old bass note. Off until the plan can push the band.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        const hits: Hit[] = [];
        if (tier === 'low') {
            // Sustained: strike at the chord (or re-strike softly at the barline).
            hits.push({ step: from, length: to - from, velocity: attack ? 80 : 64 });
            return hits;
        }
        const every = tier === 'mid' ? 4 : 2;
        const beats = pulses(ctx.bar).map((p) => p.step);
        for (let s = from; s < to; s += every) {
            // Mid energy plays on the pulses (quarters); high pumps eighths.
            if (tier === 'mid' && !beats.includes(s) && s !== from) {
                continue;
            }
            hits.push({ step: s, length: every * 0.85, velocity: s % 4 === 0 ? 92 : 76 });
        }
        return hits;
    },
});

// ---------------------------------------------------------------- guitar
// Strum lines in sixteenths (`x` a strum, `X` an accented one), on the eighth-note pendulum.
// The backbeat strums (beats 2 and 4) are accented, leaning with the snare.
const ROCK_STRUMS = [
    // "Old faithful": down, down-up, up-down-up.
    'x...X.x...x.X.x.',
    // Downstrokes on the beat, a lift into beats 3 and 4.
    'x...X...x.x.X.x.',
];

const rockGuitar = compIdiom({
    name: 'rock rhythm guitar',
    kind: 'close',
    // Four strings: a full strum with the root or fifth doubled, off the bass's low strings.
    grip: { strings: 4, slot: { lo: 50, hi: 79, top: 67 } },
    // No bassist: five strings, root on the bottom — the open and barre chords of a guitarist
    // who is the band's low end.
    alone: { strings: 5, slot: { lo: 40, hi: 76, top: 64 }, rootBottom: true },
    // Same reason as the rock keys: a push is an ensemble hit, not the guitar's alone.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        if (tier === 'low' || !isCommonTime(ctx.bar)) {
            // Let it ring: one strum per chord (per pulse in odd meters at mid energy up).
            const at =
                tier === 'low'
                    ? [from]
                    : pulses(ctx.bar)
                          .map((p) => p.step)
                          .filter((s) => s >= from && s < to);
            return (at.length ? at : [from]).map((step) => ({
                step,
                length: to - step,
                velocity: attack || step > from ? 84 : 66,
                stroke: 'down' as const,
            }));
        }
        if (tier === 'high') {
            // Driving eighth-note downstrokes, the backbeat leaned on.
            const hits: Hit[] = [];
            for (let s = from; s < to; s += 2) {
                hits.push({
                    step: s,
                    length: 1.6,
                    velocity: s % 8 === 4 ? 104 : s % 4 === 0 ? 92 : 80,
                    stroke: 'down',
                });
            }
            return hits;
        }
        const line = ctx.rng('strum', 'section').pick(ROCK_STRUMS);
        return strums(line, from, to, 2, 16);
    },
});

// ================================================================ lead
// An overdriven rock guitarist: the key's pentatonic (major pentatonic in a major key, with the
// blue minor third bent up into the major one; minor pentatonic in a minor key), landing on
// roots and fifths, long bent notes with vibrato, licks repeated to drive them home, and a burst
// of sixteenths at the peak.
const rockLead = leadIdiom({
    name: 'rock lead',
    cells: {
        sparse: ['x-------x-------', 'x-----x-x-------', '....x---x-------', 'x---x-------....'],
        mid: ['x-x-x---x-------', 'x---x-x-x---x---', '..x-x-x-x-------', 'x-x-x-x-x-------'],
        busy: ['x-x-xxxxx-x-x---', 'xxxxx-x-x-------', 'x-x-x-x-x-x-x-x-', 'x-xxx-x-x-xxx---'],
    },
    endings: ['x---------------', 'x-x-x-----------', 'x---x-----------', '..x-x-x---------'],
    head: {
        cells: ['x---x---x-x-x---', 'x-x-x---x-------', 'x-----x-x-------', 'x-x-x-x-x---x---'],
        endings: ['x---------------', 'x-------x-------'],
        form: 'period',
    },
    pool: (chord, key) => pentatonicPool(chord, key),
    arrive: (chord) => fifthFirst(chord),
    settle: (chord) => rootFirst(chord),
    chromatic: 0.1,
    enclosure: 0,
    riff: 0.4,
    space: 0.25,
    bends: { blue: 0.45, root: 0.55 },
    scoop: 0,
    // Every held rock-guitar note gets vibrato.
    vibrato: 6,
});

export const rock: Style = {
    id: 'rock',
    name: 'Rock',
    // Straight eighths, the band right on the drummer; keys a hair behind so the
    // chords sit under the backbeat rather than on top of it.
    // The lead lays back a hair against the backbeat.
    feel: { swing: 0, swingGrid: 8, lean: { bass: 0, comp: 3, lead: 4 }, humanize: 35 },
    drums: rockDrums,
    bass: rockBass,
    comp: { keyboard: rockKeys, guitar: rockGuitar },
    prefers: 'piano',
    lead: { idiom: rockLead, prefers: 'overdrive' },
};
