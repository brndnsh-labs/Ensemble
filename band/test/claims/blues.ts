import { defineClaims } from '../critique/harness.js';

export const blues = defineClaims({
    takes: [
        {
            take: {},
            claims: [
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
                // The blues figure leaves little room for a stab of its own, so the piano answers by
                // laying out under the licks: breath density 1.02 (0.86 with the answer off), line
                // density 0.132 (0.157).
                ['compBreathDensity', 0.95, 2, "call and response: the piano in the guitar's gaps"],
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
    ],
});
