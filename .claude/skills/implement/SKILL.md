---
name: implement
description: Implement a single Ensemble work story from its GitHub issue. Reads the spec from the issue body + Project fields (Track/Agent/Model/Size), picks the executor (musical-engine-implementer for engine code, critique-test-author for test-only deliverables, synth-implementer for audio/DSP, claude for UI, orchestrator-inline for opus/small/finicky), sets Status → In progress, and presents a plan before building. Plan-first. Usage `/implement #<n>`.
---

# /implement #<n> — ship a single story (GitHub-backed)

Goal: load one issue's context, pick agent + model, present a plan, build on confirmation, report.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill leans
on §1 Tracker & readiness (pickability), §3 Fields & routing (Track → executor + reviewer; re-verify
agent claims), §4 Gates (incl. the Track-specific DoD), §9 Branch policy. The procedure below is just
the ordering.

## Workflow

1. **Parse the issue ref** — `#<n>` (or a bare number).
2. **Read the issue + its fields:**
   - `gh issue view <n> --json title,body,labels,milestone,state,url` — Why / Touches / Acceptance
     (body), `area:*` labels, epic (milestone).
   - Its Project fields (§7 read) — **Status, Track, Model, Size, Agent, Review lens**.
   - The relevant `CLAUDE.md` sections (always § Musical Logic & Generative Standards for a musical
     story; § Coordination if context fields involved; § State for state writes; § synth notes for a
     synth story) + the matching `feedback_*` memory note (final-stage multiplier, deterministic
     phrasing, state-mock override, synth audio graph, etc.).
3. **Check it's pickable** (§1). Needs-ear / Needs-decision / Blocked → stop, surface the blocker. No
   Status (a `backlog`/`finding` idea) → warn it's untriaged; proceed only if genuinely scoped, and
   say you're promoting it (the In-progress write does so).
4. **Pick the executor** (§3 Executors) — from the Agent field, sanity-checked against what the issue
   touches (infer from Track / `area:*` / Touches if Agent is unset). Track `musical` → engine code is
   `musical-engine-implementer` (or `critique-test-author` if the test IS the deliverable); Track
   `synth` → `synth-implementer`; UI → `claude`; finicky state/worker/hydration → `orchestrator-inline`.
5. **Pick the model** (§3) — Model field (`sonnet`/`opus`); default opus. Pass to the Agent tool.
6. **Set Status → In progress:** `node scripts/gh-project.mjs status <n> "In progress"`.
7. **Branch check** (§9) — if on `main`, branch first (`git checkout -b <short-slug>`); reuse an epic
   branch if one exists. Never build on `main`.
8. **Present the plan:**

   ```
   ## Plan: #<n> — <title>

   **Issue:** #<n>  ( <milestone> · Track <musical|synth|bundle> )   **Model:** <sonnet|opus>
   **Executor:** <agent name | orchestrator-inline>   **Branch:** <branch>
   **Files I expect to touch:** <from Touches in the body>
   **Acceptance gates:** §4 (typecheck · lint · test · test:e2e) + Track DoD:
     <critique test `tests/standards/<…>` | A/B audition (Needs-ear) | KB delta>
   **Approach:** <2–4 bullets>

   Proceed? (spawn / implement inline)
   ```

9. **On confirmation, build.**
   - **Spawn:** `Agent` with `subagent_type` + `model`. Prompt cites the **issue #** + acceptance, the
     files it owns (no others), the relevant memory notes by name, the §4 gates + Track DoD, and asks
     for a `## Result` block. New `public/engine/*.ts` file → remind it to add the AI_MAP.md row (§4).
   - **Inline:** the orchestrator edits directly.
   - Run the §4 gates + the Track DoD either way (run the matching critique test for a musical change).
10. **Independently re-verify** when an agent was spawned (§3) — re-run the gates AND the relevant test
    **yourself**; the agent's "green" is a claim, not proof.
11. **Report** the `## Result` (or inline summary) + the *re-verified* gate status. **Don't run
    reviewers** (`/review`). **Don't commit / push / merge** (`/done`). For a Track `synth` story, note
    that the A/B audition (Needs-ear) is still outstanding before it can ship.
12. **Suggest next:** `/review` → `/patch` → `/done`, or `/cycle` continues automatically.

## Edge cases

- **Needs-decision / Needs-ear / Blocked:** stop — not pickable; surface the blocker.
- **No Status (backlog idea):** warn it's not a triaged story; proceed only if genuinely scoped.
- **Agent returns Blocked:** present the blocker; don't auto-retry. Common: spec ≠ code (refresh the
  issue body), or acceptance can't be measured.
- **New `public/engine/*.ts` file:** register it in `AI_MAP.md` or the pre-commit docs-lint hook
  blocks `/done` (§4).
- **Gates red:** report; don't hand off to `/review` against a broken build.
- **Build abandoned (not handed to /review):** roll Status back to `Ready`
  (`node scripts/gh-project.mjs status <n> "Ready"`) so the board doesn't strand it In-progress.
