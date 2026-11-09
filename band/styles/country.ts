// cspell:disable — pattern lines (x/o/g/X/.) are not words.
/**
 * Country: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * The genre is the **boom-chick**: the bass booms on 1 and 3 (root, then fifth), and the
 * snare, the piano and the rhythm guitar answer "chick" on 2 and 4. Energy turns the
 * two-step into a train beat. Harvested from the old engine's by-ear lessons
 * (`core/engine/grooves/country.ts`, the `country` bass style, `strum-country`), not its code.
 */
import { energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import { type Bar, chordAt } from '../form/timeline.js';
import {
    BASS,
    bassNote,
    bassPc,
    endingBass,
    type LineMemory,
    nextChord,
    place,
    sectionPlace,
} from '../players/bass/line.js';
import { isPlayable, pullOffs } from '../players/comp/fretboard.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, snareFigure, tomRun } from '../players/drums/kit.js';
import {
    at,
    barSteps,
    dyn,
    endingSpans,
    endingStrikes,
    isCommonTime,
    pulses,
    STEP,
    spanSteps,
} from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { bluesTargets, restingTones, songPentatonic } from '../players/lead/palette.js';
import { type ChordFacts, chordPcs } from '../theory/chord.js';
import { mod12, nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
// Mid energy is the two-step: kick on 1 and 3 (the boom), snare on 2 and 4 (the chick),
// even eighth hats (a soft offbeat made the two-step limp, #1421). Some sections play the light train beat instead — the snare keeps eighths
// going under the backbeat. High energy is the driving train beat. Low is a ballad:
// cross-stick on 2 and 4, a soft kick, quarter-note hat clicks.
const TWO_STEP: Lines = {
    hat: 'x.x.x.x.x.x.x.x.',
    kick: 'x.......x.......',
    snare: '....X.......X...',
};
// The train beat's snare never stops: ghost strokes (brushes or light sticks) between the
// backbeats, which stay the only loud strokes. The hat drops to quarter "clicks" that cut
// through the snare rather than doubling it (the old engine's call).
const LIGHT_TRAIN: Lines = {
    hat: 'o...o...o...o...',
    kick: 'x.......x.......',
    snare: 'g.g.X.g.g.g.X.g.',
};
// The heavy train: the full sixteenth lattice, every "e" and "a" — a real train beat is
// continuous; gaps in it read as a machine-gun stutter, not a train (old engine, drums P1 #11).
const HEAVY_TRAIN_SNARE = 'ggggXgggggggXggg';
// The freight-train alternative: steady, louder eighths. The old engine dropped to this at
// fast tempos, where sixteenths blur; the band engine doesn't regenerate on tempo, so here it
// is a section's choice instead.
const EIGHTH_TRAIN_SNARE = 'o.o.X.o.o.o.X.o.';

const countryDrums = drumIdiom({
    name: 'country two-step',
    timekeeper: ['hat', 'hatOpen', 'ride'],
    // Country drummers fill sparingly: a pickup, rarely a run. Quiet sections just pick up
    // into the next section.
    fillLength: { phrase: { low: 0, mid: 2, high: 4 }, section: { low: 2, mid: 4, high: 4 } },
    // why: kick and crash on 1 under the ringing chord. This is the blues book's line too: no
    // country-only last hit is written here that I can stand behind (#2017). A country ending
    // is told by its walk-up and stinger, not its last hit (#2177, below).
    ending: () => ({ crash: 'X', kick: 'X' }),
    groove(ctx, tier) {
        if (tier === 'low') {
            return {
                hat: 'o...o...o...o...',
                // The boom on 1, a softer one on 3: a ballad leans on the downbeat.
                kick: 'x.......o.......',
                rim: '....x.......x...',
            };
        }
        if (tier === 'mid') {
            // A section is a two-step or a light train, chosen once so it keeps its groove.
            return ctx.rng('train', 'section').chance(0.3) ? LIGHT_TRAIN : TWO_STEP;
        }
        const sixteenths = ctx.rng('train', 'section').chance(0.6);
        // At full drive the kick plays four to the floor: feathered on 2 and 4, under the
        // accented 1 and 3 rather than flattening them (old engine #797).
        const drive = ctx.plan.energy > 0.8;
        // The top of the build opens the hat on 4 (above ~0.82 in the old engine).
        const open = ctx.plan.energy > 0.82;
        return {
            hat: open ? 'x...x...x.......' : 'x...x...x...x...',
            hatOpen: open ? '............x...' : '',
            kick: drive ? 'x...o...x...o...' : 'x.......x.......',
            snare: sixteenths ? HEAVY_TRAIN_SNARE : EIGHTH_TRAIN_SNARE,
        };
    },
    // Other meters keep the boom-chick: kick on the strong pulses, snare on the others — a
    // 3/4 country waltz is boom-chick-chick.
    cells: (_ctx, tier) => {
        const hat = tier === 'low' ? 'o...' : 'x.o.';
        const back: Lines = tier === 'low' ? { rim: 'x...', hat } : { snare: 'X...', hat };
        return {
            down: { kick: 'x...', hat },
            back,
            strong: { kick: tier === 'low' ? 'o...' : 'x...', hat },
        };
    },
    fill(ctx, steps, rng) {
        // A snare pickup is the country fill; a tom run only when the band is driving, and
        // then only some of the time.
        const lines =
            steps > 2 && energyTier(ctx.plan.energy) === 'high' && rng.chance(0.5)
                ? tomRun(steps, rng)
                : { snare: snareFigure(steps, rng, steps > 2 ? 2 : 1) };
        // The chick survives the fill: a country pickup comes *off* the backbeat ("4-and,
        // ONE"), it doesn't erase it. A fill starting on a backbeat keeps its accent there.
        const start = barSteps(ctx.bar) - steps;
        const onBackbeat = pulses(ctx.bar).some((p) => p.role === 'back' && p.step === start);
        return onBackbeat && lines.snare ? { ...lines, snare: `X${lines.snare.slice(1)}` } : lines;
    },
});

// ================================================================ the ending's walk-up and stinger
// A country ending is not its last drum hit (that is the blues's crash and kick, above): it is
// the bass walking up into the last chord and the guitar's stinger over it (#2177). Both live
// here, in the country bass and guitar, because no other style plays them. (A Nashville *tag*,
// the last line played again before the end, is another thing, and is not built.)

/**
 * The chord the walk-up plays into and the stinger over (#2177): the ending bar's one chord,
 * struck on its downbeat (a resolved turnaround, a last bar already home, a fermata's written
 * chord). Null for a bar that gets home itself (`| G7 C |`): its written V–I is the chart's own
 * figure into the end, played as written, and the I arrives with no downbeat to walk to.
 */
function finalChord(ctx: BarContext, bar: Bar): ChordFacts | null {
    const chords = endingSpans({ ...ctx, bar }).filter(({ span }) => span.chord);
    return chords.length === 1 && chords[0].from === 0 ? chords[0].span.chord : null;
}

// ================================================================ bass
interface CountryBassMemory extends LineMemory {
    /** Where a walk-up pointed: the next chord arrives exactly there, not an octave off. */
    land: number | null;
    /**
     * How hard the walk-up into an ending struck its last note (#2177): the ending's root is
     * struck at least as hard, so the landing is the accent, not the note before it.
     */
    walkedIn: number | null;
    /**
     * A chord whose root the last one-boom bar (a waltz bar) played: if the chord holds, the
     * next bar's boom alternates to its fifth.
     */
    alternate: string | null;
}

/** The boom's other note: the chord's fifth — or its root, over a slash chord on the fifth. */
function fifthPc(chord: ChordFacts): number {
    // An altered chord writes no fifth; restating the root beats inventing a natural 5th.
    if (chord.fifth === null) {
        return chord.bass;
    }
    const fifth = mod12(chord.root + chord.fifth);
    return fifth === chord.bass ? chord.root : fifth;
}

/**
 * The walk-up (or walk-down): two notes on beats 3 and 4 that step from the root into the
 * next chord's bass — the classic three-note run G-A-B → C. Only for a change a third to a
 * tritone away: a step is already a walk, and anything wider isn't reachable in two steps.
 * The note right before the target (beat 4) is the one the ear judges — a clash there reads
 * as a wrong note even when beat 3 was perfectly scalar — so it outweighs beat 3 2-to-1
 * (B4: the old weighting favoured beat 3 and let A7→Dm's phrygian-dominant scale walk
 * A-Bb-C into D, a C natural fighting the chord's own C#). A note also counts as "in" when
 * it's a chord tone even if the scale (built for passing tones, not guide tones) omits it.
 * Ties go to the earlier-tried gap, which is what keeps A7→Dm's beat 3 a grind on the b3
 * (A-C-C#→D) rather than forcing the plain 9th (A-B-C#→D) — both are idiomatic; the point is
 * beat 4 always lands on the chord's own major 3rd, never the clashing natural 3rd of Dm.
 */
function walk(root: number, target: number, chord: ChordFacts): [number, number] | null {
    const distance = target - root;
    if (Math.abs(distance) < 3 || Math.abs(distance) > 6) {
        return null;
    }
    const dir = Math.sign(distance);
    const chordToneOffsets = new Set(chordPcs(chord).map((pc) => mod12(pc - chord.root)));
    const diatonic = (m: number) => {
        const offset = mod12(m - chord.root);
        return chord.scale.includes(offset) || chordToneOffsets.has(offset);
    };
    let best: [number, number] | null = null;
    let bestScore = -1;
    for (const last of [1, 2]) {
        const w4 = target - dir * last;
        for (const gap of [1, 2]) {
            const w3 = w4 - dir * gap;
            // Strictly between the root and the last walk note: the run keeps moving.
            if ((w3 - root) * dir <= 0) {
                continue;
            }
            const score = (diatonic(w4) ? 2 : 0) + (diatonic(w3) ? 1 : 0);
            if (score > bestScore) {
                best = [w3, w4];
                bestScore = score;
            }
        }
    }
    return best;
}

/**
 * A two-beat chord gets a one-note walk on its second beat: a step from the next bass, on the
 * side the line comes from — a scale tone if there is one, else the half step.
 */
function stepInto(root: number, target: number, chord: ChordFacts): number | null {
    const distance = target - root;
    if (Math.abs(distance) < 2 || Math.abs(distance) > 6) {
        return null;
    }
    const dir = Math.sign(distance);
    const candidates = [target - dir, target - dir * 2].filter((m) => (m - root) * dir > 0);
    return (
        candidates.find((m) => chord.scale.includes(mod12(m - chord.root))) ?? candidates[0] ?? null
    );
}

/** A note of the walk-up into the end: its step, pitch and weight. */
type PickupNote = { step: number; midi: number; velocity: number };

/**
 * The walk-up into a country ending (#2177): in the bar before it the bass walks into the last
 * chord's root on the one, every time rather than on the line's coin toss — the run a two-beat
 * bassist plays into a change (Marshall Grant's under the Tennessee Two, the boom-chick's own
 * bassist). `chord` is the bar's last chord, struck at step `from` on `root` and held to the
 * barline; the run takes the beats after it, so a chord struck on 3 (`C7 A7`'s A7) keeps its
 * root there and walks with the run's last note alone.
 * - From the IV it walks down the fourth, as Grant does: F, E-D → C (`walk`, the line's own).
 * - From anywhere else it climbs 5-6-7 into the root: over the V, "G, A-B → C", the G held
 *   through 2; over the I, its root, then the fifth below on 2 (the boom's own drop); over the
 *   ii, D, then G A B → C. The 7 is the chord's own b7 of the key where the bar sounds it (C7's
 *   Bb: a blues's 5-6-b7-1), else the leading tone (A7's B, its 9th, into C); the 6 is the
 *   chord's own step below the 7.
 * - A root that already sits inside the run (the vi's A, the bVII's Bb) keeps the two-beat's
 *   boom, root on 1 and fifth on 3, and walks in on 4 from above it: the run's own note, or
 *   the key's leading tone where the run has none there (A, E, B → C; Bb, F, B → C, the
 *   bVII's chromatic walk-in). Dropping to the 5 under it would turn the line round on its
 *   way up; holding it all bar sounds like the bass dropped out.
 * Null where there is no ending chord to walk into (`finalChord`) or no beat for the run:
 * outside 4/4, or a last chord struck on 4 or off the beat.
 */
function pickup(
    ctx: BarContext,
    chord: ChordFacts,
    root: number,
    from: number,
    to: number,
): { notes: PickupNote[]; target: number } | null {
    const next = ctx.next;
    const into = next?.plan.ending && next.plan.lanes.bass ? finalChord(ctx, next.bar) : null;
    if (
        !into ||
        !next?.bar.spans[0]?.attack ||
        !isCommonTime(ctx.bar) ||
        to !== barSteps(ctx.bar) ||
        from % 4 !== 0 ||
        from > 8
    ) {
        return null;
    }
    const pc = bassPc(into);
    // The bar's own root at the boom's weight (100). why: the run after it swells into the
    // landing as the line's own walk does (96, then 102 on 4, old engine #941); the 5 is the
    // boom's fifth weight (92), where it is a new note.
    const struck: PickupNote = { step: from, midi: root, velocity: 100 };
    const after = (run: PickupNote[]) => run.filter((n) => n.step > from);
    if (mod12(root - pc) === 5 && root - 5 >= BASS.lo) {
        // `walk` always answers across a fourth: the two steps down from the IV to the I.
        const [three, two] = walk(root, root - 5, chord)!;
        return {
            notes: [
                struck,
                ...after([
                    { step: 8, midi: three, velocity: 96 },
                    { step: 12, midi: two, velocity: 102 },
                ]),
            ],
            target: root - 5,
        };
    }
    // The 5 a fourth under the target, both inside the bass's range.
    const five = nearestMidi(mod12(pc + 7), root, BASS.lo, BASS.hi - 5);
    const target = five + 5;
    const tones = chordPcs(chord);
    const seven = tones.includes(mod12(target - 2)) ? target - 2 : target - 1;
    const inChord = (m: number) =>
        tones.includes(mod12(m)) || chord.scale.includes(mod12(m - chord.root));
    const six = [seven - 2, seven - 1].find((m) => m > five && inChord(m)) ?? seven - 2;
    const run: PickupNote[] = [
        { step: 4, midi: five, velocity: 92 },
        { step: 8, midi: six, velocity: 96 },
        { step: 12, midi: seven, velocity: 102 },
    ];
    if (five < root && root < target) {
        // A root inside the run keeps the two-beat's boom, its fifth on 3, and walks in on 4
        // with the run's note above it, or the key's leading tone where the run has none there
        // (the bVII's chromatic walk-in, Bb … B → C).
        const above = run.find((n) => n.step === 12 && n.midi > root);
        return {
            notes: [
                struck,
                ...after([
                    {
                        step: 8,
                        midi: nearestMidi(fifthPc(chord), root, BASS.lo, BASS.hi),
                        velocity: 92,
                    },
                    above ?? { step: 12, midi: target - 1, velocity: 102 },
                ]),
            ],
            target,
        };
    }
    return {
        notes: [
            struck,
            // Over the V the 5 is the root already sounding: it holds through 2.
            ...after(run).filter((n) => n.midi !== root),
        ],
        target,
    };
}

/**
 * The boom-chick bass: root on 1, the fifth on 3 — the fifth *below* the root where the
 * register allows (the old engine's deep-register call), leaving 2 and 4 to the chick. Into a
 * chord change it walks: a three-note run up or down to the new root. Low energy is a ballad
 * two-beat in half notes; mid lets each boom ring a beat so the chick can speak; high punches
 * shorter and walks more. Other meters boom on their strong pulses, and a one-boom meter (a
 * waltz) alternates root and fifth bar by bar while a chord holds.
 */
const countryBass: PitchedIdiom = {
    name: 'boom-chick',
    init: (): CountryBassMemory => ({ last: null, land: null, alternate: null, walkedIn: null }),
    play(ctx, memory: CountryBassMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const total = barSteps(bar);
        const events: PitchedNote[] = [];
        let { last } = memory;
        if (plan.ending) {
            // A walk into the ending (the walk-up, `pickup`, #2177) arrives where it pointed, not an
            // octave off: its target is the first note of the bar's chord.
            let land = memory.land;
            const held = endingBass(
                ctx,
                (c, p) => {
                    const pc = bassPc(c);
                    const arrive = land !== null && mod12(land) === pc ? land : place(pc, p);
                    land = null;
                    return arrive;
                },
                last,
                // why: the ending's root at the line's own weight (100), or harder where a
                // walk-up's last note came in hotter (its 102, read at the bar before's energy).
                Math.max(dyn(100, plan.energy), memory.walkedIn ?? 0),
            );
            events.push(...held.events);
            return { events, memory: { last, land: null, alternate: null, walkedIn: null } };
        }
        const common = isCommonTime(bar);
        const booms = pulses(bar)
            .filter((p) => p.role !== 'back')
            .map((p) => p.step);
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        const nextAttack = ctx.next?.bar.spans[0]?.attack ?? false;
        let land = memory.land;
        let alternate: string | null = null;
        let walkedIn: number | null = null;
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                land = null;
                return;
            }
            // A walk pointed here: arrive where it pointed. Otherwise the section's register,
            // so the boom keeps its octave from bar to bar.
            const root =
                land !== null && mod12(land) === chord.bass
                    ? land
                    : sectionPlace(ctx, bassPc(chord));
            land = null;
            if (span.fermata) {
                events.push(bassNote(bar, from, root, (to - from) * 0.95, dyn(96, plan.energy)));
                last = root;
                return;
            }
            const fifth = nearestMidi(fifthPc(chord), root, BASS.lo, BASS.hi);
            const steps = booms.filter((s) => s >= from && s < to);
            if (!steps.includes(from)) {
                steps.unshift(from);
            }
            steps.sort((a, b) => a - b);
            // A waltz holding its chord alternates: root this bar, fifth the next.
            const oneBoom = booms.length === 1 && spans.length === 1 && from === 0;
            const alternates = oneBoom && memory.alternate === chord.symbol;
            if (oneBoom && !alternates) {
                alternate = chord.symbol;
            }
            // `legato`: a walking note, or the root held into a walk — the line connects.
            // A boom is detached so the chick between booms speaks.
            type Note = { step: number; midi: number; velocity: number; legato?: boolean };
            const notes: Note[] = steps.map((step, k) => ({
                step,
                midi: k === 0 && !alternates ? root : fifth,
                velocity: k === 0 ? 100 : 92,
            }));

            // Walks: never in the ballad, only in 4/4, only into a chord struck on the next
            // barline (or the next chord in this bar) with a different bass note.
            const following = spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
            const followingAttacks = spans[i + 1]?.span.attack ?? nextAttack;
            const rng = ctx.rng(`walk${i}`);
            // The walk-up into a country ending (#2177), at any energy: like the kit's set-up
            // fill above it, the band picks up into its end even in a ballad.
            const walkUp = i === spans.length - 1 ? pickup(ctx, chord, root, from, to) : null;
            if (walkUp) {
                notes.splice(0, notes.length, ...walkUp.notes.map((n) => ({ ...n, legato: true })));
                land = walkUp.target;
                walkedIn = dyn(walkUp.notes.at(-1)!.velocity, plan.energy);
            } else if (
                tier !== 'low' &&
                common &&
                following &&
                followingAttacks &&
                following.bass !== chord.bass
            ) {
                // Aim at the next root in this section's register when a run reaches it,
                // else at its nearest octave.
                const home = sectionPlace(ctx, bassPc(following));
                const reach = Math.abs(home - root);
                const target =
                    reach >= 2 && reach <= 6
                        ? home
                        : nearestMidi(bassPc(following), root, BASS.lo, BASS.hi);
                // A walk-up announces a new section almost always; within one, it's the
                // bassist's choice about half the time (more when the band drives).
                const newSection = to === total && ctx.next?.bar.barInVisit === 0;
                const chance = newSection ? 0.9 : tier === 'high' ? 0.65 : 0.45;
                const run = from <= 4 && to - from >= 12 ? walk(root, target, chord) : null;
                if (run && rng.chance(chance)) {
                    // Root on 1 held to 3 ("G, A-B → C"): the run replaces the fifth.
                    // Walk notes punch a touch hotter than the boom, beat 4 hardest: the pickup
                    // is a gesture into the landing (old engine #941).
                    const kept = notes
                        .filter((n) => n.step < to - 8)
                        .map((n) => ({ ...n, legato: true }));
                    notes.splice(
                        0,
                        notes.length,
                        ...kept,
                        { step: to - 8, midi: run[0], velocity: 96, legato: true },
                        { step: to - 4, midi: run[1], velocity: 102, legato: true },
                    );
                    land = target;
                } else if (to - from === 8 && rng.chance(chance * 0.8)) {
                    // A two-beat chord walks with one note, on its second beat.
                    const into = stepInto(root, target, chord);
                    if (into !== null) {
                        notes.splice(1, notes.length - 1, {
                            step: from + 4,
                            midi: into,
                            velocity: 100,
                            legato: true,
                        });
                        notes[0].legato = true;
                        land = target;
                    }
                }
            }
            notes.forEach(({ step, midi, velocity, legato }, k) => {
                const gap = (notes[k + 1]?.step ?? to) - step;
                // The ballad's half notes and a walking line connect. A two-step boom is
                // short, about half a beat, so the chick answers into air and not over a
                // ringing bass (by ear, #1421); the train's boom rings a little longer.
                const length =
                    tier === 'low' || legato
                        ? gap * 0.92
                        : Math.min(gap, 4) * (tier === 'high' ? 0.75 : 0.55);
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy)));
                last = midi;
            });
        });
        return {
            events,
            memory: { last, land, alternate, walkedIn } satisfies CountryBassMemory,
        };
    },
};

