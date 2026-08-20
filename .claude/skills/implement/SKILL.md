---
name: implement
description: Implement a single Ensemble work story from its issue. Reads the spec from the issue body (Why / Touches / Acceptance), picks the executor (orchestrator-inline by default; a parallel agent only for independent mechanical work across several files), moves it to status:in-progress, and presents a plan before building. Plan-first. Usage `/implement #<n>`.
---
<!-- cycle:rendered template=skills/implement.md.tmpl hash=3b838f26c0e8 — managed by the-cycle; edit the template, not this file -->

# /implement #<n> — ship a single story

Goal: load one issue's context, present a plan, build, report.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill
leans on §1 Tracker & readiness (pickability), §3 Routing (executor choice; re-verify agent
claims), §4 Gates, §5 Judgment calls & autonomy (the fast path), §9 Branch policy. The procedure
below is just the ordering.

## Workflow

1. **Parse the issue ref** — `#<n>` (or a bare number).
2. **Read the issue:**
   - `gh issue view "<n>" --json number,title,state,url,labels,milestone,body` — Why / Touches / Acceptance (body), labels (§2), epic (milestone).
   - Its current Status (§1).
   - The relevant docs + `CLAUDE.md`.
3. **Check it's pickable** (§1). `status:ready` → pick. `status:in-progress` →
   likely mid-flight; confirm before re-building. No status label → warn it's untriaged; proceed only if
   genuinely scoped (the write below promotes it).
4. **Check fast-path eligibility** (§5) — one or two files, all docs/config, deterministic and
   gate-verifiable, none of the always-brake classes. Decide now and carry it through the rest of
   this run; when unsure, it's not eligible. **Fast-path stories always use the inline executor** —
   they're too small for a spawned agent to be worth it.
5. **Pick the executor** (§3, non-fast-path only) — **`orchestrator-inline` by default**:
   the main thread builds, keeping accumulated context (right for small diffs, and for the surfaces
   where a cold agent re-derives brittle detail and ships latent bugs). **Spawn a parallel agent
   only for independent mechanical work** (the same change across several files); keep shared-file
   edits (indexes, schema) and the §4 gates on the main thread.
6. **Mark it `status:in-progress`:** `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" --add-label "status:in-progress"`
7. **Branch check** (§9) — if on `main`, branch first (`git checkout -b <short-slug>`); reuse an
   epic branch if one exists. Never build on `main`.
8. **Present the plan** (a status update, not a gate — §5):
   - **Fast path:** one sentence — `Fast path: #<n> — <title>, touching <files>.` No `## Plan`
     block; nothing else to lay out ahead of a one-or-two-file deterministic edit.
   - **Normal:**
     ```
     ## Plan: #<n> — <title>

     **Issue:** #<n>  ( <milestone> )   **Status:** status:in-progress
     **Executor:** orchestrator-inline | parallel agent   **Branch:** <branch>
     **Files I expect to touch:** <from Touches in the body>
     **Acceptance gates:** §4
     **Approach:** <2–4 bullets>
     ```
9. **Build immediately** in the same turn — no "Proceed?" wait, unless step 3, 4, or 11 already
   surfaced a judgment call.
   - **Fast path:** make the edit directly; no task list.
   - **Inline (default, non-fast-path):** the orchestrator edits directly.
   - **Spawn (mechanical fan-out only):** the prompt cites the **issue #** + acceptance, the files
     it owns (no others), the §4 gates, and asks for a `## Result` block.
   - Run the §4 gates either way.
10. **Independently re-verify** when an agent was spawned (§3) — re-run the gates **yourself**:
    ```
    npm run typecheck     # tsc over public/**/*.{ts,tsx}
    npm run lint          # Biome lint + format check
    npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)
    npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
    npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)
    ```
    The agent's "green" is a claim, not proof; a spawned "all green" has failed in a clean shell.
    A subagent reporting "completed" is likewise evidence of *intent*, not that its writes landed —
    confirm the files actually changed before trusting the report.
11. **Always-brake check** (§5) — if the diff lands on Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field), flag it now; `/review`
    will route a `/security-review`. (Fast-path eligibility already excluded these; this is just
    confirmation.)
12. **Report:**
    - **Fast path (all gates PASS):** emit the §5 verification receipt in place of a narrative
      report:
      ```
      ## Verification receipt
      **Issue:** #<n>
      **Files:** <changed files, exhaustive>
      **Diff fingerprint:** <first 12 hex chars of sha256(`git diff -- <files>`)>
      **Gates:**
      - `npm run typecheck     # tsc over public/**/*.{ts,tsx}` — <PASS/FAIL>
      - `npm run lint          # Biome lint + format check` — <PASS/FAIL>
      - `npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)` — <PASS/FAIL>
      - `npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)` — <PASS/FAIL>
      - `npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)` — <PASS/FAIL>
      ```
      A gate that read FAIL drops the story out of the fast path — fall through to the normal
      report below instead, and don't hand off a receipt that isn't all-PASS.
    - **Normal (or a fast-path gate failed):** the `## Result` (or inline summary) + the
      *re-verified* gate status.
    - Either way: **don't run reviewers** (`/review`). **Don't commit / push / merge** (`/done`).
13. **Suggest next:** `/review` → `/patch` → `/done`.

## Edge cases

- **Issue is a judgment call** (§5, or ambiguous with no obvious default): surface options + a
  recommendation; don't guess.
- **No Status (untriaged idea):** warn it's not a scoped story; proceed only if genuinely scoped.
- **Agent returns Blocked:** present the blocker; don't auto-retry. Common causes: the spec no
  longer matches the code (refresh the issue body), or the acceptance criterion can't be measured.
- **Gates red:** report; don't hand off to `/review` against a broken build.
- **Build abandoned** (not handed to `/review`): roll the label back to `status:ready`
  (`gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" --add-label "status:ready"`) so nothing is stranded mid-flight.

Before building, read: the `CLAUDE.md` section matching the story's Track/area (always
§ Musical Logic & Generative Standards for a musical story; § Coordination if context
fields are involved; § State for state writes; § synth notes for a synth story), plus
the matching `feedback_*` memory note (final-stage multiplier, deterministic phrasing,
state-mock override, synth audio graph, etc.).

A new `public/engine/*.ts` file needs an `AI_MAP.md` row — remind a spawned agent; the
pre-commit docs-lint hook blocks the commit without it.
