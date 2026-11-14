# Gate 1: does it groove?

Stage 1 of `docs/MILESTONES.md`: foundation, drums, and bass, playing the blues. I cannot hear any of this. What follows is what was built, what the checks say, and what to listen for.

## How to audition

Copy the `.mid` files in this folder to the laptop and open each in a new Logic project. Each file has a tempo track with markers, a Drums track (channel 10, General MIDI notes), and a Bass track (program 32, acoustic bass). Every take starts with one bar of count-in on the side stick.

To make more: `pnpm -s ensemble render library/<chart> --out take.mid [--seed N] [--passes P | --minutes M] [--tempo BPM] [--energy 0..1] [--key K] [--no-count-in]`. The same chart, options, and seed always give the same file. `pnpm gate:1` rewrites this folder.

| Files | What they are |
|---|---|
| `12-bar-a-{72,100,132}bpm-seed{1,2,3}.mid` | 12-bar blues in A, three choruses, at three tempos. The same seed is the same performance at each tempo (see "Known weaknesses"). |
| `minor-blues-am-seed{1,2,3}.mid` | Minor blues in A minor, three choruses, 90 bpm. |
| `timed-3min-quick-change-e-seed{1,2,3}.mid` | Quick-change blues in E, asked for 3 minutes: 7 choruses and the ending, 3:11. |
| `level-quiet-0.25`, `level-low-0.38`, `level-mid-0.55`, `level-high-0.85-seed{1,2}` | One level held for two choruses each, so each part of the vocabulary can be heard alone. The jams above never go quiet, so the quiet band is only here. |
| `jazz-blues-f-seed1.mid` | Two chords to a bar and a ii-V turnaround, 140 bpm. |
| `intro-and-tag-d-seed1.mid` | A written intro (played once, quiet) and a written ending in place of the band's own. |

What each jam does, by chorus (m = mid, h = high; "+ride" where the shuffle moves to the ride):

| Take | Choruses |
|---|---|
| 12-bar in A and minor blues, seed 1 | 1: m · 2: h +ride · 3: m then h, +ride |
| seed 2 | 1: m · 2: h +ride · 3: m then h, on the hat |
| seed 3 | 1: m · 2: h on the hat · 3: m then h, +ride |
| Timed 3 minutes, seed 1 | 1 to 3: m, rising · 4: m then h · 5: h +ride (the peak) · 6: m (the breath) · 7: m then h, +ride, ending |
| Timed 3 minutes, seeds 2 and 3 | the same shape, on the hat throughout |
| Level 0.85, seeds 1 and 2 | 1: h on the hat · 2: h +ride |

## What to listen for

The gate's four questions, then the specific things the people who built each part were least sure of.

**1. Does the shuffle feel like a shuffle?**

- Every offbeat eighth is placed on the last note of a triplet (swing 100, your setting from the old band). The bass sits 2 ms behind the drums.
- The lope: the hat's "and" of 2 and "and" of 4 are played at 80% of the other offbeats, so the shuffle circles in two beats.
- Is a ride chorus a lift, or a different band? This is new: the old band only reached the ride on a written repeat, so a looping 12-bar never did. Here each hot chorus chooses hat or ride and commits.
- Fills are new writing, not the old band's (which had no written blues fills). Do the one-beat fills ("four-AND", "DA-da-DA", "crack-boom") read as fills with the backbeat intact? Do the two-beat ones into a new chorus sound like one drummer? Are quarter-note kicks under them too square?
- There is a crash at the top of every chorus and another on bar 9 (after the fill at the end of bar 8). Too many?

**2. Is the bass choosing good notes and approaching changes well?**

- **Register, most of all.** Kept exactly as the old band had it: roots from E1 to A2, pulled toward a home between C2 and E2. In A the line starts on A1, and after the D7 bars it settles on A2 and climbs to G3. If that is too high for a shuffle, it is one line of data (`register` in `packages/styles/src/blues/bass.ts`).
- The drop on beat 4: when the box's last note is a step from the next root but far above it, the note is moved down beside the root (`E2 G#2 B2 C#2 | D2`). Does that drop of a seventh read as a lead-in or a stumble? The old band did this too.
- How often it leads in. Above the quiet level the lead-in rates are mine, not the old band's: 3 changes in 10 at mid, 5 in 10 at high, more at the top of a chorus. Listen for the chromatic note from above into the IV, and between V and IV. Is high too busy?
- Each chorus has its own lead-ins while the rhythm figure stays. One bassist varying, or should a chorus's lead-ins repeat?
- The quiet two-feel (`level-quiet`, `level-low`): root and fifth, with a beat-4 approach about one change in three.
- Minor blues: the pentatonic box on the i, and E7 turning at its b7 with G# leading back to A.