// ================================================================ comp
/** The pulses a chick lands on (the backbeats) and the ones the bass booms on. */
function beatsOf(ctx: BarContext) {
    const all = pulses(ctx.bar);
    return {
        chick: all.filter((p) => p.role === 'back').map((p) => p.step),
        boom: all.filter((p) => p.role !== 'back').map((p) => p.step),
    };
}

/**
 * The ballad: the chord on its arrival and again on each boom, held — the comp moves with the
 * two-beat bass instead of answering it (half notes in 4/4).
 */
function ballad(ctx: BarContext, from: number, to: number, attack: boolean): Hit[] {
    const steps = beatsOf(ctx).boom.filter((s) => s >= from && s < to);
    if (!steps.includes(from)) {
        steps.unshift(from);
    }
    steps.sort((a, b) => a - b);
    return steps.map((step, i) => ({
        step,
        length: (steps[i + 1] ?? to) - step,
        velocity: step === from && attack ? 78 : 64,
    }));
}

// Piano lines in sixteenths: `X` the chick (on 2 and 4), `x` a lighter offbeat pickup.
// Section-scoped, so a verse keeps its figure.
const KEYS_MID = [
    // The plain chick on 2 and 4.
    '....X.......X...',
    // …with a lift on the "and" of 4 into the next boom.
    '....X.......X.x.',
];
const KEYS_HIGH = [
    // Boom-chicka: the offbeat eighths pump around the backbeat chicks, leaving 1 and 3 to
    // the bass (the old engine's "chicka on every &").
    '..x.X.x...x.X.x.',
    // Chick-a on 2 and 4 only.
    '....X.x.....X.x.',
];

