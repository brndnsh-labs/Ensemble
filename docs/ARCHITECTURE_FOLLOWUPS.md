# Architecture Follow-Ups

Observations gathered during the TypeScript migration (May 2026). Not emergencies — the codebase is in good shape — but each represents a meaningful improvement worth pursuing.

Items are listed in **suggested execution order**. Earlier items unblock or simplify later ones. Each entry ends with a recommended model/subagent strategy.

## How to use this doc

The Phase 8 TS migration validated a strong working pattern: **Opus plans and reviews, Sonnet subagents execute mechanical work in parallel, the main thread handles validation and shared-file updates.** Most items below benefit from the same split.

- **Opus** — design decisions, cross-file architectural reasoning, defining type shapes, post-batch review.
- **Sonnet subagents** (4–6 in parallel) — applying an established pattern across many files, mechanical refactors, file-level conversions.
- **Haiku** — trivial config tweaks, one-liners.
- **Main thread** (whatever model is driving) — `npm run typecheck` between batches, shared-doc updates (AI_MAP.md, this file), commits.

Fast mode (Opus 4.6) is a good choice for the design/iteration phases when turnaround matters more than depth.

### Tracking completed items

When an item ships, **update its heading in the same commit that completes it**, using one of these markers:

- `## N. Title ✅ DONE (Month YYYY)` — fully complete; replace the body with a 1–2 sentence summary, the commit SHA, and any deferred sub-pieces.
- `## N. Title 🟡 PARTIAL (Month YYYY)` — main intent done but meaningful follow-up remains; keep the original body and add a "**Done so far:**" / "**Still open:**" pair.
- `## N. Title ⏸ DEFERRED (Month YYYY)` — explicitly de-prioritized; note the reason and what would change to revive it.

The convention is for the *author of the work* to mark it. If you find an item that's already been done in code but not marked here (look at git log for `Items #N` or feature commits that touch the item's files), update the heading and link the commit — even if you didn't do the work. Items #1–3 were retroactively marked this way.

---

## 1. Break the worst circular dependency: `state` ↔ `scheduler-core` ✅ DONE (May 2026)

Done in commit `522aaa82`. `form-analysis.ts` no longer imports `state.ts` (only the `ArrangerState` type). `analyzeForm` takes the arranger as a parameter; the four callers (main, arranger-controller, conductor, midi-worker-logic) pass it from their existing state references. The named cycle `conductor → form-analysis → state → scheduler-core → conductor` is gone. Depcheck warning count dropped from 20 → 19; #10 later dropped it again from 19 → 9 by moving the engine-loading edges out of `state.ts`. **Open follow-up:** sweep the remaining 9 cycles when there's appetite — they're all the same shape (`state/<slice>.ts → types.ts → state/<slice>.ts`), so likely solvable by moving one symbol out of `types.ts` into a slice-owned file.

---

## 2. Canonical `Chord` type ✅ DONE (May 2026)

Done in commit `522aaa82`. `ParsedChord` (formerly local to `chords-engine`) was promoted to `Chord` in `types.ts` as the canonical parsed-chord type. `arranger.progression` is `Chord[]` and `stepMap[].chord` is `Chord` (both were `object`). `getChordAtStep` returns the new `ChordAtStep`. Six engines (accompaniment, bass-engine, harmonies, soloist, tick-logic, scheduler-core, midi-worker-logic) now type their chord parameters as `Chord` and have had their chord-related `as any` casts removed. Drive-by fix: `form-analysis.ts` was reading a `chord.value` field the parser never sets (now reads `chord.absName`).

---

## 3. Tests → TypeScript ✅ DONE (May 2026)

Completed in two phases. Phase A (commit `299f7a4d`) converted ~220 unit/integration/standards/ui test files. Phase B (May 15 2026) finished the remaining `tests/bench/` (Vitest benchmarks), `tests/e2e/` (Playwright specs), `scripts/` (Node CLI tools), and root configs (`vitest.config.ts`, `vitest.bench.config.ts`, `playwright.config.ts`). The repo is now zero-`.js` outside the single `.dependency-cruiser.cjs` config. Pattern validated: parallel Sonnet subagents grouped by directory, `@ts-nocheck` liberally applied to mock-heavy files, main thread reconciles configs.

**Polish pass (May 15 2026, post-Phase B):** added `tsx` as a devDep and switched `drums:report`, `ensemble:report`, `mix:report` invocations from `node` → `tsx` (commit follows). All 4 CLI scripts now load and run; `drums:report`, `ensemble:report`, and `audit-standards` produce real output end-to-end. `mix:report` initially hit a downstream Playwright lifecycle issue (`Target page, context or browser has been closed`) after the `addInitScript` shim for esbuild's `__name` helper. **Resolved May 16 2026:** verified end-to-end after #10's `loadTools()` extraction (which removed the `await ensemble.loadTools()` call in `mix-report.ts` that was racing with the page lifecycle). All 4 scenes (rock-backbeat, blues-shuffle, jazz-ride, funk-pocket) now produce stem-level analysis tables with `EXIT: 0`.

