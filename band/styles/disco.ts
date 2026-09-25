// cspell:disable — pattern lines (x/o/g/X/R/O/-/.) are not words.
/**
 * Disco: its feel, and its drums, bass and comp (keyboard and guitar) idioms. The
 * shared machinery lives in `players/`; this file is only what makes it this genre.
 *
 * Disco is a machine for the dance floor: four on the floor that never lets up, the open hat
 * barking on every "and", a bass pumping octaves on the eighths, and a guitar hand that never
 * stops chucking sixteenths. Energy changes how hard the band digs in (density and dynamics),
 * never the pulse.
 */
import { type EnergyTier, energyTier } from '../arrange/plan.js';
import type { PitchedNote } from '../core/types.js';
import { BASS, bassNote, type LineMemory, nextChord } from '../players/bass/line.js';
import { compIdiom, type Hit, strums } from '../players/comp/idiom.js';
import { drumIdiom, type Lines, tomRun } from '../players/drums/kit.js';
import { barSteps, dyn, isCommonTime, type Pulse, pulses, spanSteps } from '../players/grid.js';
import { leadIdiom } from '../players/lead/idiom.js';
import { chordPentatonic, guideTones, restingTones } from '../players/lead/palette.js';
import { mod12 } from '../theory/pitch.js';
import type { BarContext, PitchedIdiom, Style } from './types.js';

// ================================================================ drums
/**
 * Closed-hat parts under the open "tss" on the "and"s (step 2 of every beat is left to the
 * open hat, one hand, one cymbal):
 * - skeleton: a closed chick on each beat and nothing else — the canonical disco frame (the
 *   old engine's foundation motif). The shaker supplies the sixteenths it leaves out.
 * - sixteenths: the beat, its "e" and its "a" closed and light; the "a" closes the open hat
 *   again, so each bark is a short "ts-TSS-t" rather than a wash.
 */
const HATS = {
    skeleton: 'x...x...x...x...',
    sixteenths: 'xo.oxo.oxo.oxo.o',
} as const;