const honkyTonk = compIdiom({
    name: 'country piano',
    // Close triads (and whatever 7th or 6th the chart writes) — not jazz extensions; the old
    // engine pinned this after 7ths and 9ths leaked into a triadic idiom (chords P1 #10).
    kind: 'close',
    // The boom states the chord on the One; a pianist pushing it early would put the new
    // chord over the old bass note. No anticipations.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        if (tier === 'low') {
            return ballad(ctx, from, to, attack);
        }
        if (!isCommonTime(ctx.bar)) {
            // Other meters: the chick on every backbeat pulse (boom-chick-chick in 3/4).
            return beatsOf(ctx)
                .chick.filter((s) => s >= from && s < to)
                .map((step) => ({ step, length: 2.5, velocity: 84 }));
        }
        const line = ctx.rng('keys', 'section').pick(tier === 'mid' ? KEYS_MID : KEYS_HIGH);
        const hits: Hit[] = [];
        for (let s = from; s < to; s++) {
            if (line[s] === 'X') {
                // The chick is a dry stab, just over a sixteenth: a ringing one blurred the
                // boom-chick (by ear, #1421).
                hits.push({ step: s, length: 1.2, velocity: 90 });
            } else if (line[s] === 'x') {
                hits.push({ step: s, length: 1.5, velocity: 70 });
            }
        }
        return hits;
    },
});

