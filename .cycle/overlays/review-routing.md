   ### Ensemble's reviewer routing (path-keyed)

   DOCTRINE §3's reviewer table is keyed on the story's `track/*` label. `/review` only has a
   **diff**, so route on **changed paths** instead — these rows are the same reviewers, re-keyed.
   Rows are **additive**: union everything that matches and run each reviewer once. A diff that
   touches an engine *and* a state slice gets both.

   | If the diff touches... | Run | It is responsible for |
   | :- | :- | :- |
   | Generative engines — `public/engine/{bass-engine,soloist-*,accompaniment,chords-engine,harmonies,arc,fills}.ts`, `public/engine/grooves/**`, `coordination-engine.ts` — or `tests/standards/**` | **`music-theory-reviewer`** | Whether the musical intent is actually *expressed* by the code. Catches "programmer's math": statistically clean, musically wrong. |
   | `public/engine/synth-*.ts`, `engine.ts` `initAudio()`, `reverb.ts`, `synth-utils.ts`, the audio-graph wiring in `scheduler-core.ts` | **`synth-graph-reviewer`** | Web Audio graph hygiene only — NaN/0 into an `AudioParam`, nodes created but never disconnected, `exponentialRamp` from/to zero, feedback stability, per-note allocation in a hot path. **Not** "does it sound good" — that's the `status:needs-ear` gate. |
   | `public/state/**`, `prototypes/v2/lib/runtime.ts`, a new `ACTIONS.*`, a new `// @direct-mutation` marker, or any `signal.x = y` outside a reducer | **`state-discipline-reviewer`** | Dispatch discipline; `@direct-mutation` used outside the four sanctioned categories in CLAUDE.md; non-atomic dispatch chains; v2 UI reaching engine state outside `lib/runtime.ts`. |
   | `worker-client.ts`, `logic-worker.ts`, `getSyncState()`/`syncWorker()`, `WORKER_SYNC_MANIFEST`, a worker-mirrored slice (`arranger`, `chords`, `bass`, `soloist`, `harmony`, `groove`, `playback`), or a new `WORKER_MSG.*` | **`worker-contract-reviewer`** | The half-update: a field that exists on the main thread but never crosses; that rides the initial snapshot but has no delta case; or that the worker silently drops. |
   | Any diff whose *claim* is fewer bytes or "dead code removal / no behavior change", whatever the path | **`bundle-hygiene-reviewer`** | Reachable code deleted under a "dead" claim; behavior change disguised as cleanup; tree-shaking defeated. It does **not** measure — the orchestrator measures the v2 export (`prototypes/v2/out/_next/static/`). |
   | `prototypes/v2/app/**` (UI and CSS) | the **inline pass**, against `prototypes/v2/CLAUDE.md` | The per-surface boundaries in its navigation table (the shell owns the `<dialog>` refs and all state; surfaces are presentational), dialog a11y, CSS. The `webkit-phone` Playwright project is emulated WebKit, not a phone — say when a finding needs `verify-on-device`. |
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

   - `prototypes/v2/CLAUDE.md` — the app: delivery, trust boundaries, per-surface ownership,
     verification gates.
   - `public/CLAUDE.md` — worker sync, effects/reactivity, practice-loop step framing,
     build identity and build-time flags.
   - `public/engine/CLAUDE.md`, `public/engine/grooves/CLAUDE.md` — generative engine internals.
   - `tests/CLAUDE.md` — critique-harness shape, determinism/seeding, mocking, Playwright imports.

   ### Weighing a finding from these reviewers

   - **`music-theory-reviewer`'s musical judgment is much more trustworthy than its citations.**
     Roughly **one in three** "X exists at line N" claims is a misread. Read the cited line — grep
     the *assignment*, not a textual match — before patching. Re-derive its suggested numbers too:
     a finding can be right in diagnosis and wrong in the arithmetic.
   - **A reviewer that errored or timed out is a *missing* result, not a clean one.** Say so.

