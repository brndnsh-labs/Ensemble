import { defineClaims } from '../critique/harness.js';

export const hiphop = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['snareBackbeat', 0.95, 1, 'a hard snare on 2 and 4, every bar'],
                ['kickOnOne', 0.95, 1, 'the kick owns the One'],
                [
                    'kickSyncopation',
                    1,
                    2.75,
                    'boom-bap: kicks between the beats, never a busy double time',
                ],
                ['drumLoopRepeat', 0.9, 1, 'a beat is a loop: bars in a section repeat'],
                ['bassKickUnison', 0.75, 1, 'the sub is struck with the kick'],
                ['bassMeanPitch', 30, 38, 'a sub line in the lowest octave'],
                ['bassMeanSteps', 3, 16, 'long sub notes, held to the next kick'],
                ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its root (or slash note)'],
                ['compColour', 0.6, 1, 'the sampled-jazz Rhodes: 9ths and 13ths'],
                ['compStrikesPerBar', 1, 3, 'a sparse loop: a chord or two a bar, never a pulse'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                [
                    'compStrikesPerBar',
                    1,
                    3.5,
                    'minimal: a couple of damped hits a bar, rarely strummed',
                ],
                ['compShort', 0.9, 1, 'every hit is damped at once, never let ring'],
                ['compColour', 0.5, 1, 'the jazzy 3-7-9 grip where a seventh chord allows'],
                ['compMeanLowest', 55, 67, 'a small grip on the top strings, far above the sub'],
            ],
        },
    ],
});
