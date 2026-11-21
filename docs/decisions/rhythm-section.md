# Decisions: the drums and the bass

The drum seat and the bass seat, in every style: their grooves, lines, fills, and what the planner asks of them.

## 2026-11-14: drum seat

- A drum groove is a stack of layers, each one decision (which kick, which cymbal, whether to ghost) with weighted options and a hold span. Answer bars and phrase-position comping are layers with a condition on the bar's place in the phrase, so they need no new machinery when funk and jazz arrive.
- Blues fills are whole written shapes, kick included, with separate lists for a phrase end, a section end, and a top. The old band flipped a coin per kick stroke under its longer fills (DR-88). **(departure from the old band)**
- At high energy the blues chooses hat or ride once per pass, equal weights. The old band reached the ride only on a written repeat of a section, so a looping 12-bar never did (DR-45, DR-109). **(departure from the old band)**
- Two fills of the same length in a row are never the same shape when three or more exist.
- The open-hat breath is not played while riding: it is a turn for a hand that is on the hat.
- Bars that are not 4/4 are built from the tier's own 4/4 bar, one beat per pulse by role, with no separate per-style cells. Less data to write per style; only 4/4 is idiomatic for now (DR-10, DR-93).
- The one-bar build into a bigger section never crosses a tier line. Otherwise the groove changes for a single bar before the fill, which the old band's own rule against mid-phrase groove changes argues against (CO-08, CO-10). **(departure from the old band)**
- "Is the next section bigger" is asked of the sections' own energies before the build (X-A-33).
- The final chord of an ending is the last chord written in the bar; a rest written after it is kept and nothing rings into it (EN-40).
- Choices held per bar are keyed by the bar's place in the form, not its position in the plan, so a take with a count-in and one without are the same music.
- The count-in plays even when the drum seat is left out: the count belongs to the band.
- The lint rule against `../../` imports is gone; it also rejected imports inside the engine. The compiler's `rootDir` check already stops an import from leaving the package (verified with a probe).

## 2026-11-14: bass seat

- A bass line is a tone sequence (R 3 4 5 6 b7 8, fitted to each chord, with variants chosen by conditions on the chord) laid over a rhythm figure. The blues box, a two-feel, an eighth-note pump and a riff are all that shape; a walking line will need one more way to produce tones, and a kick-following riff will read the drummer's notes the seat already receives.
- The bass decides every arrival's pitch first, in order, then writes the notes between, so a lead-in always resolves into the note actually played (BA-05). The previous note is carried forward as a bassist carries it; every random draw is still keyed by position.
- Lead-in kinds are weighted by how the root is about to move (down a fifth, up a fifth, by step, by third), as style data. The brief asks for this; the old band's bass knew a chord's function only through its scale (BA-82). **(new)**
- Blues lead-in rates above the quiet tier (0.3 inside a section at mid, 0.5 at high; more into a section top; always into the ending) are chosen here. The notes give only the quiet tier's 0.35. A gate 1 listening question.
- Lead-ins are drawn per pass, so each chorus has its own; the rhythm figure is what the section keeps.
- No lead-in is reached by a leap of more than an octave, and a leap of more than an octave onto an arrival is bridged by a lead-in. Generalises the old band's rule for the ending (EN-28, EN-29).
- The "fifth" kind of lead-in is always a perfect fifth of the target; a diminished chord's own flat fifth made a tritone approach.
- When the two-feel's held fifth is the next chord's root, it is traded for the third (or split by an approach), so the arrival is never heard a beat early (BA-34, extended).
- The blues register is carried over as the old band had it (roots E1 to A2, home between C2 and E2, 30% pull). In A and E this lets the box climb to G3. Kept for now because it is what was approved by ear; it is one line of data and a gate 1 listening question.
- The ending's hit is where the final chord first sounds in the bar, not where it is last written.
- Not built yet: kick lock (BA-13), the jazz floor rule (BA-26), button and hits endings for drums. They arrive with the styles that need them.

## 2026-11-14: after the rhythm section review

