# The trim pass: what a push of the engine suite pays for, and what it need not (#2274)

Brandon: "trim pass can't hurt if you see anything that isn't providing much value anymore".

Read first: `CLAUDE.md`, `docs/TESTING.md` (binding: the four kinds of test, "Budgets"), `scripts/test.ts`,
`test/takes.ts`, then the `test/*.test.ts` files. The issue is #2274 (`gh api repos/brndnsh-labs/Ensemble/issues/2274`).

## What the suite costs today

The engine suite is one process per style (eight) and one for the style-free files, side by side. Measured on
`main` at 0417d849: about 183.5 CPU seconds for the whole (26 s on the clock); a style's process alone 16 to 24
CPU seconds (jazz 23.6, funk 22.6, disco 21.2, acoustic 19.9, rock 19.7, blues 18.7, neo-soul 17.3, reggae 16.1);
the style-free files 2.8. A written meter costs nothing; a chart about a third of a CPU second.

**Measure in CPU seconds, never on the clock** (the clock moves 50% with what else the machine does; CPU time
4%). `/tmp/claude-1000/-home-brandon-code-ensemble/3001e2ba-6e91-487f-adea-58ceea1c543a/scratchpad/cpu.ts`
prints both for a command: `node <that file> <label> <command...>`. `ENSEMBLE_STYLES=jazz node scripts/test.ts`
runs one style. Run the whole suite as seldom as you can and never two at once.

## The work, in this order

1. **Profile, changing nothing.** For jazz, funk and reggae (the dearest, a middle one, the cheapest), then
   summed for all: what a push renders (each kind of take in `test/takes.ts` and wherever else a test renders:
   how many, what each kind costs in CPU time), which clauses read each kind, and what each test file costs
   beyond the takes it shares. Instrument with a scratch copy or `--cpu-prof`; do not commit instrumentation.
   Write the table to the scratchpad and put it in your report. **Stop and report after this step** with the
   table and your list of candidates before changing anything; I will answer with which to take.
2. **Candidates**, each named with what still holds its rule afterwards:
   - a kind of take only one clause reads, where a take another clause already renders would do;
   - a clause a later, stricter clause wholly covers;
   - wide sweeps on a push that could leave one representative there and run whole on the full run (the
     `FULL` split the suite already makes: `ENSEMBLE_SEEDS=6`);
   - anything rendered twice in one process.
3. Move or merge the ones I name. **For each clause touched, plant its fault and show the run that holds it
   (the push run, or the full run where it moved) still fails.** Record each plant and its failing output.

## What must not happen

- **No property deleted or weakened, and no rule that a push held before left held by nothing on a push**,
  without it being set aside: list such candidates separately with the reason each earns nothing now. They
  go in a PR of their own that waits for Brandon. Do not make those changes in this branch.
- Nothing under `packages/` changes. No budget figure or rule changes (`scripts/budget.ts`, `docs/TESTING.md`
  "Budgets"). No scorecard, no golden moves: if a golden moves, something other than a test changed.
- No new kind of test. No per-function unit tests.
- Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: no private
  addresses, nothing about the network. Stage explicit paths, never `git add -A`; never `--no-verify`, amend
  or force-push; never bare `git stash`. Do not push, open a PR, or touch GitHub: I do that.
- Kill any shells you leave running before you report.

## Done when

- The profile table before and after, in CPU seconds, per style and summed.
- The push run costs less by a stated amount, and every clause touched still fails its planted fault.
- `pnpm test:full` checks what it checked before.
- `docs/decisions/repository.md` has a short entry: what moved where, what it saved, what was left alone and why.
