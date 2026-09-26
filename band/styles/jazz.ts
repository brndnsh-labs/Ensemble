// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Jazz: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type { PitchedNote } from '../core/types.js';
import {
    approach,
    BASS,
    bassNote,
    bassPc,
    type LineMemory,
    nextChord,
    pickApproach,
    place,
} from '../players/bass/line.js';
import { compIdiom, type Hit } from '../players/comp/idiom.js';
import { drumIdiom, type Lines } from '../players/drums/kit.js';
import { barSteps, dyn, pulses, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { bebopScale, guideTones, restingTones } from '../players/lead/palette.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12 } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// The ride carries the time ("spang-spang-a-lang", swung by the feel pass); hi-hat foot
// on 2 and 4; the kick "feathers" quarter notes under the band; the snare comps sparsely.
// Swung-eighth offbeats and beat 3 only: the "a" sixteenths would land between triplet
// positions once the feel pass swings them, and read as flams.
const JAZZ_COMP_SPOTS = [2, 6, 8, 10, 14];

// Two beats of swung eighths, each on the beat with an offbeat in it: the statement is
// heard as the band drops out, so it starts on the one (a displacement moves it off later).
const TRADE_MOTIFS = ['xx.x', 'x.xx', 'x..x', 'xxx.'];
const TOMS = ['tomHigh', 'tomMid', 'tomLow'] as const;

/**
 * The drummer's four, bebop style (Max Roach, Philly Joe Jones). The first bar states a
 * two-beat motif on the snare, answered on the toms, with the kick on the one as the band
 * drops out. The middle bars develop it: displaced by an eighth and moved to the toms, then
 * as accents in a stream of eighths. The last bar states it once more and runs home down the
 * toms, louder as it goes, to a snare-and-kick shot on the "and" of 4; the crash on the next
 * downbeat is the band coming back. Swung eighths only, for the same reason as the comping (a
 * sixteenth would flam once swung). The hi-hat foot is the time's own: the kit keeps it.
 */
function jazzTrade(ctx: BarContext, bar: number, length: number, tier: EnergyTier): Lines {
    const total = barSteps(ctx.bar);
    const slotStart = ctx.bar.index - bar;
    // One motif for the whole four: it is the solo's idea.
    const motif = ctx.rng(`trade:${ctx.pass}:${slotStart}`, 'song').pick(TRADE_MOTIFS);
    const lines = {
        snare: [] as string[],
        tomHigh: [] as string[],
        tomMid: [] as string[],
        tomLow: [] as string[],
        kick: [] as string[],
    };
    for (const line of Object.values(lines)) {
        line.push(...'.'.repeat(total));
    }
    const hit = tier === 'low' ? 'o' : 'x';
    const role =
        bar === length - 1
            ? 'home'
            : bar === 0
              ? 'state'
              : bar === length - 2
                ? 'stream'
                : 'displace';
    // A displaced bar plays the motif an eighth late; its first stroke is still the accent.
    const shift = role === 'displace' ? 1 : 0;
    const runFrom = 8;
    const run: number[] = [];
    for (let step = runFrom; step < total - 2; step += 2) {
        run.push(step);
    }
    for (let step = 0; step < total; step += 2) {
        const e = step / 2;
        const half = Math.floor(e / 4);
        const on = motif[(e - shift + 4) % 4] === 'x';
        const accent = e % 4 === shift;
        if (role === 'home' && step === total - 2) {
            lines.snare[step] = 'X';
            lines.kick[step] = 'X';
            continue;
        }
        if (role === 'home' && step >= runFrom) {
            // Every eighth, the three toms in turn from high to low, getting louder.
            const k = run.indexOf(step);
            lines[TOMS[Math.floor((k * TOMS.length) / run.length)]][step] =
                tier === 'low' || k < run.length / 2 ? 'o' : 'x';
            continue;
        }
        if (role === 'stream') {
            // The motif as accents in a stream of eighths, each figure's first doubled by the
            // kick (a "bomb").
            lines.snare[step] = on ? 'X' : 'g';
            if (on && accent) {
                lines.kick[step] = 'x';
            }
            continue;
        }
        if (!on) {
            // Driving hard, the left hand keeps the eighths going softly between the strokes.
            if (tier === 'high') {
                lines.snare[step] = 'g';
            }
            continue;
        }
        // Stated on the snare and answered on the high tom; displaced, it moves to the toms
        // as a unit, high then the floor tom.
        const piece =
            role === 'displace'
                ? half % 2 === 0
                    ? 'tomHigh'
                    : 'tomLow'
                : half % 2 === 0
                  ? 'snare'
                  : 'tomHigh';
        lines[piece][step] = accent ? 'X' : hit;
    }
    if (role === 'state') {
        // The one, under the statement: the band has just dropped out.
        lines.kick[0] = 'x';
    }
    return Object.fromEntries(
        Object.entries(lines).map(([piece, line]) => [piece, line.join('')]),
    ) as Lines;
}

const jazzDrums = drumIdiom({
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
    trade: jazzTrade,
});

// ================================================================ bass
/**
 * An approach into `target` that neither repeats `avoid` (the note before it) nor is the
 * target itself — so an approach always moves, and always resolves.
 */
function chooseApproach(
    rng: Rng,
    target: number,
    chord: ChordFacts,
    avoid: number | null,
    near: number = avoid ?? target,
): number {
    for (let tries = 0; tries < 4; tries++) {
        const kind = pickApproach(rng, true);
        let note = approach(target, chord, kind);
        // The fifth-above approach can come from below instead (a fourth under the target):
        // take whichever octave sits nearer the line, so it never leaps an octave to get there.
        if (kind === 'dominant') {
            const under = target - 5;
            if (under >= BASS.lo && Math.abs(under - near) < Math.abs(note - near)) {
                note = under;
            }
        }
        if (note !== avoid && note !== target) {
            return note;
        }
    }
    const below = approach(target, chord, 'chromatic-below');
    return below !== avoid ? below : approach(target, chord, 'chromatic-above');
}

// ---------------------------------------------------------------- walking
/**
 * A walking line: the chord's bass on its arrival beat, an approach tone on the beat
 * before the next chord, and chord/scale tones in between that move toward that approach
 * without repeating. Low energy relaxes into a two-feel (half notes on the strong beats).
 */
const walkingBass: PitchedIdiom = {
    name: 'walking',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        const events: PitchedNote[] = [];
        let last = memory.last;
        const beats = pulses(bar);
        const twoFeel = tier === 'low' && bar.meter.name === '4/4';
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                events.push(bassNote(bar, 0, place(bassPc(chord), last), 16, dyn(96, plan.energy)));
            }
            return { events, memory: { last } };
        }
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            let steps = beats.map((b) => b.step).filter((s) => s >= from && s < to);
            if (twoFeel) {
                steps = steps.filter((s) => s % 8 === 0);
            }
            if (span.attack && !steps.includes(from)) {
                steps.unshift(from);
            }
            if (!steps.length) {
                return;
            }
            const rng = ctx.rng(`walk${i}`);
            const rootPc = bassPc(chord);
            const followingChord =
                spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const chordPcs = new Set(chord.intervals.map((n) => mod12(chord.root + n)));
            const scalePcs = new Set(chord.scale.map((n) => mod12(chord.root + n)));

            // 1. The arrival: the chord's bass. One time in ten the 3rd, for motion — but never
            //    after an approach that pointed at the root (it must resolve), never at the
            //    top of a section, and never under a slash chord (its bass note is the point).
            let first: number;
            if (span.attack || last === null) {
                const arrival = place(rootPc, last);
                const approached = last !== null && Math.abs(last - arrival) <= 2;
                const third = chord.third;
                const useThird =
                    chord.bass === chord.root &&
                    third !== null &&
                    !approached &&
                    bar.barInVisit > 0 &&
                    rng.chance(0.1);
                first = useThird ? place(mod12(chord.root + third), last) : arrival;
            } else {
                first = last;
            }

            // 2. Two-feel: root, then the fifth on 3 — with a quarter-note approach on 4
            //    (35%) splitting the half note when a change follows.
            if (twoFeel) {
                const fifth = place(mod12(chord.root + fifthOf(chord)), first);
                const notes: [number, number][] = [];
                notes.push([steps[0], first]);
                if (steps.length > 1) {
                    notes.push([
                        steps[1],
                        fifth === first
                            ? place(mod12(chord.root + (chord.third ?? 7)), first)
                            : fifth,
                    ]);
                }
                const tail = notes[notes.length - 1];
                if (followingChord && to - tail[0] >= 8 && rng.chance(0.35)) {
                    const target = place(bassPc(followingChord), tail[1]);
                    notes.push([to - 4, chooseApproach(rng, target, chord, tail[1])]);
                }
                notes.forEach(([step, midi], k) => {
                    const length = (notes[k + 1]?.[0] ?? to) - step;
                    events.push(
                        bassNote(
                            bar,
                            step,
                            midi,
                            length * 0.92,
                            dyn(k === 0 ? 96 : 86, plan.energy),
                        ),
                    );
                });
                last = notes[notes.length - 1][1];
                return;
            }

            // 3. Four-feel: pick the approach into the next chord first (only on a note no
            //    longer than a beat — a held note is never a passing tone), then walk the
            //    middle toward it without repeating a pitch.
            const line: number[] = [first];
            const lastLength = to - steps[steps.length - 1];
            let approachNote: number | null = null;
            if (followingChord && steps.length > 1 && lastLength <= 4) {
                const target = place(bassPc(followingChord), first);
                approachNote = chooseApproach(
                    rng,
                    target,
                    chord,
                    steps.length === 2 ? first : null,
                );
            }
            const middleCount = steps.length - 1 - (approachNote === null ? 0 : 1);
            for (let k = 0; k < middleCount; k++) {
                const prev = line[line.length - 1];
                const goal = approachNote ?? first;
                const isLastMiddle = k === middleCount - 1 && approachNote !== null;
                const direction = Math.sign(goal - prev) || (prev > BASS.home ? -1 : 1);
                const strong = steps[k + 1] % 8 === 0;
                const options: [number, number][] = [];
                for (let d = 1; d <= 5; d++) {
                    for (const sign of [direction, -direction]) {
                        const m = prev + sign * d;
                        if (m < BASS.lo || m > BASS.hi || m === approachNote) {
                            continue;
                        }
                        // The note before the approach sits a step or a third from it.
                        if (
                            isLastMiddle &&
                            approachNote !== null &&
                            Math.abs(m - approachNote) > 4
                        ) {
                            continue;
                        }
                        const pc = mod12(m);
                        const isChord = chordPcs.has(pc);
                        if (!isChord && !scalePcs.has(pc)) {
                            continue;
                        }
                        // Chord tones on strong beats; steps over leaps; toward the goal.
                        let w = (isChord ? (strong ? 3 : 1.6) : strong ? 0.5 : 1.4) / d;
                        w *= sign === direction ? 2 : 0.6;
                        options.push([m, w]);
                    }
                }
                const fallback = place(mod12(chord.root + fifthOf(chord)), prev);
                line.push(
                    options.length
                        ? rng.weighted(options)
                        : fallback === prev
                          ? prev + (direction || 1) * 2
                          : fallback,
                );
            }
            if (approachNote !== null) {
                line.push(approachNote);
            }
            steps.forEach((step, k) => {
                if (k >= line.length) {
                    return;
                }
                const length = (steps[k + 1] ?? to) - step;
                // Walking accents are even; the arrival beat is a touch stronger.
                const velocity = k === 0 && span.attack ? 98 : step % 8 === 4 ? 90 : 86;
                events.push(
                    bassNote(bar, step, line[k], length * 0.92, dyn(velocity, plan.energy)),
                );
            });
            last = line[Math.min(line.length, steps.length) - 1];
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * Comping: short rootless chords in conversation with the soloist that isn't there yet —
 * a Charleston, its reverse, pushes on the "and". Rhythm per chord span is seeded per bar,
 * sparse at low energy and busier at high.
 */
