// cspell:disable — pattern lines (x/o/g/X/-/.) are not words.
/**
 * Hip Hop: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * Boom-bap is loop music: a producer chops a two-bar beat and a sample and lets them run.
 * So nearly every choice here is the *section's* (or the whole tune's), and a bar changes
 * only where the form tells it to — the second bar of the two-bar loop answers the first,
 * energy thins or thickens the hats, and the beat drops out at the end of a section.
 * Nothing re-rolls bar to bar.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import { bassNote, bassPc, kickSteps, type LineMemory, nextChord } from '../players/bass/line.js';
import { compIdiom, type Hit, pendulum, strums } from '../players/comp/idiom.js';
import { type DrumBook, drumIdiom, fillStart, type Lines } from '../players/drums/kit.js';
import { barSteps, dyn, isCommonTime, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import {
    bluesColour,
    chordScale,
    guideTones,
    pentatonicPool,
    restingTones,
} from '../players/lead/palette.js';
import { type ChordFacts, fifthOf } from '../theory/chord.js';
import { nearestMidi } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ the loop's shape
/** Whether this bar is the second of the two-bar loop: the bar that answers. */
const answerBar = (ctx: BarContext) => ctx.bar.barInVisit % 2 === 1;

const TIER_RANK: Record<EnergyTier, number> = { low: 0, mid: 1, high: 2 };

/**
 * How many sixteenths the drummer's fill takes, per fill kind and tier. A loop doesn't fill
 * inside a quiet section; the drop at a section's end is a beat, or half a bar when the band
 * is loud. The bass reads the same table (`fillFrom`) so it drops out with the beat.
 */
const FILL_LENGTH: Record<'phrase' | 'section', Record<EnergyTier, number>> = {
    phrase: { low: 0, mid: 4, high: 4 },
    section: { low: 4, mid: 4, high: 8 },
};

/**
 * The step where this bar's fill begins, or null: shares the kit's own arithmetic
 * (`fillStart`) so the bass agrees with the drums on where the beat drops out, instead of
 * carrying a second copy of it. With no drummer in the band there is no beat to drop out of
 * — the sub keeps playing through what would have been the fill.
 */
function fillFrom(ctx: BarContext): number | null {
    return ctx.plan.lanes.drums ? fillStart(ctx, boomBapBook) : null;
}

/**
 * The band is building into a louder section: the next bar sits in a higher energy tier.
 * That is the one place hip hop plays into a section instead of cutting out before it.
 */
function building(ctx: BarContext): boolean {
    const next = ctx.next?.plan;
    return (
        !!next &&
        TIER_RANK[energyTier(next.energy)] > TIER_RANK[energyTier(ctx.plan.energy)] &&
        ctx.next?.bar.barInVisit === 0
    );
}

// ================================================================ drums
/**
 * Kick loops, one per song, as the loop's two bars: the first states it, the second
 * answers with one kick moved or added (a pickup into the top of the loop, a doubled
 * "and"). A producer chops one beat for the whole record — a boom-bap track doesn't swap
 * its kick pattern section to section the way its hats and ghosts thin and thicken with
 * energy. Every loop owns the One and keeps off the backbeat, where the snare cracks; what
 * makes it boom-bap is the kick *between* the beats — the "and" of 3 in every one of them,
 * the "and" or "a" of 2 in most.
 */
const KICK_LOOPS: readonly [a: string, b: string][] = [
    // 1 and the "and" of 3; the answer picks up on the last sixteenth into the One.
    ['X.........x.....', 'X.........x....x'],
    // 1, the "and" of 2, the "and" of 3; the answer lands on 3 instead of its "and".
    ['X.....x...x.....', 'X.....x.x.......'],
    // 1, the lazy "a" of 2, the "and" of 3; the answer adds the "and" of 4.
    ['X......x..x.....', 'X......x..x...x.'],
    // 1 doubled on its "and", then the "and" of 3; the answer kicks the "e" of 4, right
    // behind the snare (bap-boom).
    ['X.x.......x.....', 'X.x.......x..x..'],
];

/**
 * Ghost snares for the loud sections: one or two soft hits on the swung sixteenths around
 * beat 3 or leading into the next One — the chatter of a sampled break, never on the backbeat.
 */
