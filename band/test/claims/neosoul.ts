import { defineClaims } from '../critique/harness.js';

export const neosoul = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                [
                    'snareBackbeatOrLate',
                    0.95,
                    1,
                    'the backbeat on 2 and 4 in every bar, the 4 dragged or not',
                ],
                [
                    'snareLateFour',
                    0.05,
                    0.3,
                    'some sections drag the 4 a sixteenth late; most play it straight',
                ],
                ['kickOnOne', 0.95, 1, 'the loop starts on the One'],
                ['kickConsistency', 0.9, 1, 'loop-like: a section keeps its kick pattern'],
                // Paired with the low-energy take's near-zero: energy is what adds the ghosts.
                [
                    'ghostsPerBar',
                    2.5,
                    4.5,
                    "ghosted e's and a's around the backbeat above quiet energy",
                ],
                ['bassSixteenthSyncopation', 0.25, 0.6, 'the line enters on the "e"s and "a"s'],
                ['bassSilence', 0.15, 0.45, 'rests are part of the line'],
                ['bassMeanPitch', 31, 38, 'a deep line, at the bottom of the neck'],
                ['bassArrivesOnBass', 0.95, 1, 'the chord tone on every change: its bass note'],
                [
                    'bassChromaticApproach',
                    0.5,
                    0.9,
                    'changes are led into by a half step in pitch, from wherever the line is near',
                ],
                ['compColour', 0.6, 1, 'lush voicings: 9ths, 13ths, 6/9s'],
                [
                    'compNotesInScale',
                    0.99,
                    1,
                    'every colour tone is in the chord scale (one authority)',
                ],
                [
                    'compShort',
                    0,
                    0.4,
                    'held for beats, not stabbed: only a bar-end strike is an eighth',
                ],
                [
                    'compOffbeatShare',
                    0.5,
                    0.9,
                    'lazily syncopated: re-strikes on the "e"s and "a"s',
                ],
                ['compTopVoiceMotion', 0, 3, 'smooth voice leading'],
            ],
        },
        {
            take: { intensity: 0.2 },
            claims: [
                // Against the default take's 2.5+: a quiet loop is backbeat only, energy adds ghosts.
                // Two things hold it at zero here — the low tier writes no ghosts, and below 0.35 the
                // backbeat moves to the cross-stick, which carries none — so it fails only when both go.
                [
                    'ghostsPerBar',
                    0,
                    0.5,
                    'a quiet section plays no ghosts: energy is what adds them',
                ],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                [
                    'compDoubleStopShare',
                    0.5,
                    0.85,
                    'Curtis/Isley: pairs picked out of the grip held',
                ],
                [
                    'compColour',
                    0.2,
                    0.5,
                    'the chord hits are extended; the double-stops are guide tones',
                ],
                [
                    'compNotesInScale',
                    0.99,
                    1,
                    'every colour tone is in the chord scale (one authority)',
                ],
                [
                    'compStrikesPerBar',
                    2,
                    4.5,
                    'sparse: a chord hit and a few pairs a bar, no chatter',
                ],
                [
                    'compUpstrokeShare',
                    0.2,
                    0.6,
                    'the sixteenth pendulum: the "e"s and "a"s come up',
                ],
                [
                    'compMeanLowest',
                    55,
                    64,
                    'the middle of the neck, off the bass, under the singer',
                ],
            ],
        },
    ],
});
