# Make room in the engine suite's budget, by consolidating (#2306)

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2306 --jq .body`. Read first: `CLAUDE.md`, `docs/TESTING.md` (binding: the four kinds of test, and "Budgets"), `scripts/test.ts`, `scripts/budget.ts`, `test/takes.ts`, then the `test/*.test.ts` files. The last trim was #2274: its brief is `prompts/trim-pass.md` and what it did is in `docs/decisions/repository.md` (read both first: do not redo what it already took, and use its method).

You work in this worktree (`.work/2306`, branch `test/2306-trim`, from `origin/main`). Never `cd` out of it. Do not read the `legacy` branch. `.work/2298` is someone else's: do not touch it.

## Where it stands

`main` at 7740aa52, nine styles: `pnpm check` read 213 of 220 CPU seconds and `pnpm test:full` 628 to 649 of 660, each run alone (readings of one tree vary by about five on a push and ten on six seeds). A branch waiting to merge (#2301, the meter choice) adds about five and ten. Since #2274 the suite gained country (a ninth process), the walk-home endings in every key in three (#2300: 24 keys, seven cases, two energies, every seed, read by the walk-home, stinger and final-tonic properties), the thirteenths and shape charts (#2300, #2302), and the solo-section chart.

**Measure in CPU seconds, never on the clock.** `/tmp/claude-1000/-home-brandon-code-ensemble/3001e2ba-6e91-487f-adea-58ceea1c543a/scratchpad/cpu.ts` prints both for a command (`node <that file> <label> <command...>`), if it is still there; otherwise `scripts/budget.ts` does the same. `ENSEMBLE_STYLES=jazz node scripts/test.ts` runs one style; `ENSEMBLE_SEEDS=6` the six-seed run. Run the whole suite as seldom as you can and never two at once. Nobody else is building on this machine now.

## Stop early, once, with the profile, before changing anything

1. **The profile**, changing nothing: CPU seconds by style process and for the style-free files, on two seeds and on six; within country, jazz and one cheap style: what is rendered (each kind of take, how many, what each costs), which properties read each kind, the ten dearest properties and whether each one's cost is rendering or reading. Instrument a scratch copy or use `--cpu-prof`; commit no instrumentation.
2. **What each seed adds** on the six-seed run, and which properties are the same on every seed (they read the chart, not the draw) yet run six times.
3. **Candidates**, each with its estimated saving on a push and on six seeds, and what it leaves exactly as it is:
   - takes rendered more than once in a process (anything that renders outside `takeOf`'s cache: inline charts, `render` called directly, plans made twice);
   - work that is the same in all nine processes and belongs in the style-free run;
   - the every-key endings: does every style's process make them, or only country's (only country walks home and pulls off); are they made once;
   - a property that scans every note of every take quadratically where an index built once per take would do;
   - anything else the profile shows.
4. **What you would not take**, because it would change a property's text, a clause, a floor's number, or drop a style or a planted fault: listed, with its saving, for Brandon. Do not take any of those.

Then stop and wait for an answer.

## The rule for everything you take (after the answer)

- **No property loses a clause, a floor or a planted fault that fails it; no style drops off a property; no test's name changes.** A floor that counts takes may count the same takes made once. Seeds are not reduced for any property that reads the draw.
- **Each saving is its own commit**, with the CPU seconds before and after in the message.
- **Proof that nothing weakened**: for every property whose takes or code you touched, and for the ten dearest, plant its fault again and show it failing (say which fault and the failure's first line). Goldens byte for byte; `git diff origin/main -- scorecard library` empty; `pnpm score` not run by you unless you touched something it reads (you should not).
- **The target**: `pnpm check` at 200 or under and `pnpm test:full` at 600 or under, each read three times, alone. Report all six readings. If consolidating cannot reach it, stop and say what it reached and what remains: do not go on to weaker things.
- Decisions in `docs/decisions/repository.md`, a new `## ` section at the end, dated 2026-11-22 with `#2306`: what was consolidated, what each saved, what was left for Brandon.

## Rules of the house

- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`. Scratch files under `out/` only.
- If a permission is denied, do not work around it: say so.
- Leave no server, shell or wait loop running (a `pgrep -f` pattern that matches the loop's own command line never ends: wait on a PID with `tail --pid`, or run in the foreground).
