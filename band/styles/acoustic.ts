// cspell:disable — pattern lines (x/o/g/X/R/5/-/.) are not words.
/**
 * Acoustic: the singer-songwriter and the acoustic band — its feel, and its drums, bass and
 * comp (keyboard and guitar) idioms. The shared machinery lives in `players/`; this file is
 * only what makes it this genre.
 *
 * The genre is restraint around a guitar. Quiet, the guitar fingerpicks (a Travis thumb when
 * it's alone, broken chords over a bassist) and the drummer barely plays: a shaker, or a
 * cross-stick on 2 and 4. Louder, the guitar strums open-position chords (D-DU-UDU), the
 * bass walks root to fifth on 1 and 3, and the backbeat fills out to a full snare. Harvested
 * from the old engine's by-ear lessons (`public/engine/grooves/acoustic.ts`, the `acoustic`
 * bass style, `guitar-player.ts`'s strum, the `arp` piano and the add9 colour rule), not its
 * code.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import { chordAt } from '../form/timeline.js';
import {
    BASS,
    bassNote,
    bassPc,
    type LineMemory,
    nextChord,
    place,
    sectionPlace,
} from '../players/bass/line.js';
import { isPlayable } from '../players/comp/fretboard.js';
import { compIdiom, type Hit, pendulum, strums } from '../players/comp/idiom.js';
import type { VoicingKind } from '../players/comp/voicing.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from '../players/drums/kit.js';
import { at, barSteps, dyn, isCommonTime, pulses, STEP, spanSteps } from '../players/grid.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// An acoustic drummer serves the song and the singer: few pieces, soft strokes, and a
// backbeat that only turns into a full snare when the band opens up (the old engine kept the
// cross-stick below 0.75 energy). Every choice is the section's, so a verse keeps its groove.
const EIGHTHS = 'o.g.o.g.o.g.o.g.';

/**
 * The quiet grooves (the old engine's "sparse cajon/shaker pulse without sprinkles"): the
 * Americana half-time (kick on 1, cross-stick on 3 — the old engine's motif 0), a cross-stick
 * on 2 and 4 alone, or just a shaker over a soft kick.
 */
const QUIET: readonly (readonly [Lines, number])[] = [
    [{ kick: 'o...............', rim: '........x.......', shaker: EIGHTHS }, 2],
    [{ kick: 'o...............', rim: '....x.......x...' }, 2],
    [{ kick: 'o...............', shaker: EIGHTHS }, 1],
];

// The kick at mid and high: 1 and 3, sometimes a pickup into 3 (the "and" of 2) or into the
// next bar (the "and" of 4) — the old engine's occasional syncopation, fixed per section.
const KICKS: readonly (readonly [string, number])[] = [
    ['x.......o.......', 3],
    ['x.....o.o.......', 1],
    ['x.......o.....o.', 1],
];

