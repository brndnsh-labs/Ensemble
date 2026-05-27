# Codebase hygiene audit (2026-05-26)

Persistent tracker for the post-shipped-audits hygiene sweep. Mirror of `/home/brandon/.claude/plans/let-s-build-a-detailed-enchanted-ripple.md`; this copy lives in-repo so the work survives session boundaries.

## Why this exists

The musical-audit, bundle-audit, synth-audit (Epic 6 outstanding), TS migration, and UI redesign have wrapped. With the big tracks done, ran a 7-lens parallel audit (TS+security, dead code, UI+a11y, state discipline, test debt, doc drift, performance) — 127 raw findings synthesized into batches grouped by file ownership for parallel fan-out.

Goals:
1. Close the **3 P0 correctness bugs** the audit surfaced.
2. Knock out the **mechanical batches** via parallel agent fan-out.
3. Park the **judgment-required batches** for daylight review.
4. Persist findings so the work survives session boundaries.

## Decisions reached 2026-05-26

| Question | Decision |
|---|---|
| P0 bugs (3) — fan out or hold? | **Fan out all 3** |
| `@direct-mutation` policy | **Do it right** — route through reducers where the site isn't truly real-time; expand CLAUDE.md sanctioned list to spell out which files keep the marker and why |
| Math.random multi-fixture sweep | **Default `[0.05, 0.5, 0.95]`** across all 14 sites; report failures |
| ManualModal `dangerouslySetInnerHTML` | **Keep lightweight** — no new deps; add evasion-vector test suite to lock current parser behavior |

---

## Status

### Tonight's fan-out (results)

| Batch | Scope | Status |
|---|---|---|
| 1 | Dead CSS sweep | ✅ shipped — commit `d6a9c68f` (679 lines deleted) |
| 2 | TypeScript hygiene | 🔁 deferred — sub-agent write failure, retry in future session |
| 3 | Doc & config drift | ✅ shipped — commit `6eaa05c4` |
| 4 | Visualizer frame allocations (perf) | ✅ shipped — commit `d1f4b48c` |
| 5 | Scheduler hot-path allocations (perf) | 🔁 deferred — sub-agent write failure, retry in future session |
| 6 | Test debt + 3 P0 bug fixes (Part 1) | ✅ shipped — commit `98588145` (P0 reducer arms, comping Scenario D, test hygiene, PRNG migration) |
| 6 | Math.random multi-fixture sweep (Part 2) | ✅ shipped — commit `d7f6717b` (sweeps + canonical seeded helper migration; no engine bugs surfaced) |

**Fan-out reliability note:** Batches 1, 2, 5, and parts of 6 were initially fanned out to background sub-agents and reported `completed` status with detailed code descriptions, but **the writes never reached disk** (confirmed via file modification timestamps). Working hypothesis: `run_in_background: true` plus the `npm run format` PostToolUse hook (Biome) is silently dropping certain Edit/Write calls in sub-agent context. Batches 3 and 4 succeeded — pattern correlates with file types touched, not with batch size or complexity. For future fan-outs: smoke-test ONE agent before fanning out (per the sonnet-no-write feedback memory), or run on the main thread when confidence in sub-agent writes is unproven.

### This week (small judgment calls)

| Batch | Scope | Status |
|---|---|---|
| 7 | Modal a11y + chord-card button | _pending_ |
| 8 | Inline styles → CSS classes; `class=` consistency | _pending_ |
| 9 | State-discipline cleanup + `@direct-mutation` migration | _pending_ |
| 10 | `playback.currentLoopCount` dual-write fix | _pending_ |

### Multi-session work (book separately)

- e2e `data-testid` migration (~119 sites)
- 5 tautological soloist style tests (`soloist-pitch-deep.test.ts:36-64`) — needs music-theory-reviewer
- Sub-baseline critique thresholds in jazz-soloist-authenticity + bass-chord-change-approach
- `dispatch(any, any)` → typed action map (large structural diff)
- ManualModal evasion-vector test suite

---

## Tonight's batches in detail

### Batch 1 — Dead CSS sweep
**Files:** `public/css/*.css` + dead-class drops in `public/components/ChartSurface.tsx`
- Delete `public/css/harmonizer.css` (138 lines, never imported)
- Delete `public/css/sequencer.css` (165 lines, never imported)
- Prune `.workspace-*` selectors (~62) from `studio.css`, `instrument-rail.css`, `chart-surface.css`
- Prune `.arrange-*` selectors (~33) from `modals.css`
- Prune dead `.lead-sheet-marker-*`, `.editor-*`, `.panel-*` selectors (verify each with fixed-string grep before deletion)
- Drop dead `chart-surface__*-btn` / `chart-surface__*-label` JSX classes (5 sites, no CSS)

Acceptance: styles.css manifest still parses; Playwright smoke (`tests/e2e/chart-surface.spec.ts`) green. Expected delta: ~300 lines CSS removed.

