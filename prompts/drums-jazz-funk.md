# Prompt: the drum seat for jazz and funk (stage 4)

A brief for a subagent. Follows `prompts/seat-drums.md` (the drum seat, built at stage 1 for the blues).

---

Write the drum parts of two new styles, jazz and funk, as data, for a generative backing band; and add to the drum engine whatever general concept the data turns out to need. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, TypeScript, stage 4 of 6: "jazz and funk as data"). The blues band exists, works, and has passed three listening gates.

Nobody on this project can hear the output except the owner, who will audition MIDI files and ask: **does each style sound like its genre, and unlike the others, on the same chart? Did the blues get worse?**

The rule that governs this stage: **styles are data.** Adding a style must not require engine changes. Where it does, the engine is missing a concept: add the concept, in general terms, then express the style as data. You will list every engine change you make and say why it was a missing concept and not a special case for one style. That list goes into the stage report.

## Where things stand

- `packages/styles/src/funk/` and `packages/styles/src/jazz/` exist. Each has its own feel, tempo, arc and ending in `index.ts`, and four seat files that are **placeholders**: the blues seat under another name. You replace `funk/drums.ts` and `jazz/drums.ts`. The other three seats in each style are still the blues bass, piano and soloist; ignore how they sound.
- The CLI renders them: `pnpm -s ensemble render library/funk-vamp-a.chart --style funk --out x.mid`. The library has seven jazz charts and six funk charts (`library/jazz-*.chart`, `library/funk-*.chart`).
- The suite holds the shipping style (blues) to every property. `ENSEMBLE_STYLES=funk,jazz node --test test/` holds the new styles to the same properties. A property that is one style's own is marked `only("blues")`.
- Two planner changes made for this stage, which you consume and do not need to touch (see `DECISIONS.md`, "stage 4 begins"):
  - **A short vamp is played in choruses of several laps.** A one-bar funk vamp is planned as a 16-bar section with four-bar phrases, so phrase and section fills, held choices and crashes fall where they would in any 16-bar tune. `FillMark.half` is gone.
  - **The head is an offset in the arc** (`ArcStyle.head`, jazz: -0.15). On the default arc the first time through a jazz tune is played at about 0.37 to 0.40, in the low tier, and the next chorus steps up to the working tier. That step is how this band plays "the head light, then the band opens up" (ST-jazz-09, ST-jazz-50): **no player tests for "the head"**. The jazz low tier is the light head.
- Another agent is building the soloist for the same two styles at the same time, in its own copy of the repo. You will not see its work.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md` the drum seat section and "stage 4 begins".
- `docs/MUSIC_NOTES.md`, then `docs/music-notes/c-styles.md`: "How to read the grids", "Style: jazz" and "Style: funk" in full (you own the Drums parts; read the rest to know what the band around you will be), and "What differs between styles and what does not" (X-C-02 to X-C-09).
- `docs/music-notes/a-rhythm-section.md`: the cross-cutting rules, "Drums" (shared craft, then the Jazz and Funk sections), "Fills and crashes are the drummer marking the form", "The five gestures" and "Each style's ending", and the drum entries under "Known failures and things tried".
- `docs/music-notes/d-audit-history-sounds.md`: "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The drum seat, all of `packages/engine/src/players/drums/`, and `packages/styles/src/blues/drums.ts` as the model for how a part is written and commented. `critic/measures/drums.ts` and the drum targets in `packages/styles/src/blues/critic.ts`.

## What to build

**1. Funk drums as data** (ST-funk-06 to ST-funk-14): the kick alternatives held per section, the accented backbeat with a ghost pattern per section, the hat by tier and the open hat, the two-bar beat (answer bars turned round one way per section), fills that are never longer than a beat and never run down the toms, the dead-stop ending. Sixteenth grid; the style swings sixteenths by a trace.

**2. Jazz drums as data** (ST-jazz-08 to ST-jazz-17): ride time and the hat foot, the feathered kick, the light head as the low tier, snare comping chosen per phrase position by what the chart does in the bar, the phrase-end set-ups and the bomb, the fill shapes at 2, 4 and 8 steps, the button ending. Swung eighths only: nothing on a sixteenth that is not an eighth (ST-jazz-06).

**3. The engine concepts those need.** Find them by trying to write the data. The ones already visible from the notes; confirm each against the code, and expect others:

- A condition on **what the harmony does** in the bar: jazz snare comping has one list for a bar of one chord with no change at the barline, one for a change at the barline, one for two chords in the bar (ST-jazz-10, ST-jazz-11). `When` was designed to grow this way (see its comment).
- **A fill the time-keeping cymbal plays through** (ST-jazz-15). Today a fill replaces the time.
- **The drummer's part in a button ending** (ST-jazz-48: ride and kick on 1, then snare and kick together on the last "and"). The other three seats already play the button; check what the drums do with `gesture.kind === "button"` and with `"stop"` (ST-funk-41: kick, snare and closed hat on 1, no cymbal to ring over the silence).
- Funk's "if the chosen turn would change nothing in the bar, the next one in the list is used" (ST-funk-09). Decide whether that needs a concept or better data.
- The quiet end of jazz has two parts in the notes: a soft, spacious ride (ST-jazz-08, a ballad) and the light head on the closed hat (ST-jazz-09). Both are "low". Decide how one tier carries both (an energy condition inside the tier is one way: the head lands at 0.37 to 0.40 on the default arc; a player who sets the level to 0.25 is asking for a ballad) and say what you chose.

Not in this build: trading with the drummer and drum solos (ST-jazz-16, ST-jazz-52), brushes, and anything about the other seats.

**4. Measures and targets.** In `critic/measures/drums.ts`, each with a `says` sentence a drummer would agree with, and targets in each style's critic data (`packages/styles/src/funk/critic.ts`, `jazz/critic.ts`, under the `// ── drums ──` heading), labelled `intent` or `measured`, with `minCases`. From ST-funk-14: the backbeat, the kick on the One, ghosts per bar, answer bars that differ from the bar before, a section turning round the same way. From ST-jazz-17: the ride on every beat away from the light head, the share of phrase ends that get the shot on the "and" of 4 (not every phrase). "The snare lands where the piano strikes" needs the jazz piano, which does not exist yet: write the measure if it is cheap, and leave its target out. Existing measures that are blues ideas (triplet fills) simply get no target in the new styles. Check that each existing drum measure still says something true when it reads a jazz or funk take (a "backbeat" measure reading a jazz ride pattern, for instance), and say which do not apply.