- A written ending (Outro, Tag) is played as written even when its last chord is not home (EN-05). The planner had been resolving it to the tonic, against the decision above; a property now pins it. Goldens unchanged.
- A lead-in answers to the scale of the chord being left, with the half step onto the landing note as the one exception (X-A-26). The fifth of the chord coming is no longer played where it clashes.
- A last bar that is all rest is silence for every seat, with no final hit and no set-up fill before it. The chart wrote the silence; the band does not move the ending back a bar to make one.
- Loudness is squeezed above 120 (a quarter of the excess is kept) in place of a hard ceiling, so accents survive at full energy. A knee at 110 was tried first and halved the backbeat's swell across a jam's arc; at 120 the swell is unchanged.
- `PlanBar.stretch` is what a choice held "per pass" is held for: the time through a section, or 16 bars on a short vamp. The drummer's hat-or-ride choice no longer flips every 4-bar lap.
- On a one-section form a new pass alone is not a "top": the biggest fill is kept for a step up in tier. Otherwise the top fill was the only fill a blues turnaround ever got.
- Goldens and the scorecard baseline accepted after these five fixes (the fills at chorus ends changed, the squeeze changed the loudest strokes, a few lead-ins changed).

## 2026-11-14: a bass that varies its line (gate 3 feedback, "a bit more creative")

Built by an Opus agent from `prompts/bass-variety.md`; read on paper, held to properties, and one of them checked by breaking the rule, on the main thread.

- **What "the same two bars all night" was, in numbers**: at the working level the bass had one two-bar box for each kind of chord; half of all bars were the bar at that place in the chorus before; no chorus ever ended with a walk.
- **More than one line for a chord, as data** (`ToneSequence.others`): on a dominant, the box, the box to the octave, the walk through the fourth, root-fifth-sixth, and the octave figure; three for a minor chord. The box and the minor box are from the notes; the rest are standard figures written here and marked as new in `packages/styles/src/blues/bass.ts`.
- **A walk into a change, as data** (`BassStyle.walks`, by root motion): four quarter notes that step to the next root and arrive a half or whole step from it (E D C# B into A; A B C C# into D). None is from the notes.
- **Chosen by the phrase, by the critic**, as the piano's rhythm is. A section keeps a home shape per level and every phrase opens on it; later stays in the phrase play home or this chorus's answer; a phrase ends with a walk, a one-beat lead-in, or neither. Up to eight plans are drawn by position, each is played out into the next phrase's first root, and the cheapest of six is played. Weights are in `critic.weights.bass`; each was set to zero in turn.
- **What it delivers** (200 takes, same seeds): bars that are the bar at that place last chorus 42% (it was 50%); 40% of chorus tops are walked into (none before), which is about three quarters of the tops a walk can reach; 15% of the other line ends; the box is still the home line in about five sections of eight. "A bit" is the measure of it: this is the same bass with a turnaround and an answer, not a new one.
- **The half-step approaches are repaired** (90% of takes in the 15% to 40% band; it was 65% after the register change, 80% before it). The cause was the register: with the I always at the bottom, the half step below it is out of reach from the IV's box. Part of the repair is in the lead-in (a half step out of reach on one side is taken from the other; only the open E, not F1, is "the floor"). Most of it is a critic feature that keeps each phrase, with the last eight changes in mind, near 20% to 25% half steps. **That feature aims the player at the measure's own definition** (ME-08a warns about exactly this): with it at zero, 48% of takes are in the band. It is kept because "chromatic approaches as seasoning, not every change" (BA-75) is a real preference, and logged because the scorecard line can no longer be read as independent evidence.
- **Not from the brief**: the quiet level's lead-ins are now chosen through the critic too (the two-feel itself is unchanged).
- **Costs**: sixths on dominant chords are in their band in 75% of takes (80% before), because the answers without a 6th have none. The bass costs four times what it did to render, and the suite went from 5.8 s to 7.6 s of its 10; the bass properties moved to `test/bass.test.ts`.
- **Still true and not addressed**: about 6% of changes are reached by a drop of a minor sixth or more into the note that leads in (the same before and after this work). With one place for each root, a line that has climbed its box has to fall to reach the next root. It was on the gate 1 list as "wide bass drops" and has not been called out by ear.
- A style with one shape, no walks and no phrase policy plays exactly as the bass played before (checked by the builder against the untouched tree; not a test).
- The golden takes changed again: the bass is different in every take.

## 2026-11-14: the drum seat for jazz and funk (stage 4)

Built by an Opus agent from `prompts/drums-jazz-funk.md` in its own clone; the diff and the printed bars were read on the main thread, six properties were written from its claims (`test/drums.test.ts`), and four of them were checked by breaking the rule on purpose (no `audible`, fills that take the cymbal, no head offset, a kick between the eighths: each was caught).

**Engine changes, each a concept the drum data lacked** (the blues uses none of them; its goldens and scorecard did not move):

- **A layer can take a stroke away** (`-` in a groove line). Layers could only add. The jazz bomb drops the feathered 4; the funk open hat takes the closed hat off the sixteenth after it.
- **Conditions on the phrase's last bar, on whether a fill ends the bar, and on what the harmony does** (`When.phraseEnd`, `fill`, `changeInBar`, `changeAhead`). The drummer reads the chart as the pianist does, since he plays first and cannot hear him (DR-89).
- **A turn must be heard** (`GrooveLayer.audible`): when the drawn option would change nothing in the bar, the next in the written list that would is played. DR-06 says it of every style with answer bars. Without it 15% of funk answer bars were the bar before again.
- **A fill vocabulary per tier** (`FillShapes`). The length still comes from where the music is going (CO-43); the shapes come from the tier of the bar the fill is played in, so a light head stays off the toms even into a loud chorus (DR-38).
- **Fills played under the time** (`DrumFills.keepTime`, `FillShape.handOff`): the cymbal keeps going through a fill as the feet do (ST-jazz-15).
- **The drummer's button** (`ending.button`), on the same "and" as the rest of the band's.

**Choices in the data:**

- The jazz low tier carries both quiet parts: under 0.3 a soft ride (a ballad a player asked for); from 0.3 the swing pattern on the closed hat, which is where the arc puts the head (0.37 to 0.40). No kick and no snare comping in either.
- The hat foot plays on 2 and 4 wherever the ride keeps time, and not under the head. The builder had it under the head too ("always", ST-jazz-08); there the stick is on the same closed hat at the same moment, one sound struck twice. Changed on the main thread.
- Jazz `drums.fills-that-repeat` is a measured bound (45%), not the blues' 10%: at two and four steps a swung set-up has two places to strike, and the notes' shapes collapse into one another.
- Funk's quiet tier has no cross-stick (funk is not on X-C-08's list), a soft kick for its turn (DR-07), and no hat cut.
- Still the old band's rule and worth a listen: an arrival crash (with a kick under it, DR-20) opens every section, the eight-bar sections of a jazz head included.
- Not built: the head out played light again, trading, brushes.

