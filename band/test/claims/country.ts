import { defineClaims } from '../critique/harness.js';

export const country = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                [
                    'snareBackbeat',
                    0.9,
                    1,
                    'the chick on 2 and 4 (snare, or cross-stick when quiet)',
                ],
                ['kickOnOne', 0.95, 1, 'the boom on the One'],
                [
                    'ghostsPerBar',
                    1,
                    5,
                    'train-beat sections keep the snare going between backbeats',
                ],
                ['bassRootFifth', 0.9, 1, 'boom-chick bass: the root on 1, the fifth on 3'],
                ['bassWalkUps', 0.2, 0.6, 'walk-ups step into the new root at many changes'],
                ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its bass note'],
                ['bassNotesPerBeat', 0.5, 0.75, 'two booms a bar, plus walks'],
                ['compBackbeatShare', 0.6, 1, 'the piano answers the boom on 2 and 4'],
                ['compColour', 0, 0.1, 'triads and sixths, not jazz ninths'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                // T11: the old bracket just pinned the constructed 0.5 of two half notes a bar — a
                // regression guard on the ballad's note count, kept honest as that (not as "no walks":
                // the real claim for that is `bassWalkUps` below, which the tier gate keeps at exactly
                // 0 by construction — a walk needs a beat-3/4 pair that low energy never writes).
                [
                    'bassNotesPerBeat',
                    0.45,
                    0.55,
                    'regression guard: two half notes a bar, nothing else',
                ],
                ['bassWalkUps', 0, 0, 'the ballad two-beat: the energy gate keeps walk-ups out'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compBackbeatShare', 0.6, 1, 'the chick: strums on 2 and 4'],
                [
                    'compMeanLowest',
                    50,
                    56,
                    'open-position grips on the top four strings, off the bass',
                ],
                ['compColour', 0, 0.1, 'open triads, not jazz extensions'],
            ],
        },
        {
            take: { comp: 'guitar', bass: false },
            claims: [
                [
                    'compBoomChick',
                    0.9,
                    1,
                    'bass-strum: the pick plays root on 1, fifth on 3, down low',
                ],
                ['compBackbeatShare', 0.6, 1, 'and strums the chick on 2 and 4'],
                // I3: with no bassist the pick is the only voice left to play the walk-up (measured
                // ~0.21 — lower than the bass's own ~0.3, since the guitar has no "new section"
                // probability bump and the low-register read can miss a walk note that climbs near 52).
                [
                    'compWalkUps',
                    0.15,
                    0.45,
                    'walks lead into at least some changes when there is no bass',
                ],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the tune fills the form'],
                ['leadChordToneOnBeats', 0.8, 1, 'the melody sits on the chords'],
                ['leadChangeGuideTones', 0.4, 0.8, 'the major 3rd marks most changes'],
                ['leadChromaticApproach', 0, 0.1, 'a tune steps into its chords'],
                ['leadBendShare', 0.06, 0.3, 'even the tune curls up into its 3rds'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases resolve'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.15, 0.45, 'the solo breathes'],
                [
                    'leadShortShare',
                    0.65,
                    0.95,
                    "chicken-pickin': clipped notes and double-time runs",
                ],
                [
                    'leadInnerSpace',
                    0.15,
                    0.4,
                    'staccato: a cluck of silence after the picked notes',
                ],
                [
                    'leadBendShare',
                    0.03,
                    0.2,
                    'bent landings: the curl into the 3rd, a pedal-steel bend',
                ],
                ['leadChangeGuideTones', 0.4, 0.8, 'the major 3rd marks most changes'],
                ['leadChangeRootFifth', 0.2, 0.55, 'the root the other landing'],
                [
                    'leadChromaticApproach',
                    0.03,
                    0.25,
                    'the half step below a landing: the curl, the chromatic walk',
                ],
                ['leadChordToneOnBeats', 0.8, 1, 'the beats sit on the chord'],
                ['leadLeapShare', 0, 0.05, 'licks, not leaps'],
                ['leadRepeatedNotes', 0, 0.06, 'a repeated pick now and then, no stutter'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.88, 1, 'licks end on a chord tone'],
                ['leadArcRise', 1.6, 4, 'the solo builds to double time'],
                ['leadPeakIsTop', 0.9, 1, 'the peak chorus holds the top note'],
                ['leadRange', 11, 26, 'the solo climbs the neck'],
            ],
        },
    ],
});