const acousticDrums = drumIdiom({
    name: 'acoustic kit',
    timekeeper: ['hat', 'ride'],
    // Sparing fills: a quiet section just picks up into the next; toms only when it drives.
    fillLength: { phrase: { low: 0, mid: 0, high: 2 }, section: { low: 2, mid: 2, high: 4 } },
    groove(ctx, tier) {
        if (tier === 'low') {
            return ctx.rng('quiet', 'section').weighted(QUIET);
        }
        const kick = ctx.rng('kick', 'section').weighted(KICKS);
        if (tier === 'mid') {
            // Some sections play brushes: soft taps on every eighth (the sweep, as a drum
            // machine can voice it) with the backbeat laid in on 2 and 4 and the hat foot
            // with it. The rest keep a cross-stick backbeat over hat or shaker eighths.
            if (ctx.rng('brushes', 'section').chance(0.35)) {
                return { kick, snare: 'g.g.o.g.g.g.o.g.', hatPedal: '....o.......o...' };
            }
            const pulse: Lines = ctx.rng('pulse', 'section').chance(0.5)
                ? { hat: EIGHTHS }
                : { shaker: EIGHTHS };
            return { kick, rim: '....x.......x...', ...pulse };
        }
        // High: the full snare backbeat, hat eighths, and the shaker shimmering on the "e"s
        // and "a"s (the old engine brought percussion in above 0.6). Some sections breathe an
        // open hat on the "and" of 4 into the next bar.
        const breath = ctx.rng('breath', 'section').chance(0.4);
        return {
            kick,
            snare: '....X.......X...',
            hat: breath ? 'x.o.x.o.x.o.x...' : 'x.o.x.o.x.o.x.o.',
            hatOpen: breath ? '..............o.' : '',
            shaker: '.g.g.g.g.g.g.g.g',
        };
    },
    // Other meters: kick on the first pulse, cross-stick (a snare when loud) on the others —
    // a 3/4 folk waltz is boom-tick-tick.
    cells: (_ctx, tier) => {
        const pulse: Lines = tier === 'high' ? { hat: 'x.o.' } : { shaker: 'o.g.' };
        return {
            down: { kick: tier === 'low' ? 'o...' : 'x...', ...pulse },
            back: tier === 'high' ? { snare: 'X...', ...pulse } : { rim: 'x...', ...pulse },
            strong: { kick: 'o...', ...pulse },
        };
    },
    fill(ctx, steps, rng) {
        const tier = energyTier(ctx.plan.energy);
        if (tier === 'high' && steps >= 4 && rng.chance(0.5)) {
            return tomRun(steps, rng);
        }
        // A quiet pickup stays on the cross-stick and never accents: no crack into a verse.
        const figure = snareFigure(steps, rng, 2);
        return tier === 'low' ? { rim: figure.replaceAll('X', 'x') } : { snare: figure };
    },
});

// ================================================================ bass
interface AcousticBassMemory extends LineMemory {
    /** Where a passing tone pointed: the next chord arrives exactly there, a step away. */
    land: number | null;
}

/**
 * Bass figures in sixteenths, one per section: `R` the root, `5` the fifth, `-` holding.
 * The old engine's acoustic bass played roots in half notes when quiet and quarters above
 * 0.4, with the fifth or octave on the secondary beats. Here: quiet is a two-beat or a whole
 * note (long notes, an upright's warmth); mid adds a pickup on the "and" of 2; high walks
 * quarters. Energy adds notes; the harmony stays root and fifth.
 */
const BASS_FIGURES: Record<EnergyTier, readonly (readonly [string, number])[]> = {
    low: [
        ['R-------5-------', 2],
        ['R---------------', 1],
    ],
    mid: [
        ['R-------5-------', 2],
        ['R-----R-5-------', 1],
    ],
    high: [
        ['R---R---5---5---', 2],
        ['R-----R-5---5---', 1],
    ],
};

/** The chord's fifth for the line — or its root, over a slash chord whose bass is the fifth. */
function fifthPc(chord: ChordFacts): number {
    const fifth = mod12(chord.root + fifthOf(chord));
    return fifth === chord.bass ? chord.root : fifth;
}

/** Other meters: the root on the first pulse, the fifth on the strong pulses above quiet. */
function bassCell(ctx: BarContext, tier: EnergyTier): string {
    const cells = Array.from({ length: barSteps(ctx.bar) }, () => '-');
    for (const p of pulses(ctx.bar)) {
        if (p.index === 0) {
            cells[p.step] = 'R';
        } else if (tier !== 'low' && p.role !== 'back') {
            cells[p.step] = '5';
        }
    }
    return cells.join('');
}

/**
 * The passing tone into `target`, one beat before it: a whole step away when that note is in
 * the current chord's scale, else a half step (chromatic) — always resolving by step, from
 * the side the line is coming from, and never repeating the note before it.
 */
function passingInto(target: number, chord: ChordFacts, from: number): number {
    const dir = from <= target ? -1 : 1;
    const inScale = (m: number) => chord.scale.includes(mod12(m - chord.root));
    const whole = target + 2 * dir;
    const half = target + dir;
    const options = [inScale(whole) ? whole : half, half, target - dir];
    return options.find((m) => m !== from && m >= BASS.lo && m <= BASS.hi) ?? half;
}

/**
 * Simple and supportive: the root on 1, the fifth on 3 (the fifth below where the register
 * allows, an upright's low warmth). Into a chord change it may pass through a step on beat 4
 * — scale tone or chromatic — that resolves onto the new root. Never in the quiet tier: a
 * ballad bass just holds.
 */
