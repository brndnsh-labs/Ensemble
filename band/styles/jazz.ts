// cspell:disable — pattern lines (x/o/g/R/5/.) are not words.
/**
 * Jazz: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { Rng } from '../core/random.js';
import type { PitchedNote } from '../core/types.js';
import { chorusBars } from '../form/timeline.js';
import {
    approach,
    BASS,
    bassNote,
    bassPc,
    endingAim,
    endingBass,
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
 * The drummer's turn when the player trades with him, bebop style (Max Roach, Philly Joe
 * Jones), written for fours and fitted to twos and eights. The first bar states a
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
    // Keyed by the turn's place in the chorus, so a counted chorus trades as its lap does.
    const place = slotStart - chorusBars(ctx.timeline, slotStart).first;
    const motif = ctx.rng(`trade:${ctx.pass}:${place}`, 'song').pick(TRADE_MOTIFS);
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
    // In fours: statement, displaced, stream, home. Eights say it twice over; twos are a
    // statement and the run home.
    const role =
        bar === length - 1
            ? 'home'
            : bar % 4 === 0
              ? 'state'
              : bar % 4 === 2 || bar === length - 2
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

/**
 * Is this bar the light head (#2018): the head's A sections, below the high tier. The melody is
 * the event there, so the band plays it lightly — the bass in 2, the drummer on the closed
 * hi-hat — and opens up (the walk, the ride) for the bridge and the solos. why: not at the
 * high tier, since a burner's head (Cherokee, Giant Steps) walks on the ride from the top, and
 * the quiet time under a hot section would sound like the band dropping out.
 */
function lightHead(plan: BarContext['plan']): boolean {
    return plan.form === 'head' && energyTier(plan.energy) !== 'high';
}

