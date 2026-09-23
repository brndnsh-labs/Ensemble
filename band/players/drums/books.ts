// cspell:disable — drum pattern lines (x/o/g/.) are not words.
/**
 * The four v0 drum idioms. Each is a groove (what the time sounds like at each energy),
 * its odd-meter cells, and its fills. Kick/comp motifs are chosen per *section* (`scope:
 * 'section'`), so a verse keeps its groove every time round and the chorus has its own —
 * the lesson of the old engine's bar-latched motif: a groove that changes every bar is
 * noise, not variation.
 */
import type { EnergyTier } from '../../arrange/plan.js';
import type { Rng } from '../../core/random.js';
import type { BarContext } from '../../styles/types.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from './kit.js';

// ---------------------------------------------------------------- rock
// Kick patterns for 4/4, all keeping 1 and 3 home; weights by tier (low favours the
// plain 1-and-3, high favours the pushed "and of 3" and "and of 4" pickups).
const ROCK_KICKS: readonly [string, Record<EnergyTier, number>][] = [
    ['x.......x.......', { low: 6, mid: 3, high: 1 }],
    ['x.......x.x.....', { low: 2, mid: 4, high: 4 }],
    ['x.....x.x.......', { low: 1, mid: 3, high: 3 }],
    ['x.......x.....x.', { low: 1, mid: 2, high: 3 }],
    ['x.x.....x.x.....', { low: 0, mid: 1, high: 3 }],
];

