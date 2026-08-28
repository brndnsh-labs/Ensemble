---
name: patch
description: Address /review findings on the uncommitted Ensemble diff. Reads the most-recent review output from context, triages (fix-now is the DEFAULT for any finding about this diff — P0/P1/bounded-P2; escalate to Brandon if it needs a decision or is too big), presents a fix plan, then patches inline — no agent spawn, the orchestrator already holds the diff + findings. Re-runs the gates after. Use after /review, before /done. Plan-first.
---
<!-- cycle:rendered template=skills/patch.md.tmpl hash=7109b7d9c2de — managed by the-cycle; edit the template, not this file -->

# /patch — address reviewer findings

Goal: close the review→done seam — sort `/review`'s findings and apply inline fixes.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** The triage
below applies §5 (findings get actioned not parked — the `finding` issue set trends to empty) and
§2 (the `finding` label); the re-run gates are §4. **Patch does not change Status** — the story
stays in progress.

## Workflow

1. **Load findings** from the most-recent `/review` output in context (severity, `file:line`,
   verbatim quote, suggested direction). If not in context (new session), ask Brandon to
   re-run `/review`.
2. **Triage:**

   | Triage | Criteria | Action |
   |---|---|---|
   | **Fix now (DEFAULT)** | Any finding about the diff under review — P0, P1, **or a bounded P2** (mechanical, or a small/localized change). This is the default, not the exception. | patch inline this turn |
   | **Escalate to Brandon** | A real finding that (a) needs a design call (§5 — Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field), or any genuinely ambiguous call), or (b) is large / cross-cutting / would balloon the diff | stop; surface it; **on Brandon's nod** open a `finding` issue (`gh issue create --title "<title>" --body "<body>" --label "finding"`) and/or recommend `/implement #<n>` with a fix-focused prompt — **never silently shelve a real finding** |
   | **New idea** | A genuinely *new* idea/feature surfaced during review — not a flaw in this code | **note it to Brandon**; don't open an issue unprompted |

   **Bias to fix now.** Deferring a real finding to a list is the thing we're eliminating — the
   open `finding` issues should trend to *empty* (§2). A fix that's genuinely too big to do
   in-cycle is an **escalation** (with Brandon's nod), not a silent defer.
3. **Present the patch plan** (Fix-now / Escalate, each with
   `file:line` + a fix sketch + any directly required companion file and why + the §4 gates) — a
   status update, not a gate (§5).
4. **Patch inline immediately** in the same turn, with Edit/Write — no "Apply?" wait, unless a
   finding needed escalation (§5). **No spawn**: the orchestrator's context already holds the diff
   and the findings; a subagent would re-derive both and get them subtly wrong. Add a `**Why:**`
   comment at any non-obvious fix site.
5. **Re-run gates** (§4):
   ```
   npm run typecheck     # tsc over public/**/*.{ts,tsx}
   npm run lint          # Biome lint + format check
   npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)
   npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
   npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)
   ```
   Re-spawn a specific reviewer if the patch landed in their lane. If a Fix-now patch fails a gate,
   stop and surface — don't pile on.
6. **Report:** a table of patches applied (finding → fix), any **escalated** findings, and gate
   status. The default expectation is that real findings were *fixed*, not parked — call out
   anything that wasn't, and why. Then suggest `/done` (if green) or `/review` again (if the
   patches were substantive).

## Safety

- Never patch an unrelated file. A file not cited by the most-recent `/review` may be changed only
  when it is directly required to resolve a cited finding (for example a regression test, fixture,
  shared type, or generated artifact), and that additional file + reason must appear in the patch
  plan before editing. This exception never permits opportunistic cleanup or new ideas.
- Never silently downgrade a P0 to avoid escalation; if you think it's overblown, say so and let
  Brandon decide.
- Don't run reviewers here — that's `/review`'s job.

## Edge cases

- **No findings:** report; suggest `/done` directly.
- **All findings are P0 design calls:** patch none; surface the questions; recommend
  `/implement #<n>`.
- **Findings conflict** (one says tighten, one says loosen the same threshold): present both; ask —
  don't auto-pick.
- **Cited line has moved** (the diff was edited since `/review`): re-Read, relocate by content
  match, and note the drift.
- **A finding contradicts a project memory note:** this is a §5 always-brake — **escalate, don't
  resolve it here.** The memory usually wins, but "usually" is not a license to drop a finding
  silently: surface both, say which you'd keep and why, and let Brandon call it.
