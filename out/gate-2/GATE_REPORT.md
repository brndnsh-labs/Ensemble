# Gate 2: voicings and rhythm

Drums, bass, and a blues piano. Nobody but you can hear these, so this report says what was built, what was measured, and what to listen for. Nothing here claims it sounds good.

Written 2026-11-14. Rewrite the files with `pnpm gate:2`.

## How to audition

Open the `.mid` files in Logic as you did for gate 1. Each has Drums (channel 10), Bass, and a Piano track (channel 2, program 0). All levels are after the 15% trim you chose at gate 1.

## The three questions

1. **Do the voicings sit in a good register, clear of the bass?**
2. **Do chord changes move smoothly, without jumps?**
3. **Is the comping rhythm varied and locked with the drums, or does it sound like a loop?**

## The files

| Files | What they are for |
|---|---|
| `pads-*.mid` (4) | Questions 1 and 2. The piano holds each chord with no comping rhythm, over drums and bass. The 12-bar, the jazz blues, the minor blues, the slow blues. |
| `level-low-0.30-seed1/2.mid` | The quiet book: a pad. Seed 1's figure is the Charleston held; seed 2's is one chord a bar. |
| `level-mid-0.55-seed1/2.mid` | The working book: chops and their answers. Seed 1's figure is chops on 2 and 4; seed 2's is the Charleston. |
| `level-high-0.85-seed1.mid`, `...-seed3.mid` | The hot book. Seed 1 is the boogie pump (every eighth, close position); seed 3 is stabs on the backbeats and their "and"s. |
| `12-bar-a-seed1..5.mid` | Question 3. Three choruses each. The section's figure differs by seed: chops, Charleston, the "and"s, 2 and the "and"s, Charleston. |
| `12-bar-a-seed1-no-bass.mid`, `...-piano-alone.mid` | Seed 1 again with the piano exposed. |
| `timed-3min-quick-change-e-seed1/2.mid` | The whole arc: quiet book, working book, hot book, and back. |
| `jazz-blues-f-seed1.mid` | Two chords a bar and a diminished chord: mid-bar changes, where the piano plays the new chord an eighth early. |
| `minor-blues-am-seed1.mid`, `slow-blues-g-seed1.mid`, `intro-and-tag-d-seed1.mid` | Other forms; the last has an intro and a written ending. |

## What to listen for

**Voicings (the pad files first)**

- The hand is rootless: a dominant is its 3rd and flat 7th with the 9th and 13th (A7 as C♯ F♯ G B). That puts a half-step rub in the middle of the hand. Is that the blues piano you want?
- A V going to a minor chord takes flat 9 and flat 13 (E7 into Am in the minor blues).
- The bottom of the hand averages about E4 and was never closer than a fourth to the bass in 200 takes.
- The top note moves by step at most changes. On the 12-bar this may read as static.
- In the pump the voicing changes to close position with the root (E G A C♯ for A7). Does the switch into and out of it sound like the same player?

**Rhythm**

- **Is the figure recognisable, and do the answers sound like answers?** Each section has one figure per level, every time it comes round. Each chorus draws two other figures to answer it. Each four-bar phrase is a plan such as "state, state, answer, return", chosen from six candidates.
- **The lean into a change.** About 4 changes in 10 are played an eighth early and tied over. When the hand leans in, a chop on beat 4 gives way to it. When it does not, the "and" of 4 is left empty so the old chord is never stabbed just before the new one. Natural, or too many?
- **The pump** is eight strikes a bar for whole choruses at high level, with no variation. Is that the groove, or does it need a break at the turnaround?
- **Locked with the drums?** By the numbers this is modest: see below.
- **Level.** The piano's stabs are written at 78 to 90 against a backbeat at 118, so it sits under the drums. Too far back?

## What the checks say

- `pnpm check`: 423 tests in 6.5 s.
- **Piano properties** (10), over the library and two stress charts (every chord quality; chords an eighth long, rests inside bars, eight chords a bar): nothing under the floor; every strike has its chord's third and seventh and every written alteration; no note the harmony rules out; every chord struck by a strike made of that chord; one hand (never more than five notes, none doubled, one chord at a time); the eighth before a change belongs to the chord coming, alone in its beat, and is not struck again on the beat; the top note never more than a sixth from its target over a four-minute jam; a section keeps its figure; quiet is sparser than loud; the last chord is the final chord, never early.
- I broke the voicing rules on purpose twice and the properties caught both.

**Scorecard** (`pnpm score`, 200 takes):

