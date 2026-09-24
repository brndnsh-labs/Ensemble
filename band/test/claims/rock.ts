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
    ],
});
