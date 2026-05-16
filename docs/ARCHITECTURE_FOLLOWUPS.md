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

**Polish pass (May 15 2026, post-Phase B):** added `tsx` as a devDep and switched `drums:report`, `ensemble:report`, `mix:report` invocations from `node` → `tsx` (commit follows). All 4 CLI scripts now load and run; `drums:report`, `ensemble:report`, and `audit-standards` produce real output end-to-end. `mix:report` now starts up cleanly (added `addInitScript` shim for esbuild's `__name` helper since tsx hardcodes `keepNames: true`) but hits a separate downstream Playwright lifecycle issue (`Target page, context or browser has been closed`) that's unrelated to TS conversion — own followup.

Also surfaced and **deferred**: the Playwright e2e suite has 38 pre-existing failures (e.g., `header.spec.ts` expects a `<header><h1>` markup the legacy shell rendered; the UI redesign at commit `3c5527ee` made `ChartSurface` the only surface and dropped that markup). The e2e specs were never updated. This is independent of TS conversion — verified by running `header.spec.ts` against `ff52a9e9` directly. Roughly all `tests/e2e/` failures stem from the same root cause: tests targeting legacy markup. Worth a sweep before adding new e2e coverage.

---

## 4. Soloist subsystem refactor — typed `SoloistSession`

**Why fourth:** Most complex item on the list. Benefits from cleaner `Chord` types (#2) being in place; doesn't block anything below it.

~7,000 lines across 7 files (`soloist`, `soloist-config`, `soloist-devices`, `soloist-pitch-engine`, `soloist-rhythm-engine`, `soloist-seeder`, `synth-soloist`). Session-state objects are described as "sprawling" — there's a real domain model (SRDC structure, Dynamic Head, intent layers, register profiles) expressed via dynamically-grown plain objects. A typed `SoloistSession` with explicit phases would unlock simplifications throughout.

**Approach:** Opus, end-to-end. **Do not delegate mechanically.** This is exactly the kind of work where domain understanding has to live in the same context as the refactor — 7,000 lines of musical state with subtle semantics. Once `SoloistSession` is defined and the seams are clear, specific extractions can fan out to Sonnet, but the bulk should stay with the model that designed the shape.

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

## 7. `@direct-mutation` tightening

**Why seventh:** Low-stakes hardening. The current discipline is documented via comments; this enforces it at the type level.

25+ direct mutations in `scheduler-core` alone. The "all writes go through dispatch" rule has a big asterisk, and `check-mutations.js` now only scans `components/*.tsx` after the TS migration. Two ways forward: lean in (mark state slices `readonly` except where `@direct-mutation` annotates, enforced via `tsc`), or refactor the hottest paths to a typed mutation API.

**Approach:** Opus picks the strategy — readonly types is the smaller, safer diff. Sonnet applies the chosen approach across state slices and engine files in parallel.

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