### Batch 2 — TypeScript hygiene
**Files:** types throughout `public/engine/`, `public/state/` (except `arranger.ts` — owned by Batch 6), `public/worker-client.ts`, `public/audio-export.ts`, `public/state-effects.ts`, `public/main.ts`, `public/e2e-tools.ts`, `public/state-hydration.ts`, `public/components/SurpriseMe.tsx`, `public/types.ts` (Window augmentation)

- Expand `CoordinationContext` to drop 17+ `(coordination as any)` casts in `tick-logic.ts`
- Type `TIME_SIGNATURES` properly (5 `as any` lookups)
- `instrumentStateMap: Record<string, any>` → discriminated union by module key
- `Record<string, any>` groove strategies → `GrooveStrategy` interface keyed by `GenreFeel`
- Replace 20+ `(e: any)` in `SurpriseMe.tsx` with typed event handlers
- Augment `Window` for `window.ensemble` (kills 6 `window as any`)
- `cloneStateForRender(liveState: any): any` → `(liveState: EnsembleState): EnsembleState`
- `state-effects.handleEffects` payload/context typing
- Reducer payload casts → existing `Mutable<T>` helper from `types.ts:1103`
- `(t: any)` toast filter → `(t: Toast)`
- Hydration clamp helpers `any` → `unknown`
- Remove `@ts-expect-error` at `Visualizer.tsx:294`

Out of scope: global `dispatch(action: any, payload?: any)` (parked).

Acceptance: `npm run typecheck` green; `any` count drops by ~50+; no behavioral test changes.