const COMP_CELLS: readonly [number[], number][] = [
    [[0, 6], 4], // Charleston
    [[2, 8], 2], // reverse Charleston
    [[6], 3], // the "and" of 2
    [[0], 2],
    [[2, 6], 1],
    [[4, 10], 2],
    [[6, 14], 2],
];

// Two-beat spans (two chords in a bar) get half-bar figures: on the chord, on its "and",
// or both — never a four-beat figure that would never strike the chord.
const SHORT_COMP_CELLS: readonly [number[], number][] = [
    [[0], 3],
    [[2], 2],
    [[0, 6], 1],
];

function jazzComp(
    { from, to, attack }: { from: number; to: number; attack: boolean },
    tier: EnergyTier,
    rng: Rng,
): Hit[] {
    if (!attack && from === 0 && tier === 'low') {
        return [];
    }
    const length = to - from;
    const cell = rng.weighted(
        length <= 8
            ? SHORT_COMP_CELLS
            : COMP_CELLS.filter(([c]) => c.every((s) => s < length) || c[0] < length),
    );
    const hits: Hit[] = [];
    for (const offset of cell) {
        const step = from + offset;
        if (step >= to) {
            continue;
        }
        // Mostly short stabs; some held (a legato comp breathes).
        const held = rng.chance(tier === 'low' ? 0.5 : 0.25);
        hits.push({
            step,
            length: held ? to - step : 1.5,
            velocity: offset % 4 === 0 ? 78 : 88,
        });
    }
    if (tier === 'high' && length >= 8 && rng.chance(0.4)) {
        const extra = from + rng.pick([10, 14].filter((s) => s < length));
        if (extra && !hits.some((h) => h.step === extra)) {
            hits.push({ step: extra, length: 1.5, velocity: 84 });
        }
    }
    return hits.sort((a, b) => a.step - b.step);
}

