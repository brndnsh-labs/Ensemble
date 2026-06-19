---
name: burndown
description: Autonomously work through the SAFE, self-contained backlog — issues labelled `burndown` (human-vetted) first, then clean findings + hygiene (knip dead-code, jscpd de-dup, /dep-update, bounded type-tightening) — one item at a time via /cycle with auto-merge, stopping at any judgment call or when the safe set is dry. The "fire it and let it grind" companion to /cycle. Plan-first: curates + presents the safe queue before working. Excludes anything destructive / state-or-worker-contract-design / Track-synth / by-ear / audio-path-perf.
---

# /burndown — grind the safe backlog autonomously

Goal: tick off the safe, no-judgment work without Brandon in the loop, so a session runs
unattended-ish and he reviews the merged results when back. The autonomous engine on top of `/cycle`.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** The **safe set**
this skill lives or dies by *is* §5's autonomous safe set (the negation of the always-brake list) —
`/burndown` only ever touches work outside the brakes. Also leans on §2 Labels (the `burndown` tag),
§6 Merge guard (auto-merge = the poll-then-merge guard, never `--auto`), §3 (re-verify agent claims).
**When in doubt, exclude and surface — never include.**

## The `burndown` label — the fast path (and the /unblock handoff)

A **`burndown`**-labelled issue is **vetted safe for autonomous execution** (§2) — typically by
`/unblock` when a decision turns an item into safe hands-off work, by `/scout`, or by Brandon. Pick
these first, in issue-number order. **But the safe filter still backstops it** — if a labelled item
turns sensitive mid-cycle, stop and hand it back (strong signal, not a blank check).

## The safe filter (what /burndown MAY pick — label or not)

Qualifies ONLY if **all** hold:
- **Not a §5 always-brake class** (`/done` wouldn't auto-merge it anyway) — not a destructive data op
  (persisted sessions / share-URL schema / preset data / state migration), not a state-or-worker
  contract change needing a design call.
- **Not Track `synth` and not by-ear musical** — their DoD is a human listen (`Needs-ear`), which an
  unattended run can't satisfy.
- **Not audio-path perf / floor-risky** (§5) — NOT `scheduler-core.ts`, the `synth-*.ts` voices, or
  the worker hot paths; those need a by-ear / weak-device check the gates lack.
- **Well-specified + self-contained** — clear acceptance, small (S/M), single area, no open design
  question.
- **Gate/CI-verifiable** (§4) — provable by the gates (a passing critique test for a musical change, a
  measured KB delta for bundle), **not by ear or a device**.

If an item *almost* qualifies but has one catch, it's **out** — leave it for a human `/cycle`.

## What's in scope

1. **`burndown`-labelled issues** (fast path).
2. **Other clean backlog/finding issues** that pass the safe filter (most are Track `bundle` or
   mechanical hygiene; a `musical` story qualifies only if its critique test is the whole DoD).
3. **Hygiene** (standing safe work, even with no clean issue):
   - **`knip` dead-code sweep** — `npm run knip`; remove genuinely dead exports/files.
   - **`jscpd` de-dup** — `npx jscpd`; collapse genuine copy-paste in non-engine code.
   - **`/dep-update`** — npm update + validate + lockfile commit.
   - **Bounded type-tightening** — a named, single-file `any`/`as` cleanup that doesn't change
     behavior (NOT an engine change that could move a critique test). **Verify the gap first.**

## Workflow

1. **Build the safe queue.** `burndown`-labelled first; then other open issues through the safe filter
   (§7 read + fields); then hygiene candidates — **verifying each has *real* work** (knip flags
   something, jscpd finds a real clone, deps actually update). Order: quickest first.
2. **Present the curated queue** (plan-first): the ordered list, each with one line of *why it's safe*,
   plus the stop conditions. The only checkpoint — then it works unattended (or under a standing go).
3. **Work each item:**
   - **Issue:** ensure Ready (set fields), `/cycle #<n>` → auto-merge (safe by construction) → sync
     main.
   - **Hygiene:** branch, gates green (the full §4 suite — critique test if anything engine-adjacent
     slipped in), `/done`-style PR (`Closes` any tracking issue) → auto-merge.
   - **Re-verify gates yourself** (§3) — never trust a spawned "green."
4. **Stop — and report — when ANY of:**
   - A **judgment call surfaces inside a cycle** → stop, leave that PR for Brandon; continue the rest
     only if still clearly clean.
   - **Gates or CI red** and not a trivial retry.
   - The **safe queue is dry**.
   - **5 items shipped** this run → check in (runaway guard).
   - Interrupt.
5. **Report:** what shipped (issue/PR links), what was skipped + why, what's left, anything needing
   Brandon.

## Safety

- **The filter is conservative by design.** Excluding a safe-ish item costs throughput; including an
  unsafe one costs trust. Exclude when unsure — even a `burndown`-labelled item if the diff turns
  sensitive mid-cycle.
- Auto-merge only, only for filter-passing items with green CI, via §6's guard — **never
  `gh pr merge --auto`**.
- Prod deploy is **never** part of `/burndown` (always Brandon's `scripts/deploy-prod.sh`).
- Honor the 5-item check-in and the >30-min-per-cycle guard from `/cycle`.

## Edge cases

- **Nothing safe to do:** say so — the backlog is all blocked / sensitive / needs-design / by-ear.
  Don't manufacture busywork; suggest `/unblock` (clears decisions → safe Ready work) or `/scout`
  (refills the `burndown` pile).
- **A hygiene task has no real work:** skip it, don't invent a change.
- **An item looked safe but the diff grew / got sensitive (or could move a critique test):** treat as
  a judgment call — stop, hand it back.
