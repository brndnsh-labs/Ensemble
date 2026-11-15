# Gate 3: is the aimlessness gone?

Drums, bass, piano, and a soloist. Nobody but you can hear these, so this report says what was built, what was measured, and what to listen for. Nothing here claims it sounds good.

Written 2026-11-14. Rewrite the files with `pnpm gate:3`.

## How to audition

Open the `.mid` files in Logic as before. Each has Drums (channel 10), Bass, Piano, and a Solo track: vibraphone (program 11), or alto sax (program 65) in the two `alto-` files.

Every file has a recipe beside it (`.json`). `pnpm -s ensemble replay out/gate-3/seed-001.json --out again.mid` writes the same file, byte for byte.

Each of the ten main takes is five times through a 12-bar blues in A at 100 bpm, about two and a half minutes: the band alone, three choruses of solo, and the band alone to finish.

## The four questions

1. **Does the solo repeat and develop ideas?**
2. **Do phrases relate to each other, and do they breathe?**
3. **Are the worst takes still acceptable?** The last band failed on variance, so the floor matters more than the ceiling.
4. **Does the comping leave room?**

## The files

| Files | What they are for |
|---|---|
| `seed-001`, `002`, `004`, `005`, `006`, `007`, `008` | Seven ordinary seeds. By the critic's own score they run from one of the best of 200 (seed 7) to one of the worst twenty (seed 5). |
| `worst-1-seed-171`, `worst-2-seed-003`, `worst-3-seed-192` | Question 3. The three lowest-scoring solos of seeds 1 to 200 on this chart, worst first. |
| `room-seed-1-piano-listening`, `room-seed-1-piano-deaf` (and seed 2) | Question 4. Soloist and piano alone, no drums or bass. The same solo twice: once with the piano as built, once with a piano that cannot hear the soloist. |
| `alto-seed-1`, `alto-seed-2` | Seeds 1 and 2 on the alto sax, which has to breathe and sits a fourth lower, in the piano's register. |
| `timed-4min-quick-change-e` | Nine passes: the band, a three-chorus solo, a chorus of rest, a second three-chorus solo that reaches the jam's peak, and the band out. |
| `slow-blues-g`, `minor-blues-am`, `jazz-blues-f` | Other tunes: 66 bpm, a minor key, two chords a bar at 140 bpm. |
| `intro-and-tag-d-song` | The chart played once as a song: the soloist rests through the intro and the written ending. |

**The scores behind "worst"**: the critic's cost for a solo is the mean cost of its phrases, lower is better. Over 200 seeds the middle solo costs 1.53 and the best 1.18. The three worst cost 2.03, 1.98 and 1.92. Taking the first candidate every time, with no critic, the average solo costs 2.19, so by its own measure the worst chosen solo is better than the average unchosen one. Whether that measure hears what you hear is what this gate is for.

## What to listen for

**The soloist**

- **Ideas that come back.** A chorus is built as the form is: a statement, the statement again over the IV (often moved with the chord), and an answer. Later choruses vary the idea (a new ending, a step along, opened out, as a riff) or bring the first idea back. Do you hear it as one solo, or as licks in a row?
- **Breath.** Every phrase is followed by at least half a second of air before the next one starts, pickups included. A first chorus is sparse on purpose: a few notes and a long one, with a bar or two of room.
- **The arc.** Three choruses build: the last has about 2.4 times the notes a second of the first, the one top note of the solo comes in the last chorus, and the band's energy climbs under it.
- **Landings.** A note struck on a chord change is a tone of the new chord, most often its third or seventh. The tune's last note is the root, third or fifth of the final chord.
- **Wrong notes.** The soloist plays the key's blues scale over every chord. A note of that scale that says a different chord (the key's flat 5 over the IV is that chord's flat 9) may now only pass: it is never on a beat or held. If you hear a clinker, the bar number is worth a note.
- **The worst three.** On paper they are sparse and a little square rather than broken. Are they acceptable?

**The piano under the soloist (the `room-` pairs first)**

- **It moves down and off the soloist's note.** Under a solo the bottom of the hand is around middle C, where without one it is around E4, and a voice that would sit on the soloist's own held pitch is left out. Does the lower hand sound muddy, or crowd the bass, in A?
- **It thins a little, not a lot.** Where the soloist is sounding, some chops are left out, but never a bar's first strike of a chord. Is that leaving room, or is it still too busy? Or already too thin? One number in the data moves this either way.
- **It speaks up in the gaps.** Strikes that fall in the soloist's breaths are played a little harder. Does that read as an answer, or as random accents?
- **The pump does not react.** At the hot level, when the section's figure is the boogie pump, the piano hammers eighths under the solo's last chorus unchanged. That is the old band's rule (a groove is not a conversation). Right, or should it give way?
- **After the solo** the hand comes back up to its own register by steps over a few chords.