const jazzKeys = compIdiom({
    name: 'jazz comp',
    kind: 'rootless',
    push: { low: 0.15, mid: 0.3, high: 0.4 },
    rhythm: (_ctx, span, tier, rng) => jazzComp(span, tier, rng),
});

// ---------------------------------------------------------------- guitar
const jazzGuitar = compIdiom({
    name: 'swing rhythm guitar',
    kind: 'shell',
    // The Freddie Green chunk: root on the 6th or 5th string (doubling the walking bass an
    // octave up, on purpose), 7th and 3rd above it with a muted string skipped (8x89xx).
    // No open strings: the chunk is muted by releasing the fretting hand.
    grip: {
        strings: 3,
        slot: { lo: 40, hi: 67, top: 62 },
        rootBottom: true,
        skip: true,
        open: false,
    },
    // Four-to-the-bar never anticipates; the sparse comp sometimes does.
    push: { low: 0.15, mid: 0, high: 0 },
    rhythm(ctx, span, tier, rng) {
        if (tier === 'low') {
            // Quiet choruses: comp like the piano (a Charleston, a push on the "and").
            return jazzComp(span, tier, rng);
        }
        // Four to the bar, the Freddie Green way: 1 and 3 a little longer and softer, 2 and 4
        // short, crisp and leaned on — the long-short pull between them is the chunk's swing.
        // A three-string chunk sounds as one: no audible roll to smear it against the bass.
        return pulses(ctx.bar)
            .filter((p) => p.step >= span.from && p.step < span.to)
            .map((p) =>
                p.role === 'back'
                    ? { step: p.step, length: 1.2, velocity: 86 }
                    : { step: p.step, length: 2.4, velocity: 70 },
            );
    },
});

