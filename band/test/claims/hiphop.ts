import type { DrumHit, PitchedNote } from '../../core/types.js';
import { STEP } from '../../players/grid.js';
import { defineClaims, type Take } from '../critique/harness.js';
import { guideTonesTake } from './guide-tones.js';

export const hiphop = defineClaims({
    metrics: {
        /**
         * The loop's second bar answers the first (S6): share of two-bar loop pairs (a
         * kick-bearing state bar immediately followed by its answer, both in the same
         * section visit) whose kick pattern actually differs. `drumLoopRepeat` only checks
         * that a bar repeats its own phase two bars later — it never checks that the *other*
         * phase brings a change, so a drummer who played the same bar twice would still pass
         * it.
         */
        answerBarKickDiffers: (takes: Take[]): number => {
            let n = 0;
            let diff = 0;
            for (const { timeline: t, events } of takes) {
                const kicksByBar = new Map<number, string>();
                for (const b of t.bars) {
                    if (b.meter.name !== '4/4') {
                        continue;
                    }
                    const steps = events
                        .filter(
                            (e): e is DrumHit =>
                                e.lane === 'drums' && e.bar === b.index && e.piece === 'kick',
                        )
                        .map((e) => Math.round((e.tick - b.start) / STEP))
                        .sort((x, y) => x - y)
                        .join(',');
                    if (steps) {
                        kicksByBar.set(b.index, steps);
                    }
                }
                for (const b of t.bars) {
                    if (b.meter.name !== '4/4' || b.barInVisit % 2 !== 0) {
                        continue;
                    }
                    const answer = t.bars[b.index + 1];
                    if (
                        !answer ||
                        answer.visit.ordinal !== b.visit.ordinal ||
                        answer.barInVisit !== b.barInVisit + 1
                    ) {
                        continue;
                    }
                    const state = kicksByBar.get(b.index);
                    const ans = kicksByBar.get(answer.index);
                    if (!state || !ans) {
                        // No kick at all in one of the pair (a drop ate it): not a loop pair
                        // to judge here — `dropKickSilent` judges the drop itself.
                        continue;
                    }
                    n++;
                    diff += state !== ans ? 1 : 0;
                }
            }
            return n ? diff / n : 0;
        },
        /**
         * The beat actually cuts out at a phrase's end (S6): share of a phrase's last 4/4
         * bars (with a drum part at all) whose kick is silent over its last beat — the drop.
         * `grooveBars` in the shared harness excludes exactly these bars from every other
         * drum claim, so nothing was asserting the drop itself happens. Checks the kick only
         * (not every piece): the "building into a louder section" case keeps a snare roll
         * there, but the kick still drops under it either way.
         */
        dropKickSilent: (takes: Take[]): number => {
            let n = 0;
            let silent = 0;
            for (const { timeline: t, events } of takes) {
                for (const b of t.bars) {
                    if (b.meter.name !== '4/4' || b.phrase.bar !== b.phrase.length - 1) {
                        continue;
                    }
                    const kicks = events
                        .filter(
                            (e): e is DrumHit =>
                                e.lane === 'drums' && e.bar === b.index && e.piece === 'kick',
                        )
                        .map((e) => Math.round((e.tick - b.start) / STEP));
                    if (!kicks.length) {
                        // No drums at all in this bar (the lane's off, or a low-energy phrase
                        // that plays no fill in the first place): nothing to judge.
                        continue;
                    }
                    n++;
                    silent += kicks.every((s) => s < 12) ? 1 : 0;
                }
            }
            return n ? silent / n : 0;
        },
        /**
         * T4's regression guard: of the answer-bar note pairs shaped like a slide's final
         * half-step (the note right before a barline root change sits exactly a semitone from
         * it — the grace's own signature, since `slide = target - sign(target - held)` is
         * always one semitone from `target`), the share where the note *before that* — the
         * held pitch the glide actually leaps from — is no more than a minor 3rd from the
         * arrival. A wide leap into the grace (the T4 bug: a tritone or a major 3rd) shows up
         * here as a wide `held`-to-arrival span even though the grace itself still measures
         * one semitone; a plain half-step-away arrival (no grace needed) also measures 1 and
         * is excluded by requiring a genuine `held` two positions back.
         */
        bassSlideLeap: (takes: Take[]): number => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                const bass = events
                    .filter((e): e is PitchedNote => e.lane === 'bass' && !e.muted)
                    .sort((a, b) => a.tick - b.tick);
                for (const b of t.bars) {
                    if (b.meter.name !== '4/4' || b.barInVisit % 2 !== 1) {
                        continue;
                    }
                    const next = t.bars[b.index + 1];
                    const nextFirst = next?.spans[0];
                    const thisChord = b.spans[b.spans.length - 1]?.chord;
                    if (
                        !nextFirst?.attack ||
                        !nextFirst.chord ||
                        !thisChord ||
                        nextFirst.chord.bass === thisChord.bass
                    ) {
                        continue;
                    }
                    const idx = bass.findIndex((e) => Math.abs(e.tick - next.start) < 1);
                    if (idx < 2) {
                        continue;
                    }
                    const graceDist = Math.abs(bass[idx].midi - bass[idx - 1].midi);
                    if (graceDist !== 1) {
                        continue;
                    }
                    n++;
                    const width = Math.abs(bass[idx].midi - bass[idx - 2].midi);
                    hit += width <= 3 ? 1 : 0;
                }
            }
            return n ? hit / n : 0;
        },
        /**
         * The hook loops: share of the lead's bars, played straight after another played bar,
         * that play the bar before's figure again (the same onsets, step for step). The shared
         * lead metrics measure a line's notes, not whether a figure comes round, and a sampled
         * hook is exactly a figure coming round.
         */
        leadFigureRepeats: (takes: Take[]): number => {
            let n = 0;
            let hit = 0;
            for (const { timeline: t, events } of takes) {
                const figure = new Map<number, string>();
                for (const e of events) {
                    if (e.lane === 'lead') {
                        const step = Math.round((e.tick - t.bars[e.bar].start) / STEP);
                        figure.set(e.bar, `${figure.get(e.bar) ?? ''}${step},`);
                    }
                }
                for (const [bar, steps] of figure) {
                    const before = figure.get(bar - 1);
                    if (before === undefined) {
                        continue;
                    }
                    n++;
                    hit += before === steps ? 1 : 0;
                }
            }
            return n ? hit / n : 0;
        },
    },
    takes: [
        // The known standard's guide-tone head, on hip hop's own figures (#2122, `head.guide` in
        // `styles/hiphop.ts`): a sparse sampled hook on the sixteenths.
        guideTonesTake(
            {
                // Two or three notes a bar: 2.20, against 2.71 on the shared figures (and 0.90 held
                // a chord apiece). The ceiling sits between them, so it fails on the shared set.
                leadNotesPerBar: [2, 2.5, 'a sparse hook, two or three notes a bar'],
                // 0.054 with the head capped at the book's solo top (`bookReach`, #2135: a hook
                // stays within a 6th of home). The pop song's 24-bar chorus sits at that cap,
                // so over F → C and G → Am the line can't climb on: the two voices cross
                // instead (A5 → E5, D5 → G5), a 4th apiece. A hook at the top of its range
                // crossing to its other voice is the line, not a leap; 0.07 still fails a line
                // that jumps.
                leadMoveOverThird: [0, 0.07, 'voice-led: a 4th where the hook meets its top'],
            },
            [
                // The hook's snap (1 and its "a") and its sixteenth pushes: 0.306 of the notes
                // on an "e" or an "a", against 0 on the shared straight-eighth figures.
                ['leadSixteenthOffbeats', 0.2, 0.45, 'the hook snaps on the sixteenths'],
            ],
        ),
        {
            take: {},
            claims: [
                // A ceiling on a ratio passes at 0 lead-ins, so the count has a floor (47, about half the 94 measured; a lead-in is a note within a beat of the change).
                ['bassApproachCount', 47, 10000, 'it does play half-step lead-ins into changes'],
                ['bassApproachLeap', 0, 0.05, 'a lead-in stays beside the note it leads to'],
                ['snareBackbeat', 0.95, 1, 'a hard snare on 2 and 4, every bar'],
                ['kickOnOne', 0.95, 1, 'the kick owns the One'],
                [
                    'kickSyncopation',
                    1,
                    2.75,
                    'boom-bap: kicks between the beats, never a busy double time',
                ],
                ['drumLoopRepeat', 0.9, 1, 'a beat is a loop: bars in a section repeat'],
                [
                    'answerBarKickDiffers',
                    0.6,
                    1,
                    'the loop’s second bar answers the first with a real change',
                ],
                ['dropKickSilent', 0.5, 1, 'the beat actually cuts out at a phrase’s end'],
                ['bassSlideLeap', 0.85, 1, 'the 808’s glide never leaps more than a minor 3rd in'],
                ['bassKickUnison', 0.75, 1, 'the sub is struck with the kick'],
                ['bassMeanPitch', 30, 38, 'a sub line in the lowest octave'],
                // 4 (a walking bass averages 3.74 — S5) so this claim actually distinguishes
                // the sub's long, held notes from a bass that keeps moving every beat.
                ['bassMeanSteps', 4, 16, 'long sub notes, held to the next kick'],
                ['bassArrivesOnBass', 0.95, 1, 'every change arrives on its root (or slash note)'],
                ['compColour', 0.6, 1, 'the sampled-jazz Rhodes: 9ths and 13ths'],
                ['compStrikesPerBar', 1, 3, 'a sparse loop: a chord or two a bar, never a pulse'],
                // Measured 0.048 (#2025), 1.000 before: the loop's Rhodes spreads a seventh
                // chord (a low shell, its colour stacked in 4ths), where it played the jazz
                // piano's rootless voicing note for note.
                [
                    'compSharedWithJazz',
                    0,
                    0.3,
                    "the record's own Rhodes chord, not the jazz piano's voicing",
                ],
                // Measured 55.3 (#2025), 60.4 with the one-hand voicing (the ceiling sits
                // midway). The floor: a left hand at C3–D3 on every chord would crowd the sub.
                ['compMeanLowest', 50, 57.5, 'a left-hand shell low under the chord'],
                // Measured 1.46 semitones (#2025), 0.65 with the one-hand voicing: a spread's
                // stack has fewer places to stand than a rootless voicing, so its top moves
                // more. 2.06 when a one-hand voicing after a spread was led to its left hand
                // (`compTopLeapAtChange`); the ceiling sits midway.
                ['compTopVoiceMotion', 0, 1.75, 'the top line led smoothly, hand by hand'],
                // Measured 0.164 (#2025), 0.004 with the one-hand voicing; 0.270 led voice for
                // voice from the bottom (the top dropping a 5th to a spread's left hand). The
                // ceiling sits midway. What is left is the spread's own: few places to stand
                // (a shell under B3, a stack within a 4th of it), so G7alt into Cm7 or F7 into
                // Bbmaj7 still leaps a 5th on top.
                [
                    'compTopLeapAtChange',
                    0,
                    0.22,
                    'the top line moves by step or skip at a change, led from the right hand',
                ],
            ],
        },
        {
            take: { comp: 'guitar' },
            claims: [
                [
                    'compStrikesPerBar',
                    1,
                    3.5,
                    'minimal: a couple of damped hits a bar, rarely strummed',
                ],
                ['compShort', 0.9, 1, 'every hit is damped at once, never let ring'],
                ['compColour', 0.5, 1, 'the jazzy 3-7-9 grip where a seventh chord allows'],
                ['compMeanLowest', 55, 67, 'a small grip on the top strings, far above the sub'],
            ],
        },
        {
            take: { lead: 'solo', comp: 'rhodes' },
            claims: [
                ['compLeadUnison', 0, 0.15, "the Rhodes leaves the guitar's note to the guitar"],
                // Measured 9.5 semitones (#2025): under a sounding line the spread closes up to
                // the one-hand rootless voicing; 14.5 when it stays spread over the line. The
                // ceiling sits midway.
                [
                    'compSpanUnderLead',
                    0,
                    12,
                    "under the guitar's line the Rhodes plays compact, out of its register",
                ],
                // Measured 0 (#2025). 0.089 when each strike chose its own hands, closing up
                // under the line on one and spreading again on the next; the ceiling sits
                // midway.
                [
                    'compHandsChangeInBar',
                    0,
                    0.045,
                    'a chord struck twice in a bar keeps its hands: spread, or closed up',
                ],
            ],
        },
        {
            take: { lead: 'head' },
            claims: [
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (in the figure's own rhythm, up to four), then moves. Measured
                // 0.009 with no stabs, 0.130 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'a one-note hook said in rhythm, then a turn'],
                // The head breathes at every phrase end (#2024). Measured 2.5 bars before and after:
                // its figures already leave room at each phrase end.
                ['leadLongestRun', 0, 8, 'never more than eight bars without a breath'],
                ['leadLongBreath', 0, 0.02, 'the hook never drops out for two bars'],
                ['leadRestShare', 0.15, 0.4, 'the hook, then a bar of beat'],
                ['leadInnerSpace', 0.28, 0.55, 'air inside the bar: a lick, then the beat'],
                ['leadNotesPerBar', 1.8, 3.2, 'a sparse hook'],
                ['leadChordToneOnBeats', 0.75, 1, 'the hook sits on the chords on the beats'],
                ['leadChangeGuideTones', 0.5, 0.85, "changes land on the Rhodes' 3rds and 7ths"],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'each lick rests on a chord tone'],
                ['leadLeapShare', 0, 0.05, 'no wide leaps inside a lick'],
                ['leadOscillation', 0, 0.05, 'no trilling back and forth'],
            ],
        },
        {
            take: { lead: 'solo' },
            claims: [
                // Repeated notes as a riff (#2024, `LeadBook.repeat`): a stabbed figure says one
                // pitch for a run of its notes (in the figure's own rhythm, up to four), then moves. Measured
                // 0.021 with no stabs, 0.111 now; the floor fails with the stabs off, the
                // ceiling is one note hammered.
                ['leadRepeatedNotes', 0.08, 0.2, 'a one-note hook said in rhythm, then a turn'],
                // Measured 0.305; development off 0.211, #2012's bar fix reverted 0.310; always develops 0.55.
                // Floor guards development off (0.211) only; this style barely sees the bar fix (0.310 vs 0.305), which blues, disco and rock guard.
                // Ceiling is midway to always developing; the openings floor keeps the rate from resting on a few.
                [
                    'leadMotifDevelopment',
                    0.26,
                    0.43,
                    "a phrase now and then says the last one's opening again",
                ],
                ['leadMotifOpenings', 120, 10000, 'enough phrase openings to judge the rate on'],
                ['leadLongBreath', 0, 0.12, 'breaths, not gaps: two empty bars are rare'],
                // Funk and rock riff at ~0.2 by this measure; the loop can only come round
                // between two line bars of a phrase, so hip hop's ceiling is near 0.3.
                ['leadPhraseLoop', 0.12, 0.6, 'the sampled hook comes round, whole'],
                ['leadFigureRepeats', 0.2, 0.45, 'and figures repeat bar to bar'],
                ['leadRestShare', 0.15, 0.4, 'whole bars left to the beat'],
                ['leadInnerSpace', 0.3, 0.6, 'lots of air inside the bar'],
                ['leadNotesPerBar', 1.8, 3.5, 'a sparse hook, not a solo'],
                ['leadChordToneOnBeats', 0.75, 1, 'the beats sit on the chord'],
                ['leadChangeGuideTones', 0.55, 0.9, "changes land on the Rhodes' 3rds and 7ths"],
                // A looped soul lick keeps its shape, octave and 6th leaps included, when it is moved whole
                // onto the next chord (the `loop` book option): a little more room than a line's 0.05.
                ['leadLeapShare', 0, 0.07, 'few wide leaps inside a lick'],
                ['leadOscillation', 0, 0.05, 'no mechanical trills'],
                ['leadPhraseEndsOnChordTone', 0.9, 1, 'licks end on a chord tone'],
                ['leadArcRise', 1.4, 4, 'the hook develops: busier by the third chorus'],
                ['leadPeakIsTop', 0.85, 1, 'the peak chorus holds the top note'],
            ],
        },
    ],
});