/**
 * The honky-tonk sixth: a plain major triad takes its major 6th a whole step above the 5th
 * (C-E-G-A) — the pedal-steel colour the old engine's country pads carried. Only on the key's
 * tonic and subdominant (I and IV): a western-swing band runs I6-IV6-I turnarounds on pedal
 * steel, but the 6th on V is the next chord's 3rd arriving early and blurs the pull into I,
 * and the other majors a chart can write (bIII, bVI, bVII) aren't this pocket's tonic-and-
 * subdominant color chords (T4 — the old rule added the 6th to every plain major triad except
 * a V resolving down a fifth, which still let it onto IV and a non-resolving V alike). The
 * compIdiom voices the triad; this adds one note to it, the same length.
 */
function withSixths(ctx: BarContext, events: PitchedNote[]): PitchedNote[] {
    const [, top] = ctx.instrument.range;
    const byTick = new Map<number, PitchedNote[]>();
    for (const e of events) {
        byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e]);
    }
    const out = [...events];
    for (const [tick, notes] of byTick) {
        // The held ending plays its bar's own chord (`arrange/ending.ts`): a resolved
        // turnaround is the I, and it takes its 6th like any I.
        const chord = ctx.plan.ending
            ? (endingSpans(ctx)
                  .filter(({ from }) => at(ctx.bar, from) <= tick)
                  .at(-1)?.span.chord ?? null)
            : chordAt(ctx.timeline, tick);
        const plain =
            chord?.family === 'major' &&
            chord.third === 4 &&
            chord.fifth === 7 &&
            chord.seventh === null &&
            !chord.sixth &&
            chord.tensions.length === 0;
        const degree = chord ? mod12(chord.root - ctx.bar.key.tonic) : -1;
        if (!chord || !plain || (degree !== 0 && degree !== 5)) {
            continue;
        }
        const fifth = notes.find((n) => mod12(n.midi - chord.root) === 7);
        const sixth = fifth ? fifth.midi + 2 : Infinity;
        if (fifth && sixth <= Math.min(top, 84) && !notes.some((n) => n.midi === sixth)) {
            out.push({ ...fifth, midi: sixth });
        }
    }
    return out;
}

