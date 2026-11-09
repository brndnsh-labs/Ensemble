import type { PitchedNote } from '../../core/types.js';
import { STEP } from '../../players/grid.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { defineClaims, type Take } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

const ratio = (hits: number, total: number) => (total ? hits / total : 0);

/** Every two-note comp strike, with the chords it sounds over (its onset's and its end's). */
function dyads(takes: Take[]) {
    const out: { notes: PitchedNote[]; chords: ChordFacts[] }[] = [];
    for (const { timeline: t, events } of takes) {
        const strikes = new Map<number, PitchedNote[]>();
        for (const e of events) {
            if (e.lane === 'comp' && !e.muted) {
                strikes.set(e.tick, [...(strikes.get(e.tick) ?? []), e]);
            }
        }
        const chordAt = (tick: number) =>
            t.spans.find((s) => s.start <= tick && tick < s.end)?.chord ?? null;
        for (const [tick, notes] of strikes) {
            if (notes.length !== 2) {
                continue;
            }
            const end = tick + Math.min(...notes.map((n) => n.dur)) - 1;
            const chords = [chordAt(tick), chordAt(end)].filter((c): c is ChordFacts => !!c);
            out.push({ notes: [...notes].sort((a, b) => a.midi - b.midi), chords });
        }
    }
    return out;
}