const GHOSTS = ['.......g........', '.......g.g......', '..........g....g'];

/**
 * The hat line, per tier. Low energy plays soft eighths — or no hats at all where the form
 * strips the beat (the song's opening section or a labelled intro/break at low energy: the
 * beat before the hats come in). Mid is the section's choice between eighths and accented
 * sixteenths; high is always the sixteenths. The sixteenths carry three levels — the beat,
 * then the "and", then the "e" and "a" softest — so the style's swing, which bends only the
 * odd sixteenths, lopes the quiet ones late: the lazy "Dilla" hat.
 */
const HATS = {
    eighths: 'x.o.x.o.x.o.x.o.',
    sixteenths: 'xgogxgogxgogxgog',
    quiet: 'o.g.o.g.o.g.o.g.',
} as const;

function stripped(ctx: BarContext): boolean {
    const { visit } = ctx.bar;
    return visit.ordinal === 0 || /^(intro|break)/i.test(visit.label.trim());
}

/** Snare roll over `steps`: eighths, then sixteenths, crescendo into the next One. */
function snareRoll(steps: number): string {
    return Array.from({ length: steps }, (_, i) => {
        if (i === steps - 1) {
            return 'X';
        }
        const late = i >= steps / 2;
        return late ? 'x' : i % 2 === 0 ? 'o' : '.';
    }).join('');
}

// A named book (not an inline literal): `fillFrom` above needs to share its `fillLength`
// with the kit's own `fillStart`, and can only do that against a real reference.
const boomBapBook: DrumBook = {
    name: 'boom-bap',
    timekeeper: ['hat', 'hatOpen'],
    fillLength: FILL_LENGTH,
    groove(ctx, tier) {
        // why: 'song' scope — the record's one beat, not a per-section re-roll. Hats and
        // ghosts (below) stay per-section: the layers that thin and thicken with energy.
        const loop = ctx.rng('kick', 'song').pick(KICK_LOOPS);
        // The core loop is the same at every energy; only a quiet band plays it as a one-bar
        // loop (no answer), because the answer is a gesture and a quiet band makes none.
        const kick = tier !== 'low' && answerBar(ctx) ? loop[1] : loop[0];
        // Hip hop's snare is hard on 2 and 4 at any energy (a quiet band just hits softer).
        const back = tier === 'low' ? '....x.......x...' : '....X.......X...';
        const ghosts = tier === 'high' ? ctx.rng('ghost', 'section').pick(GHOSTS) : '';
        const snare = [...back].map((c, i) => (c !== '.' ? c : (ghosts[i] ?? '.'))).join('');
        if (tier === 'low') {
            return stripped(ctx) ? { kick, snare } : { hat: HATS.quiet, kick, snare };
        }
        const hat =
            tier === 'high' || ctx.rng('hats', 'section').chance(0.5)
                ? HATS.sixteenths
                : HATS.eighths;
        // The loud answer bar opens the hat on the "and" of 4: the half-open "tss" that
        // turns the loop round. One hand, one cymbal: the closed hat leaves that step.
        if (tier === 'high' && answerBar(ctx)) {
            return {
                hat: `${hat.slice(0, 14)}.${hat.slice(15)}`,
                hatOpen: '..............o.',
                kick,
                snare,
            };
        }
        return { hat, kick, snare };
    },
    cells(ctx, tier) {
        // Other meters: kick on the downbeat pulse (and its "and" on a strong pulse), the
        // snare on the backbeat pulses, the same hats as 4/4 (none where the beat is stripped).
        const hat = tier === 'low' ? (stripped(ctx) ? '' : 'o.g.') : 'x.o.';
        const withHat = (lines: Lines): Lines => (hat ? { ...lines, hat } : lines);
        return {
            down: withHat({ kick: 'X...' }),
            back: withHat({ snare: tier === 'low' ? 'x...' : 'X...' }),
            strong: withHat({ kick: 'x.x.' }),
        };
    },
    /**
     * Hip hop fills are drops, not tom runs: the beat cuts out — kick, snare and hats — and
     * slams back in on the One (with the crash, at a new section). Only into a louder section does the drummer
     * play *into* it instead, with a snare roll and the kick dropped under it.
     */
    fill(ctx, steps) {
        const silence = '.'.repeat(steps);
        return building(ctx)
            ? { snare: snareRoll(steps), kick: silence }
            : { kick: silence, snare: silence };
    },
};
const boomBap = drumIdiom(boomBapBook);