const countryKeys: PitchedIdiom = {
    // I6: spread the inner idiom rather than rebuilding `{name, init, play}` by hand, so a
    // flag `honkyTonk` carries (`percussive`, or one added later) survives the wrapper.
    ...honkyTonk,
    play(ctx, memory) {
        const out = honkyTonk.play(ctx, memory);
        return { events: withSixths(ctx, out.events), memory: out.memory };
    },
};

// ---------------------------------------------------------------- guitar
// Strum lines on the eighth-note pendulum (down on the beat, up on the "and"). The hand
// passes 1 and 3 without touching the strings — that's the bass's boom (or, alone, the
// guitarist's own bass note).
const GUITAR_MID = ['....X.......X...', '....X.......X.x.'];
const GUITAR_HIGH = ['..x.X.x...x.X.x.'];

const boomChick = compIdiom({
    name: 'boom-chick guitar',
    // Open triads: root, 3rd and 5th (a written 7th or 6th kept), nothing jazzier.
    kind: 'close',
    // The top four strings in open position — C as xx2010, G as xx0003, D as xx0232 — where
    // open strings ring on the chick (country's sound, unlike the funk scratch or swing
    // chunk, which mute by releasing). D string up: the low strings are the bassist's.
    // A strong pull keeps the hand in first position instead of drifting up the neck.
    grip: { strings: 4, slot: { lo: 50, hi: 72, top: 64, pull: 0.8 }, open: true },
    // No `alone` shape: without a bassist the pick plays the boom on the low strings itself
    // (`countryGuitar` below) and the strum stays on the treble strings — the bass-strum split
    // (Luther Perkins' Johnny Cash sound), not the Carter Family's own thumb-picked melody.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to, attack }, tier) {
        const alone = !ctx.plan.lanes.bass;
        const { chick } = beatsOf(ctx);
        if (tier === 'low' || !isCommonTime(ctx.bar)) {
            if (tier === 'low' && !alone) {
                // A ballad lets each chord ring from its boom, with the bass.
                return ballad(ctx, from, to, attack).map((h) => ({ ...h, stroke: 'down' }));
            }
            // A downstroke on each backbeat, ringing to the next boom (boom-chick-chick in 3/4).
            const booms = beatsOf(ctx).boom;
            return chick
                .filter((s) => s >= from && s < to)
                .map((step) => ({
                    step,
                    length: Math.min(to, booms.find((b) => b > step) ?? to) - step,
                    velocity: tier === 'low' ? 72 : 88,
                    stroke: 'down' as const,
                }));
        }
        const line = ctx.rng('strum', 'section').pick(tier === 'mid' ? GUITAR_MID : GUITAR_HIGH);
        // The chick is choked after an eighth: the hand damps it so the boom speaks.
        return strums(line, from, to, 2, 2);
    },
});

/**
 * How long the stinger's 6th sounds before it falls to the 5th, in sixteenths: an eighth.
 * why: the steel's pedal comes up in about an eighth at a two-step's tempo, quick enough to
 * read as one gesture with the band's hit, slow enough for the 6th to be heard as a note.
 */
const STING_STEPS = 2;
const STING = STING_STEPS * STEP;
/**
 * How far past the hand's span the stinger's struck 6th alone may reach, in frets (`pullOffs`).
 * why: the ending lick is the one place a Telecaster player stretches the pinky for a grace
 * note, and it lasts an eighth, so one fret is the honest reach (open C's A at e5 over B1).
 * Off (0) pending #2195: the invariant suite holds every guitar chord to the three-fret span,
 * and loosening that oracle for a grace note is Brandon's call. Until then the stinger keeps
 * the span like every other chord, and open C has none.
 */
