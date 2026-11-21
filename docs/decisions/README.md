# Decisions

The record: why things are as they are. Date, decision, one line of why. Newest at the bottom. Departures from the docs are marked **(departure)**.

It was one file, `DECISIONS.md`, until 2026-11-21 (#2259), when it was split by area, each section moved whole and word for word, in its order. What is in flight and what shipped is on the issues and pull requests, not here.

| File | Holds |
|---|---|
| [`engine.md`](engine.md) | the engine's shape and rules, the chart format, the plan, takes and the arrangement, goldens, the built-in library |
| [`rhythm-section.md`](rhythm-section.md) | the drum seat and the bass seat |
| [`chords.md`](chords.md) | the comping seat: voicings, rhythm, the piano and the guitar |
| [`soloist.md`](soloist.md) | the soloist, and what each instrument does with a note's pitch |
| [`styles.md`](styles.md) | a style's whole band: each new style, a style read as a band |
| [`meters.md`](meters.md) | meters other than 4/4: six and twelve, and the rest to come |
| [`critic.md`](critic.md) | the critic and the scorecard, the ear cases, his verdicts by ear that are about more than one seat |
| [`audio.md`](audio.md) | the sample packs, the audio package, instruments chosen by ear, levels |
| [`app.md`](app.md) | the app: screens, editor, takes and export, the poster wall, loading |
| [`repository.md`](repository.md) | the test suite and its budgets, the tracker and pipeline, hosting, CI and the release |

**A new decision** is a `## ` section appended at the end of its area's file: a heading that says what was decided, with the date (and the issue, if there is one). A decision that spans two areas goes in the one it changed most. When none fits, add a file and a row here rather than stretch one.

**An ear case** in `scorecard/ear-cases.json` cites where his words are written as `docs/decisions/<area>.md: <heading>`, the heading word for word (a `## ` or `### `). `pnpm ears` fails on one that is not there, and CI runs that check.

Briefs under `prompts/`, the gate reports under `out/gate-*/` and the sections themselves still say `DECISIONS.md` where they were written before the split: they are history and are left as written. Read such a mention as this folder.
