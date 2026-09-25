// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Funk: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
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
    place,
    sectionPlace,
    targetAfter,
} from '../players/bass/line.js';
import { compIdiom, type Hit, pendulum, strums } from '../players/comp/idiom.js';
import { drumIdiom, snareFigure, tomRun } from '../players/drums/kit.js';
import { dyn, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { chordScale, minorPentatonic, rootFirst } from '../players/lead/palette.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import type { PitchedIdiom, Style } from './types.js';

// ================================================================ drums
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

const funkDrums = drumIdiom({
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

// ================================================================ bass
// One-bar riffs as sixteenth lines: R root, O octave, 5 fifth, 7 seventh (the octave on
// a major-7th chord), m a muted ghost on the root. Each note lasts until the next.
const FUNK_RIFFS = [
    'R..mR.O.m.R..7O.',
    'R...m.R.O..R.m5.',
    'R..m..RO..R..7.m',
    'R.O.m.R...R.m.O.',
    'R......7O.R..5..',
];

function riffPitch(code: string, root: number, chord: ChordFacts): number {
    switch (code) {
        case 'O':
            return root + 12 <= BASS_SLOT_HI ? root + 12 : root;
        case '5':
            return root + fifthOf(chord);
        case '7': {
            // The b7 drops below the root when it would leave the register (a funk staple).
            const up = chord.seventh === 10 ? root + 10 : root + 12;
            return up <= BASS_SLOT_HI ? up : up - 12;
        }
        default:
            return root;
    }
}

const funkBass: PitchedIdiom = {
    name: 'funk riff',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const riff = ctx.rng('riff', 'section').pick(FUNK_RIFFS);
        const kicks = kickSteps(ctx);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                events.push(bassNote(bar, 0, place(bassPc(chord), last), 8, dyn(108, plan.energy)));
            }
            return { events, memory: { last } };
        }
        const total = Math.round(bar.meter.barTicks / 120);
        const line = bar.meter.name === '4/4' ? riff : riff.padEnd(total, '.').slice(0, total);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            const root = sectionPlace(ctx, bassPc(chord));
            const codes = new Map<number, string>();
            for (let s = from; s < to; s++) {
                const c = line[s] ?? '.';
                // Low energy: roots only, locked to the kick; no ghosts or pops.
                if (tier === 'low') {
                    if (c === 'R' || kicks.has(s)) {
                        codes.set(s, 'R');
                    }
                } else if (c !== '.' && (c !== 'm' || tier === 'high' || s % 4 !== 3)) {
                    codes.set(s, c);
                } else if (kicks.has(s)) {
                    codes.set(s, 'R');
                }
            }
            // The chord's arrival always gets its root.
            if (span.attack) {
                codes.set(from, 'R');
            }
            const steps = [...codes.keys()].sort((a, b) => a - b);
            const target = targetAfter(spans, i, next, root);
            const rng = ctx.rng(`funk${i}`);
            steps.forEach((step, k) => {
                const code = codes.get(step)!;
                let midi = riffPitch(code, root, chord);
                const gap = (steps[k + 1] ?? to) - step;
                if (
                    k === steps.length - 1 &&
                    target !== null &&
                    to - step <= 1 &&
                    rng.chance(0.3)
                ) {
                    midi = approach(target, chord, 'chromatic-below');
                }
                const muted = code === 'm';
                // Funk bass is short: notes stop before the next, ghosts are a clipped thud.
                const length = muted ? 0.5 : Math.min(gap, 3) * 0.75;
                const velocity = muted ? 52 : step % 4 === 0 ? 112 : 94;
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy), muted));
                if (!muted) {
                    last = midi > BASS.hi ? midi - 12 : midi;
                }
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
// cspell:disable-next-line
const FUNK_STABS = ['..x..x.x...x.x..', '.x..x..x.x..x...', '..x...x...x..x.x', 'x..x..x...x.x...'];

const funkKeys = compIdiom({
    name: 'funk stabs',
    kind: 'stab',
    push: { low: 0, mid: 0.15, high: 0.25 },
    rhythm(ctx, { from, to }, tier) {
        const line = ctx.rng('stabs', 'section').pick(FUNK_STABS);
        const riffSteps = [...line].flatMap((c, i) => (c === 'x' ? [i] : []));
        const dropped = ctx.rng('thin', 'section').pick(riffSteps);
        const hits: Hit[] = [];
        for (let s = from; s < to; s++) {
            if (line[s] !== 'x') {
                continue;
            }
            // Low energy thins the riff to its offbeats; high plays all of it.
            if (tier === 'low' && s % 4 !== 2) {
                continue;
            }
            // Mid energy drops the same stab every bar of the section — a thinner riff, not a
            // stuttering one.
            if (tier === 'mid' && s === dropped) {
                continue;
            }
            hits.push({ step: s, length: 0.9, velocity: s % 4 === 2 ? 98 : 88 });
        }
        if (!hits.length) {
            hits.push({ step: from + (to - from > 2 ? 2 : 0), length: 0.9, velocity: 90 });
        }
        return hits;
    },
});

// ---------------------------------------------------------------- guitar
// Sixteenth-note chicken scratch: the hand never stops (`-` is a muted scratch), chord
// stabs land where the riff says. Section-scoped, so a section keeps its riff.
const FUNK_SCRATCH = [
    // Backbeat stabs with a sixteenth pickup.
    '-.-xX-x--.-xX-x-',
    // The One, then dotted-eighth stabs (three against four) landing on beat 4.
    'x--x--x--x-xX-x-',
    // Stabs on the "and"s and the sixteenths around the backbeat.
    '--x-X--x-x--X-x-',
];

const funkGuitar = compIdiom({
    name: 'funk rhythm guitar',
    // The three-note "E9" grip: 3rd, 7th and 9th on the top strings.
    kind: 'stab',
    // No open strings: the scratch is the fretting hand releasing, and an open string rings on.
    grip: { strings: 3, slot: { lo: 50, hi: 79, top: 66, pull: 0.8 }, open: false },
    push: { low: 0, mid: 0.1, high: 0.2 },
    rhythm(ctx, { from, to }, tier) {
        const line = ctx.rng('scratch', 'section').pick(FUNK_SCRATCH);
        // A funk chank is staccato — the hand lets go at once, and the silence between chanks
        // is the groove — so a stab sounds for under a sixteenth.
        let hits = strums(line, from, to, 1, 0.9);
        if (tier === 'low') {
            // Low energy: just the stabs, no scratch between them.
            hits = hits.filter((h) => !h.muted);
        } else if (tier === 'mid') {
            // Mid energy: scratches on the eighths only, air on the sixteenths between.
            hits = hits.filter((h) => !h.muted || h.step % 2 === 0);
        } else {
            // High energy: the hand digs in — every pass of the pendulum sounds.
            const taken = new Set(hits.map((h) => h.step));
            for (let s = from; s < to; s++) {
                if (!taken.has(s)) {
                    hits.push({
                        step: s,
                        length: 0.5,
                        velocity: 40,
                        stroke: pendulum(s, 1),
                        muted: true,
                    });
                }
            }
        }
        return hits.sort((a, b) => a.step - b.step);
    },
});

// ================================================================ lead
// A funk horn: short, clipped sixteenth figures with space around them (the rests are part of
// the groove), a riff repeated bar after bar more often than not, the chord's own scale with
// the key's minor pentatonic, landing on roots and fifths, and a scoop into a held note now
// and then.
const funkLead = leadIdiom({
    name: 'funk lead',
    cells: {
        sparse: ['x..x..x.........', '..x.x..x........', 'x.x...x.x.......', '....x..x.x......'],
        mid: ['x..x..x.x.x.....', '..x.xx.x..x.x...', 'x.xx..x.x..x....', 'x..x.x..x..x.x..'],
        busy: ['x.xx.xx.x.xx.x..', 'xxx.x.xx.x.x.x..', '..xx.x.xx.x.xx..', 'x.x.xx.x.xx.x.x.'],
    },
    endings: ['x.x.x-----......', 'x-------........', '..x.x.x---......', 'x..x..x-----....'],
    head: {
        cells: ['x..x..x.x.......', '..x.x..x..x.....', 'x.x...x.x-......', 'x..x.x..x-......'],
        endings: ['x-------........', 'x.x.x-------....'],
        form: 'period',
    },
    pool: (chord, key) => [...new Set([...chordScale(chord), ...minorPentatonic(key.tonic)])],
    arrive: (chord) => rootFirst(chord),
    settle: (chord) => rootFirst(chord),
    chromatic: 0.25,
    enclosure: 0.05,
    riff: 0.5,
    space: 0.3,
    bends: { blue: 0, root: 0 },
    scoop: 0.2,
});

export const funk: Style = {
    id: 'funk',
    name: 'Funk',
    // Straight sixteenths, bass and keys a touch *ahead* — funk pushes on the One.
    feel: { swing: 0, swingGrid: 16, lean: { bass: -5, comp: -3 }, humanize: 25 },
    drums: funkDrums,
    bass: funkBass,
    comp: { keyboard: funkKeys, guitar: funkGuitar },
    prefers: 'clav',
    lead: { idiom: funkLead, prefers: 'sax' },
};
