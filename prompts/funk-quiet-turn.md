# Build: funk's quiet turn in twelve answers (#2299)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of nine styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2299 --jq .body`. In short: in funk's 12/8, a quiet section's drums can play one bar over and over. The quiet turn adds a soft kick on `3li`, and two of the four kick options in twelve already strike `3li`, so drawn together the answer bar is the bar before. The property "funk: the beat is two bars long" fails on funk's own 12/8 chart held at 0.3 on seeds 4, 10 and 11; the push's takes never met those.

You work in this worktree (`.work/2299`, branch `fix/2299-funk-quiet-turn`). Never `cd` out of it. Do not read the `legacy` branch or `~/code/ensemble-legacy`.

## Stop early, once, before building

Read first (below), then send back a short design and **stop** for an answer before writing code:

1. How a turn is drawn against a section's figure today (the engine's part and the style's part), and whether the same thing can happen anywhere else: every style, every meter, every voice that has turns. Count it, do not guess: for each style and meter, the pairs of (figure option, turn) where the turn adds nothing the figure lacks.
2. Which fix: data only (the turn's stroke moved, or each kick naming the turns it takes), or the engine concept "a turn that changes nothing is not drawable" once for every style. Say which you would take and why. If the count in 1 finds the same fault in other styles, the engine concept is likely right; if it is funk in twelve alone, data is.
3. The property, and what it costs the budget.
4. What moves: funk's goldens and scorecard, and whether anything outside twelve does.

## What to build (after the answer)

- **The property first, in its own commit, failing**: funk in twelve, held quiet, on the seeds above (and whatever else the count in 1 says is exposed): an answer bar's kick line differs from the bar before. Only the four kinds in `docs/TESTING.md`. Prefer widening the takes the existing "funk: the beat is two bars long" property reads over a new property, if that is what it means. Say the planted fault that proves it fails for the right reason.
- **Then the fix.**
- **`REMETERED` in `test/takes.ts` goes back to seed 1**, and the comment that explains seed 2 is removed.
- Funk's goldens and scorecard: say what moved and why, in numbers. Nothing outside twelve should move; if it does, find out why before going on. Do not accept a scorecard baseline (`score --update`) and do not raise a tolerance: report the movement and I will decide.

## Budgets

In CPU seconds, judged locally by `scripts/budget.ts`. **You may not raise one or change its rule**: `pnpm check` 220 (about 205 now), `pnpm test:full` 660 (about 610), `pnpm score` 150. There is little room: the property should cost a second or two at most. Read `docs/decisions/repository.md`, "room in the engine suite's budget", for what costs what: a take kept costs as much as a take rendered.

Run targeted tests while you build (`node --test test/<file>` with the style env the runner uses; see `scripts/test.ts`); I run the full gates alone afterwards. When you wait on a process, wait in the foreground or with `tail --pid`; never `until … pgrep -f` (it matches its own command line and never ends).

## The house

- The engine stays pure; styles are data; boundaries hold (`CLAUDE.md`).
- Decisions go in `docs/decisions/styles.md` (or `engine.md` if the engine gained a concept), as a new `## ` section appended at the end, dated 2026-11-22 with `#2299`.
- A musical call (where the turn's stroke goes) is yours: decide it from `docs/music-notes/`, log it with its reason. Never say how anything sounds.
- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`.
- If a permission is denied, do not work around it: say so.
- Leave no server or shell running; say what you started and that you stopped it.

## For his ear (not committed)

A page at `out/funk-quiet-turn/index.html`: `library/funk-twelve-eight-gm.chart`, funk, energy 0.3, seed 4, before (render from `origin/main` in a scratch checkout or by `git stash`-free means: a second worktree under your scratch is fine) and after, drums alone and the whole band (`pnpm render:audio`, `only=drums`), each with the kick line of bars 1 to 8 written beside it. No claim about how it sounds.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `docs/music-notes/` on drums and on funk (the answer-bar lesson); `packages/styles/src/funk/drums.ts`; how the engine draws a figure and its turn (`packages/engine/src/players/drums/`); the property "funk: the beat is two bars long" and its takes; `test/takes.ts` (`REMETERED`); `docs/decisions/styles.md` on funk in twelve.

## Report

What you built, file by file in a line each; the count from step 1; each call and why; the planted fault and what it failed with; goldens and scorecards with numbers; the budgets as you last read them; what is unproved; what you were unsure of.