const discoDrums = drumIdiom({
    name: 'disco four on the floor',
    timekeeper: ['hat', 'hatOpen'],
    // A quiet band barks the open hat into a new phrase; a driving one rolls the snare or runs
    // the toms (the Philly fill) into a new section.
    fillLength: { phrase: { low: 2, mid: 2, high: 4 }, section: { low: 4, mid: 8, high: 8 } },
    groove(ctx, tier) {
        if (tier === 'low') {
            // Thinner: closed eighths (no open hat yet), a softer kick still on every beat, and
            // a cross-stick in place of the snare when the band is barely playing (the old
            // engine's sidestick below 0.35).
            return {
                kick: 'o...o...o...o...',
                hat: 'x.o.x.o.x.o.x.o.',
                ...(ctx.plan.energy < 0.3
                    ? { rim: '....x.......x...' }
                    : { snare: '....x.......x...' }),
            };
        }
        // The section's hat part (kept every bar of it); a driving band always plays the
        // sixteenths.
        const hat =
            tier === 'high'
                ? HATS.sixteenths
                : ctx.rng('hats', 'section').weighted([
                      [HATS.skeleton, 1],
                      [HATS.sixteenths, 2],
                  ]);
        // The percussionist's shaker fills the "e" and "a" between the hats wherever the
        // drummer leaves them (the skeleton), and joins the whole band when it drives.
        const shaker = tier === 'high' || hat === HATS.skeleton;
        // The lift, at high energy, in the second bar of each pair: a snare sixteenth on the
        // "a" of 4 and an accented bark on the "and" before it kick the band into the next
        // bar. A lift is louder than the time around it, never a ghost.
        const lift = tier === 'high' && ctx.bar.barInVisit % 2 === 1;
        return {
            kick: 'x...x...x...x...',
            hat,
            hatOpen: lift ? '..x...x...x...X.' : '..x...x...x...x.',
            snare: lift ? '....X.......X..x' : '....X.......X...',
            ...(shaker ? { shaker: '.g.g.g.g.g.g.g.g' } : {}),
        };
    },
    cells(ctx, tier) {
        // Any other meter: the kick on every pulse (the genre marker), the backbeat pulses
        // snared, and the open hat on each pulse's last eighth.
        const low = tier === 'low';
        const kick = low ? 'o...' : 'x...';
        const hat: Lines = low ? { hat: 'x.o.' } : { hat: 'x...', hatOpen: '..x.' };
        const back: Lines =
            low && ctx.plan.energy < 0.3 ? { rim: 'x...' } : { snare: low ? 'x...' : 'X...' };
        return {
            down: { kick, ...hat },
            back: { kick, ...hat, ...back },
            strong: { kick, ...hat },
        };
    },
    fill(ctx, steps, rng) {
        const tier = energyTier(ctx.plan.energy);
        if (steps <= 2) {
            // The bark: the open hat on the "and" of 4, a snare sixteenth closing it.
            return { hatOpen: 'X.'.slice(-steps), snare: '.X'.slice(-steps) };
        }
        // The "and" is disco's genre marker as much as the kick (I4): once a fill takes the
        // stick hand off the open hat, a hi-hat-pedal foot chick keeps its offbeat motion
        // going, wherever the open hat would otherwise be playing (mid energy and up — a
        // quiet band's hat is already closed, so there is no "and" motion to preserve). The
        // bar-absolute "%4===2" grid only reads as the "and" in 4/4 — only 4/4 is idiomatic
        // in v0 (`docs/design/band-engine.md`), so odd meters keep today's silence.
        const total = barSteps(ctx.bar);
        const hatPedal =
            tier === 'low' || !isCommonTime(ctx.bar)
                ? undefined
                : Array.from({ length: steps }, (_, i) =>
                      (total - steps + i) % 4 === 2 ? 'x' : '.',
                  ).join('');
        if (tier === 'high') {
            // Toms in sixteenths down the kit (the Philly fill). The run's own kick is dropped:
            // the floor never stops dancing, so the groove's four on the floor plays through
            // the fill (the kit keeps the kick wherever a fill writes none).
            const { kick: _dropped, ...toms } = tomRun(steps, rng, 1);
            return { ...toms, ...(hatPedal ? { hatPedal } : {}) };
        }
        if (steps >= 8) {
            // The classic disco roll: eighths on 3, then sixteenths crescendoing into the One.
            return { snare: `${'.'.repeat(steps - 8)}x.x.xxxX`, ...(hatPedal ? { hatPedal } : {}) };
        }
        // A beat of sixteenths building into the One (softer for a quiet band), trimmed to a
        // shorter span in a short bar.
        const build = tier === 'low' ? '.oxX' : 'oxxX';
        return {
            snare: build.slice(-steps).padStart(steps, '.'),
            ...(hatPedal ? { hatPedal } : {}),
        };
    },
});

// ================================================================ bass
/**
 * The octave pump, as sixteenth lines: R the root down low, O its octave, `.` silence. The
 * root lands with the kick on every beat and the octave pops on the "and" between — the
 * Philly / Salsoul / Hi-NRG engine room ("Don't Leave Me This Way", "Relight My Fire"), not
 * Chic's: Bernard Edwards played syncopated riffs, never a straight octave pump (T5). A
 * section keeps its figure; energy picks which figures a section may choose.
 */
const FIGURES: Record<EnergyTier, readonly [string, number][]> = {
    low: [
        // Quarter-note roots with the kick: the band barely playing.
        ['R...R...R...R...', 3],
        // …with one octave pickup on the "and" of 4, leaning into the next bar.
        ['R...R...R...R.O.', 2],
    ],
    mid: [
        // The pump itself: root, octave, every beat.
        ['R.O.R.O.R.O.R.O.', 4],
        // Straight eighths on the root, the octave only on the "and"s of 2 and 4.
        ['R.R.R.O.R.R.R.O.', 1],
        // Eighths on the root, the pump saved for the back half of the bar.
        ['R.R.R.R.R.O.R.O.', 1],
    ],
    high: [
        ['R.O.R.O.R.O.R.O.', 2],
        // The gallop: a sixteenth root on each "a" kicks back down into the next beat.
        ['R.ORR.ORR.ORR.OR', 2],
    ],
};

/**
 * The pump's register, for the whole tune: every root sits in one octave window low enough
 * that its octave stays on the neck (≤ D3), so the pump never folds over into an inversion.
 * Song-scoped, so *any* bar knows where the next bar's root will sit — an approach into a
 * change resolves by a half step in pitch, not just in pitch class.
 */
