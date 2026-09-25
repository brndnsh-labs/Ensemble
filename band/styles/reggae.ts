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
import { leadIdiom } from '../players/lead/idiom.js';
import { chordScale, pentatonicPool, restingTones, rootFirst } from '../players/lead/palette.js';
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
            // The riddim is the tune's, not the section's: a band commits to steppers or
            // rockers for the whole performance, it doesn't flip between choruses.
            const riddim = ctx.rng('riddim', 'song').pick(['steppers', 'rockers'] as const);
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
 * one. The chop on 2 and 4 is reggae's non-negotiable comp gesture — every figure below
 * keeps it accented, never softer than the lighter strokes around it — while beats 1 and 3
 * stay empty, left to the bass and the drop.
 * - plain: the one-drop skank;
 * - double: the chop and a sixteenth flick after it ("chk-a"), a busier hand;
 * - ands: the 2-and-4 chop plus every other "and" as a lighter stroke, the rockers/steppers
 *   lift (guitar only). A lift has to sound *louder*, not softer: the "and"s are lighter
 *   than 2 and 4, never a replacement for them.
 */
const SKANKS = {
    plain: '....X.......X...',
    double: '....Xx......Xx..',
    ands: '..x.X.x...x.X.x.',
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
 * The organ bubble: the canonical "space-left-right-left" cell on e-&-a. Each beat is a
 * hole; a felt left-hand touch anticipates the chord on the "e", the chord itself lands on
 * the "and" (the right hand), and a matching felt touch trails it on the "a". The touches
 * are lighter, not literally lower — this book plays one voicing at a time (there's no
 * second, lower hand to give them their own note), so softness is what stands in for the
 * second voice. A quiet band drops the e/a touches and plays only the chord, same as before.
 * The light sixteenth swing drags the "a" late, which is the bubble's lope.
 */
function bubble(ctx: BarContext, { from, to }: { from: number; to: number }, tier: EnergyTier) {
    const hits: Hit[] = [];
    const push = (step: number, length: number, velocity: number) => {
        if (step >= from && step < to) {
            hits.push({ step, length, velocity });
        }
    };
    for (const p of pulses(ctx.bar)) {
        // The pulse's last eighth is its "and" (a 4/4 beat's step 2, a 6/8 group's step 4).
        const and = p.step + p.steps - 2;
        push(and, 0.9, 88);
        if (tier !== 'low') {
            push(and - 1, 0.5, 46); // "e": felt, ahead of the chord
            push(and + 1, 0.5, 46); // "a": felt, trailing it
        }
        // With no guitar in the band, the organ alone has to carry reggae's one non-negotiable
        // gesture: a right-hand chop on 2 and 4, doubling what the skank would play there. The
        // organ is always this band's only comp (there's no second instrument to lean on), so
        // it plays at every tier — the same accent the skank gives it — or an organ-only band
        // would never sound unmistakably reggae.
        if (p.role === 'back') {
            push(p.step, 0.9, 96);
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
        const { line } = skankLine(ctx, tier, 'guitar');
        // At reggae tempos the hand swings in sixteenths, not eighths (T2): every skank line
        // uses grid 1. The pendulum then sets each chop's direction from its own position —
        // the 2-and-4 chop lands on an even sixteenth, so it's always a downstroke, and so is
        // every "and" (also an even sixteenth): the meatier chop a lift wants, not the lighter
        // upstroke an eighth-grid hand would have given it. The double chop's sixteenth flick
        // right after it is the only hit on an odd step, so it alone comes up.
        // The hand lets go at once: a chop sounds for under a sixteenth.
        return strums(line, from, to, 1, 0.8);
    },
});

// ================================================================ lead
// A roots horn line, the sound between a melodica and a Wailers horn section: short phrases that
// start after the One (the one drop leaves the downbeat empty, and so does the melody) and come
// to rest on the drop on 3, long warm notes scooped into, and a lot of room — the skank and the
// bass are the song, the horn answers them. A minor-key tune moves through the minor
// pentatonic (the dub melodica's dark, modal sound); a major-key one through the chord's own
// scale, sweet rather than blue. It lands on the 3rd, comes home to the root, and says the same
// hook again rather than something new: a call, the call again, an answer (the head is AAB), and
// a riff played twice in a solo more often than not.
const reggaeLead = leadIdiom({
    name: 'reggae lead',
    cells: {
        // Chorus one: two or three notes after the One, the last held onto the drop.
        sparse: ['..x-x-------....', '....x---x-------', '......x-x-x-----', '..x---..x-------'],
        // A short line: offbeat entries, a long note on 3, sometimes a pickup into the next bar.
        mid: ['..x-x-x-x-------', 'x---..x-x---x---', '..x-x-..x-x-x---', '....x-x-x---..x-'],
        // Busier, still laid back: eighth lines with a sixteenth turn, never a bebop run.
        busy: ['..x-x-x-x-x-x---', 'x-x-..x-x-x-x-x-', '..xxx-x-x---x-x-', '....x-xxx-x-x---'],
    },
    // A phrase ends on a long note from beat 2 or on the drop, and holds through the skank.
    endings: ['..x-x-----------', '....x-----------', '..x-x-x---------', '......x-x-------'],
    head: {
        cells: ['..x-x-x-x-------', '....x-x-x-------', '..x---x-x---x---', 'x---..x-x-------'],
        endings: ['..x-------------', '..x-x-----------'],
        // A call, the same call again, a different answer, each with a bar of room for the
        // skank: the way a roots horn line (or a dub melodica) hangs a hook over the riddim.
        form: 'aab',
    },
    // Minor: the minor pentatonic with the chord's tones (Augustus Pablo's modal minor). Major:
    // the chord's own scale — reggae's major-key tunes are sweet, and a blue third held over a
    // skanking I sounds like rock, not roots.
    pool: (chord, key) => (key.minor ? pentatonicPool(chord, key) : chordScale(chord)),
    // A change lands on the 3rd first (the note horn sections harmonise on), then root and 5th.
    arrive: (chord) => restingTones(chord),
    // A phrase comes home to the root: the hook resolves, and the riddim rolls on under it.
    settle: (chord) => rootFirst(chord),
    // A half-step approach now and then (0.1): the line is diatonic and singable, not bebop.
    chromatic: 0.1,
    // Enclosures are a bebop device; a reggae horn line steps straight into its notes.
    enclosure: 0,
    // Hooks come round again (0.45): a riff played twice is the genre's repetition, the dub
    // loop in miniature, but not so often that every phrase stutters.
    riff: 0.45,
    // Spacious (0.45): nearly half the phrases take a roomier shape than the arc asks for — the
    // horn answers the band, it doesn't lead it.
    space: 0.45,
    // A horn doesn't bend.
    bends: { blue: 0, root: 0 },
    // A lazy scoop into a long note (0.25): the melodica's and the roots horn's slide up to pitch.
    scoop: 0.25,
    // Warm vibrato on a half note or longer; the short notes of a line stay straight.
    vibrato: 8,
});

export const reggae: Style = {
    id: 'reggae',
    name: 'Reggae',
    // A light sixteenth swing (the old engine's 20) lopes the hats, the bubble's tap and the
    // bass pickups without turning them into a shuffle. The drums are the clock; bass and
    // skank sit back behind them — the famously deep, laid-back pocket (the old engine laid
    // the band 8 ms back). The bass drags most; the skank a touch less, so the chop stays
    // crisp against the hat.
    // The horn lays back furthest of all, well behind the drums: roots horn lines drag, and
    // the lazier the melody the deeper the pocket feels.
    feel: { swing: 20, swingGrid: 16, lean: { bass: 8, comp: 5, lead: 12 }, humanize: 30 },
    drums: reggaeDrums,
    bass: reggaeBass,
    comp: { keyboard: reggaeKeys, guitar: reggaeGuitar },
    // Guitar, against the old mapping's organ. The band has one comp instrument, and it has
    // to carry the genre alone: the chop on 2 and 4 is reggae's non-negotiable comp gesture.
    // The skank plays it as the beat itself; the organ bubble is iconic, but on a record it
    // bubbles *between* the skank's chops, so alone it now borrows that chop on its own right
    // hand (see `bubble`) to stay a credible alternative rather than a run of offbeat
    // sixteenths that could be rocksteady or ska. Guitar stays the default because it's the
    // more idiomatic solo voice — the skank *is* the genre's rhythm guitar part. The old
    // engine chose the organ in a two-channel world, where the chords lane skanked and the
    // harmony lane bubbled beside it.
    prefers: 'guitar',
    // Sax: the comp is already a guitar, and a roots lead is a horn or a melodica — Dean Fraser,
    // Tommy McCook. Of the band's leads the sax's reedy, breathy tone is the nearest to the
    // melodica, and warmer than the trumpet, which ska wants for its brightness.
    lead: { idiom: reggaeLead, prefers: 'sax' },
};
