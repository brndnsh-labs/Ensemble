# Build: the meter is a choice on any chart (#2298)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of nine styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear or see.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2298 --jq .body`. In short: a chart's meter comes only from its header, and 57 of the 77 library charts are in 4/4. Style, key and tempo can each be changed on a chart's screen; the meter cannot. His words: "should we make time signature an easily configurable option like it used to be? seems like the user has to pick specific charts if they want a different time signature at the moment", and "ultimately it'd be cool to support every style in every meter, but maybe we should mark some as idiomatic or something".

You work in this worktree (`.work/2298`, branch `feat/2298-meter-choice`). Never `cd` out of it. Do not read the `legacy` branch or `~/code/ensemble-legacy`.

## Stop early, once, before building

Read first (below), then send back a short design and **stop** for an answer before writing code. It says:

1. Where the meter of a take is read today, and where the option goes (the take's options beside `key` and `tempo`; the CLI's `--meter`).
2. The rule for where chords land when a chart is read in another meter, as exact cases, with the library counted against it: for each of 4/4, 3/4, 6/8, 12/8 and 6/4 as the target, how many of the library's charts fit, and three charts that do not with the bar that stops them.
3. The tempo rule (see below), with two worked examples.
4. How a style says which meters are its own, and your list for each of the nine styles with what in `docs/music-notes/` each rests on (or "my judgement" where the notes are silent).
5. What the picker looks like in More, in words, and what it costs the screen.
6. Which properties, and what they cost the budget (see the budgets).
7. Anything in the issue you think is wrong.

## What to build (after the answer)

- **A take can be asked for in another meter.** The chart is read as if its header said that meter. Nothing in the chart's text changes, and a chart in its own meter plays exactly as before (no golden and no scorecard baseline moves; if one does, something leaked: find it).
- **Where the chords land.** A bar with one chord fits any meter. A bar whose slot count is valid in the new meter (`docs/CHART_FORMAT.md` section 4.1) is read as written. A bar of two chords in a bar that does not halve splits by how the bar groups, the long part first (3/4 is 2+1), as a player reading the chart would. A bar that still does not fit means the chart does not fit that meter: it is refused with a reason, never squeezed. One function answers "does this chart fit this meter", and the engine, the CLI and the app all ask it.
- **Not offered** on a chart with a section in its own meter.
- **The meters** are the five the band already plays: 4/4, 3/4, 6/8, 12/8, 6/4. No new meter, no new part written for any style: that is #2244. If a style turns out to play one of the five badly by the measures (a scorecard run on a re-metered library chart reads far from the same style on a chart written in that meter), report it; do not retune a style here.
- **Tempo.** The chart's figure counts its header meter's pulse. Read in another meter: where the count of pulses in a bar is the same (4/4 to 12/8), the pulse keeps the figure. Otherwise propose the rule at the early stop; whatever it is, the result is held inside the style's range for that meter (`tempoRange`), and a tempo the player has set himself is what is played.
- **Each style says which meters are its own**: data in the style pack, validated. A musical call, yours, logged with its reason for each style.
- **The CLI**: `--meter 12/8` on `render`, `read` and wherever `--key` and `--tempo` are taken; a kept take (`--save`, `replay`) carries it.
- **The app**: in More beside key and tempo, remembered for each chart as they are (`settings.ts`, `ChartChoices`). The list is the meters the chart fits, the style's own first and the others after a rule, no badge and no explanatory text: where a meter sits is the mark. A chart that fits only its own meter shows no meter control at all. Changing the style re-sorts the list and keeps the choice. A kept take remembers its meter and plays again in it; MIDI export is in it; the page's bars and the playhead follow the meter played. `count` (the app's counts, `counts.ts`) gains nothing unless there is already an event for key or tempo changing, in which case match it.
- **Do not clutter the interface**: one control, in the place its neighbours are, in their form.

## What holds it

- **Properties first, in their own commit, failing**, then the code. Only the four kinds in `docs/TESTING.md`. Each made to fail by a planted fault you then remove (say which):
  - a chart read in another meter keeps its chords in order, bar for bar, and every chord change lands on a pulse of the new meter;
  - a chart that does not fit is refused by `fits` and by a render alike (they cannot disagree);
  - a chart read in its own meter is the take it was;
  - for every style and each of the five meters, the band's existing properties hold on a re-metered chart (reuse takes the suite already makes where you can: see the budgets).
- **Budgets, in CPU seconds, judged locally by `scripts/budget.ts`. You may not raise one or change its rule**: `pnpm check` 220 (about 200 now), `pnpm test:full` 660 (about 615), `pnpm score` 150, `pnpm smoke` 60 s on the clock. There is little room: a re-metered take for every style in every meter will not fit. Pick the fewest takes that prove the rule (the rule is the chart's reading, which is not per style), and say what you left unproved.
- **Another builder may be at work on this machine.** Run targeted tests while you build; I run the full gates alone afterwards.
- **The engine stays pure; styles are data; boundaries hold** (`CLAUDE.md`).
- **Decisions** go in `docs/decisions/engine.md` (the option, the reading rule, the tempo rule), `docs/decisions/styles.md` (each style's own meters) and `docs/decisions/app.md` (the picker), as new `## ` sections appended at the end, dated 2026-11-22 with `#2298`. `docs/CHART_FORMAT.md` says nothing new unless the format changed (it should not); the CLI lines in `CLAUDE.md` gain `--meter`.

## For his eye and ear (not committed)

A page at `out/meter-choice/index.html`: the picker in light and dark at phone size (`node scripts/look.ts`, 390x844), open, on a chart that fits all five and on one that fits two; and clips (`pnpm render:audio`) of `library/blues-12-bar-a.chart` and one other 4/4 chart in each meter they fit, in two styles, each with what was measured beside it (tempo played, bars, how the two-chord bars split). No claim about how anything sounds or looks.

## Brake

A kept take's recipe gains an optional field: a shape kept through `packages/app/src/stored.ts`. Change nothing else about what is stored, do not touch the service worker or `offline.ts`, and say in your report exactly what the stored shape gained and what an old kept take (no meter) does. The PR will wait for Brandon's word.

## Rules of the house

- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`.
- If a permission is denied, do not work around it: say so.
- Leave no server or shell running; say what you started and that you stopped it.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `docs/CHART_FORMAT.md` sections 3 and 4; `docs/MUSIC_NOTES.md` and the parts of `docs/music-notes/` on meter and on each style; `docs/decisions/README.md`, then what `engine.md`, `styles.md` and `app.md` say of meters (the "fit", the meter studies, tempo in pulses); `packages/engine/src/perform/meter.ts`, `packages/engine/src/style/meters.ts`, how `key` and `tempo` travel as take options from the CLI and from the app (`packages/app/src/settings.ts`, `play/PlayView.tsx`, `play/jam.ts`, `takes.ts`); `test/takes.ts` and one property file for the house form.

## Report

What you built, file by file in a line each; each call and why; the planted faults and what each failed with; goldens and scorecards (nothing should have moved: say so with the command's output); the budgets as you last read them; what is unproved; what you were unsure of.
