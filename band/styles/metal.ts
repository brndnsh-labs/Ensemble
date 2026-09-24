// cspell:disable — pattern lines (x/o/X/-/.) are not words.
/**
 * Metal: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The shared
 * machinery lives in `players/`; this file is only what makes it this genre.
 *
 * Metal is one riff played by three people at once: the rhythm guitar's palm-muted power
 * chords, the bass under them on the same root, and the kick drum under both, all three on
 * the same sixteenths. Energy turns a half-time sway into driving eighths and then into the
 * double kick, where the guitar and bass gallop and chug with the feet. Harvested from the old
 * engine's lessons (`public/engine/grooves/metal.ts`, the `metal` bass style, `power-metal`
 * comping, the crunch guitar sound), not its code.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import { BASS, bassNote, kickSteps, type LineMemory } from '../players/bass/line.js';
import { compIdiom, type Hit, pendulum } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from '../players/drums/kit.js';
import { barSteps, dyn, isCommonTime, pulses, STEP, spanSteps } from '../players/grid.js';
import { mod12 } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
/**
 * The feel a section plays: the backbeat on 2 and 4, or half time — the snare on 3 alone, the
 * riff suddenly twice as heavy under the same tempo. A quiet band is always half time (the
 * doom sway); a louder one plays half time in some sections (a breakdown, a heavy bridge).
 */
type Feel = 'backbeat' | 'half';
const FEEL_WEIGHTS: Record<EnergyTier, readonly [Feel, number][]> = {
    low: [['half', 1]],
    mid: [
        ['backbeat', 3],
        ['half', 1],
    ],
    high: [
        ['backbeat', 3],
        ['half', 1],
    ],
};

/**
 * Kick patterns by tier and feel. Every one keeps the One. Low energy is sparse, the kick on
 * the One and a push later in the bar. Mid is the "standard heavy" (1, the "and" of 2, 3; the
 * old engine's motif 0), a pushed pair, or driving eighths (the thrash engine). High is the
 * double kick: continuous sixteenths, a burst of them through the back half of the bar, or the
 * gallop (eighth-sixteenth-sixteenth on every beat, the Iron Maiden rhythm the guitar and bass
 * gallop with).
 */
const KICKS: Record<EnergyTier, Record<Feel, readonly [string, number][]>> = {
    low: {
        backbeat: [],
        half: [
            ['x.........x.....', 3],
            ['x.....x.........', 2],
            ['x.x.......x.....', 1],
        ],
    },
    mid: {
        backbeat: [
            ['x.....x.x.......', 3],
            ['x.x.....x.x.....', 2],
            ['x.x.x.x.x.x.x.x.', 2],
        ],
        half: [
            ['x.....x...x.....', 2],
            ['x.x.......x.x...', 1],
        ],
    },
    high: {
        backbeat: [
            ['xxxxxxxxxxxxxxxx', 2],
            ['x.xxx.xxx.xxx.xx', 2],
            // Eighths, then a double-kick burst through beats 3 and 4 into the next bar.
            ['x.x.x.x.xxxxxxxx', 2],
            ['x.x.x.x.x.x.x.x.', 1],
        ],
        // Half time over the double kick: the snare's weight halves, the feet don't.
        half: [
            ['xxxxxxxxxxxxxxxx', 2],
            ['x.xxx.xxx.xxx.xx', 1],
        ],
    },
};

const BACKBEAT = '....X.......X...';
const HALF_TIME = '........X.......';

/** The energy at which the band is at its peak: the only place a blast burst belongs. */
const PEAK = 0.85;

/**
 * A blast burst: kick and snare alternating sixteenths under crash quarters — the buzz is the
 * alternation, never the two together (the old engine's drums P1 #6). Only at the peak, once
 * every eight bars — the bar before the fill that closes each second phrase, a burst throwing
 * the band into the fill and the next period — and only in a band that blasts at all: whether
 * it does is the tune's, not a section's.
 */
function blasts(ctx: BarContext): boolean {
    const { bar, plan } = ctx;
    return (
        plan.energy >= PEAK &&
        plan.fill === 'none' &&
        isCommonTime(bar) &&
        bar.phrase.length >= 4 &&
        bar.phrase.index % 2 === 1 &&
        bar.phrase.bar === bar.phrase.length - 2 &&
        ctx.rng('blast', 'song').chance(0.5)
    );
}

