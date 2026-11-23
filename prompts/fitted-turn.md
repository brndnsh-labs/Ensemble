# Build: in a fitted meter the drums' turn is one the fit keeps (#2308)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of nine styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2308 --jq .body`. In short: where a style has no drum part written for a meter, the drums are fitted from the 4/4 part. The section's turn (the answer bar's variation, `docs/music-notes/a-rhythm-section.md` DR-05, DR-06, DR-95) is chosen against the 4/4 bar, and the fit can then drop the stroke the turn added, so the answer bar is the bar before. Since #2298 any chart that fits can be played in 3/4, 6/8, 12/8 or 6/4 in any style from the app, so fitted bars are reachable.

The rule that was just fixed for written meters (#2299, `docs/decisions/engine.md`, "a turn that only restrikes a stroke is not heard"): a turn is heard only where it strikes a silent step, takes a stroke away, or moves a snare across the ghost line. This issue is the same rule's other gap: the check runs before the fit.

You work in this worktree (`.work/2308`, branch `fix/2308-fitted-turn`). Never `cd` out of it. Do not read the `legacy` branch or `~/code/ensemble-legacy`.

## The musical call (made; log it)

DR-11 records that the old version played no answer bars outside 4/4. That was its limit, not a lesson: DR-95 is the lesson (a section of one bar four times was "correct but lifeless"), and every style in every meter is where the band is going (#2244). So: **a fitted bar plays a turn where one of the style's turns survives the fit and is heard in the bar as fitted; where none does, it plays none.** No turn is invented, no style data is written, and a meter a style has a part written for is untouched.

If your reading shows this call is wrong (for example the surviving turns land somewhere the notes say a drummer in that meter would not put them), say so at the early stop.

## Stop early, once, before building

Read first (below), then send back a short design and **stop** for an answer before writing code:

1. **Confirm the count by reading takes**, not only by enumeration: for funk, rock, reggae, acoustic and country in 3/4 (and country in fitted 6/8), `pnpm -s ensemble read <a 4/4 library chart> --style <style> --meter 3/4 --seats drums` on three seeds each at a held energy, and say how many answer bars are the bar before. Then the enumeration for every style, every fitted meter (3/4, 6/8, 12/8, 6/4 where the style writes no part) and every tier: the share of draws where the answer bar strikes what the bar before strikes.
2. Where the check should move: the turn's lines as fitted (`onThePulse`, and whatever the fit does to a bar of three), compared with the bar as fitted. Say exactly what the fit does to a turn in each fitted meter, and for each style and fitted meter, which of its turns survive.
3. After the change, by the same enumeration: the share of draws with a heard answer, and the cases where no turn survives (the bar plays none).
4. The property and what it costs the budget.
5. What moves: goldens (none should: they are in written meters), scorecards (the library's charts are scored in their own meters: say whether any style's library has a chart in a meter the style has no part for, since those takes will move).

## What to build (after the answer)

- **The property first, in its own commit, failing**: in a fitted meter, where a style's section has a turn that survives the fit, an answer bar differs from the bar before in what it strikes. Only the four kinds in `docs/TESTING.md`. Reuse takes the suite already makes where you can: the `REMETERED` takes in `test/takes.ts` already play every style in fitted meters. Say the planted fault that proves it fails for the right reason.
- **Then the engine change**, in `packages/engine/src/players/drums/groove.ts`. Styles are data: no style file changes. If a style needs data to make this work, stop and say so.
- Goldens and scorecards: say what moved and why, in numbers. Do not `score --update` and do not raise a tolerance: report the movement and I will decide. If `pnpm score` puts any measure outside what was passed by ear, stop and report.

## Budgets

In CPU seconds, judged locally by `scripts/budget.ts`. **You may not raise one or change its rule**: `pnpm check` 220 (about 204 now), `pnpm test:full` 660 (about 610), `pnpm score` 150. The property should cost a second or two at most; a take kept costs as much as a take rendered (`docs/decisions/repository.md`, "room in the engine suite's budget").

Run targeted tests while you build; I run the full gates alone afterwards. When you wait on a process, wait in the foreground or with `tail --pid`; never `until … pgrep -f` (it matches its own command line and never ends).

`/tmp` on this machine is memory. Keep scratch small, write audio only under `out/`, and remove any scratch worktree, scratch folder and `/tmp/ensemble-chrome-*` profile you leave (only once no Chrome of yours is running).

## The house

- The engine stays pure; styles are data; boundaries hold (`CLAUDE.md`).
- Decisions go in `docs/decisions/engine.md` as a new `## ` section appended at the end, dated 2026-11-22 with `#2308`, with the call above and its reason, the count before and after, and what moved.
- Never say how anything sounds.
- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`.
- If a permission is denied, do not work around it: say so and stop that line of work.
- Leave no server or shell running; say what you started and that you stopped it.

## For his ear (not committed)

A page at `out/fitted-turn/index.html`: for funk, rock and country, one 4/4 library chart played in 3/4 (`pnpm render:audio … meter=3/4`), drums alone and the whole band, before (from `origin/main` in a scratch worktree) and after, on a seed where the answer bar was the bar before; beside each, the drum lines of bars 1 to 4 as `ensemble read` gives them. No claim about how it sounds.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `docs/music-notes/a-rhythm-section.md` on answer bars and other meters (DR-05, DR-06, DR-11, DR-95 and what stands near them); `packages/engine/src/players/drums/groove.ts` (`grooveBar`, `changes`, `onThePulse`, and the fit); `packages/engine/src/perform/meter.ts`; each style's `drums.ts` under `packages/styles/src/` for which meters it writes; `test/drums.test.ts` and `test/takes.ts` (`REMETERED`, `heldTakes`); `docs/decisions/engine.md` on #2298 and #2299.

## Report

What you built, file by file in a line each; the counts before and after; each call and why; the planted fault and what it failed with; goldens and scorecards with numbers; the budgets as you last read them; what is unproved; what you were unsure of; what you started and cleaned up.
