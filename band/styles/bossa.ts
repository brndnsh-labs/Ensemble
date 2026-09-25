// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Bossa: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 */

import type { EnergyTier } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type { PitchedNote } from '../core/types.js';
import {
    approach,
    BASS,
    bassNote,
    bassPc,
    type LineMemory,
    nextChord,
    place,
    sectionPlace,
} from '../players/bass/line.js';
import { compIdiom, type Hit } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, snareFigure } from '../players/drums/kit.js';
import { at, barSteps, dyn, isCommonTime, pulses, STEP, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { chordScale, guideTones } from '../players/lead/palette.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// The cross-stick plays the bossa clave across two bars (x..x..x. ..x..x.. in eighths);
// the kick is the surdo: 1 and 3 with pickups on the "and" of 2 and 4.
const BOSSA_CLAVE = ['x.....x.....x...', '....x.....x.....'];

const bossaDrums = drumIdiom({
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

// ================================================================ bass
/**
 * Root and fifth in the surdo rhythm, in unison with the kick: root on 1 (dotted quarter),
 * fifth on the "and" of 2, then beat 3 — a new root if the chord changes there, else the
 * fifth — and the "and" of 4 leading into the next bar.
 */
const bossaBass: PitchedIdiom = {
    name: 'bossa root-fifth',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const events: PitchedNote[] = [];
        let last = memory.last;
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                events.push(bassNote(bar, 0, place(bassPc(chord), last), 16, dyn(92, plan.energy)));
            }
            return { events, memory: { last } };
        }
        const grid =
            bar.meter.name === '4/4'
                ? [0, 6, 8, 14]
                : pulses(bar).flatMap((p) => [p.step, p.step + p.steps - 2]);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            const root = sectionPlace(ctx, bassPc(chord));
            // The fifth sits below the root when the root is high, so the line stays low.
            const up = root + fifthOf(chord);
            const fifth = up > BASS.hi ? up - 12 : up;
            const steps = grid.filter((s) => s >= from && s < to);
            if (span.attack && !steps.includes(from)) {
                steps.unshift(from);
            }
            const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const rng = ctx.rng(`bossa${i}`);
            steps.forEach((step, k) => {
                const isArrival = k === 0 && span.attack;
                const isLast = k === steps.length - 1;
                // The figure is root, fifth, fifth, root: 1 (root), &2 (fifth), 3 (fifth
                // again, unless a new chord arrives there), and the &4 pickup, which leads
                // to the next bar's root — the chord it anticipates, or this root again.
                let midi = isArrival ? root : fifth;
                if (isLast && step === to - 2 && to === barSteps(bar) && !isArrival) {
                    midi =
                        following && following.bass !== chord.bass
                            ? rng.chance(0.3)
                                ? approach(
                                      sectionPlace(ctx, bassPc(following)),
                                      chord,
                                      'chromatic-below',
                                  )
                                : sectionPlace(ctx, bassPc(following))
                            : root;
                }
                const length = ((steps[k + 1] ?? to) - step) * 0.9;
                const velocity = isArrival || step % 8 === 0 ? 96 : 78;
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy)));
                last = midi;
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
// Two-bar comping figures (bar A, bar B) in sixteenths; the last hit of bar B is the
// classic anticipation of the next bar's chord.
const BOSSA_FIGURES: readonly [number[], number[]][] = [
    [
        [0, 6, 10],
        [4, 8, 14],
    ],
    [
        [0, 6, 12],
        [4, 10, 14],
    ],
];

/**
 * The bossa comping figure, for piano and guitar alike — it *is* the guitar's pattern
 * (João Gilberto's right hand), which the piano borrowed.
 */
function bossaFigure(
    ctx: BarContext,
    { from, to }: { from: number; to: number },
    tier: EnergyTier,
    stroke?: 'down',
): Hit[] {
    const figure = ctx.rng('figure', 'section').pick(BOSSA_FIGURES);
    const cell =
        ctx.bar.meter.name === '4/4'
            ? figure[ctx.bar.barInVisit % 2]
            : pulses(ctx.bar).map((p) => p.step);
    const steps = cell.filter((s) => s >= from && s < to);
    // A chord change mid-bar gets struck on (or an eighth before) its arrival. A figure hit
    // an eighth early belongs to the previous span, where `pushInBar` retargets it — that
    // strike is the arrival, so it isn't struck again.
    if (from > 0 && !cell.some((s) => s >= from - 2 && s <= from + 2)) {
        steps.unshift(from);
    }
    if (tier === 'low' && steps.length > 2) {
        steps.splice(1, 1);
    }
    return steps.map((step, i) => ({
        step,
        length: Math.min(3, (steps[i + 1] ?? to) - step),
        velocity: step % 4 === 0 ? 74 : 82,
        stroke,
    }));
}

const bossaKeys = compIdiom({
    name: 'bossa comp',
    kind: 'drop2',
    pushInBar: true,
    push: { low: 0.6, mid: 0.7, high: 0.75 },
    rhythm: (ctx, span, tier) => bossaFigure(ctx, span, tier),
});

// ---------------------------------------------------------------- guitar
const bossaNylon = compIdiom({
    name: 'bossa guitar',
    kind: 'drop2',
    // Four strings plucked together by the fingers, mid-neck.
    grip: { strings: 4, slot: { lo: 50, hi: 76, top: 67 } },
    // No bassist: the grip takes the root on its bottom string (x32433), thumb and fingers
    // in one hand shape.
    alone: { strings: 5, slot: { lo: 40, hi: 76, top: 67 }, rootBottom: true },
    pushInBar: true,
    push: { low: 0.6, mid: 0.7, high: 0.75 },
    rhythm: (ctx, span, tier) => bossaFigure(ctx, span, tier, 'down'),
});

/**
 * The bossa guitarist's thumb plays the bass — root on the One, fifth on beat 3 (the samba's
 * two surdo beats, in a 4/4 bar). João Gilberto kept his thumb going over a bassist; here it
 * plays only when the bass lane is off, a mixing choice: with a bass in the band, two
 * instruments on the same bottom line muddy the low end of our voices.
 */
const bossaGuitar: PitchedIdiom = {
    name: bossaNylon.name,
    init: bossaNylon.init,
    play(ctx, memory) {
        const out = bossaNylon.play(ctx, memory);
        // (The ending's last chord needs no thumb: without a bass, its grip has the root.)
        if (ctx.plan.lanes.bass || ctx.plan.ending || !isCommonTime(ctx.bar)) {
            return out;
        }
        const thumb: PitchedNote[] = [];
        let last = 45;
        const plucked = new Set(out.events.map((e) => e.tick));
        for (const { span, from, to } of spanSteps(ctx.bar)) {
            const chord = span.chord;
            if (!chord || span.fermata) {
                continue;
            }
            for (const step of [0, 8]) {
                if (step < from || step >= to || (step === from && !span.attack)) {
                    continue;
                }
                // An anticipated grip (root on its bottom string) still rings over the One.
                if (step === 0 && (memory as { pushed?: boolean }).pushed) {
                    continue;
                }
                // Where the fingers pluck, the grip already has the bass on its bottom string.
                if (plucked.has(at(ctx.bar, step))) {
                    continue;
                }
                // The chord's bass where it arrives, its fifth on the other half of the bar.
                const pc = step === from ? chord.bass : mod12(chord.root + fifthOf(chord));
                last = nearestMidi(pc, last, 40, 52);
                thumb.push({
                    lane: 'comp',
                    tick: at(ctx.bar, step),
                    // Rings until the fingers next pluck (the same strings cut it) or the change.
                    dur: Math.min(
                        Math.min(7, to - step) * STEP,
                        Math.min(...[...plucked].filter((t) => t > at(ctx.bar, step)), Infinity) -
                            at(ctx.bar, step),
                    ),
                    midi: last,
                    velocity: dyn(70, ctx.plan.energy),
                    offsetMs: 0,
                    bar: ctx.bar.index,
                });
            }
        }
        // A thumb pluck restarts its string: a grip note of the same pitch stops there.
        const events = out.events.map((e) => {
            const cut = thumb.find(
                (t) => t.midi === e.midi && t.tick > e.tick && t.tick < e.tick + e.dur,
            );
            return cut ? { ...e, dur: cut.tick - e.tick } : e;
        });
        return { events: [...events, ...thumb], memory: out.memory };
    },
};

// ================================================================ lead
/**
 * Where a bossa phrase comes to rest: the 3rd, then the colour the chord owns — a major 7th or
 * a 6th, a written 9th, #11 or 13th — then the 5th, and the root last. Jobim's tunes hang on
 * the maj7 and the 9th ("Girl from Ipanema" sits on them); every choice is a chord tone, so a
 * phrase still ends on the harmony. A dominant's b7 and a b9 or #9 are tension to move
 * through, never a place to rest.
 */
function bossaRest(chord: ChordFacts): number[] {
    const order: number[] = [];
    if (chord.third !== null) {
        order.push(chord.third);
    }
    if (chord.seventh === 11) {
        order.push(11);
    } else if (chord.sixth) {
        order.push(9);
    }
    order.push(...chord.tensions.filter((t) => t === 2 || t === 6 || t === 9));
    order.push(fifthOf(chord), 0);
    return [...new Set(order.map((i) => mod12(chord.root + i)))];
}

// A cool-school horn over the clave: Stan Getz on "Getz/Gilberto". Soft, lyrical lines that
// move by step through the chord's own scale (its 9ths, 13ths and #11s are the colour), long
// notes with the syncopation of the guitar's figure (the 3+3+2, a held note struck on the
// "and") rather than a bebop horn's running eighths, a phrase that lands on the 3rd or 7th
// and rests on the maj7 or the 9th, and a lot of air. Straight tone: vibrato only at the end
// of a long note. The head is a Jobim song form — a statement, its answer, a contrast, the
// statement back.
const bossaLead = leadIdiom({
    name: 'bossa lead',
    cells: {
        // Chorus one: two or three long notes a bar, placed on the clave's 3+3+2.
        sparse: [
            'x-----x-----....',
            '..x-------x-----',
            'x-----x-x-------',
            '....x-----x-----',
            '..x---x-----....',
        ],
        // The guitar's own syncopations: the "and" of a beat pushing into a held note.
        mid: [
            'x-x---x-x---x---',
            '..x-x---x-x---..',
            'x---x-x---x-x---',
            'x-----x-x-x-x---',
            '..x---x---x-x---',
        ],
        // Getz at his busiest is a legato eighth line with a sixteenth turn in it, never bebop's
        // chromatic torrent.
        busy: ['x-x-x-x-x---x---', '..x-x-x-x-x-x---', 'x-x-x---x-x-x-x-', 'x-x-xxx-x---x---'],
    },
    // A phrase arrives on a long note: on the One, or late on the "and" of it (the bossa
    // singer's delayed arrival), or a short-long sigh.
    endings: ['x---------------', '..x-------------', 'x-----x---------', 'x-x-----------..'],
    head: {
        // A Jobim tune: long notes on the 3+3+2, pushed along by the "and"s, with the last
        // figure's pickup on the "and" of 4.
        cells: [
            'x-----x-----x---',
            '..x-x-----x-x---',
            'x-----x-x-------',
            'x---x-x-----x---',
            '....x-x-x-----x-',
        ],
        endings: ['x---------------', '..x-------------', 'x-----x---------'],
        form: 'period',
    },
    pool: (chord) => chordScale(chord),
    arrive: (chord) => guideTones(chord),
    settle: (chord) => bossaRest(chord),
    // Jobim's chromaticism is in the chords, which the chord scale already carries; the line
    // itself steps through them, with a half-step approach now and then (under blues' 0.2,
    // a third of bebop's 0.45).
    chromatic: 0.15,
    // Getz came up through bebop and still encloses a target now and then: a third of jazz's
    // 0.25.
    enclosure: 0.08,
    // A bossa melody restates its figure (One Note Samba lives on it) more than a bebop line
    // does, much less than a blues lick.
    riff: 0.2,
    // Cool-school: the peak is a lift to around G5, never the altissimo scream.
    peak: 11,
    // Cool is spare: the roomiest shape more often than jazz's 0.25.
    space: 0.35,
    // A horn doesn't bend a string.
    bends: { blue: 0, root: 0 },
    // Straight, pure tone: a scoop is rare (a third of jazz's 0.15).
    scoop: 0.05,
    // Vibrato only at the tail of a note of three beats or more; everything shorter is
    // straight tone.
    vibrato: 12,
});

export const bossa: Style = {
    id: 'bossa',
    // Bossa nova *is* the nylon guitar; the piano comp is the alternative.
    name: 'Bossa',
    // Straight, light, slightly forward: bossa floats, it never drags.
    // The horn floats a hair behind the guitar, as Getz did over João Gilberto.
    feel: { swing: 0, swingGrid: 16, lean: { bass: -3, comp: -3, lead: 5 }, humanize: 30 },
    drums: bossaDrums,
    bass: bossaBass,
    comp: { keyboard: bossaKeys, guitar: bossaGuitar },
    prefers: 'nylon',
    // The sax, not the nylon: the bossa lead voice is Getz's horn, and a nylon melody over the
    // nylon comp would be two of the same guitar in the same register.
    lead: { idiom: bossaLead, prefers: 'sax' },
};