Also surfaced and **deferred**: the Playwright e2e suite had 38 pre-existing failures (e.g., `header.spec.ts` expected a `<header><h1>` markup the legacy shell rendered; the UI redesign at commit `3c5527ee` made `ChartSurface` the only surface and dropped that markup). **Resolved May 16 2026:** five parallel Sonnet subagents repaired the affected spec files (`arranger.spec.ts`, `arranger-mobile.spec.ts`, `header.spec.ts`, `modals.spec.ts`, `instrument-settings.spec.ts`). Tests that targeted the new ChartSurface idioms were rewritten with `.chart-surface__topbar` selectors, `getByRole('button')` patterns, and overflow-panel flows for mobile. Tests asserting on removed surfaces were deleted. Final suite: **44/44 pass** across Desktop Chrome / Mobile Chrome / Mobile Safari.

**Still open:** `instrument-settings.spec.ts` has a documented TODO block describing 8 replacement tests needed against the new `InstrumentRail` / `mobile-mix-sheet` architecture — its existing tests were all written against the eliminated `StudioWorkspace` surface and were scrapped. Future work to write the replacements is its own item.

---

## 4. Soloist subsystem refactor — typed `SoloistSession` ✅ DONE (May 2026)

`SoloistState` was restructured into a hybrid shape — config fields stay flat at the top (preserving persistence, UI, share-URL, and the worker-sync wire contract); per-playback engine runtime moves under `session: SoloistSession` with sub-objects `phrasing` / `currentPhrase` / `memory` / `rhythm` / `contour`; main-thread synth state moves under `audio: SoloistAudio`. Concrete types were introduced for the previously-`any` domain (SeedNote, MotifSignature, MotifSignatureNote, RhythmNode, SoloistDeviceEvent, RecentSoloistNote, SoloistVoice, SectionRecallEntry, FormArcEntry/Occurrence, SoloistHook). Shipped across four commits: `ca1cd8c6` + `ffbac6da` (C1 types + review fixes), `43a1fe12` (C2/C3/C4 merged — shape + 100+ engine mutation sites + 25+ external readers + reducer routing + worker translator + 139 test files via new `tests/utils/mock-soloist.ts` helper), and `94238f4f` (C5 cleanup: simplified `resetSoloistState`, hoisted casts in `getSoloistNote`).

The planned 5-commit split collapsed to 4 once it became clear the engine and external-reader sweeps couldn't be staged independently — 25+ external files (scheduler-core, accompaniment, bass-engine, harmonies, etc.) directly read soloist runtime fields, so a typecheck-clean intermediate commit wasn't achievable without duplicate flat+nested fields. The merged commit was reviewer-vetted by an independent Opus agent before landing.

**Drive-by:** caught a misnamed type — `phraseContext.skeleton` is `number[]` (step offsets), not `SeedNote[]`.

**Deferred sub-pieces:**
- `motifCache` (`SoloistMemory.motifCache: unknown`) and `lickDictionary` (`SoloistMemory.lickDictionary: unknown[]`) — both fields exist in the slice but their producer pipelines aren't currently wired in code. Marked `TODO(soloist-session)` in `types.ts`; type them concretely (`MotifEntry | null` and `SoloistLick[]`) when those pipelines land.
- Worker-side soloist state mirror stays flat — `logic-worker.ts` has a `syncSoloistFromWire()` translator that lifts the flat wire payload into a nested local. A follow-up could mirror the C2 restructure inside the worker and drop the translator.
- `ActionPayloadUpdateSB` type is hand-enumerated; could in principle derive from `SOLOIST_FIELD_ROUTES` via `keyof typeof`, but deriving loses per-field value types — judged not worth the complexity loss.

---

## 5. Build pipeline rewrite — migrate to Vite ✅ DONE (May 2026)

Replaced the bash + esbuild + sed pipeline with `vite.config.ts`. `npm run dev` is now a real Vite dev server with HMR on port 5173 (no more rebuild-and-serve loop). `npm run build` calls `vite build --mode test`; `deploy-test.sh` / `deploy-prod.sh` shrunk to ~15-line wrappers around `vite build` + `rsync`. Worker bootstrap (`worker-client.ts`, `visualizer-proxy.ts`) uses `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`; the `WORKER_PATH` / `VIZ_WORKER_PATH` `--define` injections are gone. Service worker rewritten with `vite-plugin-pwa` in `injectManifest` mode — Workbox now generates the precache list at build time from `__WB_MANIFEST`, replacing the brittle `sed`-replaced `'ASSETS_PLACEHOLDER'` string. Per-env cache prefix (`ensemble-test-*` vs `ensemble-*`) preserved via `workbox-core`'s `setCacheNameDetails` driven by `import.meta.env.MODE`.