const STRETCH = 0;
/**
 * The pull-off's weight against the strum. why: a left-hand pull-off sounds a little under
 * the picked notes around it, about a tenth softer, so it reads as the hand, not a new pick.
 */
const PULL_OFF = 0.9;

/**
 * The stinger on a country ending (#2177): the rhythm guitar ends on the 6 → 5 fall. The pedal
 * steel's signature ending is the A pedal let up on the last chord — on the E9 neck it raises
 * the 5th a whole step to the 6th, so releasing it drops 6 → 5 over the held chord (Buddy
 * Emmons, Lloyd Green); the Bakersfield Telecaster pickers (Don Rich with Buck Owens) bent and
 * released it the same way. On the boom-chick guitar it is a pull-off: the 6th struck with the
 * chord on the downbeat, pulled off to the 5th an eighth later, which rings to the end. The 6th
 * is the chord's own scale step above the 5th: the major 6th on a major chord (the honky-tonk
 * sixth the piano adds, `withSixths`), the b6 in a minor key (A minor's F → E).
 *
 * It sings on top, or it is not played: the fall is in the chord's top two voices, never under
 * it, and on one string of the chord as the hand holds it (`pullOffs`): a string sounds one
 * note, so the fall takes a string the chord leaves free, or one whose note it can spare — the
 * 5th it falls back to, or a doubled root or 5th, never the only 3rd — and the hand inside its
 * reach (`STRETCH`, off pending #2195). E pulls its B string off from the C# (B2 → B0),
 * A minor its top string from the F (e1 → e0); G, whose open shape holds its only 5th at the
 * bottom, gives the fall its doubled top G's string (E5 → D5, e12 → e10, over the open
 * strings). Open C's and open D's grips have no sting: C's top G (e3) can't reach the A at e5
 * over B1 without the stretch, and D's only 5th is an inner voice. Only on home, the tonic: a
 * written V7 held under a fermata is not where the band stings, and its 6th sits under the b7. Nor where the 6th rubs a half step under a
 * chord note.
 */
function sting(ctx: BarContext, events: PitchedNote[]): PitchedNote[] {
    const chord = finalChord(ctx, ctx.bar);
    const sixth = chord?.scale.find((d) => d === 8 || d === 9);
    if (chord?.fifth !== 7 || sixth === undefined || chord.root !== ctx.bar.key.tonic) {
        return events;
    }
    const strum = events.filter((e) => e.tick === ctx.bar.start && !e.muted);
    const pitches = strum.map((e) => e.midi);
    const top = strum.reduce<PitchedNote | null>((t, e) => (t && t.midi >= e.midi ? t : e), null);
    if (!top || top.dur <= STING) {
        return events;
    }
    const up = (fifth: number) => fifth + sixth - 7;
    // A note the chord can spare: one whose pitch class it sounds again elsewhere.
    const spare = (m: number) => pitches.filter((p) => mod12(p - m) === 0).length > 1;
    const [, hi] = ctx.instrument.range;
    // Each 5th the fall could land on, from the top of the instrument down.
    for (let fifth = nearestMidi(mod12(chord.root + 7), hi, 0, hi); fifth > 0; fifth -= 12) {
        if (up(fifth) > hi || pitches.includes(up(fifth))) {
            continue;
        }
        // The 6th never rubs a half step (or a ninth) under a chord note.
        if (pitches.some((p) => p > up(fifth) && mod12(p - up(fifth)) === 1)) {
            continue;
        }
        const option = pullOffs(pitches, up(fifth), fifth, STRETCH).find(
            ({ replaces }) =>
                (replaces === null && !pitches.includes(fifth)) ||
                replaces === fifth ||
                (replaces !== null && spare(replaces) && !pitches.includes(fifth)),
        );
        if (!option) {
            continue;
        }
        const kept = strum.filter((e) => e.midi !== option.replaces);
        // In the top two voices, or not at all: lower 5ths only sink further.
        if (kept.filter((e) => e.midi > fifth).length > 1) {
            return events;
        }
        const template = strum.find((e) => e.midi === option.replaces) ?? top;
        // The pull-off is no pick stroke: the left hand sounds it, so it rolls with no strum.
        const { stroke: _, ...pulled } = template;
        const fall: PitchedNote[] = [
            { ...template, midi: up(fifth), dur: STING },
            {
                ...pulled,
                midi: fifth,
                tick: template.tick + STING,
                dur: template.dur - STING,
                velocity: Math.round(template.velocity * PULL_OFF),
            },
        ];
        return [
            ...events.filter((e) => !(e.tick === top.tick && e.midi === option.replaces)),
            ...fall,
        ];
    }
    return events;
}

/**
 * The bass-strum guitar (T3 — this is Luther Perkins' Johnny Cash sound, not the Carter
 * Family's own style, which picks the *melody* on the bass strings): with no bassist, the
 * guitarist picks the boom — the root on 1, the fifth on 3, on the low strings — and strums
 * the chick on the treble strings between them. The "who owns the bottom" law: the bass lane
 * is off, so the low strings are the guitar's (as the bossa thumb takes them). With a bass in
 * the band, the pick leaves them alone.
 */