const acousticBass: PitchedIdiom = {
    name: 'acoustic root-fifth',
    init: (): AcousticBassMemory => ({ last: null, land: null }),
    play(ctx, memory: AcousticBassMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const total = barSteps(bar);
        const events: PitchedNote[] = [];
        let { last, land } = memory;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                // A passing tone into the last chord lands where it pointed, a step away.
                const root =
                    land !== null && mod12(land) === chord.bass ? land : place(bassPc(chord), last);
                events.push(bassNote(bar, 0, root, total, dyn(96, plan.energy)));
            }
            return { events, memory: { last, land: null } satisfies AcousticBassMemory };
        }
        const common = isCommonTime(bar);
        const figure = common
            ? ctx.rng('bass', 'section').weighted(BASS_FIGURES[tier])
            : bassCell(ctx, tier);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                land = null;
                return;
            }
            // A passing tone pointed here: arrive where it pointed. Otherwise the section's
            // register, so the root keeps its octave from bar to bar.
            const root =
                land !== null && mod12(land) === chord.bass
                    ? land
                    : sectionPlace(ctx, bassPc(chord));
            land = null;
            if (span.fermata) {
                events.push(bassNote(bar, from, root, (to - from) * 0.95, dyn(92, plan.energy)));
                last = root;
                return;
            }
            // The fifth below the root when it fits, else above.
            const fifth = nearestMidi(fifthPc(chord), root - 5, BASS.lo, BASS.hi);
            type Note = { step: number; midi: number; velocity: number };
            const notes: Note[] = [];
            for (let s = from; s < to; s++) {
                const c = figure[s];
                if (s === from || c === 'R') {
                    notes.push({ step: s, midi: root, velocity: s === from ? 96 : 86 });
                } else if (c === '5') {
                    notes.push({ step: s, midi: fifth, velocity: 88 });
                }
            }
            // A passing tone into a change struck on arrival with a new bass note: the bassist's
            // choice about half the time, almost always into a new section.
            const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const followingAttacks = spans[i + 1]?.span.attack ?? ctx.next?.bar.spans[0]?.attack;
            const passAt = to - 4;
            if (
                tier !== 'low' &&
                common &&
                following &&
                followingAttacks &&
                following.bass !== chord.bass &&
                passAt > from
            ) {
                const newSection = to === total && ctx.next?.bar.barInVisit === 0;
                const chance = newSection ? 0.85 : tier === 'high' ? 0.55 : 0.4;
                if (ctx.rng(`pass${i}`).chance(chance)) {
                    // The target is placed the way the next bar would place it, and `land`
                    // makes the next bar arrive exactly there even across a section change.
                    const target = sectionPlace(ctx, bassPc(following));
                    const kept = notes.filter((n) => n.step < passAt);
                    const before = kept[kept.length - 1]?.midi ?? root;
                    kept.push({
                        step: passAt,
                        midi: passingInto(target, chord, before),
                        velocity: 84,
                    });
                    notes.splice(0, notes.length, ...kept);
                    land = target;
                }
            }
            notes.forEach(({ step, midi, velocity }, k) => {
                const gap = (notes[k + 1]?.step ?? to) - step;
                // Quiet notes ring into the next; louder ones leave a breath before it.
                const length = gap * (tier === 'low' ? 0.95 : tier === 'mid' ? 0.88 : 0.8);
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy)));
                last = midi;
            });
        });
        return { events, memory: { last, land } satisfies AcousticBassMemory };
    },
};

// ================================================================ comp: shared
const plainTriad = (chord: ChordFacts) =>
    (chord.family === 'major' || chord.family === 'minor') &&
    chord.seventh === null &&
    !chord.sixth &&
    chord.tensions.length === 0;

/**
 * A plain triad takes its 9th (the add9: Cadd9, Am(add9)) — the singer-songwriter's colour —
 * only where its own chord scale owns a natural 9th. One chord authority: a phrygian iii
 * would have a b9 there, so it stays a plain triad.
 */
const takesAdd9 = (chord: ChordFacts) => plainTriad(chord) && chord.scale.includes(2);