// ================================================================ bass
/**
 * The sub's register: the lowest octave, one fixed window for the whole tune (a producer
 * sets the 808's octave once). So a chord's root is always the same note — the line loops
 * with the beat — and an approach aims at exactly the note the next bar will play.
 */
function subRoot(ctx: BarContext, pc: number): number {
    const lo = 28 + ctx.rng('register', 'song').int(4);
    return nearestMidi(pc, lo, lo, lo + 11);
}

/**
 * The tone the answer bar's last kick takes, the section's choice: most sections stay on
 * the root (the sub is a pedal under the kick); some drop to the fifth below, a few jump the
 * octave — the two moves an 808 line makes inside one chord.
 */
type Answer = 'root' | 'fifth' | 'octave';
const ANSWERS: readonly [Answer, number][] = [
    ['root', 3],
    ['fifth', 2],
    ['octave', 1],
];

function answerPitch(answer: Answer, root: number, chord: ChordFacts): number {
    // Over a slash chord the written bass note is the point: the line stays on it.
    if (answer === 'root' || chord.bass !== chord.root) {
        return root;
    }
    if (answer === 'octave') {
        return root + 12;
    }
    // The chord's own 5th (never an invented natural one: an altered chord's b13 sits
    // there), under the root while it stays on a four-string's low E, else above it.
    const fifth = fifthOf(chord);
    const below = root - (12 - fifth);
    return below >= 28 ? below : root + fifth;
}

/** Where the bassist hears the kick when no drummer plays: 1 and the "and" of 3. */
const KICK_FALLBACK = [0, 10];

/**
 * The sub bass: long notes struck with the kick, mostly the root, held until the next kick.
 * It reads what the drummer played (`heard.drums`), so it follows the section's kick loop,
 * its answer bar, and its drops — the band's low end is one instrument split in two. A chord
 * that changes where no kick plays is still stated where it changes. Low energy plays only
 * the One and the changes and holds them. Mid and high follow every kick; the answer bar's
 * last kick may leave the root, and into a barline change the answer bar slides.
 */
