# Technical Debt

A running log of state-discipline, worker-contract, and architectural-hygiene findings that have been triaged but not yet fixed. Companion to `docs/MUSICAL_AUDIT.md` (which tracks musicality findings) — different failure modes, same shape of tracker.

Started: 2026-05-16. Each entry is sized so the next reader can decide whether to pick it up without re-deriving the audit.

## Status (2026-05-16)

- **Open:** 2 — `arranger.progression` bulk write bypasses dispatch flow; soloist picker signature uses `soloistState: any` to allow a test-only escape-hatch slot.
- **Shipped:** 0.

## Open findings

### 1. `arranger.progression` and derived cache fields are written outside the reducer

**Location:** `public/engine/chords-engine.ts:916` (validateProgression), `public/engine/chords-engine.ts:1025-1030` (updateProgressionCache).

**Severity:** `DIRECT-MUTATION ABUSE` + `MISSING ACTION` (per `state-discipline-reviewer` taxonomy).

**What:** `validateProgression` writes `arranger.progression` via a `(arranger as Mutable<...>).progression = allChords; // @direct-mutation` cast, and `updateProgressionCache` writes four derived fields (`totalSteps`, `stepMap`, `measureMap`, `sectionMap`) via `Object.assign(arranger, {...})` — all bypassing the dispatch flow. The `@direct-mutation` marker on line 916 doesn't fit any legitimate category from CLAUDE.md § State: not real-time audio, not an AudioNode property, not pre-mount hydration, not a coordinated transient flag. The three callers (`main.ts:30`, `state-effects.ts:97`, `arranger-controller.ts:56`) all fire once per user action on the main thread — exactly the case dispatch was designed for. `dispatch(ACTIONS.PROG_VALIDATED)` is fired afterward as a Preact notification, but `PROG_VALIDATED` has no reducer case (confirmed by `tests/unit/state-integrity.test.ts:77-88`, which catalogs it as notify-only).

**Why it matters:**
1. **Discipline rot.** This is the canonical "escape hatch" the marker exists to prevent. Once one cold-path call site claims the marker, the rule erodes — future contributors will cite this as precedent.
2. **Worker snapshot drift risk.** `getSyncState` reads `arranger.progression` (and derived fields). The full sync flows correctly only because the mutation happens synchronously before `syncWorker` is next called; there's no enforcement. A future async refactor of `validateProgression` (e.g. for large progressions) would silently drift the worker out of sync.
3. **Hidden ordering coupling.** `validateProgression` is called from `state-effects.ts:97` inside `handleEffects`, which runs after a dispatch. The mutation happens, then `dispatch(ACTIONS.PROG_VALIDATED)` re-enters the dispatch loop. A reducer-driven path would make the ordering explicit; the current path hides it.

**Suggested fix:** Introduce `ACTIONS.SET_PROGRESSION` with payload `{ progression, totalSteps, stepMap, measureMap, sectionMap }` (atomic — these five fields are derived together; any partial update would corrupt the scheduler). Add a case to `arrangerReducer`. Refactor `validateProgression` to compute and return the bundle rather than mutate. Refactor `updateProgressionCache` to be pure (return the cache fields). The three callers dispatch. Delete `PROG_VALIDATED` since the reducer write will trigger Preact via deepSignal naturally. Drop the `@direct-mutation` marker.

**Scope cost (the reason this is queued, not fixed):**
- 7 source files (`chords-engine`, `state/arranger`, `types`, `main`, `state-effects`, `arranger-controller`, `e2e-tools`).
- 1 unit test (`tests/unit/state-integrity.test.ts`) updates its notify-only catalog.
- **~30 test files** call `validateProgression(getState())` with no dispatch argument and rely on the direct mutation. The standards-compliance suite alone calls it 16 times (`tests/standards/standards-compliance.test.ts:132, 146, 370, 501, 556, 598, 663, 687, 704, 733, 773, 815, 870, 911, 960, 1014`). Each needs either dispatch wiring or a test-harness shim that internalizes dispatch on `validateProgression`'s behalf.
- Circular-import risk if `validateProgression` tries to import `dispatch` from `state.ts` directly (`state-effects.ts` already imports from `chords-engine.ts`).

Roughly: a multi-day refactor with non-trivial test surgery. Worth doing as its own work, not a drive-by.

**Partial cleanup already shipped (2026-05-16):** dropped a redundant unmarked `Object.assign(arranger, { progression: allChords })` on what was previously line 917 — it duplicated the mutation on line 916 without a marker. Surface paint; the underlying discipline violation remains.

### 2. Soloist picker uses `soloistState: any` to allow a test-only escape-hatch slot

**Location:** `public/engine/soloist-pitch-engine.ts:205` (signature), `:474` (the load-bearing access).

**Severity:** `NIT` / type-safety (per `worker-contract-reviewer` taxonomy).

**What:** `selectPitchAndDevices` takes `soloistState: any`. That looseness is what lets the picker read `soloistState.srdcState` (a top-level override slot used only by tests, never declared on `SoloistState` in `public/types.ts`) without a compile error. Read order is `soloistState.srdcState || soloistState.session?.currentPhrase?.context?.srdcState || 'statement'` — top-level test override wins, then production-written nested slot, then default. The pattern is documented in memory `feedback_state_mock_vs_production_override.md` and validated by `docs/MUSICAL_AUDIT.md` § Patterns Proven #5.

**Why it matters:** A future maintainer tightening the picker signature to `soloistState: SoloistState` would silently break every critique test that uses the top-level override (currently `tests/standards/soloist-musicality.test.ts:109,137`, `tests/unit/engine/soloist-ceiling.test.ts:76`, `tests/unit/engine/soloist-country.test.ts:52`). The error would be a typecheck failure on the test files, not a runtime regression — caught at CI, but the failure message wouldn't obviously point at "your override slot is undeclared." Discoverability is the issue, not correctness.

**Suggested fix:** Two options, both small.

- **(a)** Declare `srdcState?: SrdcPhase` on `SoloistState` in `public/types.ts` with a JSDoc comment marking it `@test-only` (or `@deprecated except in tests` — whichever style fits). The picker can keep `soloistState: any` for now or be tightened in the same change.
- **(b)** Document the loose-typing decision: a one-line comment on the picker signature noting that `any` is deliberate because of the test override slot, with a pointer to `feedback_state_mock_vs_production_override.md`.

Option (a) is more discoverable; option (b) is zero structural change. Either closes the discoverability gap.

**Scope cost:** ~5 minutes. One type definition or one comment.

## Methodology

Findings land here when:
- A reviewer agent (state-discipline-reviewer, worker-contract-reviewer, etc.) surfaces a real violation.
- The fix is real but the scope is bigger than the diagnosis.
- The minimal surgical cleanup (if any) has been done; the full refactor is queued.

Each entry should include: location, severity, what, why it matters, suggested fix, and an honest **scope cost** that lets the next reader decide whether to pick it up. When shipped, move the entry to a `Shipped` section with the resolving commit.

## Related

- `docs/MUSICAL_AUDIT.md` — musicality findings, same shape of tracker.
- `CLAUDE.md` § Mandatory Checklist and § State — the rules being enforced.
- `.claude/agents/state-discipline-reviewer.md` — the agent that surfaces state-flow findings.
