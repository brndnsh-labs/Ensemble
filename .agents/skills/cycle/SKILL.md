---
name: cycle
description: Run the full Ensemble story loop on one issue or a chain — composes /implement → /review → /patch → /done (→ optional /deploy-test), interrupting only on a judgment call. Usage `/cycle #<n>` · `/cycle next` · `/cycle next --until-blocked` · add `--deploy`.
---
<!-- cycle:rendered template=skills/cycle.md.tmpl hash=8340222ba3af — managed by the-cycle; edit the template, not this file -->

# /cycle — full loop on one story or a chain

Goal: collapse the routine `/implement → /review → /patch → /done` rhythm into one invocation.
Plan-first.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** This skill is
the orchestrator of the others, so it leans on nearly all of it: §1 readiness, §3 routing, §4
Gates, **§5 Judgment calls & autonomy (the governing rule below IS §5)**, §6 Merge guard, §8/§9
commit and branch policy. The phases invoke `/implement`, `/review`, `/patch`, `/done` — run their
workflows inline; don't re-derive them.

**Before the `/done` phase, ensure `.agents/skills/DELIVERY.md` is in context; read it only if
absent.** It expands §6/§8's delivery mechanics without displacing DOCTRINE's safety authority.

## The governing rule (= §5)

**Interrupt Brandon only when you hit a judgment call** — something you can't responsibly
decide yourself. Run hands-off for self-contained, gate-verifiable, non-destructive work. When a
judgment call surfaces you stop *there*, at the decision — not pre-emptively. The always-brake set
is §5: Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field). Surface those even when the cycle could proceed. Everything else runs
unattended.

## Forms

- **`/cycle #<n>`** — one issue, full loop. `/done` auto-merges a safe story on CI green (§6) or
  leaves a judgment-call PR open. `--deploy` adds `/deploy-test` after the merge.
- **`/cycle next`** — runs `/next` first, then cycles whatever it picks.
- **`/cycle next --until-blocked`** — after each `/done`, auto-`/next` and continue. **Stops on:** a
  judgment call (§5, including a PR left un-merged) · no pickable issue left · a milestone boundary
  (retrospective) · interrupt · a `/done` that fails or yields an empty diff.

## Workflow

1. **Parse args** (single id · `next` · `next --until-blocked` · `--deploy`).
2. **For `next`:** run `/next`'s workflow internally; report the picked story.
3. **Present the cycle plan** (a status update, not a gate — §5):

   ```
   ## Cycle plan
   **Issue:** #<n> — <title>   **Milestone:** <…>
   **Executor:** orchestrator-inline (default — parallel agents only for independent mechanical work, §3)
   **Reviewer:** inline pass<, + /security-review if the diff lands on an always-brake surface (§3)>
   **Chain:** /implement → /review → [/patch → /review (finding closure)]* → /done (PR + Closes #<n> → §6 merge) <→ /deploy-test if --deploy>
   **Auto-pause points:** judgment call (§5) · gates/CI red · (--until-blocked) blocked-on-Brandon / milestone boundary
   ```

