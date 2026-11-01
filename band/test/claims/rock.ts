import { defineClaims } from '../critique/harness.js';

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
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (65, about half the measured).
                ['bassApproachCount', 65, 10000, 'it does play half-step lead-ins into changes'],
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
        {
            take: { lead: 'head' },
            claims: [
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
                // Measured 0.149; development off 0.040, #2012's bar fix reverted 0.067; always develops 0.26.
                // Floor and ceiling sit between those; the openings floor keeps the rate from resting on a few.
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