One quirk worth noting: a small inline `copyStaticAssets` plugin in `vite.config.ts` copies `manifest.json`, `icon-*.png`, `icon.svg`, and `MANUAL.md` to `dist/` verbatim, then rewrites the hashed manifest/icon hrefs Vite emits in `index.html` back to the unhashed paths. This is needed because the PWA manifest references icons by their bare filenames; if Vite hashed them, the lookups would 404.

**Cosmetic follow-up resolved:** entry filename is `index.<rev>.js` (Vite uses the HTML basename) instead of legacy `main.<rev>.js`. Verified by grep — no code, scripts, configs, or docs in the repo reference the old name. Any external monitoring that watches log streams for `main-*.js` URLs would still need updating, but that's outside the repo's purview.

---

## 6. Discriminated `dispatch` action types ✅ DONE (May 2026)

A new discriminated union `Action` (mapped over `ActionPayloadMap`) was added to `types.ts`. `dispatch` in `state.ts` bundles `{ type, payload }` into an `Action` and passes a single arg to each reducer. All 7 per-slice reducers (`playback`, `instruments`, `groove`, `arranger`, `conductor`, `midi`, `visualizer`) were retyped from `(action: string, payload?: any)` to `(action: Action)` (`grooveReducer` preserves its 3rd `playback: GlobalContext` arg). Inside each switch, `case ACTIONS.FOO:` now narrows `action.payload` automatically.

Also consolidated: the 14 loose `dispatch('STRING_LITERAL')` call sites scattered across components, state-effects, state-hydration, instrument-controller, scheduler-core, and chords-engine now use `ACTIONS.X` — and `ACTIONS` gained explicit entries for the 12 notification-only signal keys (`HYDRATE`, `TOAST_EXPIRED`, `FLASH_EXPIRED`, `KEY_CHANGE`, `TIME_SIG_CHANGE`, `GROUPING_CHANGE`, `REL_KEY_TOGGLE`, `TRANSPOSE`, `VIS_RESET`, `VIS_UPDATE`, `PROG_VALIDATED`, `DRUM_PRESET_LOADED`) that already lived in `ActionPayloadMap`. The `state-integrity` audit was updated to recognize these as listener-observed (no reducer case expected).

A few reducers needed minimal `as any` casts where the new strict payload types collided with `Object.entries`/`for-in` write paths in the `UPDATE_*` and `SET_PARAM` cases — those are localized and consistent with similar casts already present on the write side.

**Future #6.1 (deferred):** Per-slice exhaustiveness — split `Action` into per-slice unions (e.g., `PlaybackAction`) and route `dispatch` by ownership so each reducer must handle every action it owns. Would require a centralized slice-ownership map and a non-broadcast dispatch shape. Strictly bigger surgery than the type narrowing this item delivered; valuable if future regressions show missing-case bugs.

---

## 7. `@direct-mutation` tightening ✅ DONE (May 2026)

Closed in two commits.

**Phase 1** (commit `c0854a52`) expanded the textual `check-mutations` script: glob now covers `public/**/*.{ts,tsx}` instead of only `components/*.tsx`, and the regex catches one level of nested writes (`slice.x.y =`). The script also accepts annotations on the line above the assignment (formatter-friendly). 11 newly-surfaced sites were annotated (Web Audio param writes in engine init, `playback.intent.*` in accompaniment, `soloist.phraseContext.skeleton`). Engine-code mutation discipline is now CI-enforced, not convention-only.

**Phase 2** marked the top-level fields of all 10 state-slice interfaces (`GlobalContext`, `GrooveState`, `ChordState`, `BassState`, `SoloistState`, `HarmonyState`, `MidiState`, `VisualizerState`, `ConductorState`, `ArrangerState`) as `readonly` and added a `Mutable<T>` helper in `types.ts`. Reducers use a function-top alias (`const p = playback as Mutable<typeof playback>;`) for static writes; `@direct-mutation` / `@worker-mutation` sites in engine code use inline casts (`(slice as Mutable<typeof slice>).field = value`). Nested types (`PlaybackIntent`, `ModalsState`, `PocketState`, `SoloistPhraseContext`) were left mutable — nested writes work without casts and are still gated by the textual check.

