# Prompt: build the chart parser (stage 1)

A brief for a subagent. It was launched on 2026-11-14 and paused for quota. Before relaunching, look at what it left in `packages/engine/src/chart/` and `packages/engine/test/`, and say so at the top of the brief if there is work to continue from.

---

Build the chart parser, canonical printer, and expander for this project (Ensemble, a generative backing band; a ground-up rewrite in its first stage). The chart text format is the user-facing source of truth for songs, and everything else is built on what you produce, so correctness against the spec matters more than speed.

## Read first

1. `docs/CHART_FORMAT.md`: the spec. Treat every sentence as a requirement.
2. `docs/TESTING.md`: binding. Only the test kinds it names may exist. For this work that means the **fixture corpus** (one table, one runner, one round-trip check over the whole corpus) and, optionally, one **property** that states a user-facing rule (below). No per-function unit tests, no mocks.
3. `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`.
4. The code already in `packages/engine/src/`: `chart/types.ts` (the contract to produce: `ChartChord`, `FlatBar`, `ChordSpan`, `ExpandedChart`, `Diagnostic`, `SourceRange`, `Meter`, `PPQ`), `theory/pitch.ts` and `theory/chord.ts` (note names, keys, degrees, qualities, `makeQuality`, `qualityToString`), `plan/plan.ts` (the consumer of `expand`: note how it groups bars into section runs by `sectionIndex` and `barInSection`), and `index.ts` (the public API barrel).
5. `library/*.chart`: eight blues charts written by hand and not yet validated by any parser. They must parse with no errors or warnings; if one does not, report whether the chart or the parser is wrong before changing either.

## Deliver

In `packages/engine/src/chart/` (split into files as you see fit; keep each one legible, since the owner reads the code):

- `parse(text: string): { chart: Chart; diagnostics: Diagnostic[] }`. Never throws, on any input whatsoever. Handles CRLF, tabs, and the Unicode sharp and flat signs.
- `print(chart: Chart): string`: canonical printing per spec section 9.
- `expand(chart: Chart): ExpandedChart`: repeats, endings, `%`, `.` holds, and section references flattened into bars for the planner, per the comments in `types.ts`. Spans cover each bar exactly, in ticks (`PPQ` is 480; `barTicks(meter)` gives the bar length).
- `transpose(chart: Chart, toKey: Key): Chart`: a change of key. Every chord's degree is kept and its absolute spelling recomputed; section key overrides move by the same interval; printing the result is the explicit "transpose and rewrite".
- Display helpers for a later lead-sheet view: a function that returns a chord's parts for display as a name or as a numeral, separately (root or numeral, quality suffix, bass), so a view can set the root large and the quality small. Name display uses canonical quality spellings. A chord typed as a name must be displayable as a numeral and the reverse.
- The `Chart` model type itself is yours to design, within spec section 8: it preserves repeats, endings, `%`, references, comments, unknown header fields, and a source range on every node; it exposes resolved title, key, tempo (null when absent, since the default comes from the style), meter, and style id (null when absent); each section exposes its label, its jam-mode role, and its resolved key and meter.
- Export the public functions and types from `packages/engine/src/index.ts` (append; other exports are already there).

In the test directory (currently `packages/engine/test/`; the main session will move it to a top-level `test/` package):

- `corpus.ts`: the table. Each row has a `name` that states the rule of the format it demonstrates, the chart `text`, and the expected result: expanded bars in a compact, human-readable notation of your design (something like `"C:1440 G:480"` per bar, with clear marks for no-chord and tied spans; it must show absolute spellings so numeral rows prove resolution), the exact expected diagnostics (severity, line, and a distinctive fragment of the message), and where useful the expected canonical print and the numeral display. The table should read top to bottom as an illustrated copy of the spec. **Every example in the spec is a row**, including each line of each table that shows chart text (slot examples, each quality alias, each row of the numeral table, each ambiguity rule in section 6.4, each row of the diagnostics table, every "More examples" chart). A new edge case is a new row, never a new test.
- `chart.test.ts`: one runner over the table; one round-trip check over the whole corpus plus every file in `library/` (tests may read files with `node:fs`; the engine may not). Each `test(...)` name states its rule in plain language.
- Optionally one property in the same file, named for the rule "one bad token never breaks the rest of the chart": mutate corpus texts with a seeded generator (`createRng` from the engine; no `Math.random`), and check that `parse` never throws, that `expand` always yields bars whose spans cover them exactly, and that printing then parsing is stable. Keep the whole engine test run well under 2 seconds.
- Tests import only from `@ensemble/engine` (the public API), never from `src/` paths.

