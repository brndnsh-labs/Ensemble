---
name: review
description: Run the appropriate reviewer agents on the current uncommitted diff. Inspects `git status` + `git diff --stat` to determine which reviewers fire — music-theory-reviewer for any engine/test change; state-discipline-reviewer if state slices or coordination-engine were touched; worker-contract-reviewer if state read by the logic worker changed. Plan-first — presents the reviewer list and prompts before spawning. Use after `/implement` or `/fan-out` and before `/done`.
---

# /review — review the uncommitted tree

Goal: pick the right reviewer agents based on what changed, spawn them in parallel on the uncommitted diff, and present findings.

## Workflow

1. **Survey the diff.** Run:
   - `git status` — see what's modified, added, deleted
   - `git diff --stat` — see the scope per file

2. **Determine which reviewers to run.** Based on changed files:

   | If diff touches... | Run reviewer |
   | :- | :- |
   | Anything in `public/engine/`, `public/data/`, or `tests/standards/` | `music-theory-reviewer` (default — almost always fires) |
   | `public/state/*.ts`, `public/state-effects.ts`, components that dispatch, OR `coordination-engine.ts` | `state-discipline-reviewer` |
   | `public/state/{arranger,chords,bass,soloist,harmony,groove,playback}.ts`, `public/logic-worker.ts`, `public/worker-client.ts`, OR `getSyncState`/`syncWorker` changes | `worker-contract-reviewer` |
   | Only docs (`docs/`, `*.md`) and no code | None — skip review, report that |
   | Only test additions in `tests/standards/` (no engine change) | `music-theory-reviewer` only (state/worker reviewers irrelevant) |

3. **Present the plan.** Format:

   ```
   ## Review plan

   **Diff scope:** <N files changed, +<n>/-<m> lines>
   **Files:**
   - `public/engine/bass-engine.ts` (+18/-4)
   - `public/engine/coordination-engine.ts` (+12/-0)
   - `tests/standards/jazz-bass-critique.test.ts` (+24/-2)

   **Reviewers to spawn (parallel):**
   - `music-theory-reviewer` — musical correctness, weight placement, idiom
   - `state-discipline-reviewer` — coordination-engine.ts touched

   Run all reviewers? Or adjust?
   ```

4. **On confirmation, spawn reviewers in parallel.**
   - Single message, multiple `Agent` tool calls.
   - Each prompt: "Review the current uncommitted diff. Specifically the following stories were just implemented: <story-ids>. Focus on the changes in <file list>. Report findings as a prioritized list with verbatim line quotes."
   - Use `run_in_background: false`.

5. **When all reviewers complete, present the consolidated findings.** Format:

   ```
   ## Review findings (<N> reviewers)

   ### music-theory-reviewer (<count> findings)
   - P0: <verbatim issue>
   - P1: <verbatim issue>

   ### state-discipline-reviewer (<count> findings)
   - <verbatim issue> | <file:line>

   ### Recommendation
   <One of:>
   - ✅ All clean → `/done <story-ids>` to commit
   - ⚠️ Minor findings, fixable inline → orchestrator addresses, then re-/review
   - ❌ Significant findings, kick back to implementer → `/implement <story-id>` with a fix-specific prompt
   - 🛑 Architectural finding → pause batch, escalate to design decision
   ```

6. **Suggest next step based on the recommendation row.**

## Chain references

- Comes after `/implement` or `/fan-out`.
- Hands off to `/done` (if clean) or back to `/implement` (if findings warrant a rework).

## Edge cases

- **Empty diff:** report it, don't spawn reviewers. Suggest `/next` if user expected to be reviewing.
- **Diff includes both implemented work AND unrelated drift (e.g., accidental edits):** flag the unrelated parts; ask the user whether to revert before reviewing.
- **A reviewer hits a tool error or returns nothing useful:** report the failure, don't fabricate a "clean" verdict.
- **All findings are P2-only:** OK to ship and address P2s in a follow-up. Note them in the recommendation.
- **A finding contradicts a project memory note:** the memory wins by default unless the user explicitly overrides. Surface the contradiction prominently.