### Batch 3 — Doc & config drift
**Files:** `CLAUDE.md`, `AI_MAP.md`, `docs/README.md`, `docs/synth-audit/EPICS.md`
- CLAUDE.md:68 — rewrite state-slice list to match `EnsembleState` (`playback, arranger, groove, chords, bass, soloist, harmony, midi, vizState, conductor`)
- CLAUDE.md:121 — `enforceRegisterSlotting` is in `tick-logic.ts`, not `logic-worker.ts`
- CLAUDE.md — add `@direct-mutation` policy section: sanctioned in `scheduler-core.ts`, `synth-*.ts`; init-only exception in `engine.ts`; pre-mount-only exception in `state-hydration.ts`; everything else routes through reducers
- AI_MAP.md:39 — `state-effects.ts` exports `handleEffects`, not `subscribeToState`
- AI_MAP.md:30-40 vs 154-164 — collapse duplicate state-slice tables
- AI_MAP.md:184 — relocate `visualizer-engine.ts` row (it's worker-internal)
- AI_MAP.md:81 — `playNote` in `engine.ts` is a re-export
- docs/README.md:23 — FOLLOWUPS count says ~28; FOLLOWUPS.md says ~20; align after recount
- docs/synth-audit/EPICS.md:39 — header date `2026-05-21` → `2026-05-25`

Acceptance: `npm run lint:docs` green.

### Batch 4 — Visualizer frame allocations (perf, hot-path)
**Files:** `public/visualizer-engine.ts`, `public/visualizer-worker.ts`
- Hoist `overlayConfigs` array (lines 625-640) to module-level const
- Cache `getChordOverlayEntries` by `(laneName, chordEvent.index)`
- Skip render in `visualizer-worker.ts:28-40` when `!isPlayingLocal`

Acceptance: visualizer unit tests pass; manual smoke OK.

### Batch 5 — Scheduler hot-path allocations (perf, hot-path)
**Files:** `public/engine/scheduler-core.ts` only
- Strum-rank `new Map + sort` (lines 966-973) → scratch number-array sort
- Persistent cursor for `getChordAtStep` (line 552)
- Persistent cursor for `arranger.sectionMap.findIndex` (lines 577-579)
- Cache snare lane reference on `groove` state (kills per-measure `find` at line 1204)
- Cache `chordNotes` MIDI array per chord index (3 viz callsites: 739, 877, 908)
- Hot `.forEach` → indexed `for` in 5 instrument schedulers
- Hoist `const freqs = chord.freqs` in inner loops

Out of scope: bare `Math.random()` jitter at line 1235 (pending humanize-migrations).

Acceptance: `npm test` green; scheduler unit tests catch timing regressions.

### Batch 6 — Test debt + 3 P0 bug fixes
**Files:** `public/state/arranger.ts`, `tests/standards/*.test.ts`, `tests/unit/engine/*.test.ts`, `tests/e2e/arranger.spec.ts`

**P0 bugs (do first):**
- `arrangerReducer`: add `SET_SECTIONS` arm (`a.sections = action.payload; a.isDirty = true`) — currently `InlineEditor.tsx:81` dispatches it but no reducer handles it
- `arrangerReducer`: add `SET_IS_MINOR` arm (`a.isMinor = !!action.payload`) — currently `PresetLibrary.tsx:520` dispatches it but no reducer handles it
- Fix Scenario D in `tests/standards/comping-consistency.test.ts:147-178`: add bass-range guard assertion (currently zero `expect()` inside `if (notes.length > 0)`)

**Test hygiene (mechanical):**
- Delete redundant `waitForTimeout(150|250|150)` in `tests/e2e/arranger.spec.ts:265,269,277`
- Migrate inline PRNGs → `tests/utils/seeded-random.ts#makeMulberry32` in 3 sites: `blues-drummer-critique.test.ts:22-30`, `tom-vocabulary-critique.test.ts:43-48`, `soloist-chorus-evolution-rhythm.test.ts:91`
- Remove `_mockMath` leak in `rock-groove-integrity.test.ts:96`
- Wire dead aggregations in `rock-drummer-critique.test.ts:104-111` into real assertions
- Wire `_patternB` in `comping-consistency.test.ts:126` to assert pattern rotation

**Math.random multi-fixture sweep:** convert pinned `mockReturnValue(0.5)` → sweep `[0.05, 0.5, 0.95]` across:
- `tests/standards/final-bar-cadence.test.ts:736,756,777,805,827`
- `tests/standards/per-genre-final-bar-critique.test.ts:142-332` (9 sites)
- `tests/unit/engine/conductor.test.ts:288,317,355,370`
- `tests/unit/engine/soloist-v2-integrity.test.ts:30,84,129`

If any inequality fails at an extreme: stop and report (real bug, not test bug).

Out of scope (deferred): 5 tautological soloist style tests; sub-baseline thresholds.

Acceptance: all tests pass; `npm run test:e2e` green.

---

## This week's batches

### Batch 7 — Modal a11y
Modal `role="dialog"` + `aria-modal` + Esc + focus trap across Settings, ShareModal, ManualModal, VisualizerOverlay, StudioSurface. Extract `useModalA11y(ref, onClose)` hook. Backdrop unification. Convert `ChordVisualizer.tsx:81` chord card to `<button>`.

### Batch 8 — Inline styles + `class=` consistency
Static inline styles in Visualizer.tsx:383-386, KeySignatureControls.tsx:106-110, SectionCard.tsx:315. `className=` → `class=` sweep across 6 components.

### Batch 9 — State-discipline + `@direct-mutation` migration
Categorize the 10+ `@direct-mutation` sites:
- **Keep marker (real-time):** `scheduler-core.ts`, `synth-*.ts`, `chords-engine.ts:1019` (SET_PROGRESSION live-tick path)
- **Init-only sanctioned:** `engine.ts:initAudio`, `audio-recovery.ts`
- **Pre-mount sanctioned:** `state-hydration.ts`
- **Route through reducers:** `history.ts` (undo IS state replay), `audio-export.ts`, `main.ts`, `conductor.ts` non-tick paths

Then implement migrations: `Object.assign(arranger, …)` in chords-engine.ts:1035, 1127; section-field mutation in arranger-controller.ts:307-316; `setTimeout` out of `playbackReducer`; extract `regenerateSessionSeeds()` from state-effects.ts duplicate; atomic-action consolidations.

### Batch 10 — `playback.currentLoopCount` dual-write fix
Main thread writes (`scheduler-core.ts:325`) + worker writes (`tick-logic.ts:735`) independently; no sync. Pick single writer (main thread canonical), push to worker via `syncWorker` on increment.

---

## Sanity-clean signals (no findings)

- `npm audit --omit=dev` → 0 vulnerabilities
- `npx knip` → 0 unused files/exports/duplicates
- No `eval` / `new Function` / `document.write`; only one `dangerouslySetInnerHTML` (ManualModal, handled above)
- URL/share-state hydration robustly validated
- All 63 `ACTIONS.*` constants have ≥1 dispatch site
- All component files have ≥1 external importer

---

## Verification (per batch + final)

Per batch: agent reports diff + test results; spot-check diff against the batch's findings list; verify `npm run typecheck`, `npm test`, `npm run lint`, `npm run lint:docs` green on merged tree.

Reviewer chain on the merged diff: `state-discipline-reviewer` (Batches 5, 6), `music-theory-reviewer` (Batch 6 touches critique tests).

Commit per batch using Conventional Commit scopes:
- `refactor(css): drop orphaned and pre-redesign selectors`
- `refactor(types): collapse any-casts across engine + state`
- `docs: align CLAUDE.md and AI_MAP.md with current state`
- `perf(visualizer): hoist per-frame allocations`
- `perf(scheduler): persistent cursors + scratch buffers`
- `fix(arranger): add SET_SECTIONS + SET_IS_MINOR reducer arms; test sweep`

Manual smoke: `npm run dev`, open `http://localhost:5173`, play through chord chart, change keys, toggle visualizer overlay, clear chart, load minor preset (verify P0 fixes), then `npm run test:e2e`.

Mark batches complete in this file as each lands.
