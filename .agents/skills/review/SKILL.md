---
name: review
description: Independently review the current uncommitted Ensemble diff (or a named branch/PR) — correctness, plus whether it does what the issue asked — adding `/security-review` when it touches an always-brake surface (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state contract (a `@direct-mutation` outside the sanctioned categories)). Reports findings with evidence; fixing them is the caller's job. Used by /cycle, or on its own for any diff.
---
<!-- cycle:rendered template=skills/review.md.tmpl hash=f8fff0181ee4 — managed by the-cycle; edit the template, not this file -->

# /review — fresh eyes on a diff

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context** (§3 says how
much review a change deserves; §5 says when to stop).

**Run it in a fresh-context subagent** when the caller built the diff: hand it the issue number
and the diff, not your reasoning. The value is a reviewer who doesn't share the builder's
assumptions. If a subagent can't be launched at all, don't stall: review in-thread, re-reading
the issue and the diff from scratch, and say that's what happened.

## What to check

- **Correctness — the inline correctness pass.** Logic, edge cases, error paths, contracts,
  invariants. Depth matches risk. Tests beside production code are supporting cast; the behavior
  change is the subject.
- **Spec — kept separate.** Read the issue's Acceptance and its comments, and report against them:
  a criterion missing or half-met, behavior nobody asked for, or a criterion addressed in a way that
  won't actually satisfy it. Quote the acceptance line, and tag these `[spec]`. No issue in context
  → say "no spec available"; never reconstruct one from the diff.
- **Tests that are the deliverable — the test-quality lens.** Do they assert the contract or just
  restate the implementation? Can each assertion actually fail? A test that enshrines a bug is a
  finding, however green.
- **Brake surfaces** (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state contract (a `@direct-mutation` outside the sanctioned categories)): also run `/security-review`, reasoning about this flow's
  threat model, not generic categories.
- **A big or subtle diff:** a second reviewer on a different model catches same-prior blind spots.
  The heavyweight `/code-review` is human-triggered — if a diff deserves it, say so and leave the
  call to Brandon.

   ### Ensemble's reviewer routing (path-keyed)

   DOCTRINE §3's reviewer table is keyed on the story's `track/*` label. `/review` only has a
   **diff**, so route on **changed paths** instead — these rows are the same reviewers, re-keyed.
   Rows are **additive**: union everything that matches and run each reviewer once. A diff that
   touches an engine *and* a state slice gets both.

   | If the diff touches... | Run | It is responsible for |
   | :- | :- | :- |
   | The band engine — `band/**` (styles, players, arrange, feel, theory) — or its claims, `band/test/claims/**` | **`music-theory-reviewer`** | Whether the musical intent is actually *expressed* by the code. Catches "programmer's math": statistically clean, musically wrong. |
   | `core/engine/synth-*.ts`, `engine.ts` `initAudio()`, `reverb.ts`, `synth-utils.ts`, the band host's scheduling in `web/lib/band-host.ts` | **`synth-graph-reviewer`** | Web Audio graph hygiene only — NaN/0 into an `AudioParam`, nodes created but never disconnected, `exponentialRamp` from/to zero, feedback stability, per-note allocation in a hot path. **Not** "does it sound good" — that's the `status:needs-ear` gate. |
   | `core/state/**`, `web/lib/runtime.ts`, a new `ACTIONS.*`, a new `// @direct-mutation` marker, or any `signal.x = y` outside a reducer | **`state-discipline-reviewer`** | Dispatch discipline; `@direct-mutation` used outside the three sanctioned categories in CLAUDE.md; non-atomic dispatch chains; v2 UI reaching engine state outside `lib/runtime.ts`. |
   | Any diff whose *claim* is fewer bytes or "dead code removal / no behavior change", whatever the path | **`bundle-hygiene-reviewer`** | Reachable code deleted under a "dead" claim; behavior change disguised as cleanup; tree-shaking defeated. It does **not** measure — the orchestrator measures the v2 export (`web/out/_next/static/`). |
   | `web/app/**` (UI and CSS) | the **inline pass**, against `web/CLAUDE.md` | The per-surface boundaries in its navigation table (the shell owns the `<dialog>` refs and all state; surfaces are presentational), dialog a11y, CSS. The `webkit-phone` Playwright project is emulated WebKit, not a phone — say when a finding needs `verify-on-device`. |
   | A `band/test/**` claim or critique that *is* the deliverable | the **test-quality lens**, sharpened to the **five critique smells** below | — |
   | Anything else | the inline correctness pass alone | — |

   ### The five critique smells (test-quality lens for `band/test/**`)

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

   - `web/CLAUDE.md` — the app: delivery, trust boundaries, per-surface ownership,
     verification gates.
   - `band/CLAUDE.md` — the band engine: its design laws, claims and critique harness.
   - `core/CLAUDE.md` — effects/reactivity, offline-render clones, build identity and
     build-time flags, the metronome product constraint, config-semantics migrations.
   - `core/engine/CLAUDE.md` — the voices, sample packs and the audio graph.
   - `tests/CLAUDE.md` — statistical-claim traps, determinism/seeding, mocking, Playwright imports.

   ### Weighing a finding from these reviewers

   - **`music-theory-reviewer`'s musical judgment is much more trustworthy than its citations.**
     Roughly **one in three** "X exists at line N" claims is a misread. Read the cited line — grep
     the *assignment*, not a textual match — before patching. Re-derive its suggested numbers too:
     a finding can be right in diagnosis and wrong in the arithmetic.
   - **A reviewer that errored or timed out is a *missing* result, not a clean one.** Say so.

## Reporting

- Each finding: an ID (`F1`, `F2`, …), severity (P0 / P1 / P2), `file:line`, a verbatim quote of the
  line, and what's wrong. **Read the cited line before reporting it** — a confidently wrong finding
  costs more than a missed one.
- End with one verdict: **clean**, **fixable** (mechanical findings — fix and re-check), or
  **needs Brandon** (a design call, a P0 on a brake surface, or a contradiction with a project
  memory note — which wins by default, but surface it).
- No findings is a valid result. A reviewer that errored or timed out is a *missing* result — say
  so; never report it as clean.
- **Re-check mode:** when called again after fixes, confirm each original ID against the current
  tree (fixed / still open) and look at the fix itself for new problems. If the fix grew into new
  behavior, do a full review instead.