**A measure of one way of playing is reported only where a style targets it** (`Measure.idiom`). With three styles, "the backbeat" read off a jazz take says 0% and means nothing. A measure marked `idiom` is on the scorecard of a style that sets it a target and of no other. Twelve drum measures are marked; the general ones (fills that repeat) are reported everywhere.

## 2026-11-15: the bass for jazz and funk (stage 4)

Built by a Fable agent from `prompts/bass-jazz-funk.md` in its own clone. On the main thread: the diff and the printed lines were read (the walk on rhythm changes; the funk riff under the kick); the blues goldens are identical, `pnpm score` reports no movement, and the builder's digest of 1,472 blues takes is byte for byte what it was. With this merge **all three styles pass every property** (the jazz piano is still the blues piano standing in).

**Engine changes, each a concept the bass lacked:**

- **A walked line** (`BassLine.walked`, `players/bass/walking.ts`). The figure still gives the rhythm; the pitches are made a note at a time toward an approach that is chosen first (BA-18), each a tone of the chord or its scale within a fourth. Six walks are drawn for a phrase and the critic takes the line with a direction. Ska and a country walk-up are this with other weights.
- **A figure that names its own tones** (`R 2 3 4 5 6 7 8` in a grid). A riff is a rhythm that belongs to its notes (X-C-10).
- **A dead note** (`m` in a grid, the voice `dead`): a 60-tick note on the root at a low level.
- **A named draw shared by tiers** (`figures.draw`), so a section's quiet part is its loud part thinned, as in the chord seat.
- **Following the kick** (`followsKick`): a root wherever the bass drum falls and the figure is silent (X-C-12).
- **A turn** (`BassLine.turns`): a beat or two laid over the end of a phrase's last bar, as a drum fill is.
- **Length as a share of the gap to the next note, capped** (`length.gap`, X-C-14), and **a level for notes off the beat** (`velocity.off`).
- **Tones under the root** (`Figure.under`), **lead-ins only on a note the figure already has** (`leadIn.pickup: false`, BA-41), and **coming down through the octave** into a landing (`leadIn.throughOctave`).
- **The bar before a step up plays the tier it is going to** (`stepsUpEarly`, the general form of BA-25): the last bar of a jazz head already walks.
- **Critic features for a made line**: `turns-back`, `rocking`, `leaps-left-hanging`, `strong-beats-off-the-chord`, `bars-as-last-time`. They read walked notes only.
- Fifteen new measures, all `idiom`; six blues measures marked `idiom` (the blues targets them all). `walks-into-the-top`, `steps-into-the-top` and `steps-into-a-line` describe the blues line and are still reported for jazz and funk, where they say little: they have no target anywhere, so marking them would drop them from the blues card.