4. **Run the chain immediately** in the same turn, with a brief status line between steps ("✅
   implement green, running review…"). Don't wait for a "go ahead" — the plan above already gave
   Brandon the chance to redirect before anything ran.
5. **Decision gates** (no prompt unless required):

   | After | Auto-continue if | Pause if |
   |---|---|---|
   | implement | gates green when **the orchestrator re-runs them itself** (§4) | gates red, agent Blocked, a spawned "green" that doesn't reproduce (§3), **or the diff lands on a §5 always-brake surface** |
   | review | findings all mechanical, no design call | any P0, a finding that needs a design decision, or one that contradicts a memory note (§5) |
   | patch | gates green → `/review` in finding-closure mode | gates red, a fix needs a design call |
   | finding closure | every ID fixed or explicitly escalated, no new finding → `/done`; remaining mechanical finding → `/patch` again; scope expansion / new behavior / a new finding → normal full `/review` | any §5 judgment call |
   | done | safe story: §6 server-side merge queued; issue closes when the forge lands it | CI red / conflict / a hook failure that isn't a trivial retry · **judgment-call class → PR left open** (not a failure — stop the chain there and report) |
   | deploy-test | deploy + verify green | deploy non-zero, or the external check fails after retries |

6. **On `--until-blocked`, after `/done`** (and the optional deploy):
   - `/done` **left the PR open** (judgment call) → stop and report; the chain is blocked on
     Brandon's merge.
   - The just-shipped issue was the **last open one in its milestone** → stop with the
     retrospective.
   - Else run `/next` internally and loop to step 3 ("starting cycle N+1: #<n>"). Stop when nothing
     pickable remains (§1) — say so — or a judgment call surfaces *inside* a cycle.

   **Milestone-boundary retrospective:**
   ```
   ## Milestone complete — <epic title>
   **Shipped this chain:** #<n>, #<n>, …
   Before the next milestone: what surprised us (a memory write)? · did a docs premise break? ·
   any finding issues ready to fix inline or close?
   Resume with `/cycle next --until-blocked`, or `/next`.
   ```

7. **End-of-chain summary:** shipped story ids, wall-clock, anything paused and why, the next move.

## Runaway / sanity guards

Runaway detectors, not cost throttles:
- **`--until-blocked` emits a progress checkpoint after every 5 stories, then continues.** It is
  visibility, not a confirmation gate: re-read `/next` and apply the governing rule before each
  subsequent story, as usual.
- **>30 min on a single cycle is a no-progress detector, not a timer gate.** If 30 minutes pass
  without fresh evidence of progress — a meaningful diff, a green gate, or a CI state transition —
  pause and surface the diagnostic. Elapsed time alone does not require confirmation.
- Prefer **`orchestrator-inline`** (§3) — accumulated context beats a cold spawn on
  anything finicky.

## Findings get actioned, not accumulated

A cycle isn't done while a real finding from its own review sits unactioned (§5): `/patch` fix-now
is the default; a fix too big is an *escalation* (a `finding` issue, with Brandon's nod),
never a silent park. After any patch, `/review` must close every finding ID against the latest tree
before `/done`; a patch report is not its own proof. The open `finding` issues must not grow as a
cycle side effect (§2).

## Safety

Same as `/done` (§6 + §8): never `git add -A`, never `--no-verify`, never **force**-push, never
amend. Never override a pause gate without explicit direction this turn. Don't accept "looks fine"
from a reviewer without parsing actual findings — empty findings is valid, *missing* findings
(timeout/error) is a failure.

## Edge cases

- **Last story of a milestone ships under `--until-blocked`:** stop with the retrospective; don't
  roll into the next milestone unattended.
- **Reviewer fails (timeout / no output):** pause-worthy; don't auto-`/done` unreviewed.
- **Diff touches a §5 always-brake surface:** stop and surface, and offer a human
  `/security-review` — even if the gates are green.
- **Tracker unreachable (§7):** stop; don't fabricate a story.

## Track-awareness (the fold-in)

Read the issue's `track:*` label; it sets the loop's tail:
- **musical** → DoD is the **critique test** (run it, read the Critique Report); reviewer
  `music-theory-reviewer` (+ state/worker if those changed). Safe → auto-merge on green.
- **synth** → DoD is a **human listen on the deployed test build**; reviewer `synth-graph-reviewer`
  (graph hygiene only). Pick these up freely — the loop runs the same as any other Track right up
  to the gate. `/done` builds + opens the PR, then **deploys the branch to test** (`scripts/deploy.sh
  test`, no merge needed first) and hands Brandon the checklist + a Works/Something's-off/Haven't-
  checked verdict prompt right there — **that's the audition**, not a separate local harness step.
  "Works" merges immediately (the verdict *is* the approval); "Haven't checked" parks it (`status:needs-ear`) — re-invoke `/cycle #<n> approved` once he's listened. The merge itself still always
  waits on his ear; nothing here auto-merges unheard.
- **bundle** → DoD is a **measured KB delta** (`npm run build` / size check) **and** the full suite
  green (behavior-preserving); reviewer `bundle-hygiene-reviewer`. Safe → auto-merge on green.
