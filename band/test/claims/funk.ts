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
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the riff tune fills the form'],
                ['leadShortShare', 0.8, 1, 'clipped sixteenths'],
                ['leadInnerSpace', 0.5, 0.85, 'rests inside every bar: the space is the groove'],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'figures end on a chord tone'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadInnerSpace', 0.4, 0.8, 'space around the figures inside the bar'],
                ['leadShortShare', 0.8, 1, 'short, clipped notes'],
                ['leadChordToneOnBeats', 0.72, 1, 'the beats sit on the chord'],
                ['leadChangeRootFifth', 0.45, 0.8, 'roots and fifths mark the changes'],
                ['leadLeapShare', 0, 0.05, 'riffs, not leaps'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadArcRise', 1.6, 4, 'the solo builds'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'figures end on a chord tone'],
            ],
        },
    ],
});