function pumpRoot(ctx: BarContext, pc: number): number {
    const floor = BASS.lo + ctx.rng('register', 'song').int(2);
    return floor + mod12(pc - floor);
}

/** A passing tone a half step into `target`: from below (the leading tone), else above. */
function leadInto(target: number): number {
    return target - 1 >= BASS.lo ? target - 1 : target + 1;
}

/** Any other meter: the root on every pulse, the octave on its last eighth when it pumps. */
function oddFigure(ps: Pulse[], total: number, tier: EnergyTier): string {
    const line = Array.from({ length: total }, () => '.');
    for (const p of ps) {
        line[p.step] = 'R';
        if (tier !== 'low' && p.steps >= 4) {
            line[p.step + p.steps - 2] = 'O';
        }
    }
    return line.join('');
}

const discoBass: PitchedIdiom = {
    name: 'disco octave pump',
    init: (): LineMemory => ({ last: null }),
    play(ctx, memory: LineMemory) {
        const { bar, plan } = ctx;
        const tier = energyTier(plan.energy);
        const events: PitchedNote[] = [];
        let last = memory.last;
        if (plan.ending) {
            const chord = bar.spans[0]?.chord;
            if (chord) {
                const root = pumpRoot(ctx, chord.bass);
                events.push(bassNote(bar, 0, root, 16, dyn(106, plan.energy)));
                last = root;
            }
            return { events, memory: { last } };
        }
        const total = barSteps(bar);
        const line = isCommonTime(bar)
            ? ctx.rng('figure', 'section').weighted(FIGURES[tier])
            : oddFigure(pulses(bar), total, tier);
        // Passing tones into changes: a quiet band doesn't walk. Otherwise the last bar of a
        // phrase always leads into the next phrase's first chord, and a section whose bassist
        // walks (the section's choice, likelier when the band drives) leads into every change.
        const walks =
            tier !== 'low' && ctx.rng('walk', 'section').chance(tier === 'high' ? 0.6 : 0.3);
        const phraseEnd = bar.phrase.bar === bar.phrase.length - 1;
        const spans = spanSteps(bar);
        const next = nextChord(ctx);
        const nextAttack = ctx.next?.bar.spans[0]?.attack ?? false;
        spans.forEach(({ span, from, to }, i) => {
            const chord = span.chord;
            if (!chord) {
                return;
            }
            // The slash note is the bass note: C/E pumps E.
            const root = pumpRoot(ctx, chord.bass);
            const codes = new Map<number, string>();
            for (let s = from; s < to; s++) {
                const c = line[s] ?? '.';
                if (c !== '.') {
                    codes.set(s, c);
                }
            }
            // A chord arrives on its root, wherever it lands.
            if (span.attack) {
                codes.set(from, 'R');
            }
            const inBar = i < spans.length - 1;
            const following = inBar ? spans[i + 1].span.chord : next;
            const followingAttacks = inBar ? spans[i + 1].span.attack : nextAttack;
            const leads =
                tier !== 'low' &&
                following !== null &&
                followingAttacks &&
                following.bass !== chord.bass &&
                (walks || (!inBar && phraseEnd));
            const steps = [...codes.keys()].sort((a, b) => a - b);
            steps.forEach((step, k) => {
                const code = codes.get(step)!;
                let midi = code === 'O' ? root + 12 : root;
                let velocity = code === 'O' ? 94 : step % 4 === 0 ? 102 : 78;
                // The last note before the change, within an eighth of it, becomes the half
                // step into the next root — placed exactly where the next chord will pump it.
                const approaching =
                    leads && k === steps.length - 1 && step !== from && to - step <= 2;
                if (approaching && following) {
                    midi = leadInto(pumpRoot(ctx, following.bass));
                    velocity = 90;
                }
                // The pump bounces: every note stops well short of the next, so the octave pops
                // and the root thumps with the kick instead of smearing into one drone.
                const gap = (steps[k + 1] ?? to) - step;
                const length = Math.min(gap, tier === 'low' ? 3 : 2) * 0.8;
                events.push(bassNote(bar, step, midi, length, dyn(velocity, plan.energy)));
                last = midi;
            });
        });
        return { events, memory: { last } };
    },
};