/**
 * The book a bar plays from. `rootless` over a plain triad is R-3-5-9 — exactly the add9
 * (`voicingTones`) — so it is reused rather than a new kind; everything else plays the close
 * chord it's written as (sevenths stay sevenths, never jazz-extended). Chosen per bar, over
 * the bar's own chords. An anticipation plays the next bar's chord with this bar's book, so
 * an add9 bar leading into a chord that can't take the add9 (a V7, a phrygian iii) holds its
 * push: the colour is the part, a push is optional.
 */
type Book = 'close' | 'add9' | 'add9Held';

function colourBook(ctx: BarContext): Book {
    const own = ctx.bar.spans.flatMap((s) => (s.chord ? [s.chord] : []));
    if (!own.length || !own.every(takesAdd9)) {
        return 'close';
    }
    const ahead = ctx.next?.bar.spans[0]?.chord;
    return !ahead || takesAdd9(ahead) ? 'add9' : 'add9Held';
}

const NO_PUSH: Record<EnergyTier, number> = { low: 0, mid: 0, high: 0 };

/** A held chord a broken-chord hand picks through, note by note. */
interface Run {
    chord: ChordFacts;
    /** The held shape, low to high. */
    notes: number[];
    from: number;
    to: number;
}
type Pluck = { midi: number; velocity: number } | null;

/**
 * Breaks held chords into single notes in sequence. The book lays a hold (a strike with no
 * stroke) where the hand takes a shape; this plucks through it on the eighths — `pick` says
 * which note of the shape each eighth plays. Each note is one event and rings until its string
 * is plucked again or the hand moves to the next shape: a fingerpicked chord (and a pedalled
 * broken chord) lets its notes overlap, never the same one twice. Anything stroked (a
 * fermata's strum, the ending) stays as it was.
 */
function breakChords(
    ctx: BarContext,
    events: PitchedNote[],
    pick: (run: Run, steps: number[]) => Pluck[],
): PitchedNote[] {
    const { bar, plan } = ctx;
    const total = barSteps(bar);
    const out = events.filter((e) => e.stroke);
    const holds = events.filter((e) => !e.stroke);
    const runs: Run[] = [];
    for (const tick of [...new Set(holds.map((e) => e.tick))].sort((a, b) => a - b)) {
        const here = holds.filter((e) => e.tick === tick);
        const notes = here.map((e) => e.midi).sort((a, b) => a - b);
        const from = Math.round((tick - bar.start) / STEP);
        const to = Math.min(total, Math.round((tick + here[0].dur - bar.start) / STEP));
        const chord = chordAt(ctx.timeline, tick);
        const prev = runs[runs.length - 1];
        // The same shape, held on: the hand keeps picking through it.
        if (prev && prev.chord === chord && prev.notes.join() === notes.join() && prev.to >= from) {
            prev.to = Math.max(prev.to, to);
        } else if (chord && to > from) {
            runs.push({ chord, notes, from, to });
        }
    }
    for (const run of runs) {
        const steps = [run.from];
        for (let s = run.from + 1; s < run.to; s++) {
            if (s % 2 === 0) {
                steps.push(s);
            }
        }
        const plucks = pick(run, steps);
        steps.forEach((step, i) => {
            const p = plucks[i];
            if (!p) {
                return;
            }
            const again = steps.findIndex((_s, j) => j > i && plucks[j]?.midi === p.midi);
            const until = again >= 0 ? steps[again] : run.to;
            out.push({
                lane: 'comp',
                tick: at(bar, step),
                dur: (until - step) * STEP,
                midi: p.midi,
                velocity: dyn(p.velocity, plan.energy),
                offsetMs: 0,
                bar: bar.index,
            });
        });
    }
    return out;
}

/**
 * Holds for a broken-chord bar: the shape taken on each pulse (and where a chord arrives),
 * held to the next. A hold on every pulse, not one per chord, so a bar tied into from an
 * anticipation still picks from its second beat.
 */
function holds(ctx: BarContext, from: number, to: number): Hit[] {
    const steps = pulses(ctx.bar)
        .map((p) => p.step)
        .filter((s) => s > from && s < to);
    return [from, ...steps].map((step, i, all) => ({
        step,
        length: (all[i + 1] ?? to) - step,
        velocity: 64,
    }));
}

