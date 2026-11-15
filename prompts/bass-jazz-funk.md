# Prompt: the bass seat for jazz and funk (stage 4)

A brief for a subagent. Follows `prompts/seat-bass.md` (the bass seat, stage 1) and `prompts/bass-variety.md` (the bass choosing by the phrase, after gate 3).

---

Write the bass parts of two new styles, jazz and funk, for a generative backing band: a walking line and a sixteenth-note riff locked to the kick. Neither can be written in the bass seat's data as it stands, so this is first an engine job: add the missing concepts, in general terms, then express both styles as data. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, TypeScript, stage 4 of 6: "jazz and funk as data"). The blues bass exists, works, and has passed its listening gate.

**The owner is a bassist.** He will audition MIDI files and ask: does each style sound like its genre, and unlike the others, on the same chart; and did the blues get worse? Of every seat in the band this is the one he hears with a player's ear. At the last gate he said the blues bass was an octave too high in some keys ("we should sit in a typical bass guitar register") and "could be a bit more creative"; both were fixed, and he then called the amount of variety right. Carry both lessons: the line lives low on the instrument, and a line that is the same bar all night is heard.

The rule that governs this stage: **styles are data.** Where a style cannot be written as data, the engine is missing a concept: add the concept, then write the style. You will list every engine change and say why it is a general concept and not a special case for one style. That list goes into the stage report.

## Where things stand