const jazzDrums = drumIdiom({
    name: 'jazz ride',
    // The hat is the time under the light head: a section's crash replaces it there too.
    timekeeper: ['ride', 'hat'],
    fillLength: { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 4, mid: 4, high: 8 } },
    // why: the ride rings with the held chord on 1 over a soft kick, then the button: snare
    // and kick together on the "and" of 4.
    ending: () => ({ ride: 'X', kick: 'x.............X.', snare: '..............X.' }),
    groove(ctx, barTier) {
        const head = lightHead(ctx.plan);
        // The light head keeps the quiet time (no feathered kick, no snare comping) whatever
        // the energy below high; the fills, the crashes and the dynamics still follow the bar.
        const tier = head ? 'low' : barTier;
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
        if (head) {
            // why: the head on the closed hi-hat — the swing pattern played on the hat, the ride
            // silent — and the move to the ride for the bridge and the solos is the cue a
            // listener hears as the band opening up. A softer ride alone barely registers.
            return {
                hat: 'x...X.x.x...X.x.',
                hatPedal: '....x.......x...',
                kick,
                snare: snare.join(''),
            };
        }
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
    fill(ctx, steps, rng) {
        // Snare on the swung eighths leading in, kick answering on the last "and".
        const snare: string[] = Array.from({ length: steps }, (_, i) =>
            i % 2 === 0 && rng.chance(0.75) ? 'o' : '.',
        );
        snare[steps - 2] = 'x';
        const kick = `${'.'.repeat(steps - 2)}x.`;
        // The fill's first stroke is on the cymbal keeping the time: the hat under the light head.
        const cymbal = lightHead(ctx.plan) ? 'hat' : 'ride';
        return { snare: snare.join(''), kick, [cymbal]: 'x'.padEnd(steps, '.') };
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
    floored = false,
    near: number = avoid ?? target,
): number {
    for (let tries = 0; tries < 4; tries++) {
        const kind = pickApproach(rng, true);
        let note = approach(target, chord, kind, floored);
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
 * without repeating. Low energy, and the head's A sections, relax into a two-feel (half notes
 * on the strong beats).
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
        // In 2 at low energy (a ballad, a breakdown), and under the light head (`lightHead`,
        // #2018): the bridge walks for contrast and the solos walk, the way a rhythm section
        // often sets up a standard. A ballad keeps it all in 2. The head's last bar before a
        // solo chorus walks: the bass sets up the solo over the barline instead of switching on
        // its downbeat.
        const twoFeel =
            (tier === 'low' || (lightHead(plan) && ctx.next?.plan.form !== 'solo')) &&
            bar.meter.name === '4/4';
        if (plan.ending) {
            // The held note lasts the bar in any meter (#1503); a written `G7 C` strikes both.
            const held = endingBass(
                ctx,
                (c, p) => place(bassPc(c), p),
                last,
                dyn(96, plan.energy),
                memory.land ?? null,
            );
            events.push(...held.events);
            return { events, memory: { last } };
        }
        // Where an approach into the ending promised the band's last note (#2178, `endingAim`).
        let land: number | null = null;
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
            // Into an ending, the approach aims at the low root the band ends on, or at its
            // own octave where the drop to the low one would be a leap (#2178, `endingAim`).
            const aim = (own: number, near: number) =>
                i === spans.length - 1 ? endingAim(ctx, own, near) : null;
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
                // Whether this half note splits is the section's (keyed by the bar's place in
                // it, and the pass): with the head's A sections in 2 (#2018), an A2 plays its
                // A's two-feel rhythm, as a walk's even quarters always did. Which note leads
                // in still follows where the line is (`rng`, the bar's).
                const splits = ctx
                    .rng(`two:${ctx.pass}:${bar.barInVisit}:${i}`, 'section')
                    .chance(0.35);
                if (followingChord && to - tail[0] >= 8 && splits) {
                    const into = aim(place(bassPc(followingChord), tail[1]), tail[1]);
                    const target = into?.target ?? place(bassPc(followingChord), tail[1]);
                    land = into?.promise ?? null;
                    notes.push([
                        to - 4,
                        chooseApproach(rng, target, chord, tail[1], into !== null),
                    ]);
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
                const into = aim(place(bassPc(followingChord), first), first);
                const target = into?.target ?? place(bassPc(followingChord), first);
                land = into?.promise ?? null;
                approachNote = chooseApproach(
                    rng,
                    target,
                    chord,
                    steps.length === 2 ? first : null,
                    into !== null,
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
        return { events, memory: { last, land } };
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

/**
 * The comper's push into a change (#2015). Before a chord change over the barline a strike is
 * added to the figure on the "and" of 4, so the next chord can arrive an eighth early and tie
 * over (the machinery's `push`): Red Garland's and Wynton Kelly's signature move behind a
 * soloist, the change announced before the bass gets there. The chance the figure sets it up,
 * by energy: a quiet chorus lets more changes land on the beat. A figure that already ends on
 * the "and" of 4 (`[6, 14]`) needs no setting up.
 */
const PUSH_SETUP: Record<EnergyTier, number> = { low: 0.25, mid: 0.4, high: 0.45 };

/** The bar's last span, ending at a chord change the comp may push into (`PUSH_SETUP`). */
function changesOverBarline(ctx: BarContext, span: { to: number; index: number }): boolean {
    const here = ctx.bar.spans[span.index]?.chord;
    const next = ctx.next?.bar.spans[0];
    return (
        span.to >= barSteps(ctx.bar) &&
        !!here &&
        !!next?.chord &&
        next.attack &&
        next.chord.symbol !== here.symbol &&
        // The machinery's own refusals (`compIdiom`): the final chord and a held one land on
        // their downbeat, and nothing is pushed into a bar the comp sits out.
        !next.fermata &&
        !ctx.next?.plan.ending &&
        ctx.next?.plan.lanes.comp !== false
    );
}

function jazzComp(
    { from, to, attack }: { from: number; to: number; attack: boolean },
    tier: EnergyTier,
    rng: Rng,
    setup = 0,
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
    // Set up the push: a strike on the "and" of 4 is added to the figure (`PUSH_SETUP`). Added,
    // never moved: the Charleston keeps its "and" of 2, and the comper answers the change with
    // one more strike, the way Garland does at the end of a phrase. Drawn after the figure's
    // own draws, so a bar that doesn't set it up keeps the figure it drew.
    const and4 = to - 2;
    if (setup > 0 && length >= 8 && !hits.some((h) => h.step === and4) && rng.chance(setup)) {
        hits.push({ step: and4, length: 1.5, velocity: 88 });
    }
    return hits.sort((a, b) => a.step - b.step);
}

const jazzKeys = compIdiom({
    name: 'jazz comp',
    kind: 'rootless',
    // A strike on the "and" of 4 before a change is the new chord arriving early, most of the
    // time (#2015): the figure sets it up (`PUSH_SETUP`), and this is the chance it is a push
    // and not a stab of the chord that is leaving. A quiet chorus lets some land on the beat.
    push: { low: 0.6, mid: 0.75, high: 0.85 },
    // A mid-bar change (a ii–V in one bar) is pushed the same way: a strike in the eighth
    // before it plays the new chord and ties over, never a stab of the outgoing chord (#2015).
    pushInBar: true,
    // The comper and the horn share the space: a strike under a moving line may lay out,
    // and nearly every breath gets a stab (Wynton Kelly behind a soloist). The figure is
    // already sparse, so the time stays: never fewer than two strikes a bar.
    answer: { layOut: 0.6, fill: 0.9, keep: 2 },
    rhythm: (ctx, span, tier, rng) =>
        jazzComp(span, tier, rng, changesOverBarline(ctx, span) ? PUSH_SETUP[tier] : 0),
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
            // why: the Charleston (dotted quarter, the "and" of 2), then 3 held and the "and"
            // of 4 pushed over the barline into the next bar: the swing tune's anticipation,
            // the next phrase word sung an eighth early (`LeadBook.pushes`).
            'x-----x-x-----x-',
        ],
        endings: ['x---------------', 'x-----------....', 'x-x-x-----------'],
        form: 'period',
        // A known standard's guide-tone head, sung (#2111): two or three notes a bar, so the
        // guide tones are the tune and the cells only give it a rhythm. The air is inside the
        // cell (a held note, a beat's breath), never a bar of rest. Each has an attack on (or
        // an eighth before) beat 3, where a two-chord bar's second chord arrives.
        guide: {
            // The figures: two or three notes a bar, every one with an attack on (or an eighth
            // before) beat 3, where a two-chord bar's second chord arrives. A note held a beat
            // or more is one of its chord's tones (`walkPool`), so the held notes are the
            // harmony and only the short ones pass between; a pickup on 4 is an eighth for that
            // reason.
            cells: [
                // Dotted quarter, eighth, half: the Charleston figure, the commonest opening of
                // a swing tune — the eighth steps into the half on 3.
                'x-----x-x-------',
                // Two quarters and a half: a plain statement, walking up or down into beat 3.
                'x---x---x-------',
                // Half, dotted quarter, then an eighth pushed into the next bar and tied over
                // its barline: the next chord's guide tone, an eighth early.
                'x-------x-----x-',
                // A lazy entry on the and of 1, then 3 and a pickup on 4: the phrase leans in
                // late, as a singer does (the guide tone is still struck within an eighth of 1).
                '..x-----x---x-..',
                // Dotted quarter, dotted quarter, pickup (3 + 3 + 2): the line rides across
                // the beat.
                'x-----x-----x-..',
                // An eighth flicked off the downbeat, then the half on 3: a doo-dah.
                'x-x-----x-------',
            ],
            // The turn: the bar after a figure, moving on — a half note at most, so the
            // phrase's only long note is its arrival. Two halves; a quarter, a half and a
            // pickup; a half and two pickups back in after an eighth's breath. A pickup on 4
            // is an eighth, clipped before the barline: a passing note that steps into the
            // next bar's guide tone, not a beat held against the chord it leaves.
            turns: ['x-------x-------', 'x---x-------x-..', 'x-------..x-x-..'],
            // The phrase's one long arrival, three beats or more: struck once (two strikes on
            // one chord would be its guide tone twice). A dotted half that breathes a beat;
            // landed an eighth late, as a singer leans into it; or the whole note.
            endings: ['x-----------....', '..x-----------..', 'x-------------..'],
            // A section's last bar: the whole note on the one, breathing an eighth before the
            // next section.
            close: 'x-------------..',
        },
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
    // why: a bebop line seldom starts on the one (#2164). Its cells already enter late, on the
    // "and" of 1 or on 2; a phrase that would enter on the one is led in from beat 4 at 0.85,
    // nearly always — the downbeat entry is the one a bebop player avoids: the eighth before the
    // barline stepping onto its first note (the commonest pickup, so twice weighted), two
    // eighths on 4, or a triplet on 4 turning into it. The solo's ends on the line's own
    // approach (`approaches`): the half step below the target, or its enclosure. A swing head's
    // phrases habitually enter on the "and" of 4 too — the way a horn player phrases a standard's
    // downbeat entries ahead of the beat — a little less often than the solo's, since a tune's
    // written entry on the one is kept now and then: 0.7 of a head's, keyed by the tune so it
    // comes back with it, and walked in by the scale.
    pickup: {
        chance: 0.85,
        head: 0.7,
        figures: ['..x-', '..x-', 'x-x-', 'xxx-'],
        approaches: true,
    },
    // why: and it leans over the barline: a run's last eighth tied into the next bar's one, the
    // change arriving an eighth early (#2164) — on half the barlines it could, since a bebop
    // line restrikes the one as often as it anticipates it.
    pushes: 0.5,
});

export const jazz: Style = {
    id: 'jazz',
    name: 'Jazz',
    // Medium swing: 60, the offbeat at 60% of the beat, not a hard triplet (Brandon's ear,
    // 2026-09-26: 60 sat right at 138 and still at 200, so it doesn't ease off with tempo;
    // the style was first tuned at 72). The walking bass
    // sits on top of the ride (a hair ahead drives the time); the comping lays back.
    // The guitar's four-to-the-bar chunk is part of the time, locked with the bass.
    feel: {
        swing: 60,
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
    // why: a swing band ends on the tonic 6th: it rings under a melody resting on the root
    // without the major 7th's half-step rub. In minor, the minor 6th (dorian's) that closes a
    // minor standard.
    ending: { major: '6', minor: 'm6' },
    // why: the swing ending's button: the band holds the last chord, then plays one short
    // unison hit on the "and" of 4 (the "bop" after the "doo-") with no fill before it.
    endingGesture: { kind: 'button', setup: false },
};
