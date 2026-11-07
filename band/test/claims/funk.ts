import { defineClaims } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

export const funk = defineClaims({
    takes: [
        // The known standard's guide-tone head, on funk's own figures (#2122, `head.guide` in
        // `styles/funk.ts`): a horn section's sixteenth pushes.
        guideTonesTake({}, [
            // The pushes land on the sixteenths: 0.361 of the notes on an "e" or an "a",
            // against 0 on the shared straight-eighth figures (so the floor fails without
            // funk's own). The ceiling is a line turned into a sixteenth run, not a head.
            [
                'leadSixteenthOffbeats',
                0.25,
                0.5,
                'the horn line pushes on the sixteenths, not the eighths',
            ],
        ]),
        {
            take: {},
            claims: [
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (18, about half the 37 measured; a lead-in is a note within a beat of the change).
                ['bassApproachCount', 18, 10000, 'it does play half-step lead-ins into changes'],
                // The riff's last note meets the next root as blues and reggae do (a leading tone
                // like Em9's B2 folds to sit beside the C2 it falls into, #2078); before that fold
                // 4 of 37 (0.108) dropped a major seventh into the change. Now measured 0; ceiling 0.05.
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
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
            take: { lead: 'solo', comp: 'clav' },
            claims: [['compLeadUnison', 0, 0.15, 'the clav leaves the horn its note']],
        },
        {
            take: { lead: 'head' },
            claims: [
                // The horn falls off a phrase's last note (#2120, `LeadBook.fall` 0.35). Measured
                // 0.399 (0 with no falls, the floor's failure); the ceiling is every phrase end
                // falling, a gimmick. Only there: 0.065 of all notes fall.
                ['leadPhraseEndFalls', 0.2, 0.6, 'the section falls off the end of a riff'],
                ['leadFallShare', 0, 0.15, 'a fall ends a phrase, never a note inside the line'],
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (sixteenths: beat 1 and its "a", then the and of 2), then moves. Measured
                // 0.006 with no stabs, 0.155 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'the horn riff punches one note, then moves'],
                // The head breathes at every phrase end (#2024). Measured 0.75 bars before and after:
                // its figures already leave room at each phrase end.
                ['leadLongestRun', 0, 8, 'never more than eight bars without a breath'],
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
                // The horn falls off a phrase's last note (#2120, `LeadBook.fall` 0.35). Measured
                // 0.330 (0 with no falls); 0.028 of all notes fall.
                ['leadPhraseEndFalls', 0.2, 0.5, 'the horn falls off the end of a phrase'],
                ['leadFallShare', 0, 0.1, 'a fall ends a phrase, never a note inside the line'],
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (sixteenths: beat 1 and its "a", then the and of 2), then moves. Measured
                // 0.009 with no stabs, 0.126 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'the horn riff punches one note, then moves'],
                // Measured 0.159; development off 0.039, #2012's bar fix reverted 0.142; always develops 0.37.
                // Floor guards development off (0.039) only; this style barely sees the bar fix (0.142 vs 0.159), which blues, disco and rock guard.
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.1,
                    0.27,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 130, 10000, 'enough phrase openings to judge the rate on'],
                // Measured 0.87 either way: the funk comp is a groove, not a conversation.
                ['compBreathDensity', 0.7, 1.0, 'the groove keeps its figure under the lead'],
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
