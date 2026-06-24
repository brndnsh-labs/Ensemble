---
name: cycle
description: Run the full Ensemble story loop on one issue or a chain — composes /implement → /review → /patch → /done, interrupting only on a judgment call. Track-aware (musical → critique-test DoD; synth → A/B audition listening gate, a hard human stop; bundle → KB delta). Replaces the old /synth-cycle and /bundle-cycle. Usage `/cycle #<n>` · `/cycle next` · `/cycle next --until-blocked` · add `--deploy`.
---

# /cycle — full loop on one story or a chain

Goal: collapse the routine `/implement → /review → /patch → /done` rhythm into one invocation.
Plan-first. **One Track-aware skill** — it reads the issue's **Track** field and routes the DoD,
reviewers, and merge gate accordingly (this folds in what used to be `/synth-cycle` and
`/bundle-cycle`).

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill
orchestrates the others, so it leans on nearly all of it: §1 readiness, §3 (Track → DoD/reviewers),
§4 Gates, **§5 Judgment calls & autonomy (the governing rule below IS §5)**, §6 Merge guard. The
phases invoke `/implement`, `/review`, `/patch`, `/done` — run their workflows inline.

## The governing rule (= DOCTRINE §5)

**Interrupt Brandon only when you hit a judgment call** — something you can't responsibly decide
yourself. **Tier does not gate this:** `opus` stories run hands-off like `sonnet` ones. The
judgment-call set and the always-brake classes are §5. Everything else — including well-specified opus
work — runs unattended.

## Track-awareness (the fold-in)

Read the issue's **Track** field; it sets the loop's tail:
- **musical** → DoD is the **critique test** (run it, read the Critique Report); reviewer
  `music-theory-reviewer` (+ state/worker if those changed). Safe → auto-merge on green.
- **synth** → DoD is the **A/B audition** through the audition harness; reviewer
  `synth-graph-reviewer` (graph hygiene only). **The listening gate is a HARD HUMAN STOP**, not a
  confirmation gate — `/done` builds + opens the PR and **HALTS for Brandon's ear** (Status Needs-ear).
  Re-invoke `/cycle #<n> approved` after auditioning to finalize the merge. This is the one Track that
  cannot run fully unattended.
- **bundle** → DoD is a **measured KB delta** (`npm run build` / size check) **and** the full suite
  green (behavior-preserving); reviewer `bundle-hygiene-reviewer`. Safe → auto-merge on green.

## Forms

- **`/cycle #<n>`** — one issue, full loop. `/done` auto-merges a safe story on CI green (§6) or leaves
  a judgment-call PR for Brandon. A **synth** issue halts at the listening gate. `--deploy` runs
  `scripts/deploy.sh test` after the merge.
- **`/cycle #<n> approved`** — finalize a synth issue whose audition you've now signed off: run §6's
  merge + set Shipped, then continue.
- **`/cycle next`** — runs `/next` first, then cycles whatever Ready issue it picks.
- **`/cycle next --until-blocked`** — after each `/done`, auto-`/next` and continue. **Stops on:** a
  judgment call (§5 — incl. a synth listening gate or a PR left un-merged) · no Ready issue left ·
  a milestone boundary (retrospective) · interrupt · a `/done` that fails or yields an empty diff.
  **Does NOT stop merely because the next story is `opus`.**
- Add **`--deploy`** to run `scripts/deploy.sh test` after each safe merge.

## Workflow

1. **Parse args** (single id · `approved` · `next` · `next --until-blocked` · `--deploy`).
2. **For `next`:** run `/next`'s workflow internally; report the picked story.
3. **Present the cycle plan:**

   ```
   ## Cycle plan
   **Issue:** #<n> — <title>   **Track:** <musical|synth|bundle>   **Model:** <sonnet|opus>   **Size:** <S|M|L>   **Milestone:** <epic>
   **Executor:** <agent | orchestrator-inline>   **Reviewer:** <per §3 / the diff>
   **DoD:** <critique test `tests/standards/…` | A/B audition (HARD STOP) | KB delta>
   **Chain:** /implement → /review → /patch (if findings) → /done (PR + Closes #<n> → §6 merge / Track gate) <→ deploy-test if --deploy>
   **Auto-pause points:** judgment call (§5) · gates/CI red · synth listening gate · (--until-blocked) blocked-on-Brandon / milestone boundary
   Start?
   ```

