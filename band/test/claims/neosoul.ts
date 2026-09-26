import type { PitchedNote } from '../../core/types.js';
import type { ChordFacts } from '../../theory/chord.js';
import { mod12 } from '../../theory/pitch.js';
import { defineClaims, type Take } from '../critique/harness.js';

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
                // Measured 0.356. Against jazz walking's ~0.68: a half step into a change is a
                // choice here (half the sections, every phrase turn), not every change's habit;
                // at 0.76 it was a mannerism that wrote over the riffs' own endings.
                [
                    'bassChromaticApproach',
                    0.3,
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
            take: { lead: 'head' },
            claims: [
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