Surprises surfaced and resolved during reconciliation:

- The pre-existing `check-mutations` regex was missing `arranger` and `conductor` slices entirely. 12 previously-invisible direct writes (5 in `state-hydration.ts`, 4 in `KeySignatureControls.tsx`, 1 each in `history.ts`, `chords-engine.ts`, `EditorModal.tsx`) were annotated `@direct-mutation` + cast. The regex was extended to include both slices.
- The cast pattern defeats tsc's narrowing — `(playback as Mutable<typeof playback>).masterGain = x` no longer narrows `playback.masterGain` from `GainNode | null` to `GainNode` on subsequent lines. Resolved in `engine.ts` by hoisting newly-created audio nodes to local variables (`const masterGain = playback.audio.createGain(); (playback as Mutable<typeof playback>).masterGain = masterGain; masterGain.gain.setValueAtTime(...);`).

Pattern validated by the Phase 8 TS migration held up well: Opus designed the cast template + proved it end-to-end on the smallest slice (`VisualizerState`), then 5 parallel Sonnet subagents (A=types.ts, B/C=reducers, D/E=engine files) executed mechanical casts. A second cleanup round (F/G/H) caught files missed by the initial survey (`soloist.ts` alone needed 93 casts; `midi-worker-logic.ts`, `tick-logic.ts`, `bass-engine.ts`, `harmonies.ts`, `instrument-controller.ts` all needed mop-up).

**Open follow-up (#7.1, low priority):** UI components in `KeySignatureControls.tsx` and `EditorModal.tsx` write to `arranger.*` directly then dispatch a notification action (`KEY_CHANGE`, `TIME_SIG_CHANGE`). These are now annotated `@direct-mutation` to preserve current behavior, but the cleaner architecture is to extend `arrangerReducer` so the state write happens inside the dispatch. ~5 call sites; small surgery; defer until the next time something in that flow needs work.

---

## 8. Web Audio types reference ✅ DONE (May 2026)

`tsconfig.json` now declares `"lib": ["ES2022", "DOM", "DOM.Iterable"]` explicitly instead of relying on the implicit default for `target: ES2022`. Web Audio types (`AudioContext`, `GainNode`, `BiquadFilterNode`, etc.) live in the DOM lib and are now visibly part of the project's type surface. Workers keep their per-file `/// <reference lib="webworker" />` comments; scripts and tests inherit the DOM lib via the root tsconfig (they import from DOM-typed `public/` modules).

---

## 9. Coverage scope sanity-check ✅ DONE (May 2026)

`vitest.config.ts` now has `coverage.include: ['public/**/*.{ts,tsx}']` (TS-only glob) with appropriate excludes for `components/**`, `data/**`, `sw.ts`, `main.ts`, `ui-root.tsx`, `App.tsx`. The original `.js`-only glob that produced empty reports is gone.

**Follow-up resolved:** running `npx vitest run --coverage` initially failed because v8 instrumentation roughly quadruples runtime and two slow integration specs (`soloist-triplet-support`, `soloist-motivic-response`) had hard 15s/25s per-test timeouts. Bumped those to 30s/45s respectively and added a project-wide `testTimeout: 30000` in `vitest.config.ts` so future slow specs don't trip the default 5s limit. The HTML report at `coverage/index.html` now generates cleanly. Final numbers: 88.64% statements, 89.76% functions, 81.63% branches.

---

## 10. Restructure `state.ts` `loadTools()` to kill remaining ineffective dynamic imports ✅ DONE (May 2026)

`loadTools()` moved out of `state.ts` into a new top-of-graph file `public/e2e-tools.ts` that statically imports `validateProgression`, `scheduleGlobalEvent`, `initAudio`, `loadDrumPreset`, `generateNotesForStep`, plus `dispatch`/`getState`/`ACTIONS`, and exports a single `installE2EGlobals()` function called once from `main.ts` at boot. The lazy `Promise`-gated tool-loader is gone; globals attach eagerly. The two callers (`tests/e2e/arranger-mobile.spec.ts`, `scripts/mix-report.ts`) had their `await window.ensemble.loadTools()` calls removed.

Results: zero `INEFFECTIVE_DYNAMIC_IMPORT` warnings on `vite build` (was 3); depcruise cycle count dropped from 19 → 9 (target was ~14 — better than expected because the 5 dynamic edges were each participating in multiple cycle chains). `state.ts` no longer imports any engine module.

---

## Notes

None of these are emergencies. The codebase has strong test coverage, real critique tests for musicality, clean state architecture, an intentional worker split, and now a completed TS migration. The biggest single-investment payback is #2 (Chord type) — it ripples out across every engine and pays back across every downstream module.