4. **On confirmation, run the chain,** with a brief status line between steps ("✅ implement green,
   running review…").
5. **Decision gates** (no prompt unless required):

   | After | Auto-continue if | Pause if |
   |---|---|---|
   | implement | gates + Track DoD green when **the orchestrator re-runs them itself** (§4) | gates red, agent Blocked, or a spawned "green" that doesn't reproduce (§3) |
   | review | findings all P1/P2 mechanical | any P0, or a finding contradicts a memory note (§5) |
   | patch | gates green | gates red, a fix needs a design call |
   | done | safe story (musical/bundle): §6 poll-then-merge → Shipped | CI red / conflict / hook failure that isn't a trivial retry · **synth → HALT at the listening gate** · **judgment-call class → PR left open for Brandon** |
   | deploy-test | deploy + verify green | deploy non-zero, external check fails after retries |

6. **On `--until-blocked`, after `/done` (and optional deploy):**
   - `/done` **left the PR open for Brandon** (judgment-call / synth listening gate) → stop and report.
   - Just-shipped issue was the **last open one in its milestone** → stop with the retrospective.
   - Else run `/next` internally. Any Ready issue (sonnet *or* opus) → loop to step 3 (auto-confirm,
     "starting cycle N+1: #<n>"). Stop only when no Ready issue remains (§1) — say which — or a judgment
     call surfaces *inside* a cycle.

   **Milestone-boundary retrospective:**
   ```
   ## Milestone complete — <epic title>
   **Shipped this chain:** #<n>, #<n>, …
   Before the next milestone: what surprised us (a memory write)? · did a VISION/premise break? ·
   any backlog/finding issues ready to promote, fix inline, or close?
   Resume with `/cycle next --until-blocked`, or `/next`.
   ```

7. **End-of-chain summary:** shipped issue-ids, wall-clock, anything paused + why, the next move.

## Runaway / sanity guards

- **`--until-blocked` checks in after 5 stories** per invocation, then confirms.
- **>30 min on a single cycle → pause and ask** (test loop diverging, agent confused).
- Prefer **`orchestrator-inline` for small stories** — keeps accumulated context over a cold spawn
  (and it's the better executor for finicky state/worker/hydration work — §3).

## Findings get actioned, not accumulated

A cycle isn't done while a real finding from its own review sits unactioned (§5): `/patch` fix-now is
the default; a fix too big is an *escalation* (a `finding` issue, with Brandon's nod), never a silent
park. The open **`finding` issues must not grow** as a cycle side effect.

## Safety

Same as `/done` (§6 + §8): never `git add -A`, never `--no-verify`, never **force**-push, never amend,
**never `gh pr merge --auto`** (use §6's poll-then-merge guard). Never override a pause gate without
explicit direction this turn. Never auto-merge a synth story past the listening gate. Don't accept
"looks fine" from a reviewer without parsing findings — empty findings is valid, *missing* findings
(timeout/error) is a failure.

## Edge cases

- **Story is opus in `--until-blocked`:** run it like any other; stop only on a *judgment call*.
- **Synth story under `--until-blocked`:** it will halt at the listening gate — report it as blocked on
  Brandon's ear; the chain stops (or continues with non-synth Ready work only if still clearly clean).
- **Last story of an epic ships under `--until-blocked`:** stop with the retrospective.
- **Reviewer fails (timeout/none):** pause-worthy; don't auto-`/done` unreviewed.
- **Project / `gh` unreachable (§7):** stop; don't fabricate a story.