// ================================================================ comp
/**
 * Keyboard stabs, one figure per section, as sixteenth lines: `x` a stab. The stab on every
 * "and" doubles the open hat's "tss" (the MFSB / "I Will Survive" piano); the syncopated
 * sixteenths push into the strong beats — the "a" of 2 into 3, the "a" of 4 into the next
 * bar (where the machinery may anticipate the next chord) — and the busiest figure, only when
 * the band drives, trades the "and"s of 2 and 4 for the sixteenths either side of them (the
 * "e" and the "a"): a stutter around the backbeat, while 1 and 3 keep their "and".
 */
const KEYS_FIGURES: Record<EnergyTier, readonly [string, number][]> = {
    low: [['..x...x...x...x.', 1]],
    mid: [
        ['..x...x...x...x.', 3],
        ['..x...xx..x...xx', 1],
    ],
    high: [
        ['..x...xx..x...xx', 2],
        ['..x...x...x...x.', 1],
        ['..x..x.x..x..x.x', 1],
    ],
};

function keysRhythm(
    ctx: BarContext,
    { from, to }: { from: number; to: number },
    tier: EnergyTier,
): Hit[] {
    const common = isCommonTime(ctx.bar);
    const line = common
        ? ctx.rng('stabs', 'section').weighted(KEYS_FIGURES[tier])
        : // Any other meter: a stab on each pulse's last eighth, its "and".
          Array.from({ length: barSteps(ctx.bar) }, (_, s) =>
              pulses(ctx.bar).some((p) => p.step + p.steps - 2 === s) ? 'x' : '.',
          ).join('');
    const hits: Hit[] = [];
    for (let s = from; s < to; s++) {
        if (line[s] !== 'x') {
            continue;
        }
        const and = s % 4 === 2 || !common;
        hits.push({
            step: s,
            // Staccato: a disco stab is a sixteenth, damped at once (the old engine's quarter
            // of a beat); a quiet band lets it bloom a little longer.
            length: tier === 'low' ? 1.5 : 0.9,
            // The "and" is the stab; the sixteenth pushes sit under it — closer at high
            // energy, when the whole hand digs in, but still under.
            velocity: and ? (tier === 'high' ? 100 : 94) : tier === 'high' ? 90 : 82,
        });
    }
    return hits;
}

const KEYS_PUSH: Record<EnergyTier, number> = { low: 0, mid: 0.3, high: 0.5 };

/** A quiet band stabs plain triads and sevenths (the old engine left disco bare below 0.35). */
const discoKeysPlain = compIdiom({
    name: 'disco stabs (plain)',
    kind: 'close',
    push: KEYS_PUSH,
    rhythm: (ctx, span, tier) => keysRhythm(ctx, span, tier),
});

/**
 * From mid energy the stabs go lush: rootless voicings put the 9th (and a written 6th, the
 * 6/9) on top — disco's Rhodes colour, with the bass holding the root. The 9th is the
 * voicing module's, which reads the chord's implied tensions (a secondary dominant into a
 * minor chord gets its b9), so the keys and the harmony agree.
 */
const discoKeysLush = compIdiom({
    name: 'disco stabs',
    kind: 'rootless',
    push: KEYS_PUSH,
    rhythm: (ctx, span, tier) => keysRhythm(ctx, span, tier),
});

// On the organ the machinery holds each chord to the next strike: a legato pad under the
// four on the floor (the strings' role on a disco record), same voicing choice by tier.
const discoKeys: PitchedIdiom = {
    ...discoKeysLush,
    play(ctx, memory) {
        return energyTier(ctx.plan.energy) === 'low'
            ? discoKeysPlain.play(ctx, memory)
            : discoKeysLush.play(ctx, memory);
    },
};

