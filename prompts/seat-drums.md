# Prompt: build the drum seat (stage 1)

A brief for a subagent. It was launched once on 2026-11-14 and stopped a minute later for quota, with nothing written. Relaunch it as is. The bass seat needs a sibling brief of the same shape (see `PLAN.md`, "Resume here").

---

Build the drum seat of a generative backing band, and the blues drum data it plays. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript, stage 1 of 6). Chord charts and a style pack go in; a drummer, bassist and others each write notes; MIDI comes out. Nobody on this project can hear the output except the owner, who will audition MIDI files in Logic Pro and judge "does the shuffle feel like a shuffle". The previous version's drums were one of its strongest parts, and your job is to preserve that quality in a cleaner design.

## Read first

Project rules and design (short): `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, and sections 4 to 7 of `docs/BRIEF.md`.

The musical knowledge, extracted from the previous version by people who read its code. It is domain knowledge, not a design to copy. Rule IDs like `DR-12` are stable; cite them in code comments where a rule explains a choice.

- `docs/music-notes/a-rhythm-section.md`: the conventions and cross-cutting rules at the top, "Drums" (shared craft: grooves, fills, crashes; the blues section; known weaknesses), "Fills and crashes are the drummer marking the form" under the conductor (already implemented by the planner; read it to know what the marks mean), "The five gestures", "Each style's ending", "The bar before", "A last bar that gets home itself", the drum entries under "Known failures and things tried", and the DR entries under "Surprises". Skim the other styles' drum sections only to see what the data format will have to express later.
- `docs/music-notes/c-styles.md`: "How to read the grids", "Styles: overview", "Style: blues" (tempo and feel, drums, endings), and the drum items in "What differs between styles and what does not".

The code you build on, all in `packages/engine/src/`:

- `style/types.ts`: `StylePack`, `Tier`, `tierOf`, `PerTier`, `Hold`, `EndingGesture`.
- `plan/types.ts`: `Plan`, `PlanBar` (energy, seats, `fill`, `crash`, `ending`, `kind`, phrase and section position), `planBar`.
- `perform/notes.ts`: `WrittenNote`, `Player`, `PlayerContext`, `heldRng`.
- `perform/grid.ts`: the pattern notation (`cells`, `strokes`, `LEVELS`, `STEP`).
- `perform/feel.ts` and `perform/perform.ts`: what happens to your notes after you write them. Read these so you do not duplicate them.
- `rng.ts`: the seeded generator and `fork`.
- `plan/plan.ts`: how fill, crash, and ending marks are decided (you consume them).

## Deliver

1. `packages/engine/src/players/drums/style.ts`: the `DrumStyle` type, replacing the placeholder. This is the drum seat's part of a style pack. It is **plain data with no functions** (it must be expressible as JSON). Design it so the blues is fully expressed now, and so that jazz (ride time, a feathered kick, snare comping chosen by phrase position), funk (sixteenth hats, answer bars that change only beats 3 and 4 of every second bar, kick alternatives), reggae and disco could later be added as data without redesign. Do not build machinery only those styles need; just do not paint yourself into a corner. The hard rule of this project: adding a style changes data only, and when it cannot, the engine is missing a general concept.
2. `packages/engine/src/players/drums/kit.ts`: the kit's voices and their General MIDI percussion notes (kick 36, snare 38, cross-stick 37, closed hat 42, pedal hat 44, open hat 46, ride 51, crash 49, toms, and so on). A ghost snare is its own voice name (so a sampler can use a ghost articulation) on the snare's MIDI note. The count-in uses sticks (side stick 37 is acceptable; say what you chose).
3. `packages/engine/src/players/drums/play.ts`: `playDrums: Player`, replacing the placeholder. Split into more files in that folder if it helps legibility. It must handle:
   - the count-in bar (`kind: "count-in"`): one stick click per beat, nothing else;
   - tail bars (`kind: "tail"`): nothing;
   - grooves per energy tier with weighted alternatives, each choice held for the span its data says (use `heldRng`);
   - the cymbal rules (one hand, one cymbal: DR-03) and any velocity touches a style lays over its grid (the blues lope, DR-43);
   - fills from the bar's `fill` mark: a fill replaces the time over its span, keeps the kick and hat foot unless it writes its own, sits at the end of the bar, is one whole written shape chosen in one draw, is sized by the mark's boundary and tier and halved when the mark says half (and only when the full fill is at least 4 sixteenths), draws from the bigger vocabulary when the mark is a top (DR-12 to DR-19, CO-43 to CO-46);
   - the arrival crash from the bar's `crash` mark (DR-20, DR-103): it edits the groove, it does not layer on it;
   - the ending bar (`bar.ending`): the style's own last bar, played where the final chord lands (`ending.at`); when the final chord lands partway through the bar, what comes before is caught with a kick alone (EN-37, EN-38); no ordinary crash on the ending bar (EN-24);
   - meters other than 4/4 without crashing and without nonsense: one cell per pulse by pulse role (DR-10). Only 4/4 needs to be idiomatic;
   - a bar where the drums are out (`bar.seats.drums === null`): the framework drops those notes, but do not rely on state from them.
4. `packages/styles/src/blues/drums.ts`: `bluesDrums: DrumStyle`, replacing the placeholder, transcribed from the notes with comments that say what each pattern is in a musician's words. Two places where the old band was weak and you should do better, on purpose:
   - **Fills (DR-88).** The old blues had no fully written fill vocabulary: its longer fills flipped a coin per kick stroke. Write whole shapes, including the kick under them, with several alternatives per length so consecutive fills differ, and separate lists for a phrase end, a section end, and a top. Keep the triplet character (at swing 100 the written "e" is the triplet's middle note and the "a" is never used: DR-40). Keep the backbeat on 4 in any fill of one beat or less.
   - **The ride (DR-45, DR-109).** The old band moved the shuffle to the ride only on a written repeat of a section, so a looping 12-bar blues never reached it. Decision already made: at high energy, hat versus ride is a weighted choice held per pass (one time through the section), so some hot choruses ride and the whole chorus commits. Start with equal weights.
5. `validateDrumStyle(drums: DrumStyle): string[]` exported from the drums folder: human-readable problems (a line of the wrong length, an unknown voice, an empty option list, weights that sum to zero). An empty array means the data is sound.

## Rules of the house

- **Position, not sequence.** Every random choice is drawn from `heldRng(...)` or `rng.fork(...)` keyed by a purpose and a place in the music. Never draw two decisions from one stream in sequence; never keep a running random state across bars. A bar must come out the same whether or not the bars before it were generated. This is what lets an open-ended jam be extended without changing what was already played, and it is tested.
- **Straight grid, written levels.** Write every note on the straight sixteenth grid at its written velocity (the four levels in `grid.ts`, or explicit numbers from the notes). Never swing, lean, humanize, or scale by energy yourself: `feel.ts` does all of that afterwards for every seat. Use the bar's energy only to choose *what* to play (the tier, thresholds like the cross-stick line at 0.30).
- **Every note starts inside its own bar** (`note.bar` is the plan bar index, `note.tick` is absolute) and no note is written into the look-ahead bars (`plan.lookahead`), though you may read them to see what comes next.
- **A figure is chosen whole**, never stroke by stroke (X-A-31). A coin per stroke reads as scatter.
- The engine is pure: no DOM, no Node, no clock, no `Math.random`, no dependencies, no imports from outside `packages/engine/src`. Strict TypeScript 7 with `erasableSyntaxOnly` (no enums or parameter properties), `verbatimModuleSyntax` (`import type`), relative imports with `.ts` extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prefer a small, legible codebase over a clever one. The owner reads the code. Comments say why, in musical terms.
- **Do not write tests.** Tests are rationed on this project and the main session owns the suite. Instead, verify your work with a throwaway script (below) and report which musical properties you believe always hold.

## Boundaries

- Edit only: `packages/engine/src/players/drums/**` and `packages/styles/src/blues/drums.ts`. Do not edit `packages/engine/src/index.ts`, the plan, perform, style, or theory files, `docs/`, or anything else; if you need a change there (a field the plan should carry, a helper that belongs in shared code), stop short of making it and say exactly what and why in your report.
- Do not commit.

## Verifying without ears

Write a throwaway script outside the repo. If the chart parser exists (`parse` and `expand` exported from the engine), use a chart from `library/`; otherwise build `FlatBar`s by hand (a 12-bar blues in 4/4, one section labeled "A"; `ChartChord` objects can be minimal). Call `planBars` from `packages/engine/src/plan/plan.ts` in jam mode with about 6 passes, then `playDrums` with the blues pack from `packages/styles/src/blues/index.ts`. Print each bar as a text grid per voice with velocities, alongside the bar's energy, tier, and marks, and read it as a drummer would: is the kick on 1 and 3 in every groove bar, do fills end on the eve of the barline, does the bar after a section fill crash without doubling the hat, do two passes at the same tier share a groove, does the ending bar play the blues ending. Also run it in 3/4 and 6/8 to see that nothing breaks, and run two seeds to see that held choices differ between seeds and repeat within one. Node 26 runs `.ts` files directly.

## Report back

Short and factual: the files; the shape of `DrumStyle` in a few lines and how a later style would express answer bars and phrase-position comping in it; every judgment call you made where the notes were unclear or you departed from them (one line each, with the rule ID); the musical properties you believe always hold for the drums, stated as a musician would, with numbers where they apply (these become the project's property tests); anything you wanted to change outside your boundary; and what you would ask the owner to listen for.
