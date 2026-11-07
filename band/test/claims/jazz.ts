import { leadRole } from '../../arrange/cycle.js';
import { type FormRole, formRole } from '../../arrange/plan.js';
import type { BandEvent, DrumHit, DrumPiece, PitchedNote } from '../../core/types.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Take } from '../critique/harness.js';

const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/**
 * Each 4/4 bar of the takes in form role `role` (#2018), as the plan reads it: the lead's job
 * there (the same `leadRole` the plan asks, with the bar's chorus added to the pass) and the
 * head's bridge. With the bar's events.
 */
function barsIn(takes: Take[], role: FormRole) {
    const out: { take: Take; index: number; events: BandEvent[] }[] = [];
    for (const take of takes) {
        const { timeline: t, events, pass = 0, trade } = take;
        for (const bar of t.bars) {
            const lead = leadRole(t, bar.index, pass + bar.visit.chorus, trade ?? null);
            if (bar.meter.name === '4/4' && formRole(t, bar.index, lead) === role) {
                out.push({
                    take,
                    index: bar.index,
                    events: events.filter((e) => e.bar === bar.index),
                });
            }
        }
    }
    return out;
}

/** The bass notes struck in a bar (a bar with none — the bass laid out — is not judged). */
const bassIn = (events: BandEvent[]) =>
    events.filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted);

/**
 * Share of the bars in `role` the bass plays in 2 (`two`: three notes or fewer — two half notes
 * and an approach) or walks (four or more). 0 when the takes hold no such bar, so a claim on
 * a role the plan never gives fails rather than passing empty.
 */
function bassFeel(takes: Take[], role: FormRole, two: boolean): number {
    const bars = barsIn(takes, role).filter((b) => bassIn(b.events).length > 0);
    return ratio(bars.filter((b) => bassIn(b.events).length <= 3 === two).length, bars.length);
}

/**
 * The time-keeping bars in `role` (no crash bar, no fill bar, no tom), each as its drum hits
 * and the sixteenth each falls on (the critique plays straight, so a step is exact).
 */
function timeBars(takes: Take[], role: FormRole) {
    return barsIn(takes, role).flatMap(({ take, index, events }) => {
        const bar = take.timeline.bars[index];
        const drums = events.filter((e): e is DrumHit => e.lane === 'drums');
        const fill =
            bar.barInVisit === 0 ||
            bar.phrase.bar === bar.phrase.length - 1 ||
            drums.some((d) => d.piece.startsWith('tom') || d.piece === 'crash');
        return fill
            ? []
            : [
                  drums.map((d) => ({
                      piece: d.piece,
                      step: Math.round((d.tick - bar.start) / STEP),
                  })),
              ];
    });
}

/** Mean `piece` strokes per time-keeping bar in `role`; NaN (a failed claim) with no such bar. */
function strokesPerBar(takes: Take[], role: FormRole, piece: DrumPiece): number {
    const bars = timeBars(takes, role);
    const strokes = bars.reduce((n, hits) => n + hits.filter((h) => h.piece === piece).length, 0);
    return bars.length ? strokes / bars.length : Number.NaN;
}

/**
 * The head's bars right before a solo chorus (the next bar, or the next pass's first when the
 * song wraps, is a solo's): the share where the bass walks into it.
 */
function setsUpSolo(takes: Take[]): number {
    let n = 0;
    let hit = 0;
    for (const { timeline: t, events, pass = 0, trade } of takes) {
        const roleAt = (index: number, onPass: number) =>
            formRole(
                t,
                index,
                leadRole(t, index, onPass + t.bars[index].visit.chorus, trade ?? null),
            );
        for (const bar of t.bars) {
            const last = bar.index === t.bars.length - 1;
            const next = last ? roleAt(0, pass + 1) : roleAt(bar.index + 1, pass);
            const notes = bassIn(events.filter((e) => e.bar === bar.index)).length;
            if (
                bar.meter.name === '4/4' &&
                roleAt(bar.index, pass) === 'head' &&
                next === 'solo' &&
                notes > 0
            ) {
                n++;
                hit += notes >= 4 ? 1 : 0;
            }
        }
    }
    return ratio(hit, n);
}