export const rockDrums = drumIdiom({
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

// ---------------------------------------------------------------- jazz
// The ride carries the time ("spang-spang-a-lang", swung by the feel pass); hi-hat foot
// on 2 and 4; the kick "feathers" quarter notes under the band; the snare comps sparsely.
// Swung-eighth offbeats and beat 3 only: the "a" sixteenths would land between triplet
// positions once the feel pass swings them, and read as flams.
const JAZZ_COMP_SPOTS = [2, 6, 8, 10, 14];

export const jazzDrums = drumIdiom({
    name: 'jazz ride',
    timekeeper: ['ride'],
    fillLength: { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 4, mid: 4, high: 8 } },
    groove(ctx, tier) {
        const rng = ctx.rng('comp');
        const snare = Array.from({ length: 16 }, () => '.');
        // Comping density rises with energy; never on 2 or 4 (the hat owns those).
        const hits = tier === 'low' ? 0 : tier === 'mid' ? rng.int(2) + 1 : rng.int(3) + 1;
        for (let i = 0; i < hits; i++) {
            snare[rng.pick(JAZZ_COMP_SPOTS)] = rng.chance(0.3) ? 'o' : 'g';
        }
        // An occasional "bomb" on the and-of-4 at high energy sets up the next bar.
        const kick =
            tier === 'high' && rng.chance(0.2)
                ? 'g...g...g.....x.'
                : tier === 'low'
                  ? '................'
                  : 'g...g...g...g...';
        return {
            ride: tier === 'low' ? 'o...x.o.o...x.o.' : 'x...X.x.x...X.x.',
            hatPedal: '....x.......x...',
            kick,
            snare: snare.join(''),
        };
    },
    cells: () => ({
        down: { ride: 'x...', kick: 'g...' },
        back: { ride: 'X.x.', hatPedal: 'x...' },
        strong: { ride: 'x...', kick: 'g...' },
    }),
    fill(_ctx, steps, rng) {
        // Snare on the swung eighths leading in, kick answering on the last "and".
        const snare: string[] = Array.from({ length: steps }, (_, i) =>
            i % 2 === 0 && rng.chance(0.75) ? 'o' : '.',
        );
        snare[steps - 2] = 'x';
        const kick = `${'.'.repeat(steps - 2)}x.`;
        return { snare: snare.join(''), kick, ride: 'x'.padEnd(steps, '.') };
    },
});

// ---------------------------------------------------------------- funk
// Syncopated sixteenth kicks that stay off the backbeat; ghost notes around it.
const FUNK_KICKS: readonly [string, Record<EnergyTier, number>][] = [
    ['x......x..x.....', { low: 3, mid: 3, high: 2 }],
    ['x.x.......x..x..', { low: 1, mid: 3, high: 3 }],
    ['x.....x...x.....', { low: 3, mid: 2, high: 1 }],
    ['x..x......x..x..', { low: 1, mid: 2, high: 3 }],
    ['x.......xx...x..', { low: 1, mid: 2, high: 3 }],
];
const FUNK_GHOSTS = [
    '.......g.g....g.',
    '..g....g.......g',
    '.g.....g..g....g',
    '.......g......gg',
];

export const funkDrums = drumIdiom({
    name: 'funk sixteenths',
    timekeeper: ['hat', 'hatOpen'],
    fillLength: { phrase: { low: 2, mid: 2, high: 4 }, section: { low: 4, mid: 4, high: 4 } },
    groove(ctx, tier) {
        const kick = ctx.rng('kick', 'section').weighted(FUNK_KICKS.map(([k, w]) => [k, w[tier]]));
        const ghosts = tier === 'low' ? '' : ctx.rng('ghost', 'section').pick(FUNK_GHOSTS);
        const backbeat = '....X.......X...';
        const snare = [...backbeat].map((c, i) => (c !== '.' ? c : (ghosts[i] ?? '.'))).join('');
        // Whether this section opens the hat on the "and" of 4 is the section's choice, kept
        // every bar (and always at high energy).
        const openBar = tier === 'high' || ctx.rng('open', 'section').chance(0.35);
        return {
            hat:
                tier === 'low'
                    ? 'x.o.x.o.x.o.x.o.'
                    : openBar
                      ? 'xoxoxoxoxoxoxo..'
                      : 'xoxoxoxoxoxoxoxo',
            hatOpen: openBar && tier !== 'low' ? '..............x.' : '',
            kick,
            snare,
        };
    },
    cells: (_ctx, tier) => ({
        down: { kick: 'x..x', hat: tier === 'low' ? 'x.o.' : 'xoxo' },
        back: { snare: 'X..g', hat: tier === 'low' ? 'x.o.' : 'xoxo' },
        strong: { kick: '.x.x', hat: 'xoxo' },
    }),
    fill: (_ctx, steps, rng) =>
        steps <= 2 ? { snare: snareFigure(steps, rng) } : tomRun(steps, rng, 1),
});

// ---------------------------------------------------------------- bossa
// The cross-stick plays the bossa clave across two bars (x..x..x. ..x..x.. in eighths);
// the kick is the surdo: 1 and 3 with pickups on the "and" of 2 and 4.
const BOSSA_CLAVE = ['x.....x.....x...', '....x.....x.....'];

export const bossaDrums = drumIdiom({
    name: 'bossa clave',
    timekeeper: ['hat', 'ride'],
    fillLength: { phrase: { low: 0, mid: 0, high: 2 }, section: { low: 2, mid: 2, high: 4 } },
    groove(ctx, tier) {
        // The clave cycles by bar within the section visit so it realigns at each section.
        const clave = BOSSA_CLAVE[ctx.bar.barInVisit % 2];
        return {
            rim: clave,
            kick: tier === 'low' ? 'o.......o.......' : 'x.....o.x.....o.',
            ...(tier === 'high' ? { ride: 'x.o.x.o.x.o.x.o.' } : { hat: 'o.g.o.g.o.g.o.g.' }),
            hatPedal: tier === 'high' ? '....o.......o...' : '',
        };
    },
    cells: () => ({
        down: { kick: 'x...', rim: 'x...', hat: 'o.g.' },
        back: { kick: '..o.', rim: '..x.', hat: 'o.g.' },
        strong: { kick: 'x...', hat: 'o.g.' },
    }),
    fill: (_ctx: BarContext, steps: number, rng: Rng): Lines => ({
        rim: snareFigure(steps, rng, 2),
        tomLow: `${'.'.repeat(steps - 1)}o`,
    }),
});
