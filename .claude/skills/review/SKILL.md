---
name: review
description: Review the current uncommitted Ensemble diff. Inspects git status + diff --stat to route reviewers — an inline correctness pass for any non-trivial change, plus `/security-review` whenever the diff touches an always-brake surface (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)), and optionally a second-model angle on a meaty diff. Presents the reviewer plan before running. Does NOT change Status — review happens within status:in-progress. Use after /implement, before /done.
---
<!-- cycle:rendered template=skills/review.md.tmpl hash=a19dd12b9fd2 — managed by the-cycle; edit the template, not this file -->

# /review — review the uncommitted tree

Goal: pick the right reviewers for what changed, run them, present consolidated findings.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill is
the detailed expansion of §3 (Reviewers) and routes on §5's always-brake surfaces. The routing
table below is review's own, more-specific version of §3. **Review does not change Status** — the
story stays `status:in-progress` through review and patch.

## Workflow

1. **Choose the review mode.** Use the normal full review unless this invocation immediately
   follows `/patch` and both the original consolidated findings and `/patch`'s outcome table are in
   context. In that case use **finding-closure mode** below. Missing original context is not a
   reason to guess: run the normal full review.
2. **Check for a fast-path receipt** (§5). In normal mode, if `/implement`'s
   `## Verification receipt` is in
   context, recompute its diff fingerprint over the same file list. A match (and every gate in it
   still PASS) means the issue read and the file list already stand proven — skip straight to step
   4's routing with that instead of re-surveying. A stale fingerprint or no receipt: proceed
   normally below, without comment.
3. **Survey the diff.** `git status` + `git diff --stat`. In finding-closure mode, also identify the
   direct patch delta and the files declared in `/patch`'s plan/report. If the diff is empty, say so
   and stop.