/**
 * Broken-chord patterns over a 4/4 bar's eighths, as places in the held shape (0 the lowest
 * note, 3 the highest; 1 and 2 the inner notes). Every chord's first note is its lowest: the
 * thumb states the chord before the fingers roll through it.
 */
const BROKEN: readonly (readonly number[])[] = [
    // p-i-m-a-m-i-m-a: up the shape and rocking back.
    [0, 1, 2, 3, 2, 1, 2, 3],
    // Up the shape twice a bar — the plainest broken chord.
    [0, 1, 2, 3, 0, 1, 2, 3],
    // Thumb on 1 and 3, the fingers rocking between the top two notes.
    [0, 2, 3, 2, 0, 2, 3, 2],
];
// Other meters: the thumb on each pulse, the fingers rolling up and back between.
const BROKEN_ROLL = [1, 2, 3, 2];

function shapeNote(notes: number[], place: number): number {
    const n = notes.length;
    const index = place === 0 ? 0 : place === 3 ? n - 1 : place === 1 ? 1 : n - 2;
    return notes[Math.max(0, Math.min(n - 1, index))];
}

/** The broken-chord hand: one pattern per section, the thumb on the shape's lowest note. */
function brokenPick(ctx: BarContext): (run: Run, steps: number[]) => Pluck[] {
    const pattern = ctx.rng('broken', 'section').pick(BROKEN);
    const common = isCommonTime(ctx.bar);
    const beats = new Set(pulses(ctx.bar).map((p) => p.step));
    const [, top] = ctx.instrument.range;
    return (run, steps) => {
        // A three-note keyboard voicing is broken with its lowest note doubled an octave up
        // (E-G-C-E), so the four places of a pattern are four different notes. A guitar grip
        // always has four strings or more, and a note off the grip couldn't be fretted.
        const [low] = run.notes;
        const notes =
            run.notes.length === 3 && ctx.instrument.family === 'keyboard' && low + 12 <= top
                ? [...run.notes, low + 12].sort((a, b) => a - b)
                : run.notes;
        let roll = 0;
        return steps.map((step, k) => {
            const place =
                k === 0
                    ? 0
                    : common
                      ? pattern[Math.floor(step / 2)]
                      : beats.has(step)
                        ? 0
                        : BROKEN_ROLL[roll++ % BROKEN_ROLL.length];
            // The thumb speaks a little over the fingers, hardest on the One.
            const velocity = place === 0 ? (step === 0 ? 72 : 66) : 56;
            return { midi: shapeNote(notes, place), velocity };
        });
    };
}

// ================================================================ comp: keyboard
type KeysMode = 'broken' | 'quarters' | 'figure';

/**
 * Quiet, a singer-songwriter pianist breaks the chord into eighths (the old engine's `arp`
 * fingerpick, pedalled) or lays a soft chord on each beat — the section's choice. Above
 * quiet it comps rhythmically.
 */
function keysMode(ctx: BarContext, tier: EnergyTier): KeysMode {
    if (tier !== 'low') {
        return 'figure';
    }
    return ctx.rng('keysQuiet', 'section').weighted<KeysMode>([
        ['broken', 2],
        ['quarters', 1],
    ]);
}

// Piano figures in sixteenths, one per section. Mid is the ballad pulse; high drives.
const KEYS_MID: readonly (readonly [string, number])[] = [
    // A chord on every beat, pedalled — the ballad pulse.
    ['x...x...x...x...', 2],
    // …with the push into 3 on the "and" of 2.
    ['x.....x.x...x...', 2],
    // …with a lift on the "and" of 4 that may carry the next chord over the barline.
    ['x...x...x...x.x.', 1],
];
const KEYS_HIGH: readonly (readonly [string, number])[] = [
    // Driving eighth-note chords.
    ['x.x.x.x.x.x.x.x.', 2],
    // The 3+3+2 pop syncopation.
    ['x..x..x.x..x..x.', 2],
    // Beats with the "and"s of 2 and 4.
    ['x...x.x.x...x.x.', 1],
];