// ================================================================ lead
// A bebop horn: eighth-note lines (swung by the feel pass) that start on an upbeat as often as
// on a beat, land a 3rd or 7th on every chord change and enclose it now and then, and end with
// a short "doo-dat" or a held note. The bebop scale puts chord tones on the beats of a run.
// The head is a period: a statement, its answer, a contrast, the statement back.
const jazzLead = leadIdiom({
    name: 'bebop lead',
    cells: {
        // Chorus one opens with short motifs: three or four notes and a breath.
        sparse: [
            '..x-x-x-----....',
            'x-x---x-----....',
            '....x-x-x-------',
            'x---..x-x---....',
            '..x-----x-x-x---',
        ],
        mid: [
            'x---x-x-x-----..',
            '..x-x-x---..x-x-',
            'x-x-x-----..x-x-',
            '....x-x-x---x---',
            '..x---x-x---....',
        ],
        busy: [
            'x-x-x-x-x-x-x-x-',
            '..x-x-x-x-x-x-x-',
            'x-x-x-x-x-x-x---',
            '....x-x-x-x-x-x-',
            'x-x-x---x-x-x-x-',
        ],
    },
    // A phrase ends on an arrival; a call or an answer is a short figure that ends held.
    endings: [
        'x-x-x-------....',
        '..x-x-x-----....',
        'x-x---..........',
        'x---x-------....',
        '..x-x-x-x-------',
        'x-------........',
    ],
    head: {
        cells: [
            'x---x---x-------',
            'x-x-x---x-------',
            '..x-x-x-x-------',
            'x-----x-x---x---',
            '....x-x-x-x-x---',
        ],
        endings: ['x---------------', 'x-----------....', 'x-x-x-----------'],
        form: 'period',
    },
    pool: (chord) => bebopScale(chord),
    arrive: (chord) => guideTones(chord),
    settle: (chord) => restingTones(chord),
    chromatic: 0.45,
    enclosure: 0.25,
    riff: 0.08,
    space: 0.25,
    bends: { blue: 0, root: 0 },
    scoop: 0.15,
    // Bebop alto is mostly straight tone: vibrato only on a half note or longer.
    vibrato: 8,
});

export const jazz: Style = {
    id: 'jazz',
    name: 'Jazz',
    // Medium swing (offbeat at ~62% of the beat, not a hard triplet). The walking bass
    // sits on top of the ride (a hair ahead drives the time); the comping lays back.
    // The guitar's four-to-the-bar chunk is part of the time, locked with the bass.
    feel: {
        swing: 72,
        swingGrid: 8,
        // The soloist lays back against the ride, like the comping, not ahead with the bass.
        lean: { bass: -2, comp: 8, lead: 10 },
        compLean: { guitar: -2 },
        humanize: 40,
    },
    drums: jazzDrums,
    bass: walkingBass,
    comp: { keyboard: jazzKeys, guitar: jazzGuitar },
    prefers: 'piano',
    lead: { idiom: jazzLead, prefers: 'sax' },
    // After the solos, the horn trades fours with the drummer before the head comes back.
    trades: true,
};