- `packages/styles/src/funk/` and `packages/styles/src/jazz/` exist, each with its own feel, tempo, arc and ending. Their drums and soloist are written. Their bass and chord seats are **placeholders**: the blues seat under another name. You replace `funk/bass.ts` and `jazz/bass.ts`. Another agent is writing the chord seats at the same time, in its own copy of the repo; until then the piano you hear around you is the blues piano.
- The CLI renders them: `pnpm -s ensemble render library/jazz-two-five-one-c.chart --style jazz --out x.mid`. The library has seven jazz charts and six funk charts.
- `pnpm check` holds the shipping style (blues) to every property. `ENSEMBLE_STYLES=funk,jazz node --test test/` holds the new styles to the same properties. A property that is one style's own is marked `only("blues")`.
- Two planner changes made for this stage, which you consume (`DECISIONS.md`, "stage 4 begins"):
  - **A short vamp is played in choruses of several laps.** A one-bar funk vamp is a 16-bar section with four-bar phrases.
  - **The head is an offset in the arc** (`ArcStyle.head`, jazz: -0.15). The first time through a jazz tune is played in the low tier and the next chorus steps up to the working tier. That step is how this band plays "the head in two, then the band walks" (ST-jazz-19, ST-jazz-50, BA-24): **no player tests for "the head"**. The jazz low tier is the two-feel; mid and high walk.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md`: the bass seat, "after the rhythm section review", "gate 3 feedback", "a bass that varies its line", and "stage 4 begins".
- `docs/MUSIC_NOTES.md`, then `docs/music-notes/a-rhythm-section.md`: the cross-cutting rules (X-A-01 to X-A-34), all of "Bass" (shared craft BA-01 to BA-16, "Jazz: the walk" BA-17 to BA-27, "Funk" BA-38 to BA-42, and skim the other styles to see what the concepts must not rule out), "The bass's last note", and the bass entries under "Known failures and things tried" and "Surprises".
- `docs/music-notes/c-styles.md`: "Style: jazz" and "Style: funk" in full (you own the Bass parts), and X-C-10 to X-C-14.
- `docs/music-notes/d-audit-history-sounds.md`: "Bass" under the audit, and "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The bass seat, all of `packages/engine/src/players/bass/` (about 2,100 lines), `packages/styles/src/blues/bass.ts`, the bass weights and targets in `packages/styles/src/blues/critic.ts`, `critic/measures/bass.ts`, and the properties in `test/bass.test.ts` and `test/band.test.ts`.
- The drum parts you play with: `packages/styles/src/funk/drums.ts`, `packages/styles/src/jazz/drums.ts`, and what the bass can hear of them (`heard.drums` in `perform/notes.ts`).

## What to build

### 1. A walked line (jazz)

Today a line is a written shape (a tone sequence over a rhythm figure), and the bassist chooses between shapes by the phrase. A walking line is not written: it is made, four quarter notes to the bar, from where the harmony is and where it is going. That is the missing concept: **a line that is walked, as one of the ways a tier can be played**, with what a style would tune written as data.

The notes describe how the old band walked (BA-17 to BA-27, ST-jazz-18 to ST-jazz-24): the arrival is the chord's bass note; the last beat before the next chord is an approach, chosen first; the beats between move toward it, each within a fourth, chord and scale tones weighted by beat. It drew every note with a weighted coin. Its own history says where that leads: a line that is correct beat by beat and goes nowhere. This project's answer everywhere else is candidates and a critic, by the phrase, and the bass seat already has that machinery (`phrase.ts`, `critique.ts`, `BASS_FEATURES`). Use it: several walks are drawn for a phrase (BA-19's weights are a fine way to draw them), each played out, and the critic picks one. Features worth having, in a bassist's terms; find the ones that move the choice and drop the ones that do not:

- a pitch said twice in a row (BA-20: the walk never repeats a note);
- chord tones on beats 1 and 3, passing tones on 2 and 4;
- steps against leaps, and a leap that is not then filled in;
- **a line with a direction**: two bars that climb and two that come back are a line; four bars that wander around one note are not. The old band had no measure of this at all, and "where the old measurements missed" (ME-11, ME-26, ME-29) is exactly here;
- the same bar as the bar before, and the same four notes at this place last chorus (a walking line that repeats is heard at once);
- how the phrase joins the next, and time spent high: the line's home is D2 (ST-jazz-18), and the register rule that fixed the blues applies in spirit. The line may climb to make a shape, and comes home.

What does not change: a chord's arrival is its bass note (BA-01; do not build BA-22's occasional third, the property stays strict); the approach resolves by step in the octave actually played (BA-05) and follows every rule a lead-in follows, including the bottom of the instrument (BA-08, BA-09, BA-26); random draws are by position.

The low tier is the two-feel (BA-23): the blues already plays one, and the jazz one should be data. BA-25 asks for the last bar of the head to walk into the first blowing chorus, so the change of feel is set up across the barline and not switched on at the downbeat. The blues already walks into its turnarounds; see whether "the bar before the band steps up a tier plays the tier it is going to" is the general form, and build it if so.

Two chords in a bar (rhythm changes has them in most bars) means two beats per chord: arrival, approach, arrival, approach. Read what your line does there; it is most of bebop.

### 2. A riff locked to the kick (funk)

Funk is one one-bar riff per section on the sixteenth grid: roots, octave pops, the fifth, the flat seventh, and dead notes, in a rhythm that belongs to those notes (BA-38 to BA-42, ST-funk-15 to ST-funk-22). Three things the seat cannot say today:

- **A riff: a rhythm with its own tones.** Today the rhythm (figures) and the tones (shapes) are drawn separately. A riff is one thing, drawn once per section and kept. By tier it thins: low is roots only; mid drops the dead notes that fall on an "a"; high is all of it (BA-39). Write the tiers so that a section's riff when quiet is the same riff, thinned (the chord seat's `draw` name does this for comping figures).
- **A dead note**: a muted, pitchless thump on the root, half a sixteenth long, quiet (BA-40). It needs to reach the MIDI file as something a bass patch plays as a thump, and a sampler later as its own articulation: look at how the drums name a ghost stroke (`voice`).
- **Following the kick the drummer actually played** (BA-13, BA-39, X-C-12): a root wherever the kick plays and the riff is silent; at low energy, roots on the riff's root positions and on the kicks. Feathered and ghosted kicks do not count. Fills included.

Also: notes are short (three quarters of the gap, and never longer than two and a quarter sixteenths: a cap on length is new); a chord's arrival always gets its root whatever the riff says there (BA-01 already); the flat seventh goes under the root when over it would leave the register, and octave pops fold down above A3; a riff note on the last sixteenth before a change becomes the half step under the next root some of the time (the lead-in policy already has `at: "sixteenth"`: check it does what BA-41 asks); a riff tone within a beat of a change that is a step from the next root by name sits beside it (BA-07).

"A bit more creative" applies here differently: the riff must not vary bar to bar (that is what a riff is), and X-C-42 says the hold is the style. What may change is at the phrase: the last bar of a phrase or of the section may turn the riff round (a pickup into the One, the octave figure), as the drummer's answer bar does. Decide whether funk gets that through the phrase machinery, and say what you chose. The owner will hear sixteen bars of a one-bar vamp: read `library/funk-one-chord-e.chart` at every level and ask what a bassist would do with it.

### 3. Registers

Funk: each section fixes its octave, anchored between C2 and E2 (ST-funk-19). Jazz: E1 to E3, home D2, each root placed near the line with a pull toward home (ST-jazz-18); the existing `RegisterPolicy` should say both. Report the average note and the share above D3 for each style on each key in the library, as the blues measures do (`bass.register`, `bass.high-notes`), with targets the owner's remark would agree with.

### 4. Measures and targets

In `critic/measures/bass.ts`, each with a `says` sentence a bassist would agree with, with targets under the `// ── bass ──` heading of `funk/critic.ts` and `jazz/critic.ts`, labelled `intent` or `measured`, with `minCases`; and `critic.weights.bass` in each (replace the blues weights the placeholder spreads in for your seat; leave the other seats'). From the notes: walking is 0.85 to 1.05 notes a beat, moves 1.5 to 4.5 semitones on average, repeats under 2% of pitches, approaches 30% to 80% of changes by half step, holds no passing tone (ST-jazz-22, ST-jazz-24); funk has 10% to 60% of its notes on syncopated sixteenths and doubles at least 35% of kicks (ST-funk-22). Add what the notes never measured: whether a walking line has a direction, and how often a bar or a chorus is the one before again. Existing measures that are blues ideas (sixths on dominants) get no target in the new styles; check that every existing bass measure still says something true reading a walk or a riff, and say which do not apply.