function keysRhythm(ctx: BarContext, from: number, to: number, tier: EnergyTier): Hit[] {
    const mode = keysMode(ctx, tier);
    if (mode === 'broken') {
        return holds(ctx, from, to);
    }
    if (mode === 'quarters' || !isCommonTime(ctx.bar)) {
        // A chord on each pulse, held (pedalled) to the next.
        return holds(ctx, from, to).map((h) => ({
            ...h,
            velocity: h.step === 0 ? 72 : tier === 'low' ? 60 : 70,
        }));
    }
    const line = ctx.rng('keys', 'section').weighted(tier === 'mid' ? KEYS_MID : KEYS_HIGH);
    const hits: Hit[] = [];
    for (let s = from; s < to; s++) {
        if (line[s] !== 'x' && s !== from) {
            continue;
        }
        hits.push({
            step: s,
            // Mid rings to the next chord (pedal); the high drive lifts off between chords.
            length: tier === 'mid' ? 4 : 1.8,
            // The One leads, the backbeats sit up, the offbeats are lighter.
            velocity: s === 0 ? 84 : s % 8 === 4 ? 78 : s % 4 === 0 ? 74 : 68,
        });
    }
    return hits;
}

// A pianist pushes a chord over the barline now and then, more as the band opens up; never
// when quiet (the broken chord and the soft pulse land on the One).
const KEYS_PUSH: Record<EnergyTier, number> = { low: 0, mid: 0.25, high: 0.35 };

const keysBook = (kind: VoicingKind, push: Record<EnergyTier, number>) =>
    compIdiom({
        name: `acoustic piano (${kind})`,
        // Close voicings: a triad (and its add9 where the scale owns it), or the written 7th.
        kind,
        push,
        rhythm: (ctx, { from, to }, tier) => keysRhythm(ctx, from, to, tier),
    });

const KEYS_BOOKS: Record<Book, PitchedIdiom> = {
    close: keysBook('close', KEYS_PUSH),
    add9: keysBook('rootless', KEYS_PUSH),
    add9Held: keysBook('rootless', NO_PUSH),
};

/**
 * The singer-songwriter piano. The add9 is a colour the pianist reaches for once the band is
 * past quiet (the old engine's rule: at 0.2 a triad stays bare); a quiet broken chord is
 * plain. The books share `compIdiom`'s memory, so voice leading carries across a change of
 * kind. An organ holds its chord instead of breaking it — a broken chord needs a struck,
 * decaying instrument.
 */
const acousticKeys: PitchedIdiom = {
    ...KEYS_BOOKS.close,
    name: 'acoustic piano',
    play(ctx, memory) {
        const tier = energyTier(ctx.plan.energy);
        const book = tier === 'low' ? 'close' : colourBook(ctx);
        const out = KEYS_BOOKS[book].play(ctx, memory);
        const broken =
            keysMode(ctx, tier) === 'broken' && !ctx.instrument.legato && !ctx.plan.ending;
        return broken
            ? { events: breakChords(ctx, out.events, brokenPick(ctx)), memory: out.memory }
            : out;
    },
};

// ================================================================ comp: guitar
/**
 * Quiet, the guitarist fingerpicks; loud, it strums. In between (a verse) the section
 * decides: most strum lightly, some keep picking — a singer-songwriter picks one verse and
 * strums the next, and holds the choice for the section.
 */
function picking(ctx: BarContext, tier: EnergyTier): boolean {
    return tier === 'low' || (tier === 'mid' && ctx.rng('picking', 'section').chance(0.35));
}

/**
 * Strum lines on the eighth-note pendulum (down on the beat, up on the "and"; `.` the hand
 * passing without touching the strings). One per section.
 */
const STRUM_MID: readonly (readonly [string, number])[] = [
    // D-DU-UDU, "old faithful": the hand misses on 3, so the up on the "and" of 3 lilts.
    ['x...x.x...x.x.x.', 3],
    // Down on every beat, up on the "and"s of 2 and 4 (the old engine's acoustic strum).
    ['x...x.x.x...x.x.', 2],
    // D-DU-DU-DU: the hand never stops.
    ['x...x.x.x.x.x.x.', 1],
];
// High: the same hand, digging in — accents on 2 and 4, leaning with the snare.
const STRUM_HIGH: readonly (readonly [string, number])[] = [
    ['x...X.x...x.X.x.', 2],
    ['x.x.X.x.x.x.X.x.', 2],
];

