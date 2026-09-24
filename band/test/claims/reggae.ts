import { defineClaims } from '../critique/harness.js';

export const reggae = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['dropOnThree', 0.9, 1, 'kick and cross-stick land together on 3 in every riddim'],
                ['kickOnOne', 0, 0.35, 'the One is a hole: only the high-energy riddims fill it'],
                ['bassOnOne', 0.15, 0.75, 'the bass leaves the One open as often as it plays it'],
                ['bassMeanPitch', 32, 42, 'a heavy line in the lowest octave'],
                ['bassSilence', 0.2, 0.6, 'melodic, with space: the rests are part of the line'],
                [
                    'bassArrivesOnBass',
                    0.9,
                    1,
                    'a chord that gets a note on its arrival gets its root',
                ],
                ['compOnOneAndThree', 0, 0.05, 'the skank leaves 1 and 3 to the bass and the drop'],
                ['compShort', 0.9, 1, 'the skank is a chop, damped at once'],
                ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                ['kickOnOne', 0, 0.02, 'a quiet one drop never kicks the One'],
                ['dropOnThree', 0.9, 1, 'the drop stays, softer'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compOnOneAndThree', 0, 0.05, 'the skank never chops on 1 or 3'],
                ['compShort', 0.9, 1, 'the fretting hand damps the chop at once'],
                ['compMeanLowest', 55, 67, 'a small grip on the top strings, far above the bass'],
                [
                    'compStrikesPerBar',
                    1.8,
                    4.5,
                    'two chops a bar, doubled or on every "and" when it lifts',
                ],
                ['compColour', 0, 0.15, 'triads and sevenths, no extensions'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.9 },
            claims: [
                // Bracketed near the real ~1.22 rather than left slack down to 1: the "ands" skank is
                // only 2 of 5 weight at high tier, so a regression that quiets just its own 2-and-4
                // chop is diluted by the still-correct plain/double bars and would slip past a claim
                // that only demanded "at least as loud" (>= 1).
                [
                    'compBackbeatVelocityRatio',
                    1.15,
                    1.4,
                    '2 and 4 are louder than the rest of the hand, not just tied with it',
                ],
                ['compBackbeat24Coverage', 0.9, 1, '2 and 4 are chopped in nearly every bar'],
            ],
        },
        {
            take: { comp: 'organ' },
            claims: [
                // Was [0.95, 1]: a tautology once the 2-and-4 chop (T1) is deliberately ON the beat.
                // The bubble itself is still almost entirely offbeat; the chop is the one exception,
                // so this drops but stays high, and a regression either way (an on-beat bubble, or a
                // missing chop pushing it back toward 1) would fail it.
                [
                    'compOffbeatShare',
                    0.75,
                    0.95,
                    'the bubble lives between the beats; the 2-and-4 chop is its one exception',
                ],
                ['compShort', 0.9, 1, 'the bubble is chopped, never held'],
                // Replaces the old compStrikesPerBar range (a tautology: it just restated the count
                // the code already produced, and would have failed the correct e-&-a bubble anyway).
                ['compOnOneAndThree', 0, 0.05, 'nothing on 1 and 3, same as the skank'],
            ],
        },
        {
            take: { comp: 'organ', intensity: 0.6 },
            claims: [
                [
                    'compEAndAMotion',
                    0.95,
                    1,
                    'every beat gets the full e-&-a cell: felt, chord, felt',
                ],
            ],
        },
    ],
});