const metalDrums = drumIdiom({
    name: 'metal double kick',
    // The crash is a timekeeper too (a crash-ride section, the accent on a riff's One), so the
    // kit's own arrival crash replaces it rather than doubling it.
    timekeeper: ['hat', 'hatOpen', 'ride', 'crash'],
    // Metal fills are tom runs in sixteenths, the double kick often going on under them.
    fillLength: { phrase: { low: 2, mid: 4, high: 4 }, section: { low: 4, mid: 8, high: 8 } },
    groove(ctx, tier) {
        const { bar, plan } = ctx;
        if (blasts(ctx)) {
            return {
                kick: 'x.x.x.x.x.x.x.x.',
                snare: '.x.x.x.x.x.x.x.x',
                crash: 'X...x...x...x...',
            };
        }
        const feel = ctx.rng('feel', 'section').weighted(FEEL_WEIGHTS[tier]);
        const kick = ctx.rng('kick', 'section').weighted(KICKS[tier][feel]);
        const snare = feel === 'half' ? HALF_TIME : BACKBEAT;
        if (tier === 'low') {
            // Half time on the ride — or on the floor tom, the sway of a doom verse. Very quiet
            // sections take the snare's 3 on the cross-stick.
            const time = ctx.rng('time', 'section').weighted<'ride' | 'toms'>([
                ['ride', 2],
                ['toms', 1],
            ]);
            return {
                ...(time === 'ride'
                    ? { ride: 'x.o.x.o.x.o.x.o.' }
                    : { tomLow: 'x.o.x.o.x.o.x.o.' }),
                kick,
                ...(plan.energy < 0.3 ? { rim: '........x.......' } : { snare: HALF_TIME }),
            };
        }
        // A lift in the last bar before a new section: an accented crash on the "and" of 4,
        // louder than the time around it, throwing the band into the arrival.
        const lift = plan.fill === 'none' && ctx.next?.plan.crash;
        if (tier === 'mid') {
            return {
                hat: lift ? 'x.o.x.o.x.o.x...' : 'x.o.x.o.x.o.x.o.',
                ...(lift ? { crash: '..............X.' } : {}),
                kick,
                snare,
            };
        }
        // High: the time moves to the ride, or to the crash on quarters (the china riding a
        // thrash chorus). On the ride, the riff's One takes a crash every second bar — the
        // accent that marks a two-bar riff.
        const cymbal = ctx.rng('cymbal', 'section').weighted<'ride' | 'crash'>([
            ['ride', 2],
            ['crash', 1],
        ]);
        const accent = bar.barInVisit % 2 === 0;
        if (cymbal === 'crash') {
            return { crash: lift ? 'X...x...x...x.X.' : 'X...x...x...x...', kick, snare };
        }
        return {
            ride: 'x.o.x.o.x.o.x.o.',
            crash: lift ? `${accent ? 'X' : '.'}.............X.` : accent ? 'X...............' : '',
            kick,
            snare,
        };
    },
    cells(ctx, tier) {
        // Any other meter: the kick on each strong pulse (doubled at high energy), the snare
        // on the backbeat pulses, eighths on the hat (the ride at high energy).
        const cymbal: Lines = tier === 'high' ? { ride: 'x.o.' } : { hat: 'x.o.' };
        const kick = tier === 'high' ? 'xxxx' : 'x...';
        const back: Lines =
            tier === 'low' && ctx.plan.energy < 0.3 ? { rim: 'x...' } : { snare: 'X...' };
        return {
            down: { kick, ...cymbal },
            back: { ...back, ...cymbal, ...(tier === 'high' ? { kick: 'xxxx' } : {}) },
            strong: { kick: tier === 'low' ? 'x...' : 'x.x.', ...cymbal },
        };
    },
    fill(ctx, steps, rng) {
        const tier = energyTier(ctx.plan.energy);
        if (steps <= 2) {
            // A snare pickup into the next bar, crescendoing.
            return { snare: snareFigure(steps, rng) };
        }
        if (tier === 'low') {
            return tomRun(steps, rng, 2);
        }
        const run = tomRun(steps, rng, 1);
        if (tier === 'high') {
            // The double kick keeps rolling under the toms: the run's own kick gives way to the
            // groove's (the kit keeps the kick wherever a fill writes none).
            const { kick: _groove, ...toms } = run;
            return toms;
        }
        return run;
    },
});

// ================================================================ bass
/**
 * Every root on the bass's low E string, E1 up to Eb2: the bottom of the instrument, an
 * octave under the guitar's power chords. One register for the whole tune, so the riff keeps
 * its octave and the three instruments stay one sound.
 */
function lowRoot(pc: number): number {
    return BASS.lo + mod12(pc - BASS.lo);
}