export const jazz = defineClaims({
    metrics: {
        /** Share of the head's A-section bars the bass plays in 2 (#2018). */
        bassHeadInTwo: (takes) => bassFeel(takes, 'head', true),
        /** Share of the solo bars (and trades) the bass walks: four notes or more. */
        bassSoloWalks: (takes) => bassFeel(takes, 'solo', false),
        /** Share of the head's bridge bars the bass walks. */
        bassBridgeWalks: (takes) => bassFeel(takes, 'bridge', false),
        /**
         * Ride strokes per time-keeping bar under the head's A sections, over the same under
         * the solos: the head on the hat, the solos on the ride.
         */
        rideHeadOverSolo: (takes) =>
            strokesPerBar(takes, 'head', 'ride') / strokesPerBar(takes, 'solo', 'ride'),
        /** Share of the head's A-section time bars with the closed hat on all four beats. */
        hatOnBeatsHead: (takes) => {
            const bars = timeBars(takes, 'head');
            const on = bars.filter((hits) =>
                [0, 4, 8, 12].every((x) => hits.some((h) => h.piece === 'hat' && h.step === x)),
            );
            return bars.length ? on.length / bars.length : Number.NaN;
        },
        /** Share of the head's last bars before a solo chorus where the bass walks into it. */
        bassSetsUpSolo: setsUpSolo,
    },
    takes: [
        {
            take: {},
            claims: [
                // The head and the solos get different grooves (#2018). This take is the head
                // (pass 0) and the first solo chorus, on Auto (the head about 0.52, mid). Measured,
                // in order: 0.827 / 1 / 1 / 0.093 / 0.907 / 1. With the change reverted: 0 (the
                // head walked from bar 1) / 1 / 1 / 1 (one ride across both) / 0 / 1. The setup
                // claim reads 0.063 without the setup bar, or without the wrap carrying the next
                // pass's role (`performPass`'s `nextPlan`). The head bars that walk or ride are
                // the setup bars, a section authored hot (the pop chart's chorus at 0.85, high,
                // walks on the ride), and a two-chord bar in 2 whose half notes each split for an
                // approach (four notes).
                ['bassHeadInTwo', 0.8, 1, "the head's A sections: the bass in 2"],
                ['bassBridgeWalks', 0.9, 1, "the head's bridge walks, for contrast"],
                ['bassSoloWalks', 0.9, 1, 'the solos walk'],
                [
                    'rideHeadOverSolo',
                    0,
                    0.1,
                    "the head's A sections on the hi-hat, the ride saved for the solos",
                ],
                ['hatOnBeatsHead', 0.9, 1, 'the closed hat keeps the time under the head'],
                ['bassSetsUpSolo', 0.9, 1, "the head's last bar walks into the solo"],
                ['hatPedal24', 0.9, 1, 'hi-hat foot on 2 and 4'],
                // Measured 0.033 today; 0.016 with the push off (the chance level: a Charleston hit
                // that happens to carry both guide tones). The floor sits between them: a guard
                // that the push exists, not a target (#2015 raises the real rate).
                [
                    'compAnticipatesChange',
                    0.025,
                    0.5,
                    'a comp hit an eighth before a change already plays the new chord',
                ],
                ['compColour', 0.6, 1, 'rootless voicings carry 9ths and 13ths'],
                ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
            ],
        },
        {
            take: { intensity: 0.9 },
            claims: [
                // A burner's head walks (#2018): the light head is below the high tier. Measured
                // 0; 0.918 with the head in 2 at every tier.
                ['bassHeadInTwo', 0, 0.1, 'a hot head walks on the ride from the top'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                [
                    'bassNotesPerBeat',
                    0.45,
                    0.75,
                    'two-feel: half notes, with an occasional approach on 4',
                ],
                // A ballad stays in 2 under the solos too (#2018): nothing at low energy changes.
                // Measured 0.033: two-chord bars whose half notes each split for an approach.
                ['bassSoloWalks', 0, 0.1, 'a ballad: the solos stay in 2 as well'],
                ['bassHeadInTwo', 0.8, 1, 'and so does the head'],
                [
                    'bassHeldNotesAreChordTones',
                    0.97,
                    1,
                    'a held half note is a chord tone, never a passing tone',
                ],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compOffbeatShare', 0, 0.2, 'four to the bar: the guitar marks the beats'],
                ['compLongShort', 1.5, 3, 'long-short: 1 and 3 held a little, 2 and 4 crisp'],
                ['compStrikesPerBar', 3, 4.2, 'one stroke per beat'],
                [
                    'compRootLowest',
                    0.8,
                    1,
                    'the root on the bottom string, doubling the walking bass',
                ],
                ['compMeanLowest', 40, 52, 'the chunk sits low (roots on the 6th and 5th strings)'],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['compLeadUnison', 0, 0.15, 'the piano leaves the horn its note'],
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the head is a tune: it fills the form'],
                ['leadNotesPerBar', 2, 4.5, 'a singable line, not a run'],
                ['leadChordToneOnBeats', 0.75, 1, 'the tune sits on the harmony on the beats'],
                ['leadChangeGuideTones', 0.7, 1, 'each change lands on its 3rd or 7th'],
                [
                    'leadChromaticApproach',
                    0,
                    0.1,
                    'a tune steps into its chords, not chromatically',
                ],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases come to rest on a chord tone'],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                ['leadRepeatedNotes', 0, 0.07, 'the line moves'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            // A known standard's head (#2027): the changes' guide-tone line, not a tune.
            take: { lead: 'guide-tones' },
            claims: [
                // A wiring check: the line chooses only guide tones, so this proves the take
                // plays the guide-tone head. The voice-leading is the interval claims below.
                ['leadChangeGuideTones', 0.9, 1, 'each change lands on its 3rd or 7th'],
                ['leadNotesPerBar', 0.6, 1.5, 'one long note a chord, not a tune (0.90)'],
                [
                    'leadMeanInterval',
                    0,
                    2.3,
                    "voice-led: each guide tone steps to the next chord's, or holds (1.68)",
                ],
                ['leadStepShare', 0.65, 1, 'mostly half and whole steps (0.74)'],
                ['leadLeapShare', 0, 0.01, 'no leaps wider than a fifth (0)'],
                [
                    'leadMoveOverThird',
                    0,
                    0.05,
                    'voice-led: no 4th or tritone inside a phrase (0; the invented head 0.30)',
                ],
                ['leadLongBreath', 0, 0.02, 'the line never drops out for two bars'],
            ],
        },
        {
            take: { trade: { with: 'drums', bars: 4, choruses: null } },
            claims: [
                ['tradeYourTurn', 1, 1, 'your four are yours: no sax, and the band keeps time'],
                ['tradeBandLaysOut', 1, 1, "the drummer's four are the drums alone"],
                ['tradeDrumsSolo', 0.95, 1, 'a solo, not the time, with the foot still going'],
                ['tradeDrumMotif', 0.9, 1, "the drummer's idea comes back an eighth later"],
                ['tradeDrumVerbatim', 0, 0.1, 'developed, not repeated'],
                ['tradeBackOnCrash', 1, 1, 'the band comes back in on a crash'],
            ],
        },
        {
            take: { trade: { with: 'lead', bars: 4, choruses: null } },
            claims: [
                ['tradeLeadPlays', 0.95, 1, 'the sax plays each of its fours through'],
                ['tradeYourTurn', 1, 1, 'then it lays out, and the band keeps comping for you'],
                ['leadShortShare', 0.6, 0.95, 'bebop lines in its fours'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // The walk and the ride are the solos' (#2018): the head's A sections are in 2
                // on the hat, so the walking line and the ride are judged on the solo choruses.
                ['rideOnBeats', 0.9, 1, 'the ride carries the time on every beat'],
                ['bassNotesPerBeat', 0.85, 1.05, 'a walking line: one note per beat'],
                ['bassArrivesOnBass', 0.75, 1, 'the walk lands on the chord (a 3rd now and then)'],
                ['bassChromaticApproach', 0.3, 0.8, 'half-step approaches lead into changes'],
                // The walk's approaches are lead-ins too: 906 measured, none leaping past a fifth.
                ['bassApproachCount', 450, 10000, 'it does play half-step lead-ins into changes'],
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
                ['bassRepeatedNotes', 0, 0.02, 'the walk keeps moving: no repeated pitches'],
                ['bassMeanLeap', 1.5, 4.5, 'mostly stepwise, not arpeggio leaps'],
                ['compLeadUnison', 0, 0.15, 'the piano leaves the horn its note'],
                // Measured 0.118; development off 0.026, #2012's bar fix reverted 0.106; always develops 0.32.
                // Floor guards development off (0.026) only; this style barely sees the bar fix (0.106 vs 0.118), which blues, disco and rock guard.
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.07,
                    0.22,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 115, 10000, 'enough phrase openings to judge the rate on'],
                // Ablations measured on the solo take (answer off / no lay-out / no fill / no
                // floor): thin bars 0.19 (0.23 / 0.19 / 0.23 / 0.39), breath density 1.15 (0.87 /
                // 1.10 / 0.91 / 1.36), answers 0.48 (0.28 / 0.51 / 0.25 / 0.48), lift +3.1
                // (-5.0 / 2.4 / 2.2 / 3.1), line density 0.113 (0.119 / 0.119 / 0.113 / 0.096).
                // The first cut (lay-out 0.6, fill 0.7, no floor) left 41% of bars with one
                // strike and Brandon heard it thin (#1404 item 33).
                ['compThinBars', 0, 0.21, 'the time is kept: a bar of one strike is rare'],
                ['compBreathDensity', 1.1, 2, "the comper talks in the soloist's breaths"],
                ['compAnswersBreaths', 0.4, 0.7, 'a stab of its own in most of them, not all'],
                ['compAnswerLift', 1, 12, 'an answer speaks up in the hole'],
                ['compLineDensity', 0.1, 0.116, 'a little thinner under the line'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.2, 0.5, 'the solo breathes between phrases'],
                ['leadShortShare', 0.6, 0.95, 'bebop: running eighth-note lines'],
                ['leadChordToneOnBeats', 0.72, 1, 'chord tones on the beats of a run'],
                ['leadChangeGuideTones', 0.6, 1, 'changes land on guide tones'],
                [
                    'leadChromaticApproach',
                    0.2,
                    0.6,
                    'out-of-scale half-step approaches and enclosures',
                ],
                ['leadStepShare', 0.55, 0.9, 'mostly stepwise, with arpeggio skips'],
                ['leadMeanInterval', 1.6, 3.2, 'lines, not leaps'],
                ['leadLeapShare', 0, 0.05, 'a wide leap is rare'],
                ['leadRepeatedNotes', 0, 0.03, 'no stuttering on one pitch'],
                ['leadOscillation', 0, 0.04, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.85, 1, 'phrases end on a chord tone'],
                ['leadArcRise', 1.6, 4, 'the solo builds: chorus 3 busier than chorus 1'],
                ['leadPeakIsTop', 0.9, 1, "the peak chorus holds the cycle's top note"],
                ['leadRange', 10, 24, 'an octave or more across a chorus'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.2 },
            claims: [['compRootLowest', 0.8, 1, 'the sparse comp keeps the root on the bottom']],
        },
    ],
});
