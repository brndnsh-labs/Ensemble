---
name: review
description: Review the current uncommitted Ensemble diff. Inspects git status + diff --stat to route reviewers by Track + what changed — music-theory-reviewer for engine/critique-test changes, synth-graph-reviewer for audio-graph changes, state-discipline-reviewer for state/coordination, worker-contract-reviewer for worker-mirrored state, bundle-hygiene-reviewer for shrink diffs, plus an inline correctness pass and a Sonnet orthogonal angle. Plan-first — presents the reviewer plan before spawning. Use after /implement or /fan-out, before /done.
---

# /review — review the uncommitted tree

Goal: pick the right reviewers for what changed, run them, present consolidated findings.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill is the
detailed expansion of §3 (Track → Reviewers) and routes on §5's sensitive-diff classes (destructive
data ops / state-or-worker-contract design calls / by-ear). §7 covers the `gh-project.mjs status`
write.

## Workflow

1. **Survey the diff.** `git status` + `git diff --stat`. Empty diff → say so and stop. If an issue #
   is in context (from `/implement` or `/cycle`), mark it **In review** —
   `node scripts/gh-project.mjs status <n> "In review"` (best-effort; skip for a standalone review).
2. **Route reviewers** (rows are additive — union them, run each once):

   | If the diff touches... | Run |
   | :- | :- |
   | `public/engine/**` (generative engines), `public/data/**`, or `tests/standards/**` | **`music-theory-reviewer`** (musical correctness, weight placement, idiom — Track musical) |
   | `public/engine/synth-*.ts`, `engine.ts` `initAudio()`, `reverb.ts`, `synth-utils.ts`, scheduler audio-graph wiring | **`synth-graph-reviewer`** (Web Audio graph hygiene — Track synth) |
   | `public/state/*.ts`, `public/state-effects.ts`, components that dispatch, OR `coordination-engine.ts` | **`state-discipline-reviewer`** (direct-mutation / dispatch discipline / `@direct-mutation` abuse) |
   | worker-mirrored slices (`arranger/chords/bass/soloist/harmony/groove/playback`), `logic-worker.ts`, `worker-client.ts`, OR `getSyncState`/`syncWorker`/`WORKER_MSG.*` changes | **`worker-contract-reviewer`** (half-synced fields) |
   | A bundle-shrink / dead-code diff (Track bundle) | **`bundle-hygiene-reviewer`** (no behavior change, real shrink, tree-shake-safe) |
   | **Test-only diff** — *every* changed file is a test | the **test-quality lens** (below) — *not* the bug-hunt inline pass, which returns `(none)` on tests. For a `tests/standards/` critique test, route to the `critique-test-author` agent's lens (the 5 smells); otherwise `/code-review`'s test angle. **+** the **Sonnet angle**. |
   | Any non-trivial code change | the orchestrator's **inline correctness pass** (logic, edges, error paths, contracts — the same angles `/code-review` covers). Flag if the diff is large/risky enough that a human `/code-review` is worth it. |
   | Destructive data op (persisted sessions / share-URL schema / preset data / state migration) | review is **mandatory** — never ship unreviewed. Surface to Brandon for a human `/code-review`. |
   | **Built by Opus** (orchestrator-inline, or an opus-tagged spawn) | a **Sonnet second-perspective** pass (see below) |
   | Docs only (`docs/`, `*.md`, `.claude/skills/**`) and no code | None — report "docs-only, skipping review." |

   ### Second-model angle (cheap, orthogonal)

   A reviewer with a **different model than the implementer** shares fewer blind spots. So **prefer the
   reviewer model ≠ the implementer model.** This matters most when the orchestrator (Opus) built the
   code inline and would otherwise also review it (Opus grading its own homework). Concretely: an
   Opus-built diff → spawn a **Sonnet** general-purpose reviewer alongside the domain agents. Prompt it
   for correctness bugs *and* "anything that feels off"; don't over-constrain. Cheap — run it freely.

   ### Test-quality lens (for test-only diffs)

   When the deliverable **is** the tests, review the tests *as the subject* against the module under
   test (a critique test → the 5 smells in `docs/MUSICAL_AUDIT.md`: tautology, sub-baseline threshold,
   mislabel, log-vs-assert mismatch, harness-silencing):
   - **Coverage gaps** — which branches / gated paths of the target are unexercised?
   - **Intent vs implementation** — do the asserts pin the *contract*, or just codify today's output
     (freezing a bug in)? Suspect the asserted value is itself a bug → **flag it, don't bless it.**
   - **Tautological / vacuous asserts**, over-mocking that tests the mock not the unit.
   - **Statistical-range discipline** — a critique test must use ranges, not a rigid binary snapshot
     (CLAUDE.md). A critique test reduced to a rigid binary snapshot is a finding.

3. **Present the plan:**

   ```
   ## Review plan
   **Diff:** <N files, +<n>/-<m>>   **Track:** <musical|synth|bundle>
   **Files:** <key files + scope>
   **Reviewers:** <inline pass | music-theory | synth-graph | state-discipline | worker-contract | bundle-hygiene | Sonnet angle — list those firing> — <why each>
   Run them?
   ```

4. **On confirmation, run them.**
   - **Inline correctness pass** — orchestrator reviews the diff itself (logic, edges, error paths,
     contracts, the invariants). Match depth to risk.
   - **Domain agent(s)** — spawn the routed reviewers in parallel (single message, multiple `Agent`
     calls, `run_in_background: false`), each with the issue # + focus + the specific invariants.
   - **Test-quality lens** — for a test-only diff, per above.
   - **Sonnet angle** — for an Opus-built diff, a `model: sonnet` general-purpose reviewer.
   - **Human `/code-review` (optional):** large/risky diff → surface it; *Brandon* triggers it.
5. **Present consolidated findings,** each with severity (P0/P1/P2) + `file:line` + verbatim quote:

   ```
   ## Review findings (<N> reviewers)
   ### <reviewer> (<count>)
   - P0: <verbatim> | <file:line>
   ### Recommendation
   - ✅ Clean → /done
   - ⚠️ Mechanical findings → /patch, then /done
   - ❌ Design-level findings → /implement #<n> with a fix-focused prompt
   - 🛑 A finding contradicts a project memory note → memory wins by default; surface it
   ```

6. **Suggest the next step** from the recommendation.

## Edge cases

- **Empty diff:** report; suggest `/next`. Don't spawn.
- **Diff mixes story work + unrelated drift:** flag the drift; ask whether to revert before reviewing.
- **A reviewer returns nothing:** empty findings is a valid clean result; *missing* findings
  (timeout/error) is a failure — report it, don't fabricate "clean."
- **Finding contradicts a memory note:** the memory wins unless Brandon overrides; surface prominently.
- **Track `synth` diff:** `synth-graph-reviewer` judges graph hygiene, **not** whether it sounds good —
  that's the A/B audition (Needs-ear), a separate human gate before `/done` can merge.
