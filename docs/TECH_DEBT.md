# Technical Debt

> **Historical snapshot (May 2026).** This file is not a live backlog. Use GitHub
> issues for current work and `CLAUDE.md`'s `@direct-mutation` policy for the
> canonical state-discipline rules.

A frozen record of state-discipline, worker-contract, and architectural-hygiene
findings from the May 2026 audit, preserved alongside
`docs/audit/FOLLOWUPS.md` for historical context.

The original audit started on 2026-05-16. Entries retain their contemporary
sizing and rationale so later readers can understand the record without
re-deriving it.

## Status (updated 2026-08-31)

- **Open:** 0.
- **Superseded:** 1 — the `arranger.progression` mutation finding did not account
  for detached offline-render state.
- **Shipped:** 1 — soloist picker `soloistState: any` discoverability gap (Epic 11 S5).

## Superseded findings

### 1. `arranger.progression` and derived cache fields are written outside the reducer — SUPERSEDED

**Superseded:** `validateProgression` must work on both the live state tree and
the detached clone passed by `public/export/audio-export.ts`. Dispatching from
inside it would target the live store and could corrupt a running session during
offline export. `CLAUDE.md` therefore classifies this boundary as a sanctioned
detached-render-clone exception. The refactor below is retained only as the
original audit record and must not be picked up as current work.

**Location:** `public/engine/chords-engine.ts:916` (validateProgression), `public/engine/chords-engine.ts:1025-1030` (updateProgressionCache).

**Historical classification (superseded):** `DIRECT-MUTATION ABUSE` + `MISSING ACTION` (per the May 2026 `state-discipline-reviewer` taxonomy).

**What the May 2026 audit reported:** `validateProgression` writes `arranger.progression` via a `(arranger as Mutable<...>).progression = allChords; // @direct-mutation` cast, and `updateProgressionCache` writes four derived fields (`totalSteps`, `stepMap`, `measureMap`, `sectionMap`) via `Object.assign(arranger, {...})` — all bypassing the dispatch flow. The original review did not account for the detached export caller described above.

**Why the original audit considered it debt (superseded):**
1. **Discipline rot.** This is the canonical "escape hatch" the marker exists to prevent. Once one cold-path call site claims the marker, the rule erodes — future contributors will cite this as precedent.
2. **Worker snapshot drift risk.** `getSyncState` reads `arranger.progression` (and derived fields). The full sync flows correctly only because the mutation happens synchronously before `syncWorker` is next called; there's no enforcement. A future async refactor of `validateProgression` (e.g. for large progressions) would silently drift the worker out of sync.
3. **Hidden ordering coupling.** `validateProgression` is called from `state-effects.ts:97` inside `handleEffects`, which runs after a dispatch. The mutation happens, then `dispatch(ACTIONS.PROG_VALIDATED)` re-enters the dispatch loop. A reducer-driven path would make the ordering explicit; the current path hides it.

**Historical suggested fix (do not implement):** Introduce `ACTIONS.SET_PROGRESSION` with payload `{ progression, totalSteps, stepMap, measureMap, sectionMap }` (atomic — these five fields are derived together; any partial update would corrupt the scheduler). Add a case to `arrangerReducer`. Refactor `validateProgression` to compute and return the bundle rather than mutate. Refactor `updateProgressionCache` to be pure (return the cache fields). The three callers dispatch. Delete `PROG_VALIDATED` since the reducer write will trigger Preact via deepSignal naturally. Drop the `@direct-mutation` marker.

**Historical scope estimate:**
- 7 source files (`chords-engine`, `state/arranger`, `types`, `main`, `state-effects`, `arranger-controller`, `e2e-tools`).
- 1 unit test (`tests/unit/state-integrity.test.ts`) updates its notify-only catalog.
- **~30 test files** call `validateProgression(getState())` with no dispatch argument and rely on the direct mutation. The standards-compliance suite alone calls it 16 times (`tests/standards/standards-compliance.test.ts:132, 146, 370, 501, 556, 598, 663, 687, 704, 733, 773, 815, 870, 911, 960, 1014`). Each needs either dispatch wiring or a test-harness shim that internalizes dispatch on `validateProgression`'s behalf.
- Circular-import risk if `validateProgression` tries to import `dispatch` from `state.ts` directly (`state-effects.ts` already imports from `chords-engine.ts`).

The original audit estimated a multi-day refactor with non-trivial test surgery;
that estimate is historical context, not a current recommendation.

**Partial cleanup shipped (2026-05-16):** dropped a redundant unmarked `Object.assign(arranger, { progression: allChords })` on what was previously line 917 — it duplicated the mutation on line 916 without a marker. The later detached-clone analysis superseded the remaining violation classification.

## Shipped findings

### 2. Soloist picker `soloistState: any` test-only escape-hatch slot — SHIPPED Epic 11 S5 (`65faccd7`)

**Was:** `selectPitchAndDevices` took `soloistState: any`, and the `srdcState` top-level test-override slot it relied on was never declared on `SoloistState` — so a future maintainer tightening the signature would silently break the critique tests that use the override, with an opaque failure message.

**Resolved:** Epic 11 S5 item 11 took suggested-fix option (a): commit `65faccd7` declares `SrdcPhase` and an optional `srdcState?: SrdcPhase` slot on `SoloistState` in `public/types.ts` with `@test-only` JSDoc (`public/types.ts:727,776`). The picker's `soloistState: any` param was deliberately *kept* — it performs `@worker-mutation` writes against `readonly` fields that a strict `SoloistState` type would reject; that looseness is now a documented intentional choice rather than an undiscoverable accident. The discoverability gap — the actual finding — is closed.

## Historical methodology

Findings landed here when:
- A reviewer agent (state-discipline-reviewer, worker-contract-reviewer, etc.) surfaced a real violation.
- The reviewer had a concrete proposed fix whose scope was bigger than the diagnosis.
- The minimal surgical cleanup (if any) had shipped while the full refactor was queued.

This process is no longer active. File and shape current work in GitHub issues;
do not promote entries from this snapshot without re-verifying them against the
live code and canonical repository policy.

## Related

- `docs/audit/FOLLOWUPS.md` — historical musicality follow-ups snapshot (post-audit).
- `docs/guides/musical-engine-patterns.md` — engine-pattern recipes referenced by some findings here.
- `docs/archive/MUSICAL_AUDIT.md` — archived snapshot of the May 2026 musical audit.
- `CLAUDE.md` § Mandatory Checklist and § State — the current canonical policy.
- `.claude/agents/state-discipline-reviewer.md` — the agent that surfaces state-flow findings.