In `packages/cli/src/`:

- Turn `main.ts` into a small command dispatcher with one file per command under `commands/`, and implement `parse <chart>` (diagnostics in a readable `file:line:col severity message` form, then the parsed model as JSON; exit code 1 when there are errors) and `fmt <chart>` (canonical print to stdout; `--write` rewrites the file). `render` and `score` will be added later by someone else, so leave the dispatcher easy to extend. No dependencies; parse arguments by hand or with `node:util` `parseArgs`.

## Decisions already made (follow these)

- **Round trip** means: `parse(print(parse(text).chart)).chart` equals `parse(text).chart` once source ranges and each chord's as-typed `text` are set aside. Provide that comparison (or a function that strips those fields) from the public API so the test and later tools share one definition. Presentation structure (repeats, endings, `%`, references, comments, header fields including unknown ones, names versus numerals) is part of the model and must survive.
- **Qualities** are built with `makeQuality`, which normalizes (for example m7 with b5 becomes m7b5; `7#5` is base `7` with alteration `#5`). The alias table in spec 6.3 belongs to the parser. If the theory types cannot represent something the spec requires, make the smallest change to `theory/` that fixes it and report it.
- **Numerals print canonically** with case carrying the third: minor-third qualities print lowercase with the leading `m` dropped (`ii7`, `imaj7` for minor-major seventh, `i6`), diminished prints as lowercase with `o` (`viio`, `viio7`), half-diminished as lowercase with `ø7`. `IIm7` therefore prints as `ii7`. Input stays lenient (`iim7b5`, `VIIdim7`, `ii7b5` are all understood).
- **`V7/ii`**: `degree` is where the chord sounds against the key (VI), and `secondary` records the numeral as written and what it is "of", so it prints and displays as `V7/ii`.
- **Line layout**: the printer uses four bars per line unless the section's source used another consistent width. A final ending "runs to the end of the line", so line breaks are meaningful there: the printer must never reflow in a way that changes which bars belong to an ending.
- **Slot counts**: the rule in 4.1 is the definition ("divides n, or equals n times a power of two"); the table is illustrative.
- **`FlatBar.barInSection`** counts bars within one time through a section, from 0, across that section's repeats; `sectionIndex` is the index of the section header the bars were played under (a reference `[A]` has its own index).
- **Diagnostics** follow the table in spec section 7 exactly for recovery behavior. Messages are written for a musician, say what is wrong, and where possible what to type instead. An arrangement block (`---`) and `!word` annotations are parsed and ignored with an info diagnostic, as specified.
- **Language constraints** (enforced by the toolchain): strict TypeScript 7, `erasableSyntaxOnly` (no enums, no parameter properties, no namespaces), `verbatimModuleSyntax` (`import type` for types), relative imports carry the `.ts` extension, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are on. The engine has no DOM, no Node, no dependencies; lint rejects `Math.random`, clock reads, and imports that leave the package. Code runs directly under Node 26 type stripping; there is no build step.

Where the spec is ambiguous or silent (for example: whether `Intro 2` counts as an intro, what a `.` after a `%` bar extends, whether a repeat count of `x1` is legal, how a second ending interacts with a section reference), make the call a musician would expect, add a corpus row that pins it, and list it in your report. Do not write to `DECISIONS.md` or to anything under `docs/`; the main session maintains those.

## Constraints

- Work only in `packages/engine/src/chart/`, `packages/engine/src/index.ts`, the test directory, `packages/cli/src/`, and (minimally, if truly needed) `packages/engine/src/theory/`. Do not edit `library/`, `docs/`, configuration files, or `package.json` files without saying why in the report.
- Do not commit. Leave the tree uncommitted for review.
- Run `pnpm check` from the repo root (typecheck, lint, tests with a 10-second budget) and `pnpm format` before you finish. Also run `pnpm -s ensemble parse` and `fmt` on each library chart and confirm formatting a formatted file changes nothing.

## Report back

Short and factual: the files you created; the `Chart` model in a few lines; the number of corpus rows; the output of the final `pnpm check` (pass counts and time); every ambiguity you resolved and how (one line each, for the decision log); anything in the spec you think is wrong or under-specified; and anything you could not finish.
