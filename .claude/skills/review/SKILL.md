---
name: review
description: Review the current uncommitted Ensemble diff. Inspects git status + diff --stat to route reviewers — an inline correctness pass for any non-trivial change, plus `/security-review` whenever the diff touches an always-brake surface (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)), and optionally a second-model angle on a meaty diff. Presents the reviewer plan before running. Does NOT change Status — review happens within in-progress. Use after /implement, before /done.
---
<!-- cycle:rendered template=skills/review.md.tmpl hash=8bad0e66a060 — managed by the-cycle; edit the template, not this file -->

# /review — review the uncommitted tree

Goal: pick the right reviewers for what changed, run them, present consolidated findings.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill is
the detailed expansion of §3 (Reviewers) and routes on §5's always-brake surfaces. The routing
table below is review's own, more-specific version of §3. **Review does not change Status** — the
story stays `in-progress` through review and patch.

## Workflow

1. **Survey the diff.** `git status` + `git diff --stat`. If the diff is empty, say so and stop.
2. **Route reviewers.** Rows are **additive** — union the reviewers and run each once.

   | If the diff touches... | Run |
   | :- | :- |
   | Any non-trivial code change | the **inline correctness pass** — the orchestrator reviews the diff itself, across the angles a heavyweight reviewer would cover (logic, edges, error paths, contracts, invariants). Match depth to risk. Tests **alongside** prod code stay supporting cast — review the behavior change; the prod diff is the subject. |
   | **Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | **destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | **the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | A **test-only** diff | the **test-quality lens** (below) — the tests *are* the deliverable. |
   | A meaty diff built by the default model | optionally a **second-model angle** (below). |
   | Docs only (`*.md`) and no code | None — report "docs-only, skipping review." |

   **`/code-review` is human-triggered, not a loop step.** The heavyweight multi-angle cloud review
   exists, but only Brandon can invoke it — no skill can run it, and a routing table that
   names it as the baseline just teaches the loop to skip that row. The loop's baseline is the
   inline pass + the second-model angle; when a diff is large or risky enough to deserve the
   heavyweight pass, *say so* in the findings ("worth a human `/code-review`") and leave the call
   to Brandon.

   ### Second-model angle (cheap, orthogonal)

   A reviewer with a **different model than the implementer** shares fewer blind spots — a
   different prior catches what same-model review lets slide. Spawn a reviewer on the other tier
   for a meaty diff, alongside the inline pass. Prompt it for correctness bugs *and* anything that
   "feels off" — the different weighting is the point, so don't over-constrain it. It's cheap; run
   it freely on a substantial diff.

   ### Test-quality lens

   When the tests *are* the deliverable, review them as the subject, not as supporting cast:
   - **Coverage gaps** — which behaviors of the unit under test are still unasserted?
   - **Intent vs implementation** — does the test assert the *contract*, or merely restate what the
     code currently does? The second kind passes forever and catches nothing.
   - **Vacuous asserts** — assertions that cannot fail (a tautology, a threshold below the
     no-op baseline, an assert on a value the test itself just set).
   - **Brittle verbatim** — snapshots and exact-string matches that will break on an unrelated
     change and teach everyone to re-bless them without reading.
   - If a test appears to **codify a bug** — the behavior is wrong but the test enshrines it —
     **flag it as a finding**; never bless it because it passes.

3. **Present the plan** (a status update, not a gate — §5):

   ```
   ## Review plan
   **Diff:** <N files, +<n>/-<m>>
   **Files:** <key files + scope>
   **Reviewers:** <those firing> — <why each>
   ```

4. **Run them immediately** in the same turn — no "Run them?" wait.
5. **Present consolidated findings,** each with severity (P0/P1/P2) + `file:line` + a **verbatim
   quote** of the offending line, then a recommendation:

   ```
   ### Recommendation
   - ✅ Clean → /done
   - ⚠️ Mechanical findings → /patch, then /done
   - ❌ Design-level findings → /implement #<n> with a fix-focused prompt
   - 🛑 A finding contradicts a project memory note → memory wins by default; surface it
   ```

6. **Suggest the next step** from the recommendation.

## Safety

- **A finding is a hypothesis with a citation, not a fact.** Before reporting one, read the cited
  line — grep the *assignment*, not just a textual match. Roughly one in three "X exists at line N"
  claims is a misread, and a confidently wrong finding costs more than a missed one.
- **Empty findings is a valid clean result; *missing* findings is a failure.** If a reviewer times
  out or errors, report that — never fabricate "clean" from an absent answer.

## Edge cases

- **Empty diff:** report; suggest `/next`. Don't run reviewers.
- **Diff mixes story work + unrelated drift:** flag the drift; ask whether to revert before
  reviewing.
- **Finding contradicts a memory note** (an architecture rule, an invariant): the memory wins
  unless Brandon overrides; surface it prominently rather than silently dropping either one.