**3. Does the timed jam build and then land a convincing ending?**

- The build is mostly a change of part (the bass lopes on every beat, the drums add ghost notes and may ride), plus about 10 steps of velocity on the backbeat between the quietest and loudest chorus. The old band's loudness range was known to be narrow; I kept its numbers. If the build is underwhelming, say so: the arc's depth and the velocity range are both data.
- The ending: the bar before gets the biggest fill; the last bar's turnaround is not played; the band strikes the I9 on the downbeat (crash and kick, the bass on its lowest root) and lets it ring for the rest of that bar and one more. The bass walks down to the low root (`A2 C#3 E3 E2 | A1`).
- No ritard. Your "fancy metronome at its core" comment from July is why; the brief lists a ritard as an option and the tempo track can carry one if you want it.

**4. Does the file open cleanly in Logic?**

I could not test this. Please check: separate tracks; the right tempo; drums mapped sensibly on a GM kit; whether section markers ("A", "Last pass", "Ending") appear; whether the chord symbols (written as text events on the tempo track) are visible anywhere or just clutter. I will adjust to whatever Logic does.

## What the checks say

`pnpm check`: typecheck and lint clean; 407 tests pass in 4.2 s of the 10 s budget.

- **Chart format**: a 380-row corpus covering every example in the spec, a round trip over the corpus and library (including each library chart through all twelve keys and back), and a fuzz property.
- **Musical properties** (24), over all eight library charts, 8 seeds, four kinds of take: identical output for identical input, down to the MIDI bytes; a timed jam is a whole number of passes, the closest to the time asked; a jam that ends lands on the tonic with the bass on its lowest root; extending an open jam changes nothing already played; a broken chart still plays (all 380 corpus rows are rendered); nothing rings past the end; nothing pitched under a rest; the bass stays between E1 and A3, one note at a time, never leaps more than an octave, states every change, and resolves every stepwise lead-in by step in real pitch; blues offbeats land on the triplet; kick on 1 and 3 and backbeat on 2 and 4 in every bar of time; nothing ever on the last sixteenth of a beat; an arrival is one crash with a kick under it and no second cymbal.
- **Golden takes**: two, both blues.

`pnpm score` (200 takes over the 8 charts; the critic arrived early, from stage 2):

| Measure | Target | Result |
|---|---|---|
| Kick on 1; backbeat on 2 and 4; a section keeps its groove | 95%, 95%, 75% or more | 100% of takes in target |
| Fills that are triplets | 15% to 50% | 34% of all fills; 89% of takes in target |
| Two fills in a row the same | 10% or less | never |
| Changes stated by the bass | 80% or more | every change, every take |
| Changes approached by a half step | 15% to 40% | 29% overall; 76% of takes in target (the lowest are quiet takes, which approach less) |
| Stepwise lead-ins that land a leap away | 5% or less | never |
| Sixths over dominant chords, above the quiet level | 15% to 35% | 22% overall; 78% of takes in target (the lowest are minor blues, where the rule against the sixth applies) |
| Notes per beat when quiet | 0.45 to 0.75 | 0.56; all in target |

These say the rules hold. They do not say it grooves.

## Known weaknesses