/** Other meters: down on each pulse, an up on its last eighth (a 3/4 strum is DU-DU-DU). */
function strumCell(ctx: BarContext): string {
    const cells = Array.from({ length: barSteps(ctx.bar) }, () => '.');
    for (const p of pulses(ctx.bar)) {
        cells[p.step] = 'x';
        if (p.steps >= 4) {
            cells[p.step + p.steps - 2] = 'x';
        }
    }
    return cells.join('');
}

function guitarRhythm(ctx: BarContext, from: number, to: number, tier: EnergyTier): Hit[] {
    if (picking(ctx, tier)) {
        return holds(ctx, from, to);
    }
    const line = isCommonTime(ctx.bar)
        ? ctx.rng('strum', 'section').weighted(tier === 'high' ? STRUM_HIGH : STRUM_MID)
        : strumCell(ctx);
    // Open strings ring until the next stroke: an acoustic strum is never choked.
    const hits = strums(line, from, to, 2, 8);
    // A chord arriving mid-bar is struck where it arrives, even where the line passes.
    if (!hits.some((h) => h.step === from)) {
        hits.unshift({ step: from, length: 8, velocity: 86, stroke: pendulum(from, 2) });
    }
    return hits;
}

const guitarBook = (kind: VoicingKind, push: Record<EnergyTier, number>) =>
    compIdiom({
        name: `acoustic guitar (${kind})`,
        kind,
        // Open position, open strings ON — the ringing open strings are the acoustic sound
        // (unlike the funk scratch or the swing chunk, nothing here mutes by releasing). With a
        // bassist the grips stay at or above C3 (the low strings are the bassist's); a strong
        // pull keeps the hand in first position instead of drifting up the neck.
        grip: { strings: 6, slot: { lo: 48, hi: 72, top: 64, pull: 0.8 }, open: true },
        // Alone, the guitar is the band's bottom: full open chords with the root on the low
        // strings (x32010, 320003), which is also the shape a Travis thumb picks from.
        alone: {
            strings: 6,
            slot: { lo: 40, hi: 72, top: 64, pull: 0.8 },
            rootBottom: true,
            open: true,
        },
        // The last upstroke often changes early to the next chord; a picked bar never pushes
        // (its holds sit on the pulses).
        push,
        rhythm: (ctx, { from, to }, tier) => guitarRhythm(ctx, from, to, tier),
    });

const GUITAR_PUSH: Record<EnergyTier, number> = { low: 0, mid: 0.2, high: 0.3 };
const GUITAR_BOOKS: Record<Book, PitchedIdiom> = {
    close: guitarBook('close', GUITAR_PUSH),
    add9: guitarBook('rootless', GUITAR_PUSH),
    add9Held: guitarBook('rootless', NO_PUSH),
};

// The fingers' roll over a Travis bar: which string (0 the top of the shape, 1 the next
// down, …) each beat's "and" plucks. One per section.
const TRAVIS_FINGERS: readonly (readonly number[])[] = [
    // 2nd, 3rd, 1st, 3rd strings: the classic roll.
    [1, 2, 0, 2],
    // Rocking between the 2nd and 3rd strings ("Freight Train").
    [1, 2, 1, 2],
    // Down from the top string and back.
    [0, 1, 2, 1],
];

/**
 * The Travis hand (no bassist: the low strings are the guitar's). The thumb keeps an
 * alternating bass on every pulse — the chord's bass on the One, then a string up, then the
 * alternate bass, then the string up again (C: C, E, G, E, the G on the 6th string) — and the
 * fingers pluck the treble strings on the "and"s. The alternate is the fifth on a lower string
 * when the hand can hold it with the grip, else the grip's own fifth; every note comes from
 * one fretted shape.
 */
