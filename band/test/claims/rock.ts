import { defineClaims } from '../critique/harness.js';

export const rock = defineClaims({
    takes: [
        {
            take: {},
            claims: [
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
                ['leadRestShare', 0, 0.15, 'the tune fills the form'],
                ['leadChordToneOnBeats', 0.8, 1, 'the melody sits on the chords'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
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