// ---------------------------------------------------------------- guitar
/**
 * The Nile Rodgers chuck, one line per section, on the sixteenth pendulum: `X` an accented
 * chop, `x` a lighter one, `-` a muted scratch. Where funk's hand stabs a riff and lets
 * silence into it, disco's never stops: every sixteenth is a stroke, and the chord sounds
 * only where the line says.
 * - ands: the chop on every "and", with the open hat;
 * - pickup: a light upstroke on the "a" of 1 and 3 answers the chop into the backbeat;
 * - push: a light upstroke on each "e" pushes into the chop on the "and" (a-CHANK);
 * - nile: syncopation off the "and"-only grid (I3) — an accented chop right on the One (the
 *   hand announces the downbeat instead of leaving it to the kick alone) with a light "a"
 *   pickup into 3 and back into 1, the "and"s of 2 and 4 kept as anchors so it still locks
 *   with the open hat. Every other mid-energy section played "ands" alone read as one
 *   generic chop with no idiomatic character until high energy; this is the line disco
 *   actually invented (Nile Rodgers), so it belongs at mid energy, not held back for high.
 * Chops fall on even sixteenths, so they are downstrokes; the lighter strokes on odd ones
 * come up — the pendulum sets the direction, never the line.
 */
const CHUCKS = {
    ands: '--X---X---X---X-',
    pickup: '--Xx--X---Xx--X-',
    push: '-xX--xX--xX--xX-',
    nile: 'X-----Xx------Xx',
} as const;
type Chuck = keyof typeof CHUCKS;

const CHUCK_WEIGHTS: Record<EnergyTier, readonly [Chuck, number][]> = {
    low: [['ands', 1]],
    mid: [
        // A section's hand alternates plain "ands" with the syncopated Nile line 50/50 (I3),
        // the same section-scoped choice every other tier already makes — some sections play
        // it straight, others get the idiom's real character, instead of every mid-energy
        // section sounding identical.
        ['ands', 1],
        ['nile', 1],
    ],
    high: [
        ['ands', 1],
        ['pickup', 1],
        ['push', 2],
    ],
};

const discoGuitar = compIdiom({
    name: 'disco chucking guitar',
    // The 3-7-9 grip (a triad on a plain chord), on the top strings: small, bright, high on
    // the neck, higher than funk's (its top voice aims for C5, not funk's F#4). No open
    // strings: the scratch is the fretting hand releasing, and an open string would ring on.
    // With no bassist it stays up here: the chuck is a texture, not a bottom.
    kind: 'stab',
    grip: { strings: 4, slot: { lo: 58, hi: 79, top: 72, pull: 0.8 }, open: false },
    // Disco changes land on the One with the kick; the chuck rarely anticipates.
    push: { low: 0, mid: 0, high: 0.15 },
    rhythm(ctx, { from, to }, tier) {
        const line = isCommonTime(ctx.bar)
            ? CHUCKS[ctx.rng('chuck', 'section').weighted(CHUCK_WEIGHTS[tier])]
            : // Any other meter: scratches throughout, the chop on each pulse's "and".
              Array.from({ length: barSteps(ctx.bar) }, (_, s) =>
                  pulses(ctx.bar).some((p) => p.step + p.steps - 2 === s) ? 'X' : '-',
              ).join('');
        // The chop is short — the hand lets go at once — but brighter and less clipped than a
        // funk chank.
        let hits = strums(line, from, to, 1, 0.9);
        if (tier === 'low') {
            // A quiet band: the hand eases to eighths, scratching the beat under the chop.
            hits = hits.filter((h) => !h.muted || h.step % 2 === 0);
        } else if (tier === 'high') {
            // The hand digs in: the scratches get louder, but the pendulum's down/up accent
            // (I3) still holds — the same +8 the old flat bump gave the mid-tier scratch
            // (44→52), applied to each direction instead of erasing the direction.
            hits = hits.map((h) =>
                h.muted ? { ...h, velocity: h.stroke === 'down' ? 58 : 44 } : h,
            );
        }
        return hits;
    },
});

