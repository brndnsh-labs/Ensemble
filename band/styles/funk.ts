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
    endingAim,
    endingBass,
    isLeadIn,
    kickSteps,
    type LineMemory,
    landingRoot,
    leadTarget,
    meetRoot,
    nextChord,
    place,
    sectionPlace,
} from '../players/bass/line.js';
import { compIdiom, type Hit, pendulum, strums } from '../players/comp/idiom.js';
import {
    drumIdiom,
    type FillPlace,
    type FillShape,
    pickTurn,
    playFill,
    strike,
    type Turn,
} from '../players/drums/kit.js';
import { dyn, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { bluesColour, chordScale, fifthFirst, rootFirst } from '../players/lead/palette.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
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

/**
 * How a funk groove turns round in the second and fourth bars of a phrase (#2022), one per
 * section — the two-bar funk beat, its second bar answering the first: a kick on the "a" of 3
 * (the syncopated push that makes the bar lean), a kick on the "a" of 4 into the One, ghost
 * strokes on the "e" and "a" of 4 (the left hand chattering into the turnaround), or the hat
 * opened on the "and" of 4 in a section that keeps it closed.
 */
const FUNK_TURNS: Record<'quiet' | 'loud', readonly (readonly [Turn, number])[]> = {
    // why: a quiet section has no ghosts and keeps the hat closed; only the foot answers.
    quiet: [
        [(t) => ({ ...t, kick: strike(t.kick, 11, 'x') }), 1],
        [(t) => ({ ...t, kick: strike(t.kick, 15, 'x') }), 1],
    ],
    loud: [
        [(t) => ({ ...t, kick: strike(t.kick, 11, 'x') }), 2],
        [(t) => ({ ...t, kick: strike(t.kick, 15, 'x') }), 2],
        [(t) => ({ ...t, snare: strike(strike(t.snare, 13, 'g'), 15, 'g') }), 2],
        [
            (t) => ({
                ...t,
                hat: strike(strike(t.hat, 14, '.'), 15, '.'),
                hatOpen: strike(t.hatOpen, 14, 'x'),
            }),
            1,
        ],
    ],
};

/*
 * Funk's fills (#2022): snare and ghost syncopations and the kick between them, never a run
 * down the toms — the James Brown drummers fill with the left hand and the foot while the right
 * keeps the hat going, so the groove never stops being a groove. Written at 2 and 4 sixteenths
 * (funk fills are no longer). Only the hit and the two-handed crescendo take the hand off the hat.
 */
// Ghosts dragging into an accented "and-a", the hat on over them (eighths under the four-step
// drag: the left hand's sixteenths need the room).
const GHOST_DRAG: FillShape = {
    2: { hat: 'xo', snare: 'gX' },
    4: { hat: 'x.x.', snare: 'ggxX' },
};
// The hit: snare hard on 4, the kick on its "and", the snare again on the "a". why: the band's
// hit is the break in the time, so the hat stops for it.
const STAB: FillShape = { 2: { snare: '.X', kick: 'x.' }, 4: { snare: 'X..X', kick: '..x.' } };
// Kick and snare trading sixteenths under the hat: boom-ka-boom-KA.
const KICK_SNARE: FillShape = {
    2: { hat: 'xo', snare: '.X', kick: 'x.' },
    4: { hat: 'xoxo', snare: '.g.X', kick: 'x.x.' },
};
// The hat opens on 4 ("tss"), the foot closes it, and the snare answers on the "a".
const HAT_CUT: FillShape = {
    2: { hatOpen: 'x.', hatPedal: '.x', snare: '.X' },
    4: { hatOpen: 'X...', hatPedal: '..x.', snare: '..gX' },
};
// A sixteenth crescendo on the snare alone.
const SNARE_SIXTEENTHS: FillShape = { 2: { snare: 'xX' }, 4: { snare: 'oxxX' } };

/**
 * Which fills a funk drummer plays where (#2022): a phrase end is a ghost drag or the hat cut, a
 * section end trades kick and snare or plays the hit, the top of the form plays the hit or the
 * crescendo. why: the bigger the boundary, the louder the left hand speaks.
 */
const FUNK_FILLS: Record<FillPlace, readonly (readonly [FillShape, number])[]> = {
    phrase: [
        [GHOST_DRAG, 3],
        [HAT_CUT, 2],
        [KICK_SNARE, 1],
    ],
    section: [
        [KICK_SNARE, 2],
        [STAB, 2],
        [GHOST_DRAG, 1],
        [SNARE_SIXTEENTHS, 1],
    ],
    top: [
        [STAB, 3],
        [SNARE_SIXTEENTHS, 2],
        [HAT_CUT, 1],
    ],
};

const funkDrums = drumIdiom({
    name: 'funk sixteenths',
    timekeeper: ['hat', 'hatOpen'],
    fillLength: { phrase: { low: 2, mid: 2, high: 4 }, section: { low: 4, mid: 4, high: 4 } },
    // why: the dead stop is kick, snare and a closed hat on 1, no cymbal: a crash would ring
    // on over the silence the stop is for.
    ending: () => ({ kick: 'X', snare: 'X', hat: 'X' }),
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
    answer: (ctx, tier, time) => pickTurn(ctx, time, FUNK_TURNS[tier === 'low' ? 'quiet' : 'loud']),
    fill(ctx, steps) {
        const lines = playFill(ctx, steps, FUNK_FILLS);
        // A quiet section's hat is eighths (`groove`): a fill carrying the hat carries those.
        return lines.hat && energyTier(ctx.plan.energy) === 'low'
            ? { ...lines, hat: 'x.o.x.o.x.o.x.o.'.slice(-steps) }
            : lines;
    },
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

/**
 * A riff note: `root` is where the sounding bass is placed, and the chord's own tones are
 * measured from the chord root, not from that bass. Over C/E the 5 is still G (a third above
 * the E), never B, which is E's fifth and C's major seventh.
 */
function riffPitch(code: string, root: number, chord: ChordFacts): number {
    const above = (interval: number) => root + mod12(chord.root + interval - chord.bass);
    switch (code) {
        case 'O':
            return root + 12 <= BASS_SLOT_HI ? root + 12 : root;
        case '5': {
            const up = above(fifthOf(chord));
            return up <= BASS_SLOT_HI ? up : up - 12;
        }
        case '7': {
            // The b7 drops below the root when it would leave the register (a funk staple).
            // Any other chord plays the chord root's octave in the seat.
            const slash = chord.root !== chord.bass;
            const up = chord.seventh === 10 ? above(10) : above(0) + (slash ? 0 : 12);
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
        let land: number | null = null;
        if (plan.ending) {
            // The funk ending is the dead stop (`endingGesture`): the bass hits it and lets go.
            const held = endingBass(
                ctx,
                (c, p) => place(bassPc(c), p),
                last,
                dyn(108, plan.energy),
                memory.land ?? null,
            );
            events.push(...held.events);
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
            const root = landingRoot(ctx, memory, i, bassPc(chord), sectionPlace);
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
            const lead = leadTarget(ctx, spans, i, next, sectionPlace);
            const target = lead?.target ?? null;
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
                    // Into an ending, the low root the band ends on where the drop from the
                    // note before stays inside an octave, else this octave, promised (#2178).
                    const aimed =
                        (lead?.ending ? endingAim(ctx, target, last)?.target : null) ?? target;
                    midi = approach(aimed, chord, 'chromatic-below');
                    land = lead?.crossing || lead?.ending ? aimed : null;
                } else if (
                    k === steps.length - 1 &&
                    target !== null &&
                    to - step <= 3 &&
                    isLeadIn(midi, target)
                ) {
                    // A riff tone within a beat of the change that sits a half or whole step from the next
                    // root (riffs 2 and 5's 5 under a chord a half step up) leads into it as a
                    // leading tone does, beside that root and not a major seventh off: the same
                    // fold blues and reggae use.
                    const aimed =
                        (lead?.ending ? endingAim(ctx, target, last)?.target : null) ?? target;
                    midi = meetRoot(midi, aimed);
                    land = lead?.crossing || lead?.ending ? aimed : null;
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
        return { events, memory: { last, land } };
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
        // A known standard's guide-tone head in funk (#2122): the guide tones as a horn
        // section phrases a tune — sixteenth pushes into the change, short punched notes with
        // a sixteenth of air between, and one held arrival a phrase. Every cell strikes beat 3
        // or a sixteenth or an eighth before it (`onsetsFor` sings a push within an eighth of
        // a change as the new chord's guide tone, early).
        guide: {
            cells: [
                // why: 1, the "a" of 1 and the "and" of 2 pushed into 3 — the 3+3+2 sixteenth
                // figure under every Tower of Power horn line, the push held over the change.
                'x-.x-.x-------..',
                // why: 1, 2, then the "a" of 2 into 3: the sixteenth push a funk horn line leans
                // on, the next chord's guide tone a sixteenth early and held.
                'x-..x-.x------..',
                // why: in off the "and" of 1, the "e" of 2, then 3 and its "a": the JB's
                // horn-hit pattern, four clipped stabs with the rests between them as groove.
                '..x-.x..x-.x-...',
                // why: 1 and its "and", the "a" of 2 pushed into 3, a stab on 4: the punch-and-
                // answer of a horn section's head, clipped before the barline.
                'x-x-...x---.x-..',
                // why: 1, its "a" held, 3, then the "a" of 4 tied over the barline — funk's
                // anticipated One, the next bar's guide tone a sixteenth early (`guideOnsets`).
                'x--x----x------x',
            ],
            // why: a turn moves on, a half note at most, and never strikes beat 4 (the bridge
            // hands back on one and a last-beat note would leave the phrase an eighth's
            // breath): the 3+3+2 answered on 3 and then out; 1 and the "a" of 2 pushed into a
            // held 3; three clipped hits off the "and" of 1.
            turns: ['x-.x-.x-x-......', 'x---...x-------.', '..x-.x..x-......'],
            // why: funk lands on the One — the arrival struck on the downbeat and held, a
            // dotted half that breathes a beat or the bar less an eighth; a pushed arrival
            // comes from the figure before it (the "a" of 4 tie).
            endings: ['x-----------....', 'x-------------..'],
            close: 'x-------------..',
        },
    },
    pool: (chord, key) => [...new Set([...chordScale(chord), ...bluesColour(chord, key)])],
    arrive: (chord) => fifthFirst(chord),
    settle: (chord) => rootFirst(chord),
    chromatic: 0.25,
    enclosure: 0.05,
    riff: 0.5,
    // why: a funk horn section punches one note in the figure's own sixteenths before it moves
    // (Tower of Power's push: beat 1 and its "a", then the and of 2), two to four notes, and the
    // riff (0.5) carries the stabbed figure on bar to bar. A solo figure stabs at 0.45; the head
    // at 0.2, since its four-note figures say a stab in half their moves (a third of its bars
    // stabbed would be the tune hammering, not singing).
    repeat: { chance: 0.45, head: 0.2, on: 'any' },
    space: 0.3,
    bends: { blue: 0, root: 0 },
    scoop: 0.2,
    // Clipped figures: vibrato only on the rare long note.
    vibrato: 12,
    // why: the funk horn section falls off the last note of a riff (Tower of Power's drop at a
    // phrase's end), about a third of the phrase ends that leave a tail to fall from (#2120).
    fall: 0.35,
});

export const funk: Style = {
    id: 'funk',
    name: 'Funk',
    // Sixteenths with a trace of swing (15: the offbeat at ~52% of its pair, the old Funk
    // drum preset's value and what the app has always played), bass and keys a touch
    // *ahead* — funk pushes on the One.
    // The horn rides on top of the pocket, right on the grid while the rhythm section pushes.
    feel: { swing: 15, swingGrid: 16, lean: { bass: -5, comp: -3, lead: 0 }, humanize: 25 },
    drums: funkDrums,
    bass: funkBass,
    comp: { keyboard: funkKeys, guitar: funkGuitar },
    prefers: 'clav',
    lead: { idiom: funkLead, prefers: 'sax' },
    // why: funk's tonic is the one-chord dominant vamp, the I9; in a minor key the im9 vamp
    // (the minor groove's Em9). The ending holds the chord the groove lives on. On a tune whose
    // own tonic is not a dominant (`Cmaj7`, `C6`) the I9's b7 would make the last chord a V7
    // of IV (#1502): it ends on the 6/9 instead, the horn section's final hit, which keeps the
    // 9th and has no 7th to argue with the tune's.
    ending: { major: '69', minor: 'm9', dominant: '9' },
    // why: the funk ending is the dead stop, the JB's hit on the One and then silence, set
    // up by a fill that brings the whole band to it.
    endingGesture: { kind: 'stop', setup: true },
};