**Properties** (`test/bass.test.ts`), each checked by breaking the rule (an extra eighth in the walk, a walk allowed to stand still, an approach from a third, a bass that ignores the kick, a riff drawn per bar: all caught):

- Jazz: once the band has opened up the bass walks, a note on every beat and nothing between, never the same note twice running, into a change of bass note by a half step, a whole step, a fourth or a fifth.
- Funk: on the One and under the kick (a dead note counts: the hand is there); on the sixteenths; nothing longer than two and a half sixteenths; a dead note never on the One, on a change, or when the band is quiet.
- Funk: the riff is the section's (the first two beats of every bar, one time through at one level).
- "Swung eighths only" now holds the jazz bassist too. "A note held a half note or more is a chord tone" reads a note of 1.6 beats or more: a half note in a two-feel sounds a little short and was never being read. The floor on "notes outside the scale" is 100, not 200: a funk bass has few.

**Choices in the data** (the builder's, kept; questions for the gate):

- Jazz approaches are 61% by half step. With the notes' weights (BA-04) it was 75%, and 83% in one take in ten.
- The head is in two; at the working level a ballad at 66 walks in four (BA-24 says a ballad stays in two: that is the arc's business, not the bass's, and is not built).
- Funk has one fixed register, F1 to E2 (ST-funk-19 gives an anchor per section, which puts A on A2). **In E the riff sits on E2 with pops on E3** (average G2, 16% above D3): moving the register down puts E on the open string and drops a seventh between D9 and E9. Brandon said after gate 3 that the bass was an octave high, so this is the first thing to ask him.
- Funk's two turns (a pickup under the root; an octave figure) are new: the notes have no bass turn. Three chorus tops in four are turned into, one inner line end in eight.
- A dead note through a General MIDI bass is a very short quiet note on the root. Whether it reads as a thump is a listening question.

**Known, not fixed** (the shared ending and register logic, left alone to keep the blues identical): a written ending that walks up by half steps into a tonic at the bottom of the instrument lands a seventh under its leading tone (27 of 2,944 takes, another style's chart in jazz); jazz in two with one note a chord can cross the A2/Bb1 seam.

## 2026-11-15: when the groove starts to follow the chart

Brandon: "i trust your judgment about when to make changes related to grooves". The call: a section's held choices will draw on the chart as well as the seed and the label, as the first change of stage 5 and not before his gate 4 verdict. Until he has listened, the files in `out/gate-4` must be what `pnpm gate:4` writes, or a bar number he reports cannot be found again. When it goes in: its own commit, a property first (two charts with the same section labels and different chords do not share their held choices at one seed), every golden and gate file rewritten, and the three scorecards shown not to move beyond noise, since the band is the same and only the draw changes.

## 2026-11-15: gate 4 passed; and the groove does not follow the chart after all

**Gate 4.** Brandon downloaded the files and listened to "a handful of seeds across blues/funk/jazz": "everything is sounding incredible so far, seriously amazing work". No complaint, so stage 4 is closed. A short verdict is not an answer to each listening question in the report: those stay open and are his to raise.

**The groove change is withdrawn** (the entry above said it would be the first change of stage 5; Brandon had left the call to me). Worked through before writing any code, it is the wrong fix:

- What a listener would meet is two tunes with the same groove. That only happens when two tunes are played at the same seed, and only the gate script did that, by asking for seed 1 everywhere. The app will draw a new seed for each jam and keep it with a saved take (stage 6, "save a seed, replay it"). The seed is the caller's, and that is where the variety belongs.
- Drawing on the chart's content breaks something worth more. Every random draw is keyed by position so that a change stays local: edit one chord in the editor and the rest of the performance is what it was. With the chart's content in the draw, one edited chord would change the beat, the riff and the strum of the whole tune.
- `A`, `A2` and `A'` share their held choices on purpose (`sectionIdentity`), so the content of one section cannot be its identity either.
- It would also have turned every saved take, golden and gate file into a different take, for no gain a user would hear.

What stays true from the review: **the funk pool is small** (three kicks, about six riffs and four strums at the working level; seeds 1 and 4 are one groove). That is style data, to be widened when funk next gets attention, with a measure first (distinct grooves in 100 seeds: 57 today). For stage 6: the app picks a fresh seed for each jam.

