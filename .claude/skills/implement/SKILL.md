---
name: implement
description: Implement a single musical-audit story by spawning the right implementer agent. Reads the story from its epic file, determines which agent to use (musical-engine-implementer for engine code, critique-test-author for test-only stories), determines model (sonnet or opus from the story tag), and presents a plan before spawning. Plan-first — does not spawn until confirmed. Usage `/implement <epic-slug>/S<N>` (e.g. `/implement coordination-contract/S3`) or `/implement <story-id>` if a unique short id has been adopted.
---

# /implement <story-id> — ship a single story

Goal: load a single story's full context, pick the right agent + model, present a plan, then on user confirmation spawn the agent and report.

## Workflow

1. **Parse the story-id.** Expected format `<epic-slug>/S<N>` (e.g. `coordination-contract/S3`, `bass-voice-leading/S1`). Be forgiving — accept `S3` alone if exactly one epic file has an S3 unfinished, but warn about ambiguity.

2. **Read full story context.**
   - The story block in `docs/audit/epic-<slug>.md`.
   - The cited source finding in `docs/audit/<area>.md` (look for `**Source:** <area>.md P<level> #<n>`).
   - The relevant `CLAUDE.md` sections (always § Musical Logic & Generative Standards; § Coordination if context fields involved; § Worker contract if state crosses the worker).
   - Any feedback-* memory note that matches the story's pattern (final-stage multiplier, deterministic phrasing, state-mock override, synth audio graph).

3. **Determine agent.**
   - Story produces a `.ts` change in `public/engine/` → `musical-engine-implementer`.
   - Story produces a `tests/standards/` change as the primary deliverable → `critique-test-author`.
   - Story does both (engine + new test) → `musical-engine-implementer` (it can extend an existing test inline; for a fresh test file split into two stories or run `critique-test-author` after).

4. **Determine model.** Read the `**Model:** opus | sonnet` line from the story. Default opus if unspecified.

5. **Present the plan.** Format:

   ```
   ## Plan: <story title>

   **Story:** `<epic-slug>/S<N>` — <title>
   **Agent:** <agent-name>
   **Model:** <opus|sonnet>
   **Files I expect the agent to touch:** <list, from the fix sketch>
   **Acceptance check the agent will run:** <test command>

   **Prompt outline:**
   - Read `<epic file>` for the full story
   - Read `<audit file>` for source finding P<level> #<n>
   - Apply repo pattern: <which pattern is most relevant>
   - Implement per fix sketch
   - Run `npx vitest run <test file>` (and 30-run reliability if a threshold is being set)
   - Run `npm run typecheck`
   - Report

   Spawn now? Or adjust prompt first?
   ```

6. **On confirmation, spawn.** Use the `Agent` tool with `subagent_type` matching step 3 and `model` matching step 4. Prompt should:
   - Cite the exact story-id and acceptance criteria
   - Cite the exact source finding
   - Reference the most-relevant memory note(s) by name
   - State the file(s) the agent owns (no other files)
   - Ask for a `## Result` block at the end

7. **When the agent completes, present its `## Result` block.** Do not invoke reviewers — that's `/review`'s job.

8. **Suggest next step.**

   ```
   ## Next:
   - `/review` to run the appropriate reviewer agents on the uncommitted diff
   - Skip review and go straight to `/done <epic-slug>/S<N>` if the change is tiny and self-evident (rare — usually run /review)
   - If the agent reported Status: Blocked, decide whether to rescope the story or escalate
   ```

## Chain references

- Comes after `/next` (or a manually-chosen story).
- Hands off to `/review` next, then `/done`.

## Edge cases

- **Story tagged opus but the orchestrator wants to run sonnet:** acceptable if the design has already been pinned down in conversation; flag the deviation in the spawn prompt so the agent knows it's executing a pre-decided design.
- **Agent returns Blocked:** present the blocker. Common reasons: fix sketch doesn't match code, pattern conflict, acceptance can't be measured. Don't auto-retry — the orchestrator decides.
- **Agent times out or returns gibberish:** report it. Don't pretend the work shipped.
- **Story file doesn't have a Model tag:** treat as opus, note the missing tag, and update the epic file with the correct tag in a `/done` step later.
