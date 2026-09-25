import { defineClaims } from '../critique/harness.js';

export const jazz = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['rideOnBeats', 0.9, 1, 'the ride carries the time on every beat'],
                ['hatPedal24', 0.9, 1, 'hi-hat foot on 2 and 4'],
                ['bassNotesPerBeat', 0.85, 1.05, 'a walking line: one note per beat'],
                ['bassArrivesOnBass', 0.75, 1, 'the walk lands on the chord (a 3rd now and then)'],
                ['bassChromaticApproach', 0.3, 0.8, 'half-step approaches lead into changes'],
                ['bassRepeatedNotes', 0, 0.02, 'the walk keeps moving: no repeated pitches'],
                ['bassMeanLeap', 1.5, 4.5, 'mostly stepwise, not arpeggio leaps'],
                ['compOffbeatShare', 0.4, 1, 'comping pushes on the "and"s'],
                ['compColour', 0.6, 1, 'rootless voicings carry 9ths and 13ths'],
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
                    'two-feel: half notes, with an occasional approach on 4',
                ],
                [
                    'bassHeldNotesAreChordTones',
                    0.97,
                    1,
                    'a held half note is a chord tone, never a passing tone',
                ],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                ['compOffbeatShare', 0, 0.2, 'four to the bar: the guitar marks the beats'],
                ['compLongShort', 1.5, 3, 'long-short: 1 and 3 held a little, 2 and 4 crisp'],
                ['compStrikesPerBar', 3, 4.2, 'one stroke per beat'],
                [
                    'compRootLowest',
                    0.8,
                    1,
                    'the root on the bottom string, doubling the walking bass',
                ],
                ['compMeanLowest', 40, 52, 'the chunk sits low (roots on the 6th and 5th strings)'],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadRestShare', 0, 0.15, 'the head is a tune: it fills the form'],
                ['leadNotesPerBar', 2, 4.5, 'a singable line, not a run'],
                ['leadChordToneOnBeats', 0.75, 1, 'the tune sits on the harmony on the beats'],
                ['leadChangeGuideTones', 0.7, 1, 'each change lands on its 3rd or 7th'],
                [
                    'leadChromaticApproach',
                    0,
                    0.1,
                    'a tune steps into its chords, not chromatically',
                ],
                ['leadPhraseEndsOnChordTone', 0.95, 1, 'phrases come to rest on a chord tone'],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                ['leadRepeatedNotes', 0, 0.07, 'the line moves'],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadRestShare', 0.2, 0.5, 'the solo breathes between phrases'],
                ['leadShortShare', 0.6, 0.95, 'bebop: running eighth-note lines'],
                ['leadChordToneOnBeats', 0.72, 1, 'chord tones on the beats of a run'],
                ['leadChangeGuideTones', 0.6, 1, 'changes land on guide tones'],
                [
                    'leadChromaticApproach',
                    0.2,
                    0.6,
                    'out-of-scale half-step approaches and enclosures',
                ],
                ['leadStepShare', 0.55, 0.9, 'mostly stepwise, with arpeggio skips'],
                ['leadMeanInterval', 1.6, 3.2, 'lines, not leaps'],
                ['leadLeapShare', 0, 0.05, 'a wide leap is rare'],
                ['leadRepeatedNotes', 0, 0.03, 'no stuttering on one pitch'],
                ['leadOscillation', 0, 0.04, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.85, 1, 'phrases end on a chord tone'],
                ['leadArcRise', 1.6, 4, 'the solo builds: chorus 3 busier than chorus 1'],
                ['leadPeakIsTop', 0.9, 1, "the peak chorus holds the cycle's top note"],
                ['leadRange', 10, 24, 'an octave or more across a chorus'],
            ],
        },
        {
            take: { comp: 'guitar', intensity: 0.2 },
            claims: [['compRootLowest', 0.8, 1, 'the sparse comp keeps the root on the bottom']],
        },
    ],
});
