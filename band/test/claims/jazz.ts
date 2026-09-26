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
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
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
            take: { trade: { with: 'drums', bars: 4, choruses: null } },
            claims: [
                ['tradeYourTurn', 1, 1, 'your four are yours: no sax, and the band keeps time'],
                ['tradeBandLaysOut', 1, 1, "the drummer's four are the drums alone"],
                ['tradeDrumsSolo', 0.95, 1, 'a solo, not the time, with the foot still going'],
                ['tradeDrumMotif', 0.9, 1, "the drummer's idea comes back an eighth later"],
                ['tradeDrumVerbatim', 0, 0.1, 'developed, not repeated'],
                ['tradeBackOnCrash', 1, 1, 'the band comes back in on a crash'],
            ],
        },
        {
            take: { trade: { with: 'lead', bars: 4, choruses: null } },
            claims: [
                ['tradeLeadPlays', 0.95, 1, 'the sax plays each of its fours through'],
                ['tradeYourTurn', 1, 1, 'then it lays out, and the band keeps comping for you'],
                ['leadShortShare', 0.6, 0.95, 'bebop lines in its fours'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Ablations measured on the solo take (answer off / no lay-out / no fill / no
                // floor): thin bars 0.19 (0.23 / 0.19 / 0.23 / 0.39), breath density 1.15 (0.87 /
                // 1.10 / 0.91 / 1.36), answers 0.48 (0.28 / 0.51 / 0.25 / 0.48), lift +3.1
                // (-5.0 / 2.4 / 2.2 / 3.1), line density 0.113 (0.119 / 0.119 / 0.113 / 0.096).
                // The first cut (lay-out 0.6, fill 0.7, no floor) left 41% of bars with one
                // strike and Brandon heard it thin (#1404 item 33).
                ['compThinBars', 0, 0.21, 'the time is kept: a bar of one strike is rare'],
                ['compBreathDensity', 1.1, 2, "the comper talks in the soloist's breaths"],
                ['compAnswersBreaths', 0.4, 0.7, 'a stab of its own in most of them, not all'],
                ['compAnswerLift', 1, 12, 'an answer speaks up in the hole'],
                ['compLineDensity', 0.1, 0.116, 'a little thinner under the line'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
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
