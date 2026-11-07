import type { BandEvent, DrumHit } from '../../core/types.js';
import type { Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Metric } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

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

/**
 * Share of the 4/4 bars the lead plays in where it strikes the bar's last eighth (the "and" of
 * 4): the push into the next One, a disco hook's lean into the downbeat the kick lands on.
 */
const leadPushIntoOne: Metric = (takes) => {
    let bars = 0;
    let hit = 0;
    for (const { timeline: t, events } of takes) {
        const pushed = new Map<number, boolean>();
        for (const e of events) {
            const bar = t.bars[e.bar];
            if (e.lane !== 'lead' || bar.meter.name !== '4/4') {
                continue;
            }
            const push = Math.round((e.tick - bar.start) / STEP) === 14;
            pushed.set(e.bar, (pushed.get(e.bar) ?? false) || push);
        }
        for (const push of pushed.values()) {
            bars++;
            hit += push ? 1 : 0;
        }
    }
    return bars ? hit / bars : 0;
};

export const disco = defineClaims({
    metrics: { hatPedalOrOpenFillCoverage, compScratchAccent, leadPushIntoOne },
    takes: [
        // The known standard's guide-tone head, on disco's own figures (#2122, `head.guide` in
        // `styles/disco.ts`).
        guideTonesTake({}, [
            // Pushed into the One: 0.24 on disco's figures, 0.11 on the shared ones (one
            // pushed cell of six). The floor sits between. A push tied into an arrival
            // leaves the arrival's bar unstruck, so `leadRestShare` reads 0.118 here, not
            // 0.084: those bars sound.
            ['leadPushIntoOne', 0.18, 0.4, 'the hook leans into the next One'],
        ]),
        {
            take: {},
            claims: [
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (160, about half the 316 measured; a lead-in is a note within a beat of the change).
                ['bassApproachCount', 160, 10000, 'it does play half-step lead-ins into changes'],
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
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
                [
                    'compColour',
                    0,
                    0.12,
                    'plain triads and sevenths when quiet, a written 9th aside',
                ],
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
        {
            take: { lead: 'solo', comp: 'guitar' },
            claims: [['compLeadUnison', 0, 0.15, 'the chuck leaves the sax its note']],
        },
        {
            take: { lead: 'head' },
            claims: [
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (on the eighths, never two sixteenths running), then moves. Measured
                // 0.006 with no stabs, 0.108 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'the horn pumps one note, then lifts off it'],
                // The head breathes at every phrase end (#2024): a beat after a four-bar phrase,
                // two after an eight-bar period. Measured 19.88 bars before (phrase into phrase),
                // 3.75 after. The ceiling is 6, not 8: with only the period's breath the head would
                // run 7.75 bars, so 6 fails if the four-bar phrase stops breathing.
                ['leadLongestRun', 0, 6, 'a breath at least every four bars'],
                ['leadLongBreath', 0, 0.02, 'the hook never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the hook fills the form'],
                ['leadNotesPerBar', 2.5, 5.5, 'a singable hook, not a run'],
                ['leadChordToneOnBeats', 0.78, 1, 'the hook sits on the chord on the beats'],
                ['leadChangeGuideTones', 0.65, 1, 'each change lands on its 3rd or 7th'],
                ['leadChromaticApproach', 0, 0.1, 'a hook steps into its chords'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases come to rest on a chord tone'],
                ['leadBendShare', 0.05, 0.3, "the tenor's scoop into its long notes"],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (on the eighths, never two sixteenths running), then moves. Measured
                // 0.009 with no stabs, 0.105 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'the horn pumps one note, then lifts off it'],
                // Measured 0.090; development off 0.034, #2012's bar fix reverted 0.029; always develops 0.33.
                // Floor sits between the bar fix reverted (0.029) and shipped: it guards #2012's bar fix and development off (0.034).
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.06,
                    0.21,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 110, 10000, 'enough phrase openings to judge the rate on'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.1, 0.35, 'it breathes, but keeps the floor moving'],
                ['leadShortShare', 0.6, 0.9, "funk's sixteenth riffs, broken by held notes"],
                ['leadChordToneOnBeats', 0.8, 1, 'the beats sit on the chord'],
                ['leadChangeGuideTones', 0.6, 1, 'changes land on the 3rd or 7th'],
                ['leadChromaticApproach', 0, 0.25, 'a pop horn: a chromatic slip now and then'],
                [
                    'leadMeanInterval',
                    2,
                    3.8,
                    "the chord's pentatonic: steps and minor 3rds, not a scale run",
                ],
                ['leadLeapShare', 0, 0.06, 'a wide leap is rare'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'every phrase ends on a chord tone'],
                ['leadBendShare', 0.02, 0.2, 'a scoop into a long note now and then'],
                ['leadArcRise', 1.6, 4, 'the break builds'],
                ['leadPeakIsTop', 0.85, 1, "the peak's big held note is the top"],
                ['leadRange', 11, 24, 'the break soars: an octave and more'],
            ],
        },
    ],
});