| Measure | Target | Result |
|---|---|---|
| Top voice at a change: holds / steps / small leaps / leaps over a 4th | leaps at most 22% | 22% / 73% / 5% / 0% |
| Mean top-voice movement | at most 3.5 semitones | 1.14 |
| Lowest note above the floor; closest to the bass | never under; at least 1 | 5 or more; 5 or more semitones |
| Chords carrying a 9th or 13th | 50% or more | 98% |
| Voicing faults (rubs, mud) | 2% or less | none |
| Strikes a bar: quiet / working / hot | 1 to 2 / 1.5 to 3.2 / 3 to 8 | 1.4 / 2.1 / 5.1 (hot is two shapes: about 3.4, or 8 for the pump) |
| Changes anticipated | 15% to 80% by take | 44% (the old piano: 35% to 60%) |
| Strikes with a kick or backbeat, against chance | above chance | 66% against 59% by chance; 77% of takes above chance |
| A bar's rhythm is the bar before again | 15% to 75% | 45% |
| A phrase is the phrase before again | 35% or less | 5% |
| A phrase is the same place last chorus again | 40% or less | 7% |
| Phrases with a shape (a bar returns, a bar differs) | 80% or more | 98% |
| Phrases that are one bar four times | 15% or less | 2% |
| Phrases whose opening bar never returns | 10% or less | none |

**Does choosing do anything?** On the same seeds, the chosen phrase plan against the first one drawn: phrases with a shape 99.7% against 86%; one bar four times 0.3% against 14%; the phrase before again 3.5% against 10%; with the drums 65% against 62%. Each weight was set to zero in turn and each moved its own measure. (These figures are from before the review fixes below, which moved the totals by a few points.)

## Known weaknesses

- **The lock with the drums is modest.** 7 points over chance on average, and about one take in four is at or under chance. That is by construction: a section whose own figure is the "and"s sits between the backbeats. The chooser only picks among answers; it does not change the section's figure.
- **The voicing is greedy.** Each chord is led from the one before with no look ahead. A pull now turns the hand round before it leaves its part of the keyboard, but there is no planned top line.
- **The pump has no variation**, by the old band's rule that a groove takes no answers.
- **Nothing answers a soloist yet.** The chooser already reads the soloist's notes; laying out under a lead and filling its gaps comes with stage 3.
- **The seven answer figures are new.** Each is one of the notes' figures with a strike moved or left out. They are marked in `packages/styles/src/blues/chords.ts`.
- **4/4 only.** Other meters get the held chords.

## How it was built and checked

- Opus built the voicing engine; Fable built the rhythm; I reviewed both, wrote the properties, and made the fixes below.
- An independent Opus review then rendered its own charts (22 charts, 10 kinds of take, 6 seeds) and read them against the notes.

**Found by the review and fixed, each behind a property first**

- **Two chords struck at once** when a chord lasts exactly an eighth and another follows (legal chart writing: `| C7 . . . . . . G7 | C7 |`). A chord written for an eighth or less is now played where it is written and never leaned past.
- **The pump walked the hand up nearly an octave** over a long jam, to C6, and it never came back. The register now has a reach (a major third either side of the target); past it each semitone costs more than a smooth move saves.
- **"A quick A7 right before the E7"**: with a chop on beat 4 and a lean on the "and", the old chord and the new one were an eighth apart. This is the old band's KF-B-27. The chop now gives way.
- **Two measures could not fail** (the pump holding for a phrase; a drum-lock floor set under chance). The first is gone; the second is now measured against chance.
- **Four of my properties were weaker than their names.** They now require a strike made of the right chord, no doubled notes, and they see eighth-long chords and rests inside bars.

**Held up under the review**: every random draw keyed by its place; an open jam extended by a pass leaves earlier notes unchanged; silence under N.C., in the count-in and the tail; no push into the ending, a rest, or another meter; 3/4 and 6/8 play held chords; a section keeps its figure; the figures and levels match the notes.

**Not reached by the review**: bars of 16 slots; key changes beyond one chart; the feel layer's effect on note lengths.

## Decisions made on the way (also in `DECISIONS.md`)

- The hand leans into a barline change with the tier's chance whether or not the figure has a strike on the "and" of 4. The notes' blues rule only pushed a strike that was already there; with that rule a section that chops 2 and 4 never leans in, and the overall rate the notes ask for is out of reach.
- The pump plays through a barline it does not lean into, on the old chord. The rule against stabbing the outgoing chord is about a lone stab; a pump's light "and" is the tail of its beat.
- High level anticipates about 55% of changes, not the old band's 73%.
