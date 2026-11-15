# Ensemble

A browser-based generative backing band. Read these before doing anything:

1. `docs/BRIEF.md` (what and why)
2. `docs/CHART_FORMAT.md` (the song text format; a spec)
3. `docs/TESTING.md` (what may be tested; binding)
4. `docs/MILESTONES.md` (stages and gates)
5. `docs/MUSIC_NOTES.md` (musical knowledge carried over from the previous version: an index, plus four parts under `docs/music-notes/` to read when the work touches them)
6. `PLAN.md` (the map, and "Resume here" for current state) and `DECISIONS.md`

## Standing rules

- **The engine is pure.** `packages/engine` has no DOM, no audio, no I/O, no clock, and no `Math.random`. Text and a seed go in, events come out. Same inputs, identical output.
- **Boundaries hold.** `app` and `audio` may import `engine`. `engine` imports nothing from them. `audio` knows nothing about music theory.
- **Styles are data.** Adding or tuning a style must not require engine changes. If it does, the engine is missing a concept: add the concept, then express the style as data.
- **You cannot hear.** Never claim something sounds good. Report what the properties and the critic scorecard say, write audition files, and let Brandon judge.
- **Tests are rationed.** Only the four kinds in `docs/TESTING.md`. Do not add per-function unit tests, mocks, or Playwright specs outside the named smoke journeys.
- **Feedback from a listening gate becomes a property or a critic metric first**, then a code change.
- **Decide and log.** When the docs do not settle something, make the call, record it in `DECISIONS.md` with one line of rationale, and continue. Stop and ask only when a choice would be expensive to reverse and could reasonably go either way.
- **Stay in scope.** `docs/BRIEF.md` lists non-goals. Do not build them.
- **Check current versions.** Do not assume library versions or APIs from memory. Look them up when adding a dependency, and prefer few dependencies.

## Commands

```sh
pnpm install            # once
pnpm check              # typecheck, lint, tests (10-second budget)
pnpm typecheck          # tsc --build across packages
pnpm lint               # biome check; `pnpm format` to fix
pnpm test               # engine suite under the budget
pnpm score              # the critic's scorecard against the accepted baseline (2-minute budget)
pnpm goldens            # rewrite the golden takes (then say why in DECISIONS.md)
pnpm gate:1             # write a gate's audition files to out/gate-1/ (also gate:2, gate:3)
pnpm ensemble <command> # the CLI; runs TypeScript directly on Node 26, no build step
```

The CLI:

```sh
pnpm -s ensemble parse  library/blues-12-bar-a.chart
pnpm -s ensemble fmt    library/blues-12-bar-a.chart [--write]
pnpm -s ensemble render library/blues-12-bar-a.chart --out take.mid [--save take.json] \
    [--style blues] [--seed 1] [--minutes 3 | --passes 4] [--song] \
    [--solo | --solo-instrument alto-sax] \
    [--tempo 96] [--energy 0.3] [--key Bb] [--without bass] [--no-count-in]
pnpm -s ensemble replay take.json --out take.mid
pnpm -s ensemble score  [chart...] [--style blues] [--seeds 200] [--update | --check]
```

A take is its chart, style, options, and seed: the same four always give the same MIDI file. `score --update` accepts the current scorecard as the baseline in `scorecard/<style>.json`.
