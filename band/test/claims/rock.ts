import { defineClaims } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

export const rock = defineClaims({
    takes: [
        {
            take: { colour: true },
            claims: [
                [
                    'compWrittenTension',
                    0.9,
                    1,
                    'a written 9th, 11th or b9 is in the chord the keys play',
                ],
            ],
        },
        {
            take: { colour: true, comp: 'guitar' },
            claims: [['compWrittenTension', 0.9, 1, 'and in the grip the guitar fingers']],
        },
        {
            take: {},
            claims: [
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (70, about half the 139 measured; a lead-in is a note within a beat of the change).
                ['bassApproachCount', 70, 10000, 'it does play half-step lead-ins into changes'],
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
                ['snareBackbeat', 0.9, 1, 'the backbeat is the song'],
                ['kickOnOne', 0.95, 1, 'the kick owns the one'],
                [
                    'kickConsistency',
                    0.75,
                    1,
                    'a section keeps its groove; it does not re-roll every bar',
                ],
                [
                    'bassArrivesOnBass',
                    0.9,
                    1,
                    'rock bass states the root (or slash note) on every change',
                ],
                ['bassNotesPerBeat', 1.2, 2.2, 'driving eighths at normal energy'],
                ['bassSixteenthSyncopation', 0, 0.05, 'no sixteenth syncopation in a rock bass'],
                ['compOffbeatShare', 0, 0.35, 'the comp sits on the beat'],
                ['compColour', 0, 0.15, 'triads and sevenths, not jazz extensions'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compUpstrokeShare', 0.1, 0.5, 'the strumming hand swings: some strokes come up'],
                ['compColour', 0, 0.15, 'open triads and sevenths, not jazz extensions'],
            ],
        },
        // The known standard's guide-tone head, on rock's own figures (#2122, `head.guide` in
        // `styles/rock.ts`): the pilot of a style overriding the shared ones.
        guideTonesTake({
            // Driving eighths: 3.08 notes a bar, against 2.72 on the shared figures (and 0.90
            // held a chord apiece). The floor sits between them, so it fails on the shared set.
            leadNotesPerBar: [2.9, 3.6, "a rock singer's eighths, busier than the shared figures"],
        }),
        {
            take: { lead: 'head' },
            claims: [
                // Bend-and-release (#2120, `LeadBook.release` 0.35). Measured 0.192 (0 with no
                // releases).
                ['leadBendReleases', 0.1, 0.4, 'a bend let back down: 4 → 5 → 4, b7 → root → b7'],
                ['leadArrivalReleaseOffRest', 0, 0, 'a phrase never ends on the let-down 4'],
                ['leadReleaseClimbs', 0, 0, 'the line goes on down from a let-down bend'],
                // Slides into the landings not bent (#2120, `LeadBook.slide` 0.2). Measured 0.133
                // on the head's few unbent landings.
                ['leadLandingSlides', 0.05, 0.3, 'a landing slid into now and then'],
                ['leadSlidesOffLanding', 0, 0, 'a slide aims at a landing, never a passing note'],
                // The head breathes at every phrase end (#2024): a beat after a four-bar phrase,
                // two after an eight-bar period. Measured 20 bars before (phrase into phrase),
                // 3.75 after. The ceiling is 6, not 8: with only the period's breath the head would
                // run 7.75 bars, so 6 fails if the four-bar phrase stops breathing.
                ['leadLongestRun', 0, 6, 'a breath at least every four bars'],
                ['compLeadUnison', 0, 0.15, 'the piano voices under the tune, rarely on its note'],
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the tune fills the form'],
                ['leadChordToneOnBeats', 0.8, 1, 'the melody sits on the chords'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Bend-and-release (#2120, `LeadBook.release` 0.35). Measured 0.189 (0 with no
                // releases).
                ['leadBendReleases', 0.1, 0.4, 'a bend let back down: 4 → 5 → 4, b7 → root → b7'],
                ['leadArrivalReleaseOffRest', 0, 0, 'a phrase never ends on the let-down 4'],
                ['leadReleaseClimbs', 0, 0, 'the line goes on down from a let-down bend'],
                // Slides into the landings not bent (#2120, `LeadBook.slide` 0.2). Measured 0.268.
                ['leadLandingSlides', 0.15, 0.45, 'a landing slid into, a position shift'],
                ['leadSlidesOffLanding', 0, 0, 'a slide aims at a landing, never a passing note'],
                ['compLeadUnison', 0, 0.15, 'the piano voices under the tune, rarely on its note'],
                // Measured 0.149; development off 0.040, #2012's bar fix reverted 0.067; always develops 0.26.
                // Floor sits between the bar fix reverted (0.067) and shipped: it guards #2012's bar fix and development off (0.040).
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.105,
                    0.21,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 100, 10000, 'enough phrase openings to judge the rate on'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.2, 0.5, 'the solo breathes'],
                ['leadChordToneOnBeats', 0.8, 1, 'pentatonic lines land on the chord'],
                ['leadChangeRootFifth', 0.45, 0.8, 'changes mostly land on 5ths and roots'],
                ['leadChangeGuideTones', 0.2, 0.55, 'with the 3rd for colour'],
                ['leadChromaticApproach', 0, 0.2, 'a rock player steps, rarely chromatically'],
                ['leadBendShare', 0.04, 0.3, 'bent landings'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadArcRise', 1.6, 4, 'the solo builds'],
                ['leadPeakIsTop', 0.85, 1, 'the peak chorus holds the top note'],
                ['leadRange', 11, 26, 'the solo climbs'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'phrases resolve'],
            ],
        },
    ],
});
