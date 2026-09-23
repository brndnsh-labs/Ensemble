// cspell:disable — riff lines (R/O/5/7/m/.) are not words.
/**
 * The four v0 bass idioms. Every one of them listens to the drummer first (`heard.drums`)
 * — the bass and kick are one instrument in most of these styles — and resolves every
 * pitch through `ChordFacts`, never the symbol text.
 */
import { energyTier } from '../../arrange/plan.js';
import type { PitchedNote } from '../../core/types.js';
import type { BarSpan } from '../../form/timeline.js';
import type { PitchedIdiom } from '../../styles/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { dyn, pulses, spanSteps } from '../grid.js';
import {
    approach,
    BASS,
    BASS_SLOT_HI,
    bassNote,
    bassPc,
    kickSteps,
    nextChord,
    pickApproach,
    place,
} from './line.js';

interface LineMemory {
    last: number | null;
}

/** Where the line is heading at the end of span `i`: the next chord's bass, placed near `from`. */
function targetAfter(spans: { span: BarSpan }[], i: number, next: ChordFacts | null, from: number) {
    const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
    return following ? place(bassPc(following), from) : null;
}

// ---------------------------------------------------------------- rock
export const rockBass: PitchedIdiom = {
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
            const root = place(bassPc(span.chord), last);
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
            steps.forEach((step, k) => {
                const isLast = k === steps.length - 1;
                let midi = root;
                // Octave pops on the offbeat eighths at high energy (15%).
                if (
                    tier === 'high' &&
                    step % 4 === 2 &&
                    rng.chance(0.15) &&
                    root + 12 <= BASS_SLOT_HI
                ) {
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

// ---------------------------------------------------------------- walking
/**
 * A walking line: the chord's bass on its arrival beat, an approach tone on the beat
 * before the next chord, and chord/scale tones in between that move toward that approach
 * without repeating. Low energy relaxes into a two-feel (half notes on the strong beats).
 */
export const walkingBass: PitchedIdiom = {
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
            const arrival = place(bassPc(chord), last);
            const target = targetAfter(spans, i, next, arrival);
            const chordPcs = new Set(chord.intervals.map((n) => mod12(chord.root + n)));
            const scalePcs = new Set(chord.scale.map((n) => mod12(chord.root + n)));
            const line: number[] = [];
            steps.forEach((_, k) => {
                const prev = line[k - 1] ?? last;
                if (k === 0 && span.attack) {
                    // Arrive on the chord's bass; one time in ten on the 3rd for motion,
                    // never under a slash chord (its bass note is the point).
                    const third = chord.third;
                    const useThird = chord.bass === chord.root && third !== null && rng.chance(0.1);
                    line.push(useThird ? place(mod12(chord.root + third), prev) : arrival);
                    return;
                }
                if (k === steps.length - 1 && target !== null && steps.length > 1) {
                    line.push(approach(target, chord, pickApproach(rng, true)));
                    return;
                }
                // Middle of the line: move toward where the approach will need to be.
                const goal = target ?? arrival;
                const from = prev ?? arrival;
                const direction = Math.sign(goal - from) || (from > BASS.home ? -1 : 1);
                const strong = steps[k] % 8 === 0;
                const options: [number, number][] = [];
                for (let d = 1; d <= 5; d++) {
                    for (const sign of [direction, -direction]) {
                        const m = from + sign * d;
                        if (m < BASS.lo || m > BASS.hi) {
                            continue;
                        }
                        const pc = mod12(m);
                        const isChord = chordPcs.has(pc);
                        if (!isChord && !scalePcs.has(pc)) {
                            continue;
                        }
                        // Chord tones on strong beats; steps preferred over leaps; toward the goal.
                        let w = (isChord ? (strong ? 3 : 1.6) : strong ? 0.5 : 1.4) / d;
                        w *= sign === direction ? 2 : 0.6;
                        options.push([m, w]);
                    }
                }
                line.push(options.length ? rng.weighted(options) : arrival);
            });
            steps.forEach((step, k) => {
                const length = (steps[k + 1] ?? to) - step;
                // Walking accents are even; the arrival beat is a touch stronger.
                const velocity = k === 0 && span.attack ? 98 : step % 8 === 4 ? 90 : 86;
                events.push(
                    bassNote(bar, step, line[k], length * 0.92, dyn(velocity, plan.energy)),
                );
            });
            last = line[line.length - 1];
        });
        return { events, memory: { last } };
    },
};

// ---------------------------------------------------------------- funk
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
            return root + (chord.fifth ?? 7);
        case '7': {
            // The b7 drops below the root when it would leave the register (a funk staple).
            const up = chord.seventh === 10 ? root + 10 : root + 12;
            return up <= BASS_SLOT_HI ? up : up - 12;
        }
        default:
            return root;
    }
}

export const funkBass: PitchedIdiom = {
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
            const root = place(bassPc(chord), last);
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

// ---------------------------------------------------------------- bossa
/**
 * Root and fifth in the surdo rhythm, in unison with the kick: root on 1 (dotted quarter),
 * fifth on the "and" of 2, then beat 3 — a new root if the chord changes there, else the
 * fifth — and the "and" of 4 leading into the next bar.
 */
export const bossaBass: PitchedIdiom = {
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
            const root = place(bassPc(chord), last);
            // The fifth sits below the root when the root is high, so the line stays low.
            const fifth =
                root + (chord.fifth ?? 7) > BASS.hi
                    ? root - (12 - (chord.fifth ?? 7))
                    : root + (chord.fifth ?? 7);
            const steps = grid.filter((s) => s >= from && s < to);
            if (span.attack && !steps.includes(from)) {
                steps.unshift(from);
            }
            const target = targetAfter(spans, i, next, root);
            const rng = ctx.rng(`bossa${i}`);
            steps.forEach((step, k) => {
                const isArrival = k === 0 && span.attack;
                let midi = isArrival || (step - from) % 8 === 0 ? root : fifth;
                // The last pickup before a change can lead in chromatically (25%).
                if (k === steps.length - 1 && !isArrival && target !== null && rng.chance(0.25)) {
                    midi = approach(target, chord, 'chromatic-below');
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