4. **Route reviewers.** In normal mode, rows are **additive** — union the reviewers and run each
   once.

   | If the diff touches... | Run |
   | :- | :- |
   | Any non-trivial code change | the **inline correctness pass** — the orchestrator reviews the diff itself, across the angles a heavyweight reviewer would cover (logic, edges, error paths, contracts, invariants). Match depth to risk. Tests **alongside** prod code stay supporting cast — review the behavior change; the prod diff is the subject. |
   | **Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | **destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | **the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)** | **`/security-review`** *in addition* — non-optional here (§5). Reason about this flow's specific threat model, not just generic categories. |
   | A **test-only** diff | the **test-quality lens** (below) — the tests *are* the deliverable. |
   | A meaty diff built by the default model | optionally a **second-model angle** (below). |
   | Docs only (`*.md`) and/or config, no application code | the **editorial lens** (below) — never "skipping review." |

   **`/code-review` is human-triggered, not a loop step.** The heavyweight multi-angle cloud review
   exists, but only Brandon can invoke it — no skill can run it, and a routing table that
   names it as the baseline just teaches the loop to skip that row. The loop's baseline is the
   inline pass + the second-model angle; when a diff is large or risky enough to deserve the
   heavyweight pass, *say so* in the findings ("worth a human `/code-review`") and leave the call
   to Brandon.

   ### Ensemble's reviewer routing (path-keyed)

   DOCTRINE §3's reviewer table is keyed on the story's `track/*` label. `/review` only has a
   **diff**, so route on **changed paths** instead — these rows are the same reviewers, re-keyed.
   Rows are **additive**: union everything that matches and run each reviewer once. A diff that
   touches an engine *and* a state slice gets both.

   | If the diff touches... | Run | It is responsible for |
   | :- | :- | :- |
   | Generative engines — `public/engine/{bass-engine,soloist-*,accompaniment,chords-engine,harmonies,arc,fills}.ts`, `public/engine/grooves/**`, `coordination-engine.ts` — or `tests/standards/**` | **`music-theory-reviewer`** | Whether the musical intent is actually *expressed* by the code. Catches "programmer's math": statistically clean, musically wrong. |
   | `public/engine/synth-*.ts`, `engine.ts` `initAudio()`, `reverb.ts`, `synth-utils.ts`, the audio-graph wiring in `scheduler-core.ts` | **`synth-graph-reviewer`** | Web Audio graph hygiene only — NaN/0 into an `AudioParam`, nodes created but never disconnected, `exponentialRamp` from/to zero, feedback stability, per-note allocation in a hot path. **Not** "does it sound good" — that's the `status:needs-ear` gate. |
   | `public/state/**`, a new `ACTIONS.*`, a new `// @direct-mutation` marker, or any `signal.x = y` outside a reducer | **`state-discipline-reviewer`** | Dispatch discipline; `@direct-mutation` used outside the four sanctioned categories in CLAUDE.md; non-atomic dispatch chains; reactivity lost in a `useEnsembleState` selector. |
   | `worker-client.ts`, `logic-worker.ts`, `getSyncState()`/`syncWorker()`, `WORKER_SYNC_MANIFEST`, a worker-mirrored slice (`arranger`, `chords`, `bass`, `soloist`, `harmony`, `groove`, `playback`), or a new `WORKER_MSG.*` | **`worker-contract-reviewer`** | The half-update: a field that exists on the main thread but never crosses; that rides the initial snapshot but has no delta case; or that the worker silently drops. |
   | Any diff whose *claim* is fewer bytes or "dead code removal / no behavior change", whatever the path | **`bundle-hygiene-reviewer`** | Reachable code deleted under a "dead" claim; behavior change disguised as cleanup; tree-shaking defeated. It does **not** measure — `npm run build:size` owns the numbers. |
   | `public/components/**`, `public/css/**`, `App.tsx` | the **inline pass**, against `public/components/CLAUDE.md` | Overlay/popover a11y, portal containing-block traps, CSS specificity, design tokens. A green `@mobile` Playwright run does **not** cover WebKit touch behavior — that project is Blink. Say when a finding needs `verify-on-device`. |
   | A `tests/standards/**` file that *is* the deliverable | the **test-quality lens**, sharpened to the **five critique smells** below | — |
   | Anything else | the inline correctness pass alone | — |

   ### The five critique smells (test-quality lens for `tests/standards/**`)

   Full treatment in `docs/guides/musical-engine-patterns.md` § Methodology; harness-shape traps
   specific to this suite are in `tests/CLAUDE.md`. Each smell has been a real bug here, and each
   produces a test that passes forever while guarding nothing:

   (a) **Predicate tautology** — expected output re-derived from the engine's own boolean tree.
   (b) **Threshold below random baseline** — passes on worse-than-random output.
   (c) **Metric measures the wrong thing** — the name's claim isn't what the assertion counts.
   (d) **Report/assert mismatch** — the logged `Target:` is aspirational; only the assertion guards.
   (e) **Harness silences the engine path** — hand-built `stepInfo` omits the flag the engine
   branches on, so the lane under test never fires.

   ### Don't re-derive the nested CLAUDE.md files

   The traps for each layer live next to the code and load automatically when you read a file in
   that directory — **read them rather than reasoning from memory**, and if a finding contradicts
   one, the file wins:

   - `public/components/CLAUDE.md` — the UI layer: `useModalA11y`'s modal-vs-popover contract,
     `createPortal` over live chart content, CSS specificity traps, design tokens.
   - `public/CLAUDE.md` — worker sync, effects/reactivity, practice-loop step framing,
     persistence/versioning, dev-only gating.
   - `public/engine/CLAUDE.md`, `public/engine/grooves/CLAUDE.md` — generative engine internals.
   - `tests/CLAUDE.md` — critique-harness shape, determinism/seeding, mocking, e2e.

   ### Weighing a finding from these reviewers

   - **`music-theory-reviewer`'s musical judgment is much more trustworthy than its citations.**
     Roughly **one in three** "X exists at line N" claims is a misread. Read the cited line — grep
     the *assignment*, not a textual match — before patching. Re-derive its suggested numbers too:
     a finding can be right in diagnosis and wrong in the arithmetic.
   - **A reviewer that errored or timed out is a *missing* result, not a clean one.** Say so.

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

   ### Editorial lens

   A docs/config-only diff gets read as an editor, not a code reviewer — light, but never skipped:
   - **Issue fidelity** — does the change actually satisfy the issue's `Acceptance:` line?
   - **Contradictory wording** — does it conflict with something else this doc/config already says?
   - **References** — do the section numbers, file paths, and links it points at still resolve?
   - **Formatting** — table alignment, heading levels, list markers consistent with the rest of the
     file?
   - **Unintended edits** — anything touched outside what `Touches:` (or the diff itself) named?

   No specialized reviewer, no automatic gate rerun — this lens is deliberately light because §4's
   gates already proved the deterministic part.

   ### Finding-closure mode

   This is a narrow independent check, not `/patch` grading its own work and not an automatic second
   full review:
   - Re-read every original finding by its stable ID (`F1`, `F2`, …) and `/patch`'s claimed outcome.
   - Verify each `fixed` claim against the current code and inspect the direct patch delta for a
     nearby regression. Confirm each `escalated` claim has the explicit disposition §5 requires;
     `remaining` is not clean.
   - Re-run the specific specialized reviewer that originated a finding when its repair remains in
     that reviewer's lane. The orchestrator performs the inline closure check for all other findings.
   - A declared test, fixture, shared type, or generated companion that is directly required by the
     finding remains eligible for targeted closure. An undeclared file, broader behavior change,
     missing original context, or newly discovered finding ends targeted closure and triggers the
     normal full review over the current diff.