/**
 * Locked to the guitar and the kick. No walking and no approach notes: the guitar plays the
 * root's power chord, and a passing tone under it would rub against the riff, not lead it. A
 * quiet band plays long roots with the kick (half time); from mid energy it picks eighths
 * (the palm-muted chug an octave down); at high energy it doubles every kick too, so the
 * double kick's bursts and gallops are the bass's as well.
 */
const metalBass: PitchedIdiom = {
    name: 'metal root chug',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                last = lowRoot(chord.bass);
                events.push(bassNote(bar, 0, last, barSteps(bar), dyn(108, plan.energy)));
            }
            return { events, memory: { last } };
        }
        const kicks = kickSteps(ctx);
        for (const { span, from, to } of spanSteps(bar)) {
            if (!span.chord) {
                continue;
            }
            // The slash note is the bass's: over C/E the guitar keeps its C5, the bass plays E.
            const root = lowRoot(span.chord.bass);
            const steps = new Set<number>();
            if (tier === 'low') {
                for (const k of kicks) {
                    if (k >= from && k < to) {
                        steps.add(k);
                    }
                }
                if (span.attack) {
                    steps.add(from);
                }
            } else {
                for (let s = from; s < to; s += 2) {
                    steps.add(s);
                }
                if (tier === 'high') {
                    for (const k of kicks) {
                        if (k >= from && k < to) {
                            steps.add(k);
                        }
                    }
                }
            }
            const sorted = [...steps].sort((a, b) => a - b);
            sorted.forEach((step, k) => {
                const gap = (sorted[k + 1] ?? to) - step;
                // Held to the next note when quiet; a tight, damped eighth or sixteenth above
                // it (the pick stops each note, like the guitar's palm).
                const length = tier === 'low' ? gap * 0.95 : Math.min(gap, 2) * 0.7;
                const velocity = step % 4 === 0 ? 106 : step % 2 === 0 ? 92 : 86;
                events.push(bassNote(bar, step, root, length, dyn(velocity, plan.energy)));
                last = root;
            });
        }
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * Where the rhythm guitar lets a power chord ring open (and a keyboard doubles it), as bar
 * steps, one figure per section. Everything else is the palm-muted chug. Mid energy accents
 * the beats; high energy adds the 3-3-2 (the One, the "and" of 2, and 4 — the Pantera/
 * Metallica push). Every chord's arrival is an open accent as well.
 */
const OPENS: Record<'mid' | 'high', readonly [number[], number][]> = {
    mid: [
        [[0, 8], 3],
        [[0], 2],
        [[0, 12], 1],
    ],
    high: [
        [[0, 8], 2],
        [[0, 6, 12], 2],
        [[0], 1],
    ],
};

function opens(ctx: BarContext, tier: EnergyTier): Set<number> {
    if (tier === 'low') {
        return new Set();
    }
    return new Set(ctx.rng('opens', 'section').weighted(OPENS[tier]));
}

/** The drummer's blast burst, heard: the snare on the offbeat sixteenths. */
function heardBlast(ctx: BarContext): boolean {
    const snares = new Set(
        ctx.heard.drums
            .filter((h) => h.piece === 'snare')
            .map((h) => Math.round((h.tick - ctx.bar.start) / STEP)),
    );
    return [1, 3, 5, 7].every((s) => snares.has(s));
}

// ---------------------------------------------------------------- guitar
/**
 * The riff for one chord span.
 * - Low energy: each chord rings open, one downstroke (a doom sway under the half time).
 * - Mid: palm-muted eighths, alternate picked (the eighth pendulum), the section's opens
 *   ringing on the beats.
 * - High: downpicked. The chugs double the kick — every eighth plus every double-kick
 *   sixteenth, so a gallop kick is a galloping riff — on the sixteenth pendulum, which puts
 *   every eighth on a downstroke and only the sixteenths between them up. A blast burst is
 *   tremolo-picked: open power chords on every sixteenth.
 * A chord's arrival is always an open, accented power chord; the palm-mute is a damped note
 * of the grip the hand holds, not a scratch.
 */
