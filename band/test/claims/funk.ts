import { defineClaims } from '../critique/harness.js';

export const funk = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['snareBackbeat', 0.9, 1, 'the backbeat is hit hard'],
                ['kickOnOne', 0.95, 1, 'on the One'],
                ['ghostsPerBar', 1, 5, 'ghost notes around the backbeat'],
                ['kickConsistency', 0.75, 1, 'the groove repeats'],
                ['bassSixteenthSyncopation', 0.1, 0.6, 'sixteenth-note syncopation in the bass'],
                ['bassKickUnison', 0.35, 1, 'bass and kick lock together'],
                ['compOffbeatShare', 0.6, 1, 'stabs live off the beat'],
                ['compShort', 0.9, 1, 'stabs are short'],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compScratchShare', 0.3, 0.8, 'the hand never stops: scratches between the stabs'],
                ['compStrikesPerBar', 8, 16, 'a sixteenth-note hand'],
                ['compOffbeatShare', 0.6, 1, 'the stabs live off the beat'],
                ['compColour', 0.5, 1, 'the 3-7-9 grip where a seventh chord allows'],
                ['compShort', 0.9, 1, 'a chank is staccato: the hand lets go at once'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.2 },
            claims: [['compShort', 0.9, 1, 'stabs stay staccato with no scratch between them']],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadRestShare', 0, 0.15, 'the riff tune fills the form'],
                ['leadShortShare', 0.8, 1, 'clipped sixteenths'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'figures end on a chord tone'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadRestShare', 0.2, 0.55, 'space around the figures'],
                ['leadShortShare', 0.8, 1, 'short, clipped notes'],
                ['leadChordToneOnBeats', 0.72, 1, 'the beats sit on the chord'],
                ['leadChangeGuideTones', 0, 0.45, 'roots and fifths mark the changes'],
                ['leadLeapShare', 0, 0.05, 'riffs, not leaps'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'figures end on a chord tone'],
            ],
        },
    ],
});