export const neosoul = defineClaims({
    metrics: {
        /**
         * Of the lead's phrase entries (its first note, and each after a beat or more of
         * silence), the share struck off the beat: a line that comes in behind the bar.
         */
        leadLateEntries: (takes: Take[]): number => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                let end = Number.NEGATIVE_INFINITY;
                for (const e of events) {
                    if (e.lane !== 'lead') {
                        continue;
                    }
                    if (e.tick - end >= STEP * 4) {
                        n++;
                        hit += Math.round((e.tick - t.bars[e.bar].start) / STEP) % 4 ? 1 : 0;
                    }
                    end = Math.max(end, e.tick + e.dur);
                }
            }
            return n ? hit / n : 0;
        },
        /** Of the half-step arrivals at a change of bass note, the share led in from below. */
        bassApproachFromBelow: (takes) => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                const bass = events.filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted);
                for (const [k, span] of t.spans.entries()) {
                    const before = t.spans[k - 1]?.chord;
                    if (!span.chord || !before || before.bass === span.chord.bass) {
                        continue;
                    }
                    const i = bass.findIndex((e) => Math.abs(e.tick - span.start) < 1);
                    const step = i >= 1 ? bass[i].midi - bass[i - 1].midi : 0;
                    if (Math.abs(step) === 1) {
                        n++;
                        hit += step === 1 ? 1 : 0;
                    }
                }
            }
            return ratio(hit, n);
        },
        /** Share of double-stops that are a 3rd or a 6th (a 10th counts as a 3rd). */
        dyadSweetShare: (takes) => {
            const all = dyads(takes);
            const sweet = all.filter(({ notes: [lo, hi] }) =>
                [3, 4, 8, 9].includes(mod12(hi.midi - lo.midi)),
            );
            return ratio(sweet.length, all.length);
        },
        /** Share of double-stops carrying a guide tone (3rd, 7th/6th) of a chord they sound over. */
        dyadGuideShare: (takes) => {
            const all = dyads(takes);
            const guided = all.filter(({ notes, chords }) =>
                chords.some((c) => notes.some((n) => c.guides.includes(mod12(n.midi - c.root)))),
            );
            return ratio(guided.length, all.length);
        },
    },
    takes: [
        // The known standard's guide-tone head, on neo-soul's own figures (#2122, `head.guide` in
        // `styles/neosoul.ts`): a lazy vocal line, sixteenth anticipations and late entries.
        guideTonesTake(
            {
                // 0.060 with the head capped at the book's solo top (`bookReach`, #2135; the
                // guitar's, a half step under its top). The pop song's 24-bar chorus sits at
                // that cap, so over C and G → C the line can't climb on: it turns on the triad
                // instead (G5 → B5 → C6 → G5), a major 3rd up and a 4th back down. A line
                // turning on the chord at the top of its range is the line, not a leap; 0.08
                // still fails a line that jumps.
                leadMoveOverThird: [
                    0,
                    0.08,
                    'voice-led: a 3rd or 4th where the line meets its top',
                ],
            },
            [
                // 0.405 of the notes on an "e" or an "a" (the swing at 45 drags them), against 0
                // on the shared straight-eighth figures; the ceiling is a run, not a sung line.
                [
                    'leadSixteenthOffbeats',
                    0.25,
                    0.55,
                    'the line anticipates and drags on the sixteenths',
                ],
                // 0.655 of its phrases come in off the beat, against 0.480 on the shared
                // figures: the floor sits between them.
                ['leadLateEntries', 0.58, 1, 'a phrase comes in late, behind the beat'],
            ],
        ),
        {
            take: {},
            claims: [
                [
                    'snareBackbeatOrLate',
                    0.95,
                    1,
                    'the backbeat on 2 and 4 in every bar, the 4 displaced or not',
                ],
                [
                    'snareLateFour',
                    0.05,
                    0.3,
                    'some sections displace the 4 to its "e" as a turnaround; most play it straight',
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
                // Measured 0.356 before #2007, 0.29 after. Not a regression: A2 sharing the A's riff
                // pick leaves fewer independent draws, so the four-seed mean swings with the seeds:
                // 0.33 to 0.44 over four other four-seed sets, 0.385 over sixteen seeds. The floor
                // sits under that spread; the lead-in switched off reads 0.205. Against jazz
                // walking's ~0.68: a half step into a change is a choice here (half the sections,
                // every phrase turn), not every change's habit; at 0.76 it was a mannerism that
                // wrote over the riffs' own endings.
                [
                    'bassChromaticApproach',
                    0.25,
                    0.6,
                    'some changes are led into by a half step; many are carried by the riff',
                ],
                // Measured 0.79 (0.24 before the lead-ins chose a side: register geometry put
                // three in four on the b9 above the target).
                [
                    'bassApproachFromBelow',
                    0.6,
                    0.95,
                    'a half step into a root slides up from below far more than it falls',
                ],
                ['compColour', 0.6, 1, 'lush voicings: 9ths, 13ths, 6/9s'],
                // Measured 0.048 (#2025): the Rhodes spreads a seventh chord across two hands,
                // a low shell under its colour in 4ths. 0.988 before, when it borrowed the jazz
                // piano's rootless voicing note for note; the rest are the changes it still
                // plays compact (an altered dominant has no 4ths to stack) and lands the same.
                [
                    'compSharedWithJazz',
                    0,
                    0.3,
                    "its own voicings: on a seventh chord it rarely plays the jazz piano's notes",
                ],
                // Measured 54.5 (#2025): the spread's shell stands in the octave under middle C,
                // against 59.2 with the one-hand voicing (the ceiling sits midway). The floor:
                // a left hand at C3–D3 on every chord would sit on the bass's register.
                ['compMeanLowest', 50, 56.5, 'a left hand low under the chord, off the bass'],
                [
                    'compNotesInScale',
                    0.99,
                    1,
                    'every colour tone is in the chord scale (one authority)',
                ],
                // Measured 0.218. The Rhodes' strikes are bar-end eighths and the few a later
                // strike cuts; before the pre-change re-strike played the new chord it stabbed
                // the old one for a sixteenth (0.289).
                [
                    'compShort',
                    0,
                    0.25,
                    'held for beats, not stabbed: only a bar-end strike is an eighth',
                ],
                [
                    'compOffbeatShare',
                    0.5,
                    0.9,
                    'lazily syncopated: re-strikes on the "e"s and "a"s',
                ],
                ['compTopVoiceMotion', 0, 3, 'smooth voice leading'],
                // Measured 0.164 (#2025), 0.004 with the one-hand voicing. Led voice for voice
                // from the bottom, a one-hand voicing after a spread met its left hand and the
                // top dropped a 5th (0.271); the ceiling sits midway. What is left is the
                // spread's own: it has few places to stand (a shell under B3, a stack within a
                // 4th of it), so G7alt into Cm7 or F7 into Bbmaj7 still leaps a 5th on top.
                [
                    'compTopLeapAtChange',
                    0,
                    0.22,
                    'the top line moves by step or skip at a change, led from the right hand',
                ],
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
                // Measured 0.807 (0.26 when the pair was the top two strings or the 3-7 shell,
                // a jazz guide-tone pair: tritones, 4ths and 5ths).
                [
                    'dyadSweetShare',
                    0.7,
                    1,
                    'Curtis/Isley double-stops: 3rds and 6ths picked out of the grip',
                ],
                // Measured 0.967 (0.79 when an upstroke's pair was its top two strings, whatever
                // they were: 13 and #9 over a 7#9 names nothing).
                [
                    'dyadGuideShare',
                    0.9,
                    1,
                    'a double-stop names its chord: it carries the 3rd or the 7th',
                ],
                // Measured 0.606. The floor sits above 0.50, what the guitar measures when a
                // triad whose scale owns the 6/9 falls back to the plain close chord (0.04 with
                // every grip plain).
                [
                    'compColour',
                    0.55,
                    0.8,
                    'the chord hits are extended (add9s, 9ths, 13ths); the double-stops are 3rds and 6ths',
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
        {
            take: { lead: 'solo', comp: 'rhodes' },
            claims: [
                // Measured 0.001 (#2025): the Rhodes keeps under the line now
                // (`compAboveLead`); 0.037 when it was led over and across it.
                ['compLeadUnison', 0, 0.15, "the Rhodes leaves the guitar's note to the guitar"],
                // Measured 0.001 (#2025): under a live phrase the whole voicing sits a whole
                // step or more under the guitar's lowest note over it. 0.050 with that rule off
                // (the voicing led from wherever the last stood, a voice on the line moved off
                // it alone), 0.059 before (a compact voicing led from a spread's right hand);
                // the ceiling sits midway. Strikes topping out at G5 or higher under the line:
                // 13 before, 10 with the rule off, 0 with it (the bossa's Dm7b5 as Ab4 C5 F5 G5
                // over a guitar at F4, then C4 F5 G5 Ab5).
                ['compAboveLead', 0, 0.025, "the Rhodes sits under the guitar's line, not over it"],
                // Measured 0.039 (#2025). 0.146 when the hands follow each bar's lead alone,
                // opening up in any bar the guitar rests (no bar of silence before it), 0.185
                // decided against the lead over each chord's strikes, 0.134 before; the
                // ceiling sits midway. What is left is the phrase's edge: the hands close up as
                // the line comes in, and the top comes down under it.
                [
                    'compTopLeapAtChange',
                    0,
                    0.09,
                    'the top line moves by step or skip at a change under the solo too',
                ],
                // Measured 0.007 (#2025): the hands follow the guitar's phrase, open in a bar of
                // its silence, closed while it plays. 0.148 following each bar's lead alone,
                // 0.187 each chord's, 0.246 each strike's (the top flipping an octave on
                // alternate downbeats under a two-note-a-bar line); the ceiling sits midway.
                [
                    'compHandsFlip',
                    0,
                    0.075,
                    "the hands change at the solo's phrase edges, not strike to strike",
                ],
                // Measured 0 (#2025): the hands are chosen for the whole bar. 0.158 when each
                // strike chose its own, closing up under the line on one and spreading again on
                // the next; the ceiling sits midway.
                [
                    'compHandsChangeInBar',
                    0,
                    0.07,
                    'a chord struck twice in a bar keeps its hands: spread, or closed up',
                ],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                // The head breathes at every phrase end (#2024): a beat after a four-bar phrase,
                // two after an eight-bar period. Measured 16.56 bars before (phrase into phrase),
                // 3.75 after. The ceiling is 6, not 8: with only the period's breath the head would
                // run 7.75 bars, so 6 fails if the four-bar phrase stops breathing.
                ['leadLongestRun', 0, 6, 'a breath at least every four bars'],
                ['leadLongBreath', 0, 0.02, 'the tune never drops out for two bars'],
                ['leadRestShare', 0, 0.15, 'the tune fills the form'],
                ['leadNotesPerBar', 2, 4.5, 'a vocal line, not a run'],
                ['leadInnerSpace', 0.08, 0.35, 'air inside the bar: phrases placed off the beat'],
                ['leadChordToneOnBeats', 0.75, 1, 'the tune sits on the harmony on the beats'],
                ['leadChangeGuideTones', 0.55, 0.95, 'a change lands on its 3rd or 7th, or colour'],
                ['leadChromaticApproach', 0, 0.1, 'a tune steps into its chords'],
                [
                    'leadPhraseEndsOnChordTone',
                    0.95,
                    1,
                    'phrases rest on a chord tone, or on the next chord an eighth early',
                ],
                ['leadLeapShare', 0, 0.06, 'no wide leaps inside a phrase'],
                ['leadRepeatedNotes', 0, 0.07, 'the line moves'],
                ['leadOscillation', 0, 0.05, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Measured 0.144; development off 0.016, #2012's bar fix reverted 0.103; always develops 0.43.
                // Floor is midway between development off (0.016) and shipped: it guards development off. The bar fix (0.103 vs 0.144) is within about 2 sd here; blues, disco and rock guard it.
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.08,
                    0.29,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 100, 10000, 'enough phrase openings to judge the rate on'],
                // Answer off / no lay-out: breath density 1.19 (0.92 / 0.93), lift +4.0 (-3.2 /
                // -; -2.0 with no lift), line density 0.134 (0.172 / 0.172).
                ['compBreathDensity', 1.05, 2, 'the Rhodes leans back under the line'],
                ['compAnswerLift', 1, 12, 'and speaks up in its breaths'],
                ['compLineDensity', 0.1, 0.155, 'held chords under the singer, fewer re-strikes'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                ['leadRestShare', 0.22, 0.5, 'space is the style: more room than any other lead'],
                ['leadThirdBend', 0.12, 0.5, 'a half-step slide into the 3rd, often'],
                ['leadInnerSpace', 0.12, 0.4, 'room inside the bar: late entries, held notes'],
                ['leadNotesPerBar', 2.2, 4.5, 'short lyrical phrases, never a stream'],
                ['leadShortShare', 0.5, 0.85, 'quick flicks, then a held note'],
                ['leadChordToneOnBeats', 0.75, 1, 'the beats sit on the chord'],
                ['leadChangeGuideTones', 0.55, 0.95, 'changes land on the 3rd or 7th, or colour'],
                ['leadChromaticApproach', 0.08, 0.4, 'a chromatic grace note into a target'],
                ['leadBendShare', 0.01, 0.15, 'the half-step slide into a 3rd, sparingly'],
                ['leadMeanInterval', 2, 3.8, 'pentatonic steps and 3rds'],
                ['leadLeapShare', 0, 0.05, 'a wide leap is rare'],
                ['leadRepeatedNotes', 0, 0.05, 'no stuttering on one pitch'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'phrases end on a chord tone'],
                ['leadArcRise', 1.5, 4, 'the solo builds'],
                ['leadPeakIsTop', 0.85, 1, 'the peak chorus holds the top note'],
                ['leadRange', 10, 24, 'an octave or more across a chorus'],
            ],
        },
    ],
});