const countryGuitar: PitchedIdiom = {
    // I6: spread the inner idiom rather than rebuilding `{name, init, play}` by hand, so a
    // flag `boomChick` carries (`percussive`, or one added later) survives the wrapper.
    ...boomChick,
    play(ctx, memory) {
        const out = boomChick.play(ctx, memory);
        const { bar, plan } = ctx;
        // The last chord ends on the stinger (#2177), with a bassist or without: over the
        // whole chord the hand holds, the picked bass note under it too.
        const stung = (events: PitchedNote[]) => (plan.ending ? sting(ctx, events) : events);
        if (plan.lanes.bass) {
            return { ...out, events: stung(out.events) };
        }
        // Where a bass note may sit: the 6th and 5th strings in first position (E2–Eb3).
        const LO = 40;
        const HI = 51;
        // Ticks the walk-up (below) claims for the pick: the strum's own hit there is dropped,
        // since a hand can't strum and pick a bass run in the same instant.
        const walkTicks = new Set<number>();
        const booms: PitchedNote[] = [];
        const pick = (tick: number, midi: number, dur: number, velocity: number) =>
            booms.push({
                lane: 'comp',
                tick,
                dur,
                midi,
                velocity: dyn(velocity, plan.energy),
                offsetMs: 0,
                bar: bar.index,
            });
        if (plan.ending) {
            // Each strike of the ending (`endingStrikes`: `G7 C`'s both, the gesture's own
            // re-strikes) gets its chord's root under it, when the hand can hold both, as long
            // and as hard as the strum it is picked with.
            for (const { span, from, to } of endingStrikes(ctx)) {
                const chord = span.chord!;
                const tick = at(bar, from);
                const strum = out.events.filter((e) => e.tick === tick);
                const grip = strum.map((e) => e.midi);
                if (!grip.length) {
                    continue;
                }
                const root = nearestMidi(chord.bass, 45, LO, HI);
                if (
                    !grip.includes(root) &&
                    root < Math.min(...grip) &&
                    isPlayable([root, ...grip])
                ) {
                    booms.push({
                        lane: 'comp',
                        tick,
                        dur: (to - from) * STEP,
                        midi: root,
                        velocity: Math.max(...strum.map((e) => e.velocity)),
                        offsetMs: 0,
                        bar: bar.index,
                    });
                }
            }
        } else {
            const { boom } = beatsOf(ctx);
            const tier = energyTier(plan.energy);
            const common = isCommonTime(bar);
            const next = nextChord(ctx);
            const spans = spanSteps(bar);
            const strikes = [...new Set(out.events.map((e) => e.tick))];
            let last: number | null = null;
            spans.forEach(({ span, from, to }, i) => {
                const chord = span.chord;
                if (!chord || span.fermata) {
                    return;
                }
                const steps = boom.filter((s) => s >= from && s < to);
                if (!steps.includes(from)) {
                    steps.unshift(from);
                }
                steps.sort((a, b) => a - b);
                // The chord's bass where it arrives, its fifth on the next boom: C then
                // the G on the 6th string, G then the open D.
                type Note = { step: number; midi: number; velocity: number };
                const notes: Note[] = steps.map((step, k) => ({
                    step,
                    midi:
                        k === 0
                            ? nearestMidi(chord.bass, last ?? 45, LO, HI)
                            : nearestMidi(fifthPc(chord), last ?? 45, LO, HI),
                    velocity: k === 0 ? 88 : 80,
                }));

                // I3: the walk-up ("G-A-B → C") is the bass-strum guitar's most recognisable
                // gesture. With the bass lane off, the pick's low strings are the only voice
                // left to play it, so it reuses `walk()` straight (B4's corrected scoring),
                // gated exactly like `countryBass`: 4/4, above the ballad, a span with room
                // for beats 3 and 4, and a change struck on arrival with a different bass note.
                const following =
                    spans[i + 1]?.span.chord ?? (i === spans.length - 1 ? next : null);
                const followingAttacks =
                    spans[i + 1]?.span.attack ?? ctx.next?.bar.spans[0]?.attack ?? false;
                if (
                    tier !== 'low' &&
                    common &&
                    from <= 4 &&
                    to - from >= 12 &&
                    following &&
                    followingAttacks &&
                    following.bass !== chord.bass
                ) {
                    const root = notes[0].midi;
                    const target = nearestMidi(following.bass, root, LO, HI);
                    const run = walk(root, target, chord);
                    const chance = tier === 'high' ? 0.65 : 0.45;
                    if (run && ctx.rng(`guitarWalk${i}`).chance(chance)) {
                        notes.splice(
                            notes.filter((n) => n.step < to - 8).length,
                            notes.length,
                            { step: to - 8, midi: run[0], velocity: 92 },
                            { step: to - 4, midi: run[1], velocity: 98 },
                        );
                        walkTicks.add(at(bar, to - 8));
                        walkTicks.add(at(bar, to - 4));
                    }
                }

                notes.forEach(({ step, midi, velocity }, k) => {
                    const tick = at(bar, step);
                    // The pick is busy strumming here (a chord's forced arrival strike) —
                    // unless it's the walk's own landing, which silences that strum instead.
                    if (strikes.includes(tick) && !walkTicks.has(tick)) {
                        return;
                    }
                    // It rings until the next bass note or the chord's end.
                    const until = notes[k + 1]?.step ?? to;
                    pick(tick, midi, (until - step) * STEP * 0.95, velocity);
                    last = midi;
                });
            });
        }
        // The walk (above) silences the strum's own hit where it lands: the chick makes way
        // for the bass run rather than sounding under it.
        const strummed = out.events.filter((e) => !walkTicks.has(e.tick));
        // A plucked string restarts: whichever of a grip note and a bass note of the same
        // pitch comes first stops where the other begins.
        const all = [...strummed, ...booms].sort((a, b) => a.tick - b.tick);
        const events = all.map((e) => {
            const cut = all.find(
                (o) => o !== e && o.midi === e.midi && o.tick > e.tick && o.tick < e.tick + e.dur,
            );
            return cut ? { ...e, dur: cut.tick - e.tick } : e;
        });
        return { events: stung(events), memory: out.memory };
    },
};

