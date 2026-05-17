---
name: next
description: Pick up the next musical-audit story to work on. Reads docs/audit/EPICS.md, identifies the current phase (Phase 1 sequential first; Phase 2 parallel-sonnet when Phase 1 done; Phase 3 opus when Phase 2 done), and surfaces the highest-priority unfinished story with its acceptance criteria, source finding, and a proposed next-step. Plan-first — does not invoke any agent, just lays out the work. Use at the start of a session or whenever you need to decide what to pick up.
---

# /next — surface the next audit story

Goal: tell the user what to work on next, with enough context that they can decide between `/implement <id>` (single story) and `/fan-out <id...>` (parallel batch).

## Workflow

1. **Read the index.** `docs/audit/EPICS.md`. Note which phase has unfinished stories.

2. **Identify the current phase.**
   - If any Phase 1 story (Epic 1 + Epic 3 S1/S2) is unfinished → Phase 1.
   - Else if any Phase 2 story (sonnet-tagged) is unfinished → Phase 2.
   - Else Phase 3 (remaining opus stories).
   - **Don't skip phases.** Phase 1 unlocks contract shape that Phase 2 stories depend on. If a user asks to skip ahead, name the dependency and confirm.

3. **Find candidate stories in the current phase.** Read each epic file referenced in the phase. Identify stories that are not yet marked done (epic files do not currently have a "done" marker — for now, treat all as unfinished and use `git log` to spot any that have shipped).

4. **Rank candidates** by:
   - P0 source findings before P1 before P2 (check the cited `<area>.md` finding's section)
   - Stories that unlock other stories first (e.g., Epic 1 S1 unlocks Epic 4 S? — note this)
   - Smaller effort first if all else equal

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
- **EPICS.md missing or empty:** something went wrong — say so, don't fabricate a story.