- **The band is tempo-blind.** The same seed plays the same notes at 72 and 132 bpm. The old band was the same and recorded it as a weakness. Tell me if a pattern that works at 100 is wrong at one of the extremes.
- **A one-section form has little chorus-to-chorus variety at one level.** A groove belongs to its section (the old band's most-tested lesson), and a 12-bar blues is one section, so two mid choruses differ only in fills and bass lead-ins. If it sounds like a loop, the levers are which choices are held per pass instead of per section.
- **Only 4/4 is idiomatic.** Other meters play something plain and correct.
- **No chords and no soloist yet** (stages 2 and 3).
- **Nothing reads the other player yet**: the blues bass does not follow the kick (the old one did not either).
- **Review status.** The chart parser was reviewed adversarially by a second agent, and its findings were fixed. The same kind of review of drums, bass, and planner was cut short by this session's quota; anything it found is listed at the end of this report, not yet acted on. Until then those parts have been verified by their authors, by the properties above, and by my reading rendered takes bar by bar against the notes.

## Decisions worth your attention

All of them are in `DECISIONS.md`. The ones that change what you hear, or depart from the handoff:

- `docs/MUSIC_NOTES.md` is an index; the knowledge (about 1,400 rules) is in four files under `docs/music-notes/`. Your own recorded listening comments are in part D, "What the owner's ear has said".
- Hat or ride per chorus at high energy; written fill shapes; lead-in kinds weighted by how the root moves; lead-in rates above quiet. All new, all data.
- The one-bar swell into a bigger section never changes the groove for that one bar.
- The ending resolves in place (the last bar becomes the tonic) and rings one extra bar.
- A count-in bar by default.
- The chart format gained rules after review (`docs/CHART_FORMAT.md` is amended): a stray header line no longer silences a chart; bars above the first label are their own unlabeled section; enharmonic spelling follows what a musician would write and survives transposition.
- `--energy` holds one level for a whole take.

## Music notes: used, deferred, dropped

**Used in stage 1**

- Time and feel: X-A-10 to X-A-20 (straight grid; swing, lean, humanize in one pass; drums never lean), with the blues values ST-blues-01 to ST-blues-07.
- Energy: X-A-06 to X-A-09, CO-01 to CO-03, CO-05, CO-06, CO-08 to CO-10, CO-12 to CO-19, CO-22, CO-23, X-A-33.
- Held choices and position-keyed randomness: X-A-29 to X-A-31, X-A-34, X-A-35, X-B-14, X-B-19, CO-49 to CO-52.
- Drums: DR-01 to DR-04, DR-09, DR-12 to DR-16, DR-18 to DR-20, DR-40 to DR-46, DR-103 to DR-107; ST-blues-08 to ST-blues-19.
- Bass: X-A-01 to X-A-03, X-A-21 to X-A-28, BA-01 to BA-11, BA-14 to BA-16, BA-28 to BA-34, BA-97; ST-blues-20 to ST-blues-28; chord scales X-B-10 to X-B-12.
- Fills, crashes, form: CO-39 to CO-47, CO-53, CO-54, CO-60.
- Endings: EN-01 to EN-07, EN-12 to EN-16, EN-19, EN-21 to EN-25, EN-27 to EN-31, EN-37, EN-38, EN-40; ST-blues-52 to ST-blues-54.
- Measuring: ME-01, ME-09, ME-11, ME-12, ME-16, ME-26.

**Deferred to the stage that needs them**

- Everything about chords (CH), the soloist (SO), their known failures (KF-B) and what separates good from bad (Q): stages 2 and 3.
- Head, solos, trading, who is featured (CO-24 to CO-38): stage 3.
- Answer bars (DR-05 to DR-08), kick lock (BA-13), the walk (BA-17 to BA-27), button and hits endings for the kit (EN-17, EN-18): stage 4, with funk and jazz.
- The other twelve styles' data: stage 4 and stage 6.
- Sounds and mix (SN, ME-30 to ME-37): stage 5.
- Fermatas (EN-41 to EN-44): the chart format has none yet.

**Dropped or changed on purpose**

- DR-45: the ride only on a written repeat. Replaced by a choice per chorus.
- DR-88: kick under a fill decided stroke by stroke. Replaced by written shapes.
- CO-08 as far as it let a one-bar swell change the groove.
- EN-08 to EN-11: guessing the key when the chart does not give one. The new format states the key, and warns when it is missing.
- X-A-32: a swing dial the player can turn. Swing is the style's.
- CO-07: reading a section named "B" as a bridge. Not carried over; it was marked unclear.
- X-A-05: the stale bass floor of 23.

## Review findings not yet acted on

The independent review of drums, bass, and planner had not reported when this was written. If this section still says so, the review needs to be run again before stage 2 builds on these parts.
