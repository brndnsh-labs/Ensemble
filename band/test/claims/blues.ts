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
    ],
});
