import { defineClaims } from '../critique/harness.js';

export const bossa = defineClaims({
    takes: [
        {
            take: {},
            claims: [
                ['claveRim', 0.9, 1, 'the cross-stick plays the bossa clave'],
                ['kickOnOne', 0.95, 1, 'the surdo on one'],
                ['bassKickUnison', 0.7, 1, 'the bass doubles the surdo rhythm'],
                ['bassArrivesOnBass', 0.9, 1, 'root on the arrival'],
                ['compColour', 0.5, 1, 'ninths on the comp'],
                ['compTopVoiceMotion', 0, 3.5, 'smooth voice leading'],
            ],
        },
        {
            take: { comp: 'nylon' },
            claims: [
                ['compColour', 0.5, 1, 'ninths in the grips'],
                ['compTopVoiceMotion', 0, 3.5, 'the grips move by step, not by leap'],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'a Jobim song form: the tune fills it'],
                ['leadNotesPerBar', 2, 4, 'a lyrical tune: two to four notes a bar, long ones'],
                ['leadShortShare', 0.15, 0.5, 'sung notes: most of the tune is held, not run'],
                [
                    'leadChordToneOnBeats',
                    0.75,
                    1,
                    'the tune sits on the harmony on the beats; colour passes between',
                ],
                ['leadChangeGuideTones', 0.6, 1, 'each change lands on its 3rd or 7th'],
                ['leadChromaticApproach', 0, 0.1, 'a tune steps into its chords'],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                [
                    'leadPhraseEndsOnChordTone',
                    0.9,
                    1,
                    'phrases rest on a chord tone (the maj7, the 6th, a written 9th)',
                ],
                ['leadOscillation', 0, 0.04, 'no trilling back and forth'],
                ['leadBendShare', 0, 0.08, 'straight tone: a scoop is rare'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.15, 0.45, 'cool is spare: the solo leaves air'],
                [
                    'leadShortShare',
                    0.35,
                    0.65,
                    'long notes among the eighths, not a bebop torrent (jazz: 0.6 up)',
                ],
                ['leadStepShare', 0.5, 0.85, 'soft lines, stepping into their landings'],
                ['leadMeanInterval', 1.6, 3.2, 'lines, not leaps'],
                ['leadLeapShare', 0, 0.05, 'a wide leap is rare'],
                [
                    'leadChordToneOnBeats',
                    0.72,
                    1,
                    "chord tones on the beats, the chord scale's colour between",
                ],
                ['leadChangeGuideTones', 0.6, 1, 'changes land on the 3rd or 7th'],
                [
                    'leadChromaticApproach',
                    0.03,
                    0.25,
                    'a half-step approach now and then, well under bebop',
                ],
                ['leadRepeatedNotes', 0, 0.04, 'no stuttering on one pitch'],
                ['leadOscillation', 0, 0.04, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.88, 1, 'phrases end on a chord tone'],
                ['leadArcRise', 1.5, 4, 'the solo builds: chorus 3 busier than chorus 1'],
                ['leadPeakIsTop', 0.9, 1, "the peak chorus holds the cycle's top note"],
                ['leadBendShare', 0, 0.08, 'straight tone: a scoop is rare'],
            ],
        },
    ],
});
