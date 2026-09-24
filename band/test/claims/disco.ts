import { defineClaims } from '../critique/harness.js';

export const disco = defineClaims({
    takes: [
        {
            take: {},
            claims: [
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
                ['compOnOneAndThree', 0, 0.05, "the stabs leave the kick's beats alone"],
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
                ['compColour', 0, 0.1, 'plain triads and sevenths when quiet, the 9ths come later'],
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
                    14,
                    16,
                    'the hand never stops: a stroke on nearly every sixteenth',
                ],
                ['compOffbeatShare', 0.9, 1, 'the chops land off the beat; the beat is scratched'],
                ['compMeanLowest', 60, 68, "small grips high on the neck, above funk's (~57)"],
                [
                    'compUpstrokeShare',
                    0.03,
                    0.2,
                    'a sixteenth pendulum: chops come down, only the light pickups come up',
                ],
            ],
        },
    ],
});