5. **Present the plan** (a status update, not a gate — §5):

   ```
   ## Review plan
   **Mode:** normal full review | finding closure
   **Diff:** <N files, +<n>/-<m>>
   **Files:** <key files + scope>
   **Reviewers:** <those firing> — <why each>
   ```

6. **Run them immediately** in the same turn — no "Run them?" wait.
7. **Present the result.** In normal mode, assign every actionable finding a stable in-context ID
   (`F1`, `F2`, …) and include severity (P0/P1/P2) + `file:line` + a **verbatim quote** of the
   offending line. In finding-closure mode, report every original ID as `fixed`, `remaining`, or
   `escalated`, plus any new finding. Then give the matching recommendation:

   ```
   ### Recommendation
   - ✅ Clean → /done
   - ✅ Closure clean → /done
   - ⚠️ Mechanical findings → /patch, then /review in finding-closure mode
   - ❌ Design-level findings → /implement #<n> with a fix-focused prompt
   - 🔄 Closure scope expanded or found a new issue → normal full /review
   - 🛑 A finding contradicts a project memory note → memory wins by default; surface it
   ```

8. **Suggest the next step** from the recommendation.

## Safety

- **A finding is a hypothesis with a citation, not a fact.** Before reporting one, read the cited
  line — grep the *assignment*, not just a textual match. Roughly one in three "X exists at line N"
  claims is a misread, and a confidently wrong finding costs more than a missed one.
- **Empty findings is a valid clean result; *missing* findings is a failure.** If a reviewer times
  out or errors, report that — never fabricate "clean" from an absent answer.

## Edge cases

- **Empty diff:** report; suggest `/next`. Don't run reviewers.
- **Fast-path receipt present but stale or missing a PASS** (§5): treat it as absent — survey and
  route normally, without flagging the mismatch as a finding.
- **Finding-closure context is missing:** run the normal full review; never reconstruct IDs or
  outcomes from memory.
- **Diff mixes story work + unrelated drift:** flag the drift; ask whether to revert before
  reviewing.
- **Finding contradicts a memory note** (an architecture rule, an invariant): the memory wins
  unless Brandon overrides; surface it prominently rather than silently dropping either one.