**5. Validation.** Extend `validateDrumStyle` for anything you add to the type.

## The blues must not change

The three blues golden takes must pass unchanged, and `pnpm score` must report no movement. If a concept you add would change what the blues plays, it is the wrong shape: the blues' data should mean exactly what it meant.

## Rules of the house

As in `prompts/seat-drums.md`, "Rules of the house": random draws by position only (`heldRng`, `rng.fork` keyed by purpose and place), never in sequence; straight grid at written levels (feel swings it afterwards); every note starts inside its own bar; nothing written into `plan.lookahead`; a figure is chosen whole (X-A-31); an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a drummer's words; cite rule IDs where a rule explains a choice.

- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, 442 tests in about 8.8 s of a 10 s budget; the new styles are not in that run, so it should not get slower). `ENSEMBLE_STYLES=funk,jazz node --test test/` must pass too, apart from a failure that is plainly another seat's placeholder; if a drum property there is wrong for jazz or funk (the properties were written with one style in the room), leave it failing and say exactly why. Do not run `pnpm goldens` or `score --update`.
- Where the notes mark a rule `(unclear)`, or where you think the old band was weak, decide on purpose and say so. The old band's own lesson was that held choices are the audible ones (X-C-42): get the holds right.

## Boundaries

- Yours: `packages/engine/src/players/drums/**`, `packages/engine/src/critic/measures/drums.ts`, `packages/styles/src/funk/drums.ts`, `packages/styles/src/jazz/drums.ts`, the drum entries of `funk/critic.ts` and `jazz/critic.ts`, and exports in `packages/engine/src/index.ts`. In the shared files (the two critic files, `index.ts`) make small edits under your own heading; never rewrite the file.
- Not yours: the planner, feel, the other seats, `packages/styles/src/blues/**`, the test folder, `docs/`, `scripts/`, `out/`, `library/`. If you need a change there (a mark the plan should carry, a feel setting), stop short of it and say exactly what and why.
- You are working in your own clone of the repo. When you are done and `pnpm check` passes, commit your work there on a branch named `drums-jazz-funk` (one commit is fine). Do not push anywhere. Throwaway scripts and charts go outside the repo, in a temporary folder.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

A throwaway script: render the funk and jazz library charts and two blues charts in each new style, as a five-pass jam, a timed jam, and at set levels (`energy: 0.3`, `0.55`, `0.85`), and print the drums bar by bar as a text grid per voice with levels, beside the bar's chords, energy, tier, phrase position and marks. Read it as a drummer would. Funk: is the One there in every bar and the backbeat untouched, do the answer bars of a section all turn the same way, does a one-bar vamp get its fills on the eight- and sixteen-bar lines and not every lap? Jazz: is the head on the hat and the second chorus on the ride, does the snare comp where the chart moves, does the set-up come at phrase ends and not all of them, does the ride keep going under a fill, is anything on a sixteenth? Run 3/4 (`library/jazz-waltz-f.chart`) to see that it is sensible. Then `pnpm -s ensemble score --style funk --seeds 200` and `--style jazz` for the distributions and the worst takes, and read the worst takes.

## Report back

Short and factual: the files; **every engine change, each with one line on why it is a general concept**; how each style's part is laid out in the data and where you departed from the notes (one line each, with the rule ID); the numbers for every measure in both styles over 200 seeds; which existing measures do not apply to which style; the musical properties you believe always hold for jazz drums and for funk drums, stated as a drummer would (these become property tests); what `pnpm check` takes now; anything you wanted outside your boundary; and what you would ask the owner to listen for.
