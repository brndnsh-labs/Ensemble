import type { BandEvent } from '../../core/types.js';
import type { Timeline } from '../../form/timeline.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Take } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

const stepOf = (t: Timeline, e: BandEvent) => Math.round((e.tick - t.bars[e.bar].start) / STEP);
const ratio = (hits: number, total: number) => (total ? hits / total : 0);

export const bossa = defineClaims({
    metrics: {
        /**
         * Share of the lead's attacks in 4/4 bars struck on an eighth-note offbeat (an "and"):
         * the Jobim melody's syncopation, a note struck ahead of the beat and held across it.
         */
        leadOffbeatAttacks: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const e of events) {
                    if (e.lane !== 'lead' || t.bars[e.bar].meter.name !== '4/4') {
                        continue;
                    }
                    n++;
                    hit += stepOf(t, e) % 4 === 2 ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
        /**
         * Share of the lead's notes struck in a bar's last eighth that sound on over its
         * barline: the bossa anticipation, the next bar's note sung an eighth early and tied.
         */
        leadTiedOverBarline: (takes: Take[]) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                for (const e of events) {
                    if (e.lane !== 'lead') {
                        continue;
                    }
                    n++;
                    const bar = t.bars[e.bar];
                    const end = bar.start + bar.meter.barTicks;
                    hit += e.tick >= end - STEP * 2 && e.tick + e.dur > end ? 1 : 0;
                }
            }
            return ratio(hit, n);
        },
    },
    takes: [
        // The known standard's guide-tone head, on bossa's own figures (#2122, `head.guide` in
        // `styles/bossa.ts`): a Jobim melody's syncopation and long tones.
        guideTonesTake({}, [
            // 0.49 on bossa's figures, 0.30 on the shared ones (any eighth line's upbeats): the
            // floor sits between them, so the shared figures fail it.
            [
                'leadOffbeatAttacks',
                0.4,
                0.65,
                'the tune is struck on the "and"s, as the guitar\'s 3 + 3 + 2 is',
            ],
            // 0.071 on bossa's figures, 0.018 on the shared ones (whose one push is in one cell
            // of six): the floor sits between them.
            ['leadTiedOverBarline', 0.04, 0.15, "the next bar's note pushed and tied over"],
        ]),
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
            take: { lead: 'solo', comp: 'nylon' },
            claims: [['compLeadUnison', 0, 0.15, 'the guitar leaves the sax its note']],
        },
        {
            take: { lead: 'head' },
            claims: [
                // The head breathes at every phrase end (#2024): a beat after a four-bar phrase,
                // two after an eight-bar period. Measured 19.88 bars before (phrase into phrase),
                // 3.75 after. The ceiling is 6, not 8: with only the period's breath the head would
                // run 7.75 bars, so 6 fails if the four-bar phrase stops breathing. 3.75 with
                // pickups (#2164): the catch-breath before one, an eighth, is the phrase's breath.
                ['leadLongestRun', 0, 6, 'a breath at least every four bars'],
                // Pickups (#2164, `LeadBook.pickup`, head 0.3): of the phrases the tune enters,
                // the share entered on the last beat of the bar before. Measured 0.095 (0 on main,
                // and with pickups off; 0.292 picking up every phrase it can). Pushed arrivals
                // (`LeadBook.pushes` 0.7): 0.146 of the barlines the tune runs across are tied (0
                // on main, and with pushes off; 0.223 pushing every one it can).
                ['leadPhrasesStartEarly', 0.05, 0.25, 'the tune comes in early now and then'],
                ['leadBarlineTies', 0.1, 0.2, 'an arrival pushed over the barline'],
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
                // Pickups (#2164, `LeadBook.pickup` 0.3): measured 0.101 (0 on main, and with
                // pickups off; 0.417 picking up every phrase it can). Pushed arrivals
                // (`LeadBook.pushes` 0.7): 0.127 (0 on main, and with pushes off; 0.169 pushing
                // every barline it can).
                ['leadPhrasesStartEarly', 0.06, 0.3, 'a phrase now and then comes in early'],
                ['leadBarlineTies', 0.1, 0.15, 'an arrival pushed over the barline'],
                // Measured 0.099 since #2164 (0.135 before); development off 0.011 (0.040 before), #2012's bar fix reverted 0.079; always develops: too few openings.
                // Floor is midway between development off (0.040) and shipped: it guards development off. The bar fix (0.079 vs 0.135) is within about 2 sd here; blues, disco and rock guard it.
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.088,
                    0.25,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 80, 10000, 'enough phrase openings to judge the rate on'],
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
                // Measured 0.019 (0.034 on main): a phrase's pickup (#2164) steps into its first
                // note by the scale, as a bossa line does, and every one of those landings is one
                // more approached without a half step, while a pushed arrival is approached from
                // beat 4, a chord tone. The floor fails the half-step approach off (0.009; 0.014
                // with only the enclosures off).
                [
                    'leadChromaticApproach',
                    0.012,
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
