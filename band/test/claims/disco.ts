import type { BandEvent, DrumHit } from '../../core/types.js';
import type { Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Metric } from '../critique/harness.js';

function drumSteps(t: Timeline, events: BandEvent[], bar: number, pieces: string[]) {
    return new Set(
        events
            .filter(
                (e): e is DrumHit =>
                    e.lane === 'drums' && e.bar === bar && pieces.includes(e.piece),
            )
            .map((e) => Math.round((e.tick - t.bars[bar].start) / STEP)),
    );
}

/**
 * Fill bars: 4/4 bars with drums that aren't a steady groove bar (a tom hit, or a phrase's
 * last bar) and aren't a section's first bar (the crash) — mirrors the shared harness's
 * `grooveBars`/`kickFourOnFloorInFills` selection, which isn't exported for a style's own
 * metric to reuse.
 */
function fillBars(t: Timeline, events: BandEvent[]) {
    const groove = new Set(
        t.bars
            .filter((b) => {
                const hasTom =
                    drumSteps(t, events, b.index, ['tomHigh', 'tomMid', 'tomLow']).size > 0;
                const lastPhraseBar = b.phrase.bar === b.phrase.length - 1;
                const hasDrums = events.some((e) => e.lane === 'drums' && e.bar === b.index);
                return (
                    b.meter.name === '4/4' &&
                    hasDrums &&
                    !hasTom &&
                    !lastPhraseBar &&
                    b.barInVisit > 0
                );
            })
            .map((b) => b.index),
    );
    return t.bars.filter((b) => {
        const hasDrums = events.some((e) => e.lane === 'drums' && e.bar === b.index);
        return b.meter.name === '4/4' && hasDrums && !groove.has(b.index) && b.barInVisit > 0;
    });
}

/**
 * I4: through a fill, the "and" is disco's genre marker as much as the kick — the share of a
 * fill bar's "and" steps where the open hat or its foot-chick stand-in (a fill's `hatPedal`)
 * still sounds. Not gated to mid+ energy in the metric itself: a quiet band's fills legitimately
 * keep the hat closed (no `openHatOnAnds` at that energy either), so the mixed-energy default
 * take reads under 1 without that being a defect — see the [0.85, 1] floor below.
 */
const hatPedalOrOpenFillCoverage: Metric = (takes) => {
    let n = 0;
    let hit = 0;
    for (const { timeline: t, events } of takes) {
        for (const b of fillBars(t, events)) {
            const covered = drumSteps(t, events, b.index, ['hatOpen', 'hatPedal']);
            for (const s of [2, 6, 10, 14]) {
                n++;
                hit += covered.has(s) ? 1 : 0;
            }
        }
    }
    return n ? hit / n : 0;
};

/**
 * I3: the pendulum accents scratches too (`strums` in `players/comp/idiom.ts`) — a downstroke
 * digs in, an upstroke is a lighter flick. The ratio of mean upstroke to mean downstroke
 * scratch velocity, so the claim holds regardless of how energy's `dyn()` scaling (applied to
 * both directions alike) moves the absolute numbers.
 */
const compScratchAccent: Metric = (takes) => {
    let downSum = 0;
    let downN = 0;
    let upSum = 0;
    let upN = 0;
    for (const { events } of takes) {
        for (const e of events) {
            if (e.lane === 'comp' && e.muted) {
                if (e.stroke === 'down') {
                    downSum += e.velocity;
                    downN++;
                } else if (e.stroke === 'up') {
                    upSum += e.velocity;
                    upN++;
                }
            }
        }
    }
    return downN && upN ? upSum / upN / (downSum / downN) : 1;
};

export const disco = defineClaims({
    metrics: { hatPedalOrOpenFillCoverage, compScratchAccent },
    takes: [
        {
            take: {},
            claims: [
                [
                    'kickFourOnFloor',
                    0.98,
                    1,
                    'four on the floor: the kick on every beat, every bar',
                ],
                ['kickFourOnFloorInFills', 0.98, 1, 'the floor keeps dancing through every fill'],
                ['snareBackbeat', 0.95, 1, 'the snare cracks 2 and 4'],
                [
                    'openHatOnAnds',
                    0.85,
                    1,
                    'the open hat barks every "and" (only a quiet band closes it)',
                ],
                [
                    'hatPedalOrOpenFillCoverage',
                    0.85,
                    1,
                    'the "and" survives a fill too — a foot-chick stands in where the stick hand leaves (I4)',
                ],
                [
                    'bassArrivesOnBass',
                    0.95,
                    1,
                    'every chord arrives on its root, or its slash note',
                ],
                [
                    'bassOctavePumpPerBeat',
                    0.5,
                    0.9,
                    'the pump: the octave pops on the "and" above the beat',
                ],
                [
                    'bassChromaticApproach',
                    0.25,
                    0.6,
                    'passing tones lead into many changes by a half step in pitch',
                ],
                ['bassMeanPitch', 34, 42, 'the root down low, its octave on the neck above it'],
                [
                    'compOffbeatShare',
                    0.9,
                    1,
                    'the stabs live on the "and"s and the sixteenths around them',
                ],
                ['compOnOneAndThree', 0, 0.1, "the stabs leave the kick's beats alone"],
                ['compShort', 0.85, 1, 'a stab is a sixteenth, damped at once'],
                ['compColour', 0.6, 1, 'lush 9ths (and 6/9s) on the Rhodes stabs from mid energy'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                ['kickFourOnFloor', 0.98, 1, 'the kick never stops, only softens'],
                ['openHatOnAnds', 0, 0.02, 'a quiet band keeps the hat closed'],
                [
                    'bassOctavePumpPerBeat',
                    0,
                    0.2,
                    'quarter-note roots: the pump waits for the band to build',
                ],
                ['compColour', 0, 0.1, 'plain triads and sevenths when quiet, the 9ths come later'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                [
                    'compScratchShare',
                    0.6,
                    0.85,
                    'mostly muted scratches, the chord only where it chops',
                ],
                [
                    'compStrikesPerBar',
                    13,
                    16,
                    'the hand never stops: a stroke on nearly every sixteenth',
                ],
                [
                    'compOffbeatShare',
                    0.85,
                    1,
                    'the chops land off the beat; the Nile line (I3) puts a few on the One',
                ],
                ['compMeanLowest', 60, 68, "small grips high on the neck, above funk's (~57)"],
                [
                    'compUpstrokeShare',
                    0.03,
                    0.25,
                    'a sixteenth pendulum: chops come down, only the light pickups come up',
                ],
                [
                    'compScratchAccent',
                    0.6,
                    0.85,
                    'the pendulum accents even the scratches: an upstroke is lighter than a down (I3)',
                ],
            ],
        },
    ],
});
