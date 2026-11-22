# Build: a chart with two Solo sections in one time through the form (#2293)

The issue is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2293 --jq .body`. It follows #2282 (commit `92af5c16` on `main`): read that commit's `packages/engine/src/plan/plan.ts` (`soloMarks`, `soloArc`, `setOut`, the `turn` closure, `soloClimax`, `soloBreath`, `soloRise`, and the override near "A solo under way when the band is told to finish"), the entry "a jam on a chart with a Solo section" in `docs/decisions/soloist.md`, and the Solo-section clauses in `test/soloist.test.ts` and `test/band.test.ts`.

## Where you are and the limits

A git worktree at `/home/brandon/code/ensemble/.work/2293`, branch `two-solo-sections`, from `origin/main`, dependencies installed. Work only there. Stage explicit paths, never `git add -A`; never `--no-verify`, amend, force-push or bare `git stash`; no push, no pull request, nothing on GitHub beyond reading the issue; never read the `legacy` branch; nothing about the project to outside services; no servers. The repository is public: no secrets, no private addresses. End each commit message with:

    Co-Authored-By: Claude Opus <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01WSqFoPyrBesZYYie7fD53M

Read `CLAUDE.md` and `docs/TESTING.md` first (tests are rationed; a property is stated as music; no floor, tolerance or existing assertion is loosened: if you think one must be, stop and report).

## The calls already made (the coordinator's)

- Each Solo section that comes round is the next chorus of the soloist's solo, in arcs of at most three, whether two fall in one pass or not: that is what the arcs count today and it stays.
- **Told to finish**: a solo under way on the told pass ends there. Every Solo section of the told pass that belongs to the arc still running at the pass's last Solo section is a chorus of a solo that ends at that last section (`of` is that section's chorus plus one); a Solo section of the told pass that ends an earlier arc keeps the mark it set out with. No section is ever both a solo's last chorus and followed by that solo's next. Passes before the told one are as the jam set out (the property #2282 added).
- **The band's build**: the peak belongs to the pass that holds a solo's last chorus, wherever in the pass it falls; the breath and the rise read the same. With one Solo section a pass, and with none, everything is exactly as it is now.

## Stop once, early

After reading, **stop and report** (under 250 words): the two cases of the issue reproduced from `plan()`; how you would make `turn` (or what replaces it) say "this pass holds a last chorus" and "this pass has no solo" for the climax, breath and rise without changing any plan of a chart with at most one Solo section a pass; and the wording of the plan-only clause(s). I will answer before you build.

## Rules

- **Byte for byte**: every plan of every library chart and of `test/charts/solo-section.chart`, every style, on the kinds #2282's review used (jams of 1, 3, 5, 7, 12 passes with and without the soloist; timed; open, told and untold; set length told on pass 0 and 2; from the top; song with and without the soloist and with its arrangement stripped), hash for hash against `origin/main`'s `plan.ts`. Report the count.
- Tests: plan-only clauses on a chart written in the test (no new stress chart, nothing rendered): they must fail on today's code, and on a fault you plant for each. Goldens must not move.
- Do NOT run the full gates (`pnpm check`, `pnpm test`, `pnpm test:full`, `pnpm score`, `pnpm smoke`); run `pnpm typecheck`, `pnpm lint`, the two test files for two or three styles (`ENSEMBLE_STYLES=rock node --test --test-isolation=none test/soloist.test.ts test/band.test.ts`), and `node --test test/goldens.test.ts`. The coordinator runs the gates.
- An entry in `docs/decisions/soloist.md`.
- Kill every shell you started before reporting.

## Report

Under 300 words: the two cases before and after, as marks; what changed and where; the byte-for-byte count; the clauses and their plants; what you ran.