// ================================================================ lead
// A disco sax break: a horn soaring over four on the floor (the tenor on "Street Life", the
// session players who cut disco by day and bebop by night). Its rhythm is funk's sixteenths
// made legato — syncopated riffs that tie across the "and", the 3-3-2 anticipation — and it
// repeats a riff to work the floor. Its notes are the pentatonic on each chord's root (major
// over major, minor-with-the-9th over minor), so it sings rather than runs; it lands the 3rd
// or 7th on a change like the jazz player it is, and every phrase peaks on a big held note,
// scooped and shaken. The head is a singable hook, a period like the song's own tune.
const discoLead = leadIdiom({
    name: 'disco sax break',
    cells: {
        // Chorus one: long tones and a short pickup into them, the horn finding the room.
        sparse: [
            'x-------x-x-----',
            '..x-x-------....',
            'x-----x-x-------',
            '......x-x-x-----',
            'x---x-------....',
        ],
        // Funk's syncopation, legato: ties over the "and", the 3-3-2, a sixteenth pickup.
        mid: [
            'x-xx-x-x---x-x--',
            'x-x-xx-x----x-x-',
            '..x-x-xx-x------',
            'x--x--x-x-x-----',
            'x-x-x--x-x------',
        ],
        // The peak: sixteenth runs, broken by a held note so the line still sings.
        busy: [
            'xxxxx-x-xxxx-x--',
            'x-xxx-xxx-xxx-x-',
            'xxxxxxxx-x-x-x--',
            '..xxxxxxx-x-x---',
            'x-x-xxxxx-x-----',
        ],
    },
    // Every phrase ends on the big held note, reached straight or by a short pickup.
    endings: [
        'x---------------',
        'x-x-x-----------',
        '..x-x-----------',
        'x.x-x-----------',
        'x--x------------',
    ],
    head: {
        // A hook a dance floor can sing: eighths and the 3-3-2, a held note to breathe on.
        cells: [
            'x-x-x---x-x-----',
            'x--x--x-x-------',
            '..x-x-x-x---x---',
            'x---x-x-x-x-----',
            'x-x---x-x-------',
        ],
        endings: ['x---------------', 'x--x------------', 'x-x-x-----------'],
        form: 'period',
    },
    pool: (chord) => chordPentatonic(chord),
    arrive: (chord) => guideTones(chord),
    settle: (chord) => restingTones(chord),
    // why: a pop horn steps into its chords; the odd half-step slide into a target is the
    // funk and bebop in it, but a disco break stays inside the song, not outside it.
    chromatic: 0.15,
    // why: an enclosure is a bebop device; a session player lets one slip now and then.
    enclosure: 0.05,
    // why: disco is built on repetition — a riff played again works the floor harder than a
    // new idea, so a bar repeats more often than a jazz line (0.08), less than funk's (0.5).
    riff: 0.35,
    // why: the dance floor wants the energy kept up — less room than jazz or blues take.
    space: 0.2,
    // why: on a guitar (not the default), the half-step bend into the 3rd is the R&B lick; a
    // whole-step bend into the root is rock's, rarer here.
    bends: { blue: 0.3, root: 0.2 },
    // why: the R&B tenor's signature: a scoop from below into a long note, a third of the time.
    scoop: 0.3,
    // why: a pop sax shakes every held note — a dotted eighth or longer — not just long ones.
    vibrato: 6,
});

export const disco: Style = {
    id: 'disco',
    name: 'Disco',
    // Straight sixteenths, machine-tight. The drums are the clock; the octave bass sits a hair
    // ahead of them (the old engine's −2 ms), pulling the four on the floor forward. The comp
    // sits dead on the grid: the stabs and the chuck double the open hat's "and", and any lag
    // against it would flam. Little human variation — the dance floor wants a metronome.
    // The sax floats a hair over the machine (4 ms, felt rather than heard as late): pushed
    // ahead with the bass, a soaring line would rush the floor.
    feel: { swing: 0, swingGrid: 16, lean: { bass: -2, comp: 0, lead: 4 }, humanize: 15 },
    drums: discoDrums,
    bass: discoBass,
    comp: { keyboard: discoKeys, guitar: discoGuitar },
    // Guitar, against the old mapping's Rhodes. The band has one comp instrument, and alone
    // it must carry what the drums and bass don't: the four on the floor and the octave pump
    // already own the beat and the "and", and a Rhodes stab on every "and" only doubles the
    // open hat. The chucking sixteenth guitar is the comp part disco invented (Nile Rodgers,
    // the Bee Gees' rhythm section), and its continuous sixteenths are the motion that tells
    // disco from four-on-the-floor pop. The old engine chose the Rhodes in a world whose
    // chords lane was keyboard-voiced and had no scratch; here the guitar's grips and muted
    // strokes are real, so it gets the job. The Rhodes (lush 9ths on the "and"s) stays a
    // strong alternative.
    prefers: 'guitar',
    // The alto sax: the disco break is a horn's (the guitar is already chucking the comp, and
    // a second guitar would fight it for the same register and attack).
    lead: { idiom: discoLead, prefers: 'sax' },
};
