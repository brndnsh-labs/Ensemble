---
name: burndown
description: Autonomously grind through the SAFE, self-contained subset of the Ensemble backlog — pre-filters out anything touching DOCTRINE §5's always-brake surfaces (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)) or posing an open decision, then loops `/cycle #<n>` over the rest, plus standing hygiene (`/dep-update`, a bounded dead-code sweep) when the issue queue is thin. A judgment call parks that item and the loop moves on; the run itself stops at 5 shipped items, a red gate, or a dry queue. Plan-first. Never touches prod. Usage `/burndown`.
---
<!-- cycle:rendered template=skills/burndown.md.tmpl hash=d9a28fcb45f2 — managed by the-cycle; edit the template, not this file -->

# /burndown — grind the safe backlog autonomously

Goal: tick off the safe, no-judgment-call work without Brandon babysitting each one, so a
session runs mostly unattended and the merged results get reviewed after. The curating layer on top
of `/cycle`, not a replacement for its safety logic.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** The safe set
this skill lives or dies by *is* §5's always-brake list. Also leans on §1 (Status/ranking), §2
(Labels), §6 (Merge guard — already enforced *inside* `/cycle` → `/done`; don't re-implement it
here), §7 (tracker mechanics). **When in doubt, exclude and surface — never include.**

## How this differs from `/cycle next --until-blocked`

`/cycle next --until-blocked` already runs hands-off and already stops at a judgment call — most of
the safety machinery lives there, not here. The gap it leaves: it picks by **strict rank** and
**stops the whole chain** the moment the top-ranked item turns out to need a judgment call, even if
three safer issues sit right behind it. `/burndown` pre-vets the queue so a known-risky issue
doesn't block a session's throughput — it's skipped (and surfaced in the report), not a stopping
point.

Use `/cycle next --until-blocked` when you want the *next* thing in strict priority order
regardless of risk; use `/burndown` when you want to clear as much *safe* work as possible in one
unattended pass.

## The safe filter (what /burndown MAY queue)

Qualifies only if **all** hold — read the issue body; don't just pattern-match the labels:

- **Labelled `status:ready`** — pickable, not already in flight.
- **Doesn't pose an open decision.** An issue framed "decide one of: A / B" is a human `/cycle`
  candidate regardless of how small the eventual diff is — a decision is a judgment call by
  construction.
- **Doesn't touch a §5 always-brake surface** (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)). Labels are a first-pass signal,
  **not the filter**: a clean dependency CVE bump under a `security` label can be perfectly safe,
  and an unlabelled issue can still be risky. **Read the body and the touched area before
  deciding.**
- **Well-specified and bounded** — clear acceptance, single area, no "TBD" scope.
- **Gate-verifiable** (§4) — not something whose correctness needs a live or manual glance.

If an item *almost* qualifies but has one catch, it's **out** — leave it for a human `/cycle #<n>`.

## What's in scope

1. **Safe-filtered pickable issues** (above), ordered by §1's ranking within the filtered set.
2. **Standing hygiene**, when the filtered queue is thin or dry:
   - **`/dep-update`** — run its workflow inline.
   - **A bounded dead-code / type-safety sweep** — mirrors `/scout`'s hygiene lens. **Verify the
     gap is real first** (read the code, don't assume); keep each sweep single-area and small.
     Skip if nothing concrete turns up — don't invent a change.

## Workflow

1. **Build the safe queue.** Pull the open set (§7); partition to pickable; apply the safe filter
   to each; order the survivors by §1 rank. Note (but don't queue) anything excluded, with a
   one-line reason.
2. **Present the curated queue** (plan-first): the ordered list, one line each on *why it's safe*,
   the excluded set + why, and the hygiene fallback if the queue's thin. This is the only
   checkpoint — then it runs unattended.
3. **Work each item: `/cycle #<n>`** (run its workflow inline — don't re-derive it). `/cycle`'s own
   judgment-call detection is the real backstop. If a pre-vetted item still trips one mid-cycle,
   that's the filter being wrong on this one, not a bug in the loop — **stop that item** (leave its
   PR open, per `/cycle`'s own behavior) **and continue to the next queued item**.
4. **When the issue queue is dry, run the hygiene fallback.** Re-verify gates yourself after each —
   never trust a spawned "green" (§3).
5. **Stop — and report — when ANY of:**
   - **5 items shipped** this run (issues + hygiene combined) → check in (runaway guard).
   - **Gates or CI red**, and not a trivial retry.
   - **The safe queue AND the hygiene fallback are both dry.**
   - Interrupt.
6. **Report:** what shipped (issue/PR links), what was excluded and why (so Brandon can
   `/cycle #<n>` those himself), and anything left running or blocked.

## Safety

- **The filter is conservative by design.** Excluding a safe-ish item costs a bit of throughput;
  including an unsafe one costs trust in the whole queue. **Exclude when unsure.**
- **Auto-merge is entirely `/cycle`/`/done`'s job** (§6) — `/burndown` never merges directly.
- **Prod deploy is never part of `/burndown`** — always Brandon's explicit `/deploy-prod`.
- Honor `/cycle`'s own >30-min-per-cycle guard.

## Edge cases

- **Nothing safe to do:** say so plainly — the backlog is all blocked, sensitive, or design-shaped.
  Point at `/scout` to refill the queue, or suggest a human `/cycle #<n>` on the judgment-call
  pile. **Don't manufacture busywork.**
- **A hygiene pass has no real work:** skip it, say so, don't invent a change.
- **An item looked safe but the diff turned sensitive mid-cycle:** that's `/cycle`'s own brake
  doing its job — treat it as informative for next run's filter, not as a failure.

## How it fits the pipeline

- **`/scout`** = code → candidate issues (feeds this queue).
- **`/burndown`** = grind the safe subset of that queue, unattended, plus hygiene backfill.
- **`/cycle #<n>`** = the human-in-the-loop path for anything `/burndown` excludes, and the engine
  `/burndown` calls under the hood.