// ================================================================ lead
// A Telecaster picker: chicken-pickin'. The key's major pentatonic bent to each chord, with
// the b3 curling up into the major 3rd — a chromatic approach into it, or a bend from the half
// step below on most landings: the country sound. The 4th is bent up a whole step into the 5th
// and the b7 into the root, as a pedal steel would glide. Clipped, staccato sixteenths snapped
// between longer notes (the cluck is the space after a note), a lick played again to drive it
// home, and double-time sixteenth runs at the peak. The head is a plain country tune, a song
// form's period.
const countryLead = leadIdiom({
    name: 'country lead',
    cells: {
        // Chorus one: short calls, a snapped pair and a held, bent note.
        sparse: ['x-x-x-------....', '..x-x-x-------..', 'x---x-x---------', 'x.x.x---x-------'],
        // Chicken-pickin': staccato notes (`x.`) clucked between the held ones.
        mid: [
            'x.x.x.x.x---x---',
            'x-x.x.x-x-------',
            '..x.x.x.x-x-x---',
            'x.x.x-x.x-------',
            'x---x.x.x.x-----',
        ],
        // Double time: sixteenth runs broken by clucked staccato notes, then a landing.
        busy: ['xxxxx.x.x.x-x---', 'x.xxxxx.x.x-----', 'x.x.xxxxx.x.x---', 'xxxx.x.xxxx.x---'],
    },
    endings: [
        'x---------------',
        'x-x-x-----------',
        '..x-x-x---------',
        'x.x.x-----------',
        'x---x-----------',
    ],
    head: {
        // A country melody: quarters and eighths with a pickup, a held note at the end of the
        // line.
        cells: [
            'x---x---x-x-x---',
            'x-x-x---x-------',
            '..x-x-x-x-------',
            'x---x-x-x---x---',
            'x-----x-x-------',
        ],
        endings: ['x---------------', 'x-------x-------'],
        form: 'period',
        // A known standard's guide-tone head in country (#2122): the guide tones sung as a
        // honky-tonk vocal phrases ("Your Cheatin' Heart", "Hey, Good Lookin'") — two-beat
        // figures in halves and quarters over the boom-chick, a pickup on 4 into the next
        // bar, and one held arrival a phrase. Every cell strikes on beat 3, where a two-chord
        // bar's second chord lands.
        guide: {
            cells: [
                // why: half, quarter on 3, pickup quarter on 4: the two-beat line, the singer's
                // "and" into the next bar's downbeat.
                'x-------x---x---',
                // why: four quarters, the last the pickup on 4: the boom-chick two-beat sung
                // straight, Hank's line (an eighth pair walking into 3 is rock's, not this).
                'x---x---x---x---',
                // why: in on 2 after the band's downbeat, then 3 and the pickup on 4: a
                // honky-tonk line that starts off the boom.
                '....x---x---x---',
                // why: half, then 3 and two eighths on 4 and its "and", the last tied over the
                // barline: the pickup run into the next line's downbeat.
                'x-------x---x-x-',
                // why: two eighths and a quarter on 2, then the half on 3: the lyric's quick
                // pair ("hey, good") into its long syllable.
                'x-x-x---x-------',
            ],
            // A turn moves on, a half note at most, and never strikes beat 4: a bridge hands
            // back to the last A on a turn, and a note struck on 4 there would leave the phrase
            // an eighth's breath, not the beat a singer takes (the pickups on 4 are the cells').
            turns: [
                // why: two halves, the boom and the chick's two-beat.
                'x-------x-------',
                // why: quarter, quarter, half: walking on.
                'x---x---x-------',
                // why: a quarter and two eighths walking up into the half on 3: the walk-up
                // a picker fills a turn with.
                'x---x-x-x-------',
            ],
            // The held arrival, struck on the one: a country tune lands on the beat, never the
            // swing singer's late landing.
            endings: [
                // why: a dotted half that breathes a beat.
                'x-----------....',
                // why: the bar less an eighth, the long held vowel at a line's end.
                'x-------------..',
            ],
            close: 'x-------------..',
        },
    },
    // The blue third is not in the pool: a country b3 always curls up into the 3rd (the
    // approach and the bend below), and a b3 held against the chord's 3rd is a rub, not a lick.
    pool: (chord, key) => songPentatonic(chord, key),
    // The 3rd first (bent into from the blue third), then the root; a written 7th before the
    // 5th.
    arrive: (chord) => bluesTargets(chord),
    settle: (chord) => restingTones(chord),
    // The half step below a landing a quarter of the time — b3 curling into the 3rd, #4 into
    // the 5th, the Nashville chromatic walk — between rock's 0.1 and bebop's 0.45.
    chromatic: 0.25,
    // An enclosure is a jazz device: a picker all but never plays one.
    enclosure: 0.05,
    // A lick repeated to drive it home, as often as a blues player (0.35).
    riff: 0.35,
    // A picker keeps the licks coming: jazz and rock's 0.25, under the blues' 0.3.
    space: 0.25,
    // The curl into the major 3rd on most of its landings, the country guitar's signature;
    // a whole-step pedal-steel bend into the root or the 5th on under half of theirs.
    bends: { blue: 0.6, root: 0.4 },
    // A horn's device; a guitar bends instead.
    scoop: 0,
    // A country bend holds steady like a steel; vibrato only on a half note or longer.
    vibrato: 8,
});

export const country: Style = {
    id: 'country',
    name: 'Country',
    // Straight eighths. Any lilt read as a shuffle that isn't one: 55 was stilted, 30
    // still off, and straight was the one that sounded right by ear (#1421).
    // The boom sits right on the kick; the piano's chick a hair behind the snare, the
    // guitar's right with it (the old engine called country "rock solid" — little humanize).
    feel: {
        swing: 0,
        swingGrid: 8,
        // The picker sits right on the kick with the bass: chicken-pickin' is crisp, on top.
        lean: { bass: 0, comp: 3, lead: 0 },
        compLean: { guitar: 0 },
        humanize: 25,
    },
    drums: countryDrums,
    bass: countryBass,
    comp: { keyboard: countryKeys, guitar: countryGuitar },
    // Piano. The boom-chick guitar is the genre's other sound, but its instrument is a
    // steel-string acoustic, which we have no pack for: on the nylon the chick goes soft and
    // classical (it reads as bossa or folk), and on the picked electric it reads as
    // rockabilly. Honky-tonk piano answering the snare on 2 and 4 is unambiguously country,
    // and the grand is what the old engine settled on by ear (`genre-sound-map.ts`).
    // Revisit when a steel-string pack exists.
    prefers: 'piano',
    // The clean electric: a Telecaster's snap is the country lead, and it bends. (It reads as
    // rockabilly *comping*, above; as the lead it is exactly right.)
    lead: { idiom: countryLead, prefers: 'guitar' },
    // why: country ends on the plain I triad (the piano adds its own 6th to a I,
    // `withSixths`), or i in a minor key.
    ending: { major: '', minor: 'm' },
    // why: the country band picks up into its last chord (the snare pickup, the set-up fill)
    // and lets it ring, the steel and the guitar hanging over the crash.
    endingGesture: { kind: 'hold', setup: true },
};