Report every measure three ways on the same 200 seeds, for each style: the bass as built; the first plan drawn with no critic; and for jazz, the old band's way (one weighted draw per note, no candidates), which your candidate drawer is if you draw one and take it.

### 5. Validation

Extend `validate.ts` for everything you add to the type.

## The blues must not change

The three blues golden takes must pass unchanged and `pnpm score` must report no movement. A blues pack that uses none of the new concepts must play exactly what it plays today.

## Rules of the house

As in `prompts/seat-bass.md` and `prompts/bass-variety.md`: random draws by position only (`heldRng`, `rng.fork` keyed by purpose and place), never in sequence; what may be carried forward is what a bassist carries (the last note played, the phrase before, what was played here last time); straight grid at written levels (feel swings and leans it afterwards: jazz swings eighths at 60%, funk swings sixteenths by a trace); every note starts inside its own bar; nothing written into `plan.lookahead`; an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a bassist's words; cite rule IDs where a rule explains a choice.

- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, the suite inside its 10 s budget; say what it takes before and after). `ENSEMBLE_STYLES=funk,jazz node --test test/` must pass too. The bass's properties: on the instrument (nothing under the open E, nothing over A3) and one note at a time; where a chord changes the bass plays that chord's bass note; a lead-in resolves by step in actual pitch; no leap of more than an octave; a note held a half note or more is a chord tone; the last note of a jam is the lowest root; a note outside its chord's scale only passes, or is the half step onto the next change. They were written with one style in the room. If one fails because of your work, fix your work; if you believe a property is wrong for a walk or a riff as stated, leave it failing and say exactly why and what it should say. Do not run `pnpm goldens` or `score --update`.
- The bass costs four times what it did to render since it began choosing by the phrase, and the suite is near its budget. A walk chosen among candidates in every phrase of a 32-bar tune at 200 bpm must not make it worse than it has to be: measure what a take costs to render before and after, and say.
- Meters other than 4/4 are played plainly (BA-16): `library/jazz-waltz-f.chart` must be sensible, one note to a pulse.

## Boundaries

- Yours: `packages/engine/src/players/bass/**`, `packages/engine/src/critic/measures/bass.ts`, `packages/styles/src/funk/bass.ts`, `packages/styles/src/jazz/bass.ts`, the bass entries of `funk/critic.ts` and `jazz/critic.ts`, and exports in `packages/engine/src/index.ts`. If a dead note needs a line in the MIDI export or the event types, make that one change and say so. In the shared files (the critic files, `index.ts`) make small edits under your own heading; never rewrite the file.
- Not yours: the planner, feel, the other seats, `packages/styles/src/blues/**`, the test folder, `docs/`, `scripts/`, `out/`, `library/`. If you need a change there, stop short of it and say exactly what and why.
- You are working in your own clone of the repo. When you are done and `pnpm check` passes, commit your work there on a branch named `bass-jazz-funk` (one commit is fine). Do not push anywhere. Throwaway scripts and charts go outside the repo, in a temporary folder.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

A throwaway script: render each style's library charts, and two blues charts in each new style, as a five-pass jam, a timed jam, and at set levels (`energy: 0.3`, `0.55`, `0.85`), across seeds, and print the bass bar by bar under the chords: note names on the grid, the kick under it for funk, which candidate the phrase chose and what each cost. Read it as a bassist would. Jazz: sing four bars of it. Does it go somewhere? Does every approach land? Is there a root on every change, and on the ii-V bars? Does the head sit in two and the second chorus walk, with the walk set up a bar early? Funk: is the riff the same riff in every bar of the section, is the One always there, does it sit on the kick, where are the dead notes, what happens at the turnaround of the four-bar vamp and at the bridge? Then count over 200 seeds as section 4 asks, use `pnpm -s ensemble score --style jazz --seeds 200` and `--style funk` for the distributions and the worst takes, and read the worst takes.

## Report back

Short and factual: the files; **every engine change, each with one line on why it is a general concept**; the shape of the new style data, and how a reggae line (a riff with a hole on beat 1) and a rock line (root eighths with a lead-in) would be written in it; how a walk is drawn and chosen, the features and weights, and what each moved when set to zero; the three-way numbers; registers by key; which existing measures do not apply to which style; every judgment call and every place you left the notes (one line each, with the rule ID); what a take costs to render and what `pnpm check` takes, before and after; the musical properties you believe always hold for a walking line and for a funk riff, stated as a bassist would (these become property tests); any property you left failing and why; anything you wanted outside your boundary; and what you would ask the owner, a bassist, to listen for.