function travisPick(ctx: BarContext): (run: Run, steps: number[]) => Pluck[] {
    const order = ctx.rng('travis', 'section').pick(TRAVIS_FINGERS);
    const beats = new Set(pulses(ctx.bar).map((p) => p.step));
    const [lo] = ctx.instrument.range;
    return ({ chord, notes }, steps) => {
        const root = notes[0];
        const fifth = mod12(chord.root + fifthOf(chord));
        const under = nearestMidi(fifth, root - 5, lo, root - 1);
        const alt =
            under < root && under >= lo && isPlayable([under, ...notes])
                ? under
                : (notes.slice(1, 3).find((m) => mod12(m) === fifth) ?? notes[1] ?? root);
        const upper = notes[1] === alt ? (notes[2] ?? root) : (notes[1] ?? root);
        // The alternate bass only when it adds a note: over x35533 the string above the root is
        // already the fifth, and the thumb just alternates root and fifth (C, G, C, G).
        const third = mod12(alt) === mod12(upper) ? root : alt;
        const thumbTop = Math.max(upper, notes.includes(alt) ? alt : upper);
        const trebles = notes.filter((m) => m > thumbTop).reverse();
        const fingers = trebles.length >= 2 ? trebles : notes.slice(-2).reverse();
        let thumb = 0;
        let finger = 0;
        return steps.map((step, k) => {
            if (k === 0 || beats.has(step)) {
                const j = thumb++;
                const midi = j % 2 === 1 ? upper : j % 4 === 2 ? third : root;
                return { midi, velocity: step === 0 ? 74 : 66 };
            }
            // The roll runs on through the chord, whatever the meter: in 4/4, one place per beat.
            const place = order[finger++ % order.length];
            // Two treble strings under the fingers: the roll alternates them.
            return { midi: fingers[place % fingers.length], velocity: 58 };
        });
    };
}

/**
 * The acoustic guitar: strummed or fingerpicked (see `picking`). Its grips take the add9
 * where the chord's scale owns it — Cadd9 (x32033), the ringing open-position family — when
 * the tune calls for that sound: a whole-song choice, as a songwriter's shapes are.
 * Who owns the bottom: with a bassist, the picking hand breaks the grip above C3; alone, it
 * plays a Travis thumb on the low strings.
 */
const acousticGuitar: PitchedIdiom = {
    ...GUITAR_BOOKS.close,
    name: 'acoustic guitar',
    play(ctx, memory) {
        const tier = energyTier(ctx.plan.energy);
        const add9 = ctx.rng('add9', 'song').chance(0.6);
        const out = GUITAR_BOOKS[add9 ? colourBook(ctx) : 'close'].play(ctx, memory);
        if (!picking(ctx, tier) || ctx.plan.ending) {
            return out;
        }
        const pick = ctx.plan.lanes.bass ? brokenPick(ctx) : travisPick(ctx);
        return { events: breakChords(ctx, out.events, pick), memory: out.memory };
    },
};

export const acoustic: Style = {
    id: 'acoustic',
    name: 'Acoustic',
    // Straight eighths with a light lilt (15 → the offbeat at ~52% of the beat): the old
    // engine's Acoustic feel. The band sits on the drums, as the old engine called it — honest,
    // no affected pocket — except the upright, a hair behind (the old bass's own lay-back,
    // 10–15 ms, less the old drums' 4–8 ms). Humanize moderate: human, never sloppy.
    feel: { swing: 15, swingGrid: 8, lean: { bass: 5, comp: 0 }, humanize: 30 },
    drums: acousticDrums,
    bass: acousticBass,
    comp: { keyboard: acousticKeys, guitar: acousticGuitar },
    // Nylon. The genre's heart is the guitar, and its instrument is a steel-string acoustic,
    // which we have no pack for. Of what we have: the picked electric reads as indie jangle,
    // not an acoustic; the grand piano (the old engine's chords default) is a fine
    // singer-songwriter sound, but it is also Rock's and Country's default, so Acoustic would
    // sound like a quieter Rock. The nylon is an acoustic guitar: fingerpicking — this style's
    // quiet sound — is native to it (and Willie Nelson strums one), and the old engine already
    // sent the acoustic strum to it (`genre-sound-map.ts`). The cost: a strummed nylon is
    // softer than a steel string, and Bossa is on nylon too — but no one hears a D-DU-UDU strum
    // over a cross-stick backbeat as bossa. Revisit when a steel-string pack exists.
    prefers: 'nylon',
};