function riff(ctx: BarContext, from: number, to: number, attack: boolean): Hit[] {
    const tier = energyTier(ctx.plan.energy);
    const common = isCommonTime(ctx.bar);
    if (tier === 'low') {
        return [{ step: from, length: to - from, velocity: attack ? 100 : 84, stroke: 'down' }];
    }
    // why: metal downpicks its palm-muted eighths for weight — the sixteenth pendulum (grid 1)
    // puts every eighth on a downstroke at every tier above low, the same as the high-energy
    // drive; alternation is still what a sixteenth run (the gallop, a blast burst) gets, since
    // those steps fall on the pendulum's offbeat side regardless of this constant.
    const grid = 1;
    if (tier === 'high' && heardBlast(ctx)) {
        const hits: Hit[] = [];
        for (let s = from; s < to; s++) {
            hits.push({
                step: s,
                length: 1,
                velocity: s % 4 === 0 ? 100 : 84,
                stroke: pendulum(s, 1),
            });
        }
        return hits;
    }
    // In odd meters the opens are each pulse's first step.
    const open = common ? opens(ctx, tier) : new Set(pulses(ctx.bar).map((p) => p.step));
    if (attack) {
        open.add(from);
    }
    const chugs = new Set<number>();
    for (let s = from; s < to; s += 2) {
        chugs.add(s);
    }
    if (tier === 'high') {
        for (const k of kickSteps(ctx)) {
            if (k >= from && k < to) {
                chugs.add(k);
            }
        }
    }
    const steps = [...new Set([...open].filter((s) => s >= from && s < to)), ...chugs].sort(
        (a, b) => a - b,
    );
    return [...new Set(steps)].map((step): Hit => {
        const stroke = pendulum(step, grid);
        if (open.has(step)) {
            return { step, length: to - step, velocity: 108, stroke };
        }
        // The chug digs in harder on the beat; a sixteenth between is the lightest.
        const base = tier === 'high' ? 90 : 80;
        const velocity = step % 4 === 0 ? base + 8 : step % 2 === 0 ? base : base - 6;
        // why: a palm mute keeps the grip's pitch (a damped chord strike), unlike a scratch
        // (`muted`) which kills it — the chug is a real, if dark, statement of the chord.
        return { step, length: 0.5, velocity, stroke, palm: true };
    });
}

const metalGuitar = compIdiom({
    name: 'metal rhythm guitar',
    // Root-5-8 power chords down on the E and A strings (E2 and A2 are the sound), doubling
    // the bass on purpose: the band's low floor is lifted for this shape alone (see the
    // invariant suite's power-chord rule). Open strings allowed: the open low E is metal's
    // home chug. With no bassist the grip is already the band's bottom, so it stays.
    kind: 'power',
    grip: { strings: 3, slot: { lo: 40, hi: 64, top: 52, pull: 2 }, rootBottom: true },
    // The riff lands on the One with the kick and the crash; a guitar pushing alone would
    // put the next chord over the old bass note.
    push: { low: 0, mid: 0, high: 0 },
    rhythm: (ctx, { from, to, attack }) => riff(ctx, from, to, attack),
});

// ---------------------------------------------------------------- keyboard
/**
 * Keys are rare in metal, and kept simple: the same power voicing (root, fifth, octave). A
 * quiet band holds each chord (the organ or synth pad under a doom riff); louder, the keys
 * stab only where the guitar lets a chord ring open, doubling its accents. On the organ the
 * machinery holds each chord to the next, the pad under the riff.
 */
const metalKeys = compIdiom({
    name: 'metal power keys',
    kind: 'power',
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        if (tier === 'low') {
            return [{ step: from, length: to - from, velocity: attack ? 84 : 66 }];
        }
        const open = isCommonTime(ctx.bar)
            ? opens(ctx, tier)
            : new Set(pulses(ctx.bar).map((p) => p.step));
        if (attack) {
            open.add(from);
        }
        const steps = [...open].filter((s) => s >= from && s < to).sort((a, b) => a - b);
        return steps.map((step, k) => ({
            step,
            // A stab that rings a beat at most, stopping short of the next.
            length: Math.min((steps[k + 1] ?? to) - step, 4) * 0.9,
            velocity: step % 8 === 0 ? 100 : 92,
        }));
    },
});

export const metal: Style = {
    id: 'metal',
    name: 'Metal',
    // Straight and on the grid: the drums are the clock and nobody leans. The riff is three
    // instruments on the same sixteenths, and any lag between them smears the chug. Metal is
    // precise, so very little human variation (the old engine's entropy 0.05).
    feel: { swing: 0, swingGrid: 16, lean: { bass: 0, comp: 0 }, humanize: 10 },
    drums: metalDrums,
    bass: metalBass,
    comp: { keyboard: metalKeys, guitar: metalGuitar },
    // The rhythm guitar is the genre. Its Auto *sound* is the crunch pack, not the clean
    // guitar `prefers: 'guitar'` maps to by default (`AUTO_VOICE_FOR_STYLE` in runtime.ts).
    prefers: 'guitar',
};
