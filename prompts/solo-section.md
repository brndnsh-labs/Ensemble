# Build: a jam on a chart with a `[Solo]` section (#2282)

The issue is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2282 --jq .body`.

## Where you are and the limits

A git worktree, branch already made from `origin/main`, dependencies installed. Work only there. Stage explicit paths, never `git add -A`; never `--no-verify`, amend, force-push or bare `git stash`; no push, no pull request, nothing on GitHub beyond reading the issue; never read the `legacy` branch; nothing about the project to outside services; no servers. The repository is public: no secrets, no private addresses. End each commit message with:

    Co-Authored-By: Claude Opus <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01WSqFoPyrBesZYYie7fD53M

Read `CLAUDE.md` and `docs/TESTING.md` first (tests are rationed; a property is stated as music; no floor, tolerance or existing assertion is loosened: if you think one must be, stop and report, do not edit it).

Another builder is working in a sibling worktree at the same time, so **do not run the full gates** (`pnpm check`, `pnpm test`, `pnpm test:full`, `pnpm score`, `pnpm smoke`): the budgets count CPU and read high on a shared machine. Run what your change touches: `pnpm typecheck`, `pnpm lint`, single files (`node --test --test-isolation=none test/<file>`, `ENSEMBLE_STYLES=<id>` to hold it to one style, `ENSEMBLE_SEEDS=6` for the full count), and `node --test test/goldens.test.ts`. The coordinator runs the gates alone afterwards. Kill every shell you started before reporting.

Your worktree: `/home/brandon/code/ensemble/.work/2282`, branch `solo-section`.

## What is already known and decided

- The planner (`soloMarks` in `packages/engine/src/plan/plan.ts`) gives a section labelled Solo to the soloist whenever it comes round, in a jam as in a song, when the soloist is asked for. On the issue's chart a jam of 1, 2 and 4 passes with `--solo` has the soloist in bars 5 to 8 of every pass (and a pickup in the bar before); without `--solo`, nowhere.
- **The call (the coordinator's): the planner is right.** A chart that labels a section Solo has said where the solo goes: in a jam the soloist has those sections every time round, from the first pass, and the rest of the form is its rest; its arc counts those sections in threes as the planner does now. Do not change the planner unless you find it doing something other than that.
- So the property "the soloist is off unless asked for; asked for, it rests through the intro and a written ending, lays out and returns, and never solos more than three choruses in a row" (`test/soloist.test.ts`) assumed no chart labels a section Solo. It gains a case, stated as music: on a chart with a section labelled Solo, asked for, the soloist has exactly those sections on every pass and no other bar, and its choruses count in order in arcs of at most three. **Every assertion it makes today still runs unchanged on every chart it runs on today.**

## Stop once, early

After reading, **stop and report** (under 300 words): what you confirmed of the above by reading and by `pnpm -s ensemble read`; which other properties fail or go unasked on a chart with a `[Solo]` section (run the soloist, plan and arrangement files on a scratch copy of the chart); where you would put the chart so a push plays it (a stress chart under `test/charts/`, a section added to one, or a library chart), with the CPU seconds each choice adds to a push (measure `ENSEMBLE_STYLES=rock node scripts/budget.ts cpu:999 node scripts/test.ts` before and after; the suite has little room, about 8 of 220 CPU seconds, so prefer the cheapest that plays the case with the soloist asked for and not); and how you would word the property. I will answer before you build.

## Rules

- Plant a fault for what you add (the planner giving the soloist a Verse bar on such a chart; the soloist missing a Solo section on a later pass) and show the property fails.
- Do not relabel country's song chart (it is in another open pull request).
- Goldens must not move. If one does, stop and report.
- `docs/decisions/soloist.md`: an entry with the reading, the call and what was added. `docs/CHART_FORMAT.md`: say in the place that fits what a jam does with a section labelled Solo, in one or two sentences, if it does not already.

## Report

Under 350 words: the diagnosis as reads; the chart and where it went; the property's wording and its plants; what you ran and the figures; anything you left.
