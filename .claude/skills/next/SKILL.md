---
name: next
description: Pick up the next musical-audit story to work on. Reads docs/audit/EPICS.md, identifies the active phase (Phase 1 sequential → Phase 2 parallel-sonnet → Phase 3 epic-by-epic), and surfaces the next unfinished story. Within Phase 3, orders by epic#, then story# (methodical pass through Epic 2 → 4 → 5 → 6 → 7 → 8) regardless of model tag — opus is normal at this stage. Plan-first — does not invoke any agent, just lays out the work. Use at the start of a session or whenever you need to decide what to pick up.
---

# /next — surface the next audit story

Goal: tell the user what to work on next, with enough context that they can decide between `/implement <id>` (single story) and `/fan-out <id...>` (parallel batch).

## Workflow

1. **Read the index.** `docs/audit/EPICS.md`. Note which phase has unfinished stories.

2. **Identify the active phase.**
   - If any Phase 1 story (Epic 1 + Epic 3 S1/S2) is unfinished → Phase 1.
   - Else if any Phase 2 sonnet-tagged story listed in the EPICS.md "Phase 2" rollout table is unfinished AND not blocked on a Phase 3 prerequisite → Phase 2.
   - Else Phase 3 (remaining stories across Epics 2, 4, 5, 6, 7, 8 — most opus, some sonnet).
   - **Don't skip Phase 1.** Phase 1 unlocks contract shape that later phases depend on. If a user asks to skip ahead, name the dependency and confirm.
   - Phase 2 → Phase 3 is not a hard boundary. If Phase 2 is empty (or all its remaining stories are blocked on a Phase 3 prerequisite), surface Phase 3 work without prompting.

3. **Find candidate stories in the active phase.** Read each epic file. A story is **done** if its body contains a `**Status:** Shipped` line (or equivalent done marker). Otherwise it's unfinished.

4. **Rank candidates** by phase:
   - **Phase 1 / Phase 2:** P0 source findings first, then P1, then P2; smaller effort breaks ties.
   - **Phase 3:** epic number ascending, then story number ascending. Model tag (opus/sonnet) is **not** a ranking factor — pick the next story in the methodical sweep regardless. The user can override by naming a specific story.
   - Cross-epic dependencies still apply: if Story X cites "after Story Y lands" in its body and Y is unfinished, skip X and continue. Name the dependency in the surfaced plan.

5. **Present the plan.** Format:

   ```
   ## Next: Epic <N> Story S<N> — <title>

   **Phase:** <1|2|3>
   **Model:** <opus|sonnet>
   **Reviewer:** <music-theory-reviewer | state-discipline-reviewer | none>
   **Effort:** ~<N>h
   **Source:** docs/audit/<area>.md P<level> #<n>

   **Why this one:** <one sentence — why now>

   **Acceptance:**
   <bullet list from the epic file>

   **Suggested next:**
   - `/implement <epic-slug>/S<N>` to ship this story solo
   - `/fan-out <epic-slug>/S<N> <other> <other>` to batch with these disjoint stories: <list 2-3 candidate parallel stories>
   ```

6. **Stop.** This skill is plan-first only. Do not spawn agents, do not edit files. The user picks the next move.

## Chain references

- After `/next`, the user runs `/implement` or `/fan-out`. Both pick up from where `/next` left off — they read the same epic file you read.
- If the user wants to skip the current phase, gently flag the dependency and let them override.

## Edge cases

- **No unfinished stories in any phase:** congratulate, suggest reading `docs/MUSICAL_AUDIT.md` Shipped table to confirm and consider archiving the audit tree.
- **All current-phase stories blocked on each other:** name the blocker; suggest the orchestrator make a design decision before continuing.
- **A sonnet-tagged story sits inside Phase 3** (e.g. Epic 2 S1, S7; Epic 4 S6): treat it as a normal Phase 3 story — surface it in epic#/story# order. The sonnet tag tells `/cycle` and `/implement` which model to spawn; it doesn't bump priority.
- **Epic just completed:** when the last unfinished story of an epic is about to be surfaced, the plan should note "this is the final story in Epic N — `/cycle --until-blocked` will pause for a retrospective after it ships."
- **EPICS.md missing or empty:** something went wrong — say so, don't fabricate a story.