## What the checks say

- `pnpm check`: 437 tests in about 6 s. `pnpm score` matches its accepted baseline (200 takes, 64 of them with a solo).
- **Soloist properties** (10), over every library chart and two stress charts, as four-pass jams and also as a song, at 160 bpm, at 60 bpm on the alto, quiet, and loud on the alto: it plays only where it has the lead, on its instrument's range, one note at a time; a note struck on a change is a tone of that chord; no wrong note on a beat or held; a breath after every phrase, at any tempo; no silence of three bars inside a solo; one top note, in the last chorus; three-chorus solos build in nine of ten; the last note of the tune is the root, third or fifth and not the solo's top; the alto never plays eight seconds on one breath, as heard; the band never comes down under a solo.
- **Piano-under-the-soloist properties** (4): hearing the soloist, fewer strikes come down under the line and far fewer voices sit on the soloist's note than when deaf; with nobody soloing a listening piano plays exactly what a deaf one plays; a voice held on the soloist's own pitch for more than a beat is the bottom of the hand or a tone the chord is heard by; under a line the two lowest notes are a half step apart only on a dominant from E4 up.
- Every piano property from gate 2 still holds with the soloist playing.
- I broke the piano's two rules on purpose and the properties caught both; each soloist fix was made behind a property that failed first.
- A digest of 224 takes without a soloist is identical before and after all of stage 3's work on the piano and the soloist.

**Does choosing do anything?** (`node scripts/gate-3-numbers.ts`: 96 takes, each played both ways on the same seed)

| The soloist | Chosen by the critic | First candidate |
|---|---|---|
| Mean cost of a solo's phrases (lower is better) | 1.53 | 2.19 |
| The same, for the worst tenth of takes | 1.83 | 2.68 |
| The worst phrase in a solo | 2.50 | 3.51 |
| Bars that rhyme with another bar of their phrase | 83% | 59% |
| Leaps that turn back by step | 85% | 28% |
| High points that are earned (approached, on a strong place) | 90% | 80% |
| Thirds and sevenths on the changes | 75% | 69% |
| Empty bars | 16% | 20% |
| Longest silence in a solo | 3.6 s | 4.1 s |
| Last chorus against first, notes a second | 2.4 times | 2.2 times |
| Phrases related to an earlier one | 66% | 73% |
| Beats on chord tones | 85% | 87% |

The last two rows are where choosing loses: the first candidate is always the most literal repeat, so it is "more related", and the critic gives some of that up for shape and density. Most of the rows above them restate something the critic was told to prefer, so they show the critic doing its job, not that its job is the right one.

| The piano under a solo | As built | Deaf to the soloist | First plan drawn |
|---|---|---|---|
| Strikes that come down while the soloist sounds a note | 61% | 66% | 67% |
| The same, over what a hand placed at random would catch | +3 points | +7 | +8 |
| Lower than the deaf piano, take by take | 91 of 96 takes (3 higher) | | |
| Time on the soloist's own note | 9% | 31% | 9% |
| Notes at or above the line's lowest note | 12% | 30% | 12% |
| Strikes in breaths, louder than strikes under the line by | 4.6 | -1.2 | -1.2 |
| Busier in the breaths than under the line (ratio) | 1.08 | 0.90 | 0.85 |
| Lowest note of the hand, on average | C4 | E4 | C4 |

The milestone asks for the comping's overlap with the soloist's rhythm to be lower than a naive baseline: it is (61% against 66%, in 91 takes of 96), and the margin is small. The larger change is in pitch and register, not rhythm.

## Feedback from listening (2026-11-14)

Brandon, in Logic, after a few seeds: "sounding pretty good, definitely intentional melodies that work well". Three things to change, each measured first and then changed. **The files in this folder were rewritten with the changes.**

- **"Piano could leave a bit more room, sometimes it gets a bit busy as the intensity ramps up."** Measured: under a solo at the band's hot level the piano played 5.2 strikes a bar, the boogie pump's eight in four bars of ten. That is exactly what it plays with nobody soloing, and the soloist is at its busiest there too. The measures in the tables below had left pump bars out, which is why they said the piano made room. Now, while the soloist has the lead, the piano stays in its working book (chops and their answers) however hot the band gets: 2.0 strikes a bar under a hot solo, played harder, not busier. The pump comes back when the band has the tune to itself, in the last chorus of these takes.
- **"It's up an octave ... we should sit in a typical bass guitar register."** It was, in some keys, and it was not intended: the notes are written at sounding pitch, but the bass's roots were allowed up to A2, so a blues in A had its I on A2 and a box reaching G3, an octave over the open A string. Its average note was B2 on that chart. Now every root is at its lowest place on the instrument (E can be either E), a blues in A is played from the open A string, the average note is about D2 to E2, and nothing is above D3.
- **"Bass could be a bit more creative."** Not changed yet. Today the bass has one two-bar box for each kind of chord, and nothing chooses between ways of playing a phrase. That is being built next.

