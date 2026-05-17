---
name: fan-out
description: Implement 3-5 musical-audit stories in parallel. Loads each story's context, verifies file-disjointness (no two stories edit the same file), determines the right agent + model per story, and presents a batch plan before spawning. Plan-first — does not spawn until confirmed. Use for Phase 2 sonnet-tagged batches and Phase 3 opus batches; do NOT use for Phase 1 (sequential). Usage `/fan-out <story-id-1> <story-id-2> <story-id-3>...`.
---

# /fan-out <story-ids...> — parallel implementation batch

Goal: take a curated list of disjoint stories from the orchestrator, spawn implementer agents in parallel, await all, then suggest `/review`.

## Workflow

1. **Parse the story-ids.** Same format as `/implement` (`<epic-slug>/S<N>`). Require at least 2; warn over 5 (diminishing returns + context pressure).

2. **Load each story's context.** For each id: read its block in the epic file, identify agent (musical-engine vs critique-test), model (opus/sonnet), files-touched (from the fix sketch), and target test.

3. **Verify file-disjointness.**
   - Build a set of files-touched per story.
   - Any file appearing in two stories' sets is a conflict. **Do not proceed.**
   - Present the conflict and suggest which stories to drop from this batch.
   - Note: `coordination-engine.ts` and `tick-logic.ts` are particularly likely to conflict — all Phase 1 stories share them. Phase 1 should not be fanned out; flag that explicitly.

4. **Verify phase eligibility.**
   - All stories in the batch should be in the same phase (mostly).
   - Mixing Phase 2 + Phase 3 is OK if files are disjoint.
   - Mixing in any Phase 1 story is NOT OK — stop and explain.

5. **Present the batch plan.** Format:

   ```
   ## Plan: fan-out batch (<N> stories)

   | Story | Agent | Model | Files | Test |
   | :- | :- | :- | :- | :- |
   | <slug>/S1 | musical-engine-implementer | sonnet | bass-engine.ts | jazz-bass-critique |
   | <slug>/S2 | musical-engine-implementer | sonnet | harmonies.ts | jazz-harmony-critique |
   | <slug>/S3 | critique-test-author | sonnet | metal-piano-critique.test.ts (new) | itself |

   **File-disjointness:** ✅ verified
   **Phase consistency:** Phase 2 (3 stories, all sonnet-tagged)
   **Reviewer (after):** music-theory-reviewer + state-discipline-reviewer (S2 touches state)

   Spawn all 3 in parallel? Or adjust the batch?
   ```

6. **On confirmation, spawn all in parallel.**
   - Single message, multiple `Agent` tool calls.
   - Each agent's prompt is the same shape as `/implement`'s spawn prompt (cite story-id, acceptance, source finding, file ownership, ask for `## Result` block).
   - Use `run_in_background: false` so the harness tracks completion and notifies on each finish.
   - Each agent gets explicit file ownership: "You may edit ONLY `<file-list>`. Report Blocked if you need to touch other files."

7. **As each agent reports, capture its `## Result` block.** Don't summarize until all are in (or until the user asks for progress).

8. **When all complete, present a batch report.** Format:

   ```
   ## Batch result (<N> stories)

   ✅ <slug>/S1 — Shipped (test passes, 30/30 reliability)
   ✅ <slug>/S2 — Shipped (test passes)
   ⚠️ <slug>/S3 — Blocked: <reason>

   **Combined diff:** <N files changed, +<n>/-<m>>

   ### Next:
   - `/review` to run reviewer agents on the combined diff
   - For blocked stories: decide whether to rescope or escalate
   ```

9. **Suggest `/review` next.**

## Chain references

- Typically comes after `/next` (which proposed the batch).
- Hands off to `/review`.
- Failed/blocked stories within a batch should be picked up individually with `/implement <id>` after rescoping.

## Edge cases

- **Two stories edit the same file:** drop one from the batch and run it sequentially after, or merge them into one story brief.
- **A story is tagged opus but bundled with sonnet stories:** OK — spawn it on opus while the sonnet siblings run in parallel. Different models is fine.
- **One agent finishes much faster than the others:** wait. Don't review partial state.
- **An agent reports Blocked:** keep the others running, report the blocker in the final batch summary. Don't kill siblings — their work is independent.
- **Batch is more than 5 stories:** doable but expect context pressure; warn the orchestrator that the post-batch review will have a large diff.