const subBass: PitchedIdiom = {
    name: 'sub bass',
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
                    bassNote(bar, 0, subRoot(ctx, bassPc(chord)), 16, dyn(110, plan.energy)),
                );
                last = subRoot(ctx, bassPc(chord));
            }
            return { events, memory: { last } };
        }
        const total = barSteps(bar);
        // The beat drops out at the end of a section (or a phrase): the bass drops with it.
        const cut = fillFrom(ctx) ?? total;
        const heard = plan.lanes.drums ? kickSteps(ctx) : new Set(KICK_FALLBACK);
        const kicks = [...heard].filter((s) => s < cut).sort((a, b) => a - b);
        const answer = ctx.rng('answer', 'section').weighted(ANSWERS);
        const next = nextChord(ctx);
        const nextAttack = ctx.next?.bar.spans[0]?.attack ?? false;
        const spans = spanSteps(bar);
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord || from >= cut) {
                return;
            }
            const end = Math.min(to, cut);
            const root = subRoot(ctx, bassPc(chord));
            const onsets = new Set<number>();
            if (tier === 'low') {
                // The quiet sub holds: the One (with the kick) and the chord's arrival only.
                if (from === 0 && kicks.includes(0)) {
                    onsets.add(0);
                }
            } else {
                for (const k of kicks) {
                    if (k >= from && k < end) {
                        onsets.add(k);
                    }
                }
            }
            if (span.attack) {
                onsets.add(from);
            }
            const steps = [...onsets].sort((a, b) => a - b);
            const notes = steps.map((step) => ({
                step,
                midi: root,
                velocity: step === 0 ? 112 : 102,
            }));
            if (tier !== 'low' && answerBar(ctx)) {
                // The answer: the bar's last kick, when it isn't the chord's own arrival.
                const tail = notes[notes.length - 1];
                if (tail && tail.step !== from) {
                    tail.midi = answerPitch(answer, root, chord);
                    tail.velocity = 98;
                }
                // The slide into a barline change: without a pitch bend in the event stream,
                // the 808's glide is played as its grace — the last sixteenth, a half step
                // off the next root on the side the line comes from, so it resolves by step
                // in pitch, into exactly the note the next bar plays (`subRoot`). A line
                // already a half step away resolves by itself: no grace to add. And a glide
                // spans at most a minor 3rd (the grace itself leaps at most a whole tone
                // in): wider than that, the grace note reads as its own leap, not the tail
                // of one glide, so an 808 jumps straight to the next root instead.
                const lastSpan = i === spans.length - 1 && end === total;
                if (lastSpan && next && nextAttack && next.bass !== chord.bass) {
                    const target = subRoot(ctx, bassPc(next));
                    const at = total - 1;
                    const kept = notes.filter((n) => n.step < at);
                    const held = kept[kept.length - 1]?.midi ?? root;
                    const slide = target - Math.sign(target - held);
                    if (slide !== held && Math.abs(target - held) <= 3) {
                        notes.splice(0, notes.length, ...kept, {
                            step: at,
                            midi: slide,
                            velocity: 92,
                        });
                    }
                }
            }
            notes.forEach((n, k) => {
                // Long: the sub rings until the next note (or the change, or the drop).
                const until = notes[k + 1]?.step ?? end;
                events.push(
                    bassNote(
                        bar,
                        n.step,
                        n.midi,
                        (until - n.step) * 0.95,
                        dyn(n.velocity, plan.energy),
                    ),
                );
                last = n.midi;
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * The Rhodes loop: a sampled jazz chord, chopped. Each figure is [step, length] strikes in a
 * 4/4 bar, one for the whole song — a producer chops one sample and lets it run for the
 * record, the same way the kick loop above does — so the sample repeats bar after bar. They
 * are held or lightly syncopated — never a pulse on every beat:
 * - held: the One, rung through the bar (the sustained sample chord);
 * - float: the One held through beat 3, re-struck with the kick on the "and" of 3;
 * - push: the One, then the "and" of 2 held (the chord leaned into early);
 * - lazy: the chord lands late on the "and" of 1, answered on the "and" of 3;
 * - chop: the old engine's stabs — the "a" of 1 and the "and" of 3, short.
 */
const KEYS_FIGURES: readonly [[number, number][], number][] = [
    [[[0, 14]], 2],
    [
        [
            [0, 10],
            [10, 6],
        ],
        3,
    ],
    [
        [
            [0, 6],
            [6, 10],
        ],
        3,
    ],
    [
        [
            [2, 8],
            [10, 6],
        ],
        2,
    ],
    [
        [
            [3, 3],
            [10, 3],
        ],
        1,
    ],
];

/** Velocity by tier: a louder section plays the same loop harder, never softer. */
const KEYS_VELOCITY: Record<EnergyTier, number> = { low: 70, mid: 80, high: 88 };

const rhodesLoop = compIdiom({
    name: 'rhodes loop',
    // Rootless: 3rd and 7th with the 9th and 13th (or the 5th) — the sampled-jazz colour,
    // and the root left to the sub. A plain triad gets its 9th (R-3-5-9).
    kind: 'rootless',
    // The "and" of 4, when the loop plays it, always ties the next chord over the barline:
    // a chopped loop pushes into the change the same way every time round, never by chance.
    push: { low: 1, mid: 1, high: 1 },
    rhythm(ctx, { from, to }, tier) {
        const base = KEYS_VELOCITY[tier];
        if (!isCommonTime(ctx.bar)) {
            // Other meters: the chord held from its arrival.
            return [{ step: from, length: to - from, velocity: base }];
        }
        // why: 'song' scope, matching the kick loop — one chopped figure for the whole
        // record. Tier still thins it (low) or extends it (high); the shape itself doesn't
        // change section to section.
        const figure = ctx.rng('figure', 'song').weighted(KEYS_FIGURES);
        // Low energy: the sample's first chord alone, held. High adds the "and" of 4, the
        // push into the next bar, where the figure doesn't already reach it.
        const strikes =
            tier === 'low'
                ? [[figure[0][0], 16] as [number, number]]
                : tier === 'high' && figure.every(([s]) => s < 14)
                  ? [...figure, [14, 2] as [number, number]]
                  : figure;
        const hits: Hit[] = [];
        for (const [step, length] of strikes) {
            if (step >= from && step < to) {
                // A syncopated strike leans a touch harder than one on the beat.
                hits.push({ step, length, velocity: base + (step % 4 === 0 ? 0 : 4) });
            }
        }
        return hits;
    },
});

// ---------------------------------------------------------------- guitar
/**
 * Hip hop rarely strums. The guitar plays a damped jazz chord hit, twice a bar, in the
 * section's figure — answers after the snare, or the boom-bap lean on the "a" of 1 and the
 * "and" of 3 — on a sixteenth-note hand (the swing bends the sixteenths).
 */
const GUITAR_FIGURES = ['......x.......x.', '...x......x.....', '..x.......x.....'];

const cleanGuitar = compIdiom({
    name: 'hip hop guitar',
    // The three-note 3-7-9 grip on the top strings: a jazz chord hit, not a strum. No open
    // strings: the hit is damped by releasing the fretting hand, and an open string rings on.
    kind: 'stab',
    // why: top 71 (was 67) — at 67 the voice-led grip settled with its lowest note under 60
    // a third of the time (down to 55, three semitones above the sub's own ceiling): too
    // close to "far above the sub" to read as a separate register. 71 pulls the hand up the
    // neck; the lowest note clears 60 in over 90% of grips (measured across the claims
    // fixtures), with the same reach and the same fretboard search otherwise.
    grip: { strings: 3, slot: { lo: 55, hi: 79, top: 71, pull: 0.8 }, open: false },
    // A damped hit stays inside its bar: tied over the barline, it would ring.
    push: { low: 0, mid: 0, high: 0 },
    rhythm(ctx, { from, to }, tier) {
        if (!isCommonTime(ctx.bar)) {
            return [{ step: from, length: 1.5, velocity: 84, stroke: 'down' }];
        }
        const line = ctx.rng('figure', 'section').pick(GUITAR_FIGURES);
        // The pendulum on the sixteenth grid decides each stroke; the hit is damped at once.
        let hits = strums(line, from, to, 1, 1.5);
        if (tier === 'low') {
            // Quiet: only the figure's second hit, one answer a bar.
            const answer = line.lastIndexOf('x');
            hits = hits.filter((h) => h.step === answer);
        } else if (tier === 'high') {
            // Loud: a muted scratch on the sixteenth before each hit — the "chk" of "chk-chang".
            const scratches: Hit[] = hits
                .filter((h) => h.step - 1 >= from)
                .map((h) => ({
                    step: h.step - 1,
                    length: 0.5,
                    velocity: 44,
                    stroke: pendulum(h.step - 1, 1),
                    muted: true,
                }));
            hits = [...hits, ...scratches].sort((a, b) => a.step - b.step);
        }
        return hits;
    },
});

// ================================================================ lead
// A sampled hook, not a soloist: the one- or two-bar lick a producer lifts off a soul or jazz
// record and loops (a clean guitar phrase, a horn line), with a lot of air around it. So the
// "solo" is the hook developing: a figure played again bar after bar more often than not,
// moved only where the chord moves, with a new idea now and then and whole bars left to the
// beat. It moves through the minor pentatonic in a minor key (the dark, dusty loop), the
// chord's own scale with the blue third in a major one (the soul record it came from), lands on
// the Rhodes' 3rds and 7ths, and sits back behind the beat with the Rhodes, inside the loop.
const hipHopLead = leadIdiom({
    name: 'hip hop lead',
    cells: {
        // A short lick and room: two to four plucked notes, then the beat alone.
        sparse: ['x-x-x---........', '......x-x-x-....', 'x---..x-x---....', '..x.x---x---....'],
        // The hook proper: a figure with a sixteenth snap in it and a rest before the bar ends.
        mid: ['x-x.x-x---......', '..x-x-x.x---....', 'x.x-..x-x-x-....', '....x-x-x.x-x-..'],
        // Busier, still a loop, never a run: one sixteenth snap (the swing lopes it) and air
        // before the bar ends.
        busy: ['..x.x-x-..x-x-..', 'x-x-x.x-x-..x-..', 'x.x-x-..x.x-x-..', '..x-x-x-x.x-x-..'],
    },
    // A lick ends on a note let ring for a beat or two; the beat carries the rest of the bar.
    endings: ['x-------........', 'x-x-x-----......', '..x-x-----......', 'x---x-------....'],
    head: {
        cells: ['x-x-x---..x-x-..', '..x-x-x---......', 'x.x-x---x---....', '....x-x-x-x---..'],
        endings: ['x-------........', 'x-x-x-------....'],
        // The hook, the hook again, a turn — each with a bar of beat after it. An 8-bar
        // section plays its four-bar hook twice, note for note: the loop.
        form: 'aab',
    },
    // Minor: the minor pentatonic with the chord's tones (the dusty loop). Major: the chord's
    // scale, and the blue third over the I and IV (a soul record's colour).
    pool: (chord, key) =>
        key.minor
            ? pentatonicPool(chord, key)
            : [...new Set([...chordScale(chord), ...bluesColour(chord, key)])],
    // The Rhodes plays 7ths and 9ths; the hook lands on the notes that name them, 3rd and 7th.
    arrive: (chord) => guideTones(chord),
    // A lick rests on a chord's 3rd, root or 5th, the note a loop can turn around on.
    settle: (chord) => restingTones(chord),
    // A half step into a note now and then (0.1): a jazz record's inflection, not a bebop line.
    chromatic: 0.1,
    // No enclosures: a hook is plain enough to hum.
    enclosure: 0,
    // A loop repeats (0.7): most bars play the bar before them again, adapted to the chord —
    // the hook developing slowly, the way a producer lets a sample run.
    riff: 0.7,
    // The sample sits over the Rhodes, a minor 3rd up.
    register: 3,
    // A sampled hook comes round: half the solo phrases play the last one again, whole.
    loop: 0.5,
    // A hook doesn't climb to the top of the guitar: the peak stays within a 6th of home.
    peak: 9,
    // The hook's room lives inside the bar (the cells' rests and the note let ring), so a
    // roomier phrase shape is taken only now and then (0.3): an emptier shape has fewer bars
    // in a row for the loop to come round in.
    space: 0.3,
    // A soul guitarist's small bends: into the 3rd from the blue third now and then (0.25), the
    // rock player's whole-step bend into the root rarely (0.1).
    bends: { blue: 0.25, root: 0.1 },
    // A guitar bends rather than scoops.
    scoop: 0,
    // Clean and sparing: only a note held a half note or longer gets the shake.
    vibrato: 8,
});

export const hiphop: Style = {
    id: 'hiphop',
    name: 'Hip Hop',
    // Swung sixteenths at 25 (the offbeat sixteenth at ~54% of its pair): the MPC's classic
    // boom-bap swing, and the old engine's Hip Hop value — which the app still sets as the
    // genre's swing, so the default and what plays agree. The drums are the programmed
    // clock and never lean; the lazy head-nod is the rest of the band laying back against
    // them. The old engine leaned the whole band 12 ms behind, which the timing law forbids
    // (a shift applied to everyone is latency). So the Rhodes carries that 12 ms alone —
    // the chopped sample sitting behind the beat is the "Dilla" drag — while the sub leans
    // only 4 ms: under ~10 ms it fuses with the kick into one fatter hit instead of flamming
    // against it. Humanize is low: a programmed beat, whose per-position character still
    // repeats every bar, so its small push and drag loop with the beat.
    // The hook is part of the chopped sample, so it drags with the Rhodes, 12 ms behind.
    feel: { swing: 25, swingGrid: 16, lean: { bass: 4, comp: 12, lead: 12 }, humanize: 20 },
    drums: boomBap,
    bass: subBass,
    comp: { keyboard: rhodesLoop, guitar: cleanGuitar },
    // Rhodes, as the old mapping had it: the tine piano is the sound of the sampled jazz
    // records boom-bap is built from (Ayers, Ramsey Lewis, the Tribe/Dilla loops), and its
    // bell-like attack with a soft sustain is exactly what the held-and-chopped loop above
    // needs. A piano's hammer reads as a live player, an organ holds and drops the chop, and
    // a guitar here is the rare exception, not the genre's voice.
    prefers: 'rhodes',
    // Clean guitar: a soul-record guitar lick is the classic sampled hook, and over the Rhodes
    // its plucked attack sits apart from the tines (a sax would blur into them), with a small
    // bend to sound played rather than programmed.
    lead: { idiom: hipHopLead, prefers: 'guitar' },
};