One thing got worse with the lower bass: in the minor blues, fewer changes are approached by a half step (9% from 22%). It is logged and goes with the bass work.

The tables under "What the checks say" were taken before these changes. After them: strikes under a sounding solo note 63%, over chance +1 point (it was +3), busier in the breaths than under the line by 1.17 (it was 1.03).

## Known weaknesses

- **The rhythm gives way only a little.** A blues figure is two chops a bar and the soloist sounds most of the time, so there is not much to leave out before the piano stops keeping time. The old band's listening test put that floor at about one bar in five with a single strike; this sits at about one in six.
- **The answer is a lift, not a new stab.** The figure already has a strike in 97% of the soloist's breaths, so the rules for an added stab are almost never met (one in 64 takes).
- **Under the alto the piano is on the soloist's note 20% of the time** (37% deaf; the target is 15%). The alto lands on thirds and sevenths in the hand's own octave, which the hand may not drop.
- **The piano's top line is less smooth under a solo**: it steps at 58% of changes against 75%, and 1.2% of changes are a drop of more than a fourth, nearly all of them the top voice left out for the soloist's note.
- **Short vamps are not handled.** On a form of one to seven bars the soloist's choruses and both players' phrases are counted in laps, so a one-bar vamp gets the same three-bar "solo" each time and a piano that loops one bar. Fixing it is one planner change with several readers, logged for the start of stage 4, where funk needs it. No library chart is a vamp.
- **Stop-time**: nothing is played under N.C., so the soloist sits out the breaks, where a soloist would play.
- **No bends, slides or vibrato**, and no trading or playing the head.
- **Four soloist measures cannot fail** by the way the soloist is built (changes on chord tones, the top in the last chorus, and two more). They are tripwires for a broken rule, not measures of quality.
- **Blues assumptions remain in the soloist's engine code** (solos of three choruses with one of rest, the kinds of variation, the shape of the peak phrase). Jazz and funk will need them as data.

## How it was built and checked

- Fable built the soloist; Opus built the piano around it; the planner's schedule, the properties and the fixes below were done on the main thread.
- An independent Opus review rendered 3,168 takes of the soloist (33 charts, 23 of its own; 16 kinds of take; both instruments; 60 and 160 bpm) and read them.

**Found by the review and fixed, each behind a property first**

- **Wrong notes on beats**: the key's flat 5 over the IV (a flat 9), a major third over a minor or diminished chord. About 1.6 a take on the jazz blues, and one in the plain 12-bar. Now a rule, not a cost.
- **The tune ending on the flat 7**, held for two bars (17 of 624 library endings).
- **Pickups filling the breath**: at 160 bpm one phrase in six ran into the next (306 of 1,794 joins on the reviewer's charts; 7 now, all in odd meters and odd phrase lengths).
- **The alto out of air**: 11.8 seconds on one breath at 60 bpm in one corner.
- **The band taking its breath under the middle of a solo** in jams of 7, 8, 12 passes and more.
- **A measure that could not see a short breath.** There is a new one that can.

**Found on the main thread in the piano build**: when a solo ended the hand jumped back to its old place, up to a fifth at once. It now comes home by steps.

**Held up under the review**: 424,745 solo notes with none out of range, none overlapping, none where the soloist lays out or under N.C.; no non-chord tone among 67,221 notes struck on a change; every ending gesture (hold, stop, button, hits, soft) in 4/4, 3/4 and 12/8; 594 of 594 replays identical; 2,970 of 2,970 open jams unchanged when made a pass longer; every weight moves its own feature when set to zero; every kind of candidate is chosen sometimes.

**Not reached by any review**: the piano-around-the-soloist code had no independent reviewer (I read all of it and wrote its properties, but I also wrote its brief); 5/4; key changes under a solo beyond one chart.

## Decisions made on the way (also in `DECISIONS.md`)

- In a jam the band plays the form once alone, then solos are three choruses with one chorus of rest between. With a soloist the band's arc peaks on the last chorus of a solo, and never comes down under one.
- Laying out and answering are chosen by the phrase from candidates, never by a coin per strike, which is what the old band did and regretted.
- Laying out keeps the first strike of every chord in every bar. The notes keep only a chord's first strike; this is firmer.
- A note of the key that says a different chord may pass but never sit, unless the chord's own scale has it. That keeps the fourth over a dominant, which a blues leans on.
- The instrument is the player's choice: `--solo-instrument alto-sax`.
