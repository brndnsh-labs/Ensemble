---
name: cover
description: Coverage-guided test writing for Ensemble — pick a genuinely valuable untested unit, write tests for its CONTRACT (never for what the code currently happens to do), and stop to surface a bug rather than codifying it. One module per fresh spawn so a long run never fills the orchestrator's context. Explicitly not about chasing a coverage percentage. Usage `/cover` (or `/cover <path>`).
---
<!-- cycle:rendered template=skills/cover.md.tmpl hash=a606e6e19dcb — managed by the-cycle; edit the template, not this file -->

# /cover — write the tests that were missing

Goal: raise the number of behaviors that are actually *pinned down*, which is not the same as
raising a coverage number.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §4
(Gates), §5 (a suspected bug is a judgment call), §8/§9 (commit and branch policy).

## The governing rule: test the contract, not the implementation

**Write the test that says what the unit is *supposed* to do.** Never write the test that says
what it *currently* does.

A test derived from the implementation passes on day one and forever after, including every day
the code is wrong. It provides coverage and zero information. The only test worth writing is one
that could fail if the behavior broke.

**And the corollary that makes this skill safe:** if the current behavior **contradicts the
intent**, you have found a bug. **Stop. Surface it.** Do not write the test that enshrines it — a
codified bug is far more expensive than an untested function, because it actively defends the bug
against the next person who tries to fix it.

## Target selection

**Rank by value, not by lowest coverage percentage.** The least-covered file is usually least
covered for a reason.

Prefer, in order:
1. **Pure logic with real consequences** — the calculation, the parser, the state transition, the
   thing whose wrongness would be quiet.
2. **Code that has broken before.** Git history is a coverage heuristic.
3. **Code about to be changed** — tests written just before a refactor earn their keep immediately.

**Refuse, unattended:** anything whose correctness depends on I/O, the DOM, the network, real
storage, timing, or an external service. Those need a design conversation about *how* to test them,
which is a judgment call (§5), not a mechanical gap to fill.

## The context firewall — one unit per spawn

Run each module as **its own fresh spawn**: one module in, tests out, orchestrator re-verifies,
commit, next.

The reason is mechanical, not stylistic: a long test-writing run accumulates enormous context —
every file read, every failed attempt — and a filled context makes later modules measurably worse
than earlier ones. A fresh spawn per unit keeps module ten as sharp as module one. The orchestrator
holds only the ledger.

**Re-verify each spawn's result yourself** (§3) before committing. A spawned "tests pass" is a
claim.

## Workflow

1. **Survey** coverage, and pick targets by the ranking above — not by the report's sort order.
2. **Present the slate:** the units chosen, why each is worth pinning down, and what's being
   deliberately skipped (with the reason — "impure, needs a design call" is a complete reason).
3. **Per unit, in its own spawn:**
   - Read the unit and its *intent* — the docs, the caller, the issue that created it.
   - Write tests for the contract.
   - If the behavior contradicts the intent → **stop and surface**; don't write the test.
   - Run the gates.
4. **Re-verify and commit** each unit separately (§8) — one unit per commit keeps a bad test easy
   to isolate.
5. **Report:** units covered, behaviors now pinned, and **any suspected bugs found** — that last
   list is usually the most valuable output of the whole run.

## Out of scope

- **Chasing a coverage percentage.** A number that went up while nothing got safer is a worse
  outcome than an honest "these three units are now pinned, the rest need a design call."
- Refactoring the code under test. If it's untestable as written, say so — that's a finding.
- Testing things the gates already cover.

## Edge cases

- **The unit is untestable without a refactor:** file it as a finding; don't refactor mid-run.
- **A test fails immediately on correct-looking code:** that's the bug case. Stop and surface it.
- **Everything valuable is already covered:** say so and stop. That's a good result.
