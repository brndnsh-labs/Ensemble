import type { PitchedNote } from '../../core/types.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Metric } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

const metrics = {
    /**
     * Share of the 4/4 bars the lead strikes in that leave beat 4 silent (#2122): the call
     * sung, then the beat the band answers in. A note counts as sounding in beat 4 if it is
     * held more than half a sixteenth into it (the lead's lean is a few ticks).
     */
    leadBeatFourOpen: (takes) => {
        let n = 0;
        let hit = 0;
        for (const { timeline: t, events } of takes) {
            const lead = events.filter((e): e is PitchedNote => e.lane === 'lead');
            for (const bar of t.bars) {
                if (bar.meter.name !== '4/4') {
                    continue;
                }
                const beat4 = bar.start + STEP * 12 + STEP / 2;
                const end = bar.start + STEP * 16;
                if (!lead.some((e) => e.bar === bar.index)) {
                    continue;
                }
                n++;
                hit += lead.some((e) => e.tick < end && e.tick + e.dur > beat4) ? 0 : 1;
            }
        }
        return n ? hit / n : 0;
    },
} satisfies Record<string, Metric>;

export const blues = defineClaims({
    metrics,
    takes: [
        // The known standard's guide-tone head, on the blues's own figures (#2122).
        guideTonesTake(
            {
                // A call and room: 2.39 notes a bar, against 2.74 on the shared figures. The
                // ceiling sits between them, so it fails on the shared set.
                leadNotesPerBar: [
                    2.1,
                    2.6,
                    "a blues singer's call, sparser than the shared figures",
                ],
            },
            [
                // Measured 0.765; 0.237 on the shared figures, whose endings alone breathe on 4.
                // The floor sits between them.
                ['leadBeatFourOpen', 0.5, 1, 'the call leaves beat 4 to the band'],
            ],
        ),
        {
            take: {},
            claims: [
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (150, about half the 301 measured; a lead-in is a note within a beat of the change).
                ['bassApproachCount', 150, 10000, 'it does play half-step lead-ins into changes'],
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
                ['snareBackbeat', 0.95, 1, 'the backbeat on 2 and 4, every bar'],
                ['kickOnOneAndThree', 0.95, 1, 'the kick grounds 1 and 3'],
                [
                    'cymbalEighths',
                    0.9,
                    1,
                    'the shuffle: the cymbal on every eighth, never a sixteenth',
                ],
                ['kickConsistency', 0.75, 1, 'a section keeps its shuffle'],
                [
                    'bassArrivesOnBass',
                    0.8,
                    1,
                    'the box starts on the root (a 2nd bar turns from the b7)',
                ],
                ['bassSixthOnDominants', 0.15, 0.35, 'the boogie box rocks through the 6th'],
                [
                    'bassLopeRepeatsBeat',
                    0.95,
                    1,
                    'the lope re-strikes the beat; it never moves on the "and"',
                ],
                [
                    'bassChromaticApproach',
                    0.15,
                    0.4,
                    'a change resolves by a half step in pitch, not just pitch class (B1)',
                ],
                ['compColour', 0.5, 1, 'rootless 9ths and 13ths over the dominants'],
                ['compOffbeatShare', 0.3, 0.8, 'stabs and pushes on the "and"s'],
                ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                [
                    'bassNotesPerBeat',
                    0.45,
                    0.75,
                    'two-feel: root and fifth, an approach on 4 now and then',
                ],
                ['bassRepeatedNotes', 0, 0.05, 'no lope at low energy'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compOnBackbeat', 0.5, 0.9, 'the chop sits on 2 and 4 with the snare'],
                ['compColour', 0, 0.2, "plain 7th and 6th grips, not the piano's 9ths and 13ths"],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.2 },
            claims: [
                ['compShort', 0.9, 1, 'the chop on 2 and 4 is damped at once, never let ring'],
            ],
        },
        {
            take: { comp: 'guitar', bass: false },
            claims: [
                [
                    'compBoogieDyads',
                    0.8,
                    1,
                    'Jimmy Reed: root under the 5th on 1 and 3, the 6th (or b7) on 2 and 4',
                ],
            ],
        },
        {
            take: { comp: 'organ' },
            claims: [
                [
                    'compStrikesPerBar',
                    1,
                    1.6,
                    'a held pad strikes only on a chord change or push, not the shuffle figure',
                ],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                // Bend-and-release (#2120, `LeadBook.release` 0.4): of the bends a quarter or
                // longer, the share let back down. Measured 0.271 (0 with no releases): inside a
                // phrase only when the line goes on below the bent pitch, at a phrase end only
                // onto the blue third or the b7.
                [
                    'leadBendReleases',
                    0.15,
                    0.5,
                    'the guitar bends the blue third up and lets it cry back',
                ],
                ['leadArrivalReleaseOffRest', 0, 0, 'a phrase ends on the blue third or the b7'],
                ['leadReleaseClimbs', 0, 0, 'the line goes on down from a let-down bend'],
                // Slides into the landings not bent (#2120, `LeadBook.slide` 0.25). Measured 0.373.
                ['leadLandingSlides', 0.2, 0.55, 'a landing slid into from a few frets away'],
                ['leadSlidesOffLanding', 0, 0, 'a slide aims at a landing, never a passing note'],
                // The head breathes at every phrase end (#2024). Measured 3 bars before and after:
                // its figures already leave room at each phrase end.
                ['leadLongestRun', 0, 8, 'never more than eight bars without a breath'],
                ['compLeadUnison', 0, 0.15, "the piano leaves the guitar's note to the guitar"],
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0.15, 0.4, 'a call, then a bar of room for the band to answer'],
                ['leadChordToneOnBeats', 0.8, 1, 'the call sits on the chord on the beats'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'each call comes to rest on a chord tone'],
                ['leadBendShare', 0.08, 0.35, 'bent into the blue third and the root'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Bend-and-release (#2120, `LeadBook.release` 0.4). Measured 0.240 (0 with no
                // releases; a phrase's arrival never releasing was too rare to hear, one in eight
                // choruses).
                ['leadBendReleases', 0.12, 0.45, 'a bend let back down, the blues cry'],
                ['leadArrivalReleaseOffRest', 0, 0, 'a phrase ends on the blue third or the b7'],
                ['leadReleaseClimbs', 0, 0, 'the line goes on down from a let-down bend'],
                // Slides into the landings not bent (#2120, `LeadBook.slide` 0.25). Measured 0.260.
                ['leadLandingSlides', 0.15, 0.45, 'a landing slid into from a few frets away'],
                ['leadSlidesOffLanding', 0, 0, 'a slide aims at a landing, never a passing note'],
                ['compLeadUnison', 0, 0.15, "the piano leaves the guitar's note to the guitar"],
                // Measured 0.134; development off 0.061, #2012's bar fix reverted 0.071; always develops 0.40.
                // Floor sits between the bar fix reverted (0.071) and shipped: it guards #2012's bar fix and development off (0.061).
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.1,
                    0.27,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 120, 10000, 'enough phrase openings to judge the rate on'],
                // 1.0 is no response (the comp as busy in the breaths as under the line), so the floor
                // sits above it: breath density 1.29 (0.94 with the answer off), line density 0.138
                // (0.165).
                ['compBreathDensity', 1.1, 2, "call and response: the piano in the guitar's gaps"],
                ['compLineDensity', 0.1, 0.145, 'the piano thins under the licks'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.2, 0.5, 'the solo leaves space between licks'],
                ['leadChordToneOnBeats', 0.75, 1, 'blue notes pass; the beats are the chord'],
                ['leadChangeGuideTones', 0.4, 0.85, 'a 3rd or 7th marks most changes'],
                ['leadBendShare', 0.04, 0.3, 'a guitarist bends its landings'],
                ['leadStepShare', 0.5, 0.9, "licks move by step and by the scale's thirds"],
                ['leadLeapShare', 0, 0.05, 'no wide leaps inside a lick'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.88, 1, 'licks end on a chord tone'],
                ['leadArcRise', 1.6, 4, 'the solo builds'],
                ['leadPeakIsTop', 0.85, 1, 'the peak chorus holds the top note'],
            ],
        },
        // The blues on a horn (a sax lead, the jump-blues tenor) falls off a phrase end now and
        // then, mostly where the chorus closes (#2120, `LeadBook.fall` 0.3, `fallDraw`).
        {
            take: { lead: 'head', leadInstrument: 'sax' },
            claims: [
                // Measured 0.160 (0 with no falls; 0.420 at the first cut's 0.45, a tic).
                ['leadPhraseEndFalls', 0.08, 0.35, 'the tenor sighs off the end of a phrase'],
                ['leadFallsInsideLine', 0, 0, 'a fall ends a phrase, never a note inside the line'],
                // Measured 0.750; drawn without the section-end weight 0.471.
                ['leadFallsAtSectionEnd', 0.6, 1, 'the falls close the chorus'],
                // 1.000 when the fall was drawn per phrase rather than per ending figure.
                ['leadHeadFallsDiffer', 0, 0, 'a section played again falls where it fell'],
                // A horn's scoop is not a bend it can let down.
                ['leadBendReleases', 0, 0, 'a horn never releases a bend'],
            ],
        },
        {
            take: { lead: 'solo', leadInstrument: 'sax' },
            claims: [
                // Measured 0.221 (0 with no falls; 0.506 at the first cut's 0.45, a tic).
                ['leadPhraseEndFalls', 0.12, 0.35, 'the tenor sighs off the end of a phrase'],
                ['leadFallsInsideLine', 0, 0, 'a fall ends a phrase, never a note inside the line'],
                // Measured 0.443; drawn without the section-end weight 0.235.
                ['leadFallsAtSectionEnd', 0.35, 1, 'the falls close the chorus'],
                // Measured 0.083; 0.351 with no damping after a fall (the first cut ran five).
                ['leadFallsBackToBack', 0, 0.2, 'never falling off phrase after phrase'],
            ],
        },
    ],
});
