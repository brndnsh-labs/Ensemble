# Build: a moved idea cut short on one take (#2287)

The issue is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2287 --jq .body`. The fix it follows is #2283 (commit `fdab021a` on `main`; `asHeard` in `packages/engine/src/players/solo/play.ts`, `rhythmsAgain` in `players/solo/critique.ts`, the decisions entry in `docs/decisions/soloist.md`). Read `docs/music-notes/` where the soloist's ideas coming back are described (the index `docs/MUSIC_NOTES.md` says which part).

## Where you are and the limits

A git worktree, branch already made from `origin/main`, dependencies installed. Work only there. Stage explicit paths, never `git add -A`; never `--no-verify`, amend, force-push or bare `git stash`; no push, no pull request, nothing on GitHub beyond reading the issue; never read the `legacy` branch; nothing about the project to outside services; no servers. The repository is public: no secrets, no private addresses. End each commit message with:

    Co-Authored-By: Claude Opus <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01WSqFoPyrBesZYYie7fD53M

Read `CLAUDE.md` and `docs/TESTING.md` first (tests are rationed; a property is stated as music; no floor, tolerance or existing assertion is loosened: if you think one must be, stop and report, do not edit it).

Another builder is working in a sibling worktree at the same time, so **do not run the full gates** (`pnpm check`, `pnpm test`, `pnpm test:full`, `pnpm score`, `pnpm smoke`): the budgets count CPU and read high on a shared machine. Run what your change touches: `pnpm typecheck`, `pnpm lint`, single files (`node --test --test-isolation=none test/<file>`, `ENSEMBLE_STYLES=<id>` to hold it to one style, `ENSEMBLE_SEEDS=6` for the full count), and `node --test test/goldens.test.ts`. The coordinator runs the gates alone afterwards. Kill every shell you started before reporting.

Your worktree: `/home/brandon/code/ensemble/.work/2287`, branch `idea-cut-short`.

## The case

Jazz handed `library/reggae-one-four-g.chart`, the default soloist kind (see `SOLOIST_KINDS` and how soloist takes are made in `test/takes.ts`), seed 1: at tick 54720 a moved idea's note sounds 624 ticks where the phrase it is measured against sounded 960. The property is "an idea comes back a beat early or late" in `test/soloist.test.ts`; it allows 120 + 40. No take the suite plays reaches this one.

## Stop once, early

Reproduce it with the property's own checks, find which earlier phrase the engine holds the idea to and which the property measures against, and why the note is 624. Then **stop and report** (under 300 words): the cause, read from the take; the fix you propose, as the engine's and the property's choice made the same one, or the third cause if it is one; what else in the library it would move (a sweep of every style over every library chart at two soloist kinds, seeds 1 and 2, counting notes held longer and notes cut short against the property's allowance, before your fix). I will answer before you build.

## Rules

- No property loosened; if the property's choice of phrase is the wrong one musically, say so and stop: that is the coordinator's call, then the owner's.
- If the engine changes: the same sweep after, showing none held longer and none cut short; goldens unchanged or each moved file named with the notes that moved (`pnpm goldens` only then); scorecards re-accepted only for a style whose card moved, with the measures and figures (`pnpm -s ensemble score --style <id>` for one style is allowed; never accept a drop without reporting it).
- Something the suite plays must reach the case so it cannot come back unseen: the cheapest way (the property's own short take of that chart and seed, if the property file already plays takes of its own), with a planted fault that fails.
- `docs/decisions/soloist.md`: an entry with the cause and the fix.

## Report

Under 350 words: the cause; the fix and where; the sweep before and after; goldens and scorecards; the plant; what you ran.
