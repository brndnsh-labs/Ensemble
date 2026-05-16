# CLAUDE.md

Operational guide for AI agents working in the Ensemble codebase. Claude Code auto-loads this file. `AGENTS.md` is a pointer to here for tools that look for it instead.

## Primary References

- **CLAUDE.md** (this file) — operational rules and architectural overview.
- **AI_MAP.md** — file-by-file navigation index. Every path in it must exist on disk (enforced by `npm run lint:docs`).
- **docs/README.md** — living documentation index.
- **docs/VISION.md** — product direction and open work.
- **docs/ARCHITECTURE_FOLLOWUPS.md** — known architectural debt and improvement opportunities.
- **docs/guides/** — deep-dive guides (worker contract, register slotting, performance, reference tuning).

If any guide drifts from live code/config, prefer live and update the docs.

## Mandatory Checklist (before any change)

1. **State writes** flow through `dispatch(ACTIONS.TYPE, payload)`. Never mutate state objects directly outside reducers (exception: `// @direct-mutation` in performance-critical engine code).
2. **UI updates** belong in `public/components/`. Use Preact functional components and `useEnsembleState()` for reactivity.
3. **Tests:** `npm test` (unit/integration) AND `npm run test:e2e` (Playwright) before concluding.
4. **Refactors:** grep the whole repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for usages before renaming or moving anything. Update all imports in the same pass.
5. **Typecheck** is green at the end of every task (`npm run typecheck`).

## Strictly npm-based

`npm install`, `npm run <script>`. Never use `pnpm`, `yarn`, or `bun`. Never create non-`package-lock.json` lockfiles.

## Commands

```bash
npm run dev          # build dist/ and serve on http://localhost:5173 (not hot-reload)
npm run build        # dry-run production bundle into dist/
npm run lint         # Biome lint + format check
npm run format       # Biome write fixes
npm run lint:docs    # repo-specific docs validation
npm run typecheck    # tsc over public/**/*.{ts,tsx}
npm test             # mutation check + Biome + docs lint + Vitest
npm run test:e2e     # build dist/ and run Playwright
npm run validate     # typecheck + knip + jscpd + format + npm test
```

Targeted tests:

```bash
npm test -- visualizer                              # Vitest filename/name filter
npm test -- standards/                              # critique-only Vitest files
npx vitest run tests/standards/funk-bass-critique.test.ts
npx vitest run tests/unit/engine/worker-client.test.ts -t "specific test name"

npx playwright test tests/e2e/chart-surface.spec.ts
npx playwright test tests/e2e/arranger-mobile.spec.ts --project="Mobile Chrome"
npx playwright test -g "@ipad" --project="Mobile Safari"
npx playwright test -g "@mobile"
```

Local-dev note: `npm run dev` is **not** Vite HMR. It rebuilds `dist/` and serves it on port 5173; browser checks reflect the current build.

## Architecture

Ensemble is a browser-based "virtual band" PWA: a Preact UI, deep-signal state slices, a real-time logic worker for generative note creation, and a separate OffscreenCanvas worker for visuals.

### Bootstrap (`public/main.ts`)

Orchestration entrypoint. Hydrates persisted/URL state **before** mounting the Preact tree, then initializes the logic worker and subscribes state changes so `syncWorker()` and `handleEffects()` run on every dispatch. Hydration-before-mount order is intentional.

### State (`public/state/`, `public/ui-bridge.ts`, `public/state-effects.ts`)

- Domain slices: `playback`, `arranger`, `groove`, `instruments`, `midi`, `ui`, `visualizer`, `conductor` — each a `deepSignal`.
- **All writes go through `dispatch(ACTIONS.TYPE, payload)`.** Never mutate state directly in components or controllers.
- `useEnsembleState()` in `public/ui-bridge.ts` — reading a property inside the selector establishes reactivity.
- `public/state-effects.ts` owns cross-module side effects kept deliberately outside reducers.
- **`@direct-mutation` exception:** allowed only in performance-critical engine code (`scheduler-core.ts`, `synth-*.ts`) for real-time audio parameters. Must be marked with `// @direct-mutation`.

### Generative Engine Pipeline (worker thread)

- `public/worker-client.ts` — main-thread bridge; sends full snapshots (`getSyncState()`) or deltas (`syncWorker()`).
- `public/logic-worker.ts` — orchestrates note generation, buffer fills, resolution handling, MIDI export.
- `public/engine/scheduler-core.ts` — real-time scheduler consuming worker buffers; timing is based on `playback.audio.currentTime`, not UI clocks.
- Musical engines: `soloist.ts`, `bass-engine.ts`, `accompaniment.ts`, `chords-engine.ts`, `harmonies.ts`, `grooves/` (15+ genre strategies).

### Visualizer Pipeline (separate OffscreenCanvas worker)

- `public/visualizer-proxy.ts` — main-thread wrapper.
- `public/visualizer-worker.ts` — `VisualizerEngine` with `OffscreenCanvas`.
- Clock sync is message-based; the worker interpolates time locally.

### UI (`public/components/`, `public/App.tsx`)

Single chart-first surface (`ChartSurface`): the chord chart is always visible, with transport and key/time controls in a topbar, the instrument rail always accessible along one edge, and a 🌈 button that opens a full-screen visualizer overlay. There are no workspace tabs. New UI work should follow this model — controls radiate outward from the chart rather than living in separate navigable views.

### Data / Config split

- UI metadata (menus, categories): `public/data/instrument-styles.ts`
- Generative behavior: `public/engine/bass-styles.ts`, `public/engine/chords-styles.ts`, `public/engine/grooves/`
- `public/styles.css` is an import manifest only — put feature CSS in `public/css/`.

## Musical Logic & Generative Standards

### Musical intent

In generative logic, always document **why** a probability or offset exists (e.g. `// 15% ghost note on step 14 for jazz feel`). Musical intent is part of the implementation, not disposable tuning noise. When musical correctness and programmer convenience conflict, favor musicality.

### Deterministic phrasing

Prefer **deterministic, seeded motif generation** (`barIndex`, `sectionId`) over raw `Math.random()`. Keeps critique tests and looped playback coherent. Reference: `getDrumMotif` in `groove-engine.ts`.

### Dynamic Head / Chorus Evolution (Soloist)

The soloist generates a session-wide `sessionSeed` (SRDC structure: Statement, Restatement, Departure, Conclusion) at playback start. Loop behavior:

- **Loop 0 (The Head):** strict Head adherence, `survivalProb = 1.0`, Imperfect Symmetry (30% motivic drift in cloned measures to avoid mechanical looping).
- **Loop 1 (Conversational):** Themed Improv — pitch jitter, Gap-Fill (generative notes between theme hits), Sequencing (transposed motifs); effective intensity +0.05.
- **Loop 2+ (Exploratory):** Progressive Ornamentation (+20%/loop), Fatigue Decay (shorter rests), Common Tone Reward (pedal-point bias across chord changes).

### Coordination & Register Slotting

Source of truth: `public/engine/coordination-engine.ts`. Always pass `CoordinationContext` to instrument generators. `logic-worker.ts` enforces ranges via `enforceRegisterSlotting`:

- **Bass:** 23–57
- **Chords/Harmony:** 52–84
- **Soloist:** priority 60–90 (only clamp when a note would fall below MIDI 52)

### Naming / Canonicalization

- One canonical internal name per concept. UI labels can be friendlier, but state keys, config keys, persisted payloads, and code paths normalize to the canonical form.
- Aliases live near the data/config that owns the concept — don't scatter alias checks across components, tests, docs, and controllers.
- Before any rename: grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
- Preserve compatibility shims when a rename touches saved sessions, share URLs, or presets.
- Split labels from logic: display labels in UI/data layer, behavior keys in engine/config layer. A pretty label should not silently become a runtime enum unless that is the intended canonical key.
- Known alias families: `Rock`/`Shred`, `Neo-Soul`/`Neo`. Add new aliases to the same map instead of creating one-off fixes.

### TypeScript

All `public/` source is `.ts`/`.tsx` (migration complete May 2026). `tsconfig.json` has `strict: true` and `moduleResolution: "Bundler"` — import specifiers can keep `.js`/`.jsx` suffixes; the resolver finds the `.ts`/`.tsx` source. Use global interfaces in `public/types.ts` (`EnsembleState`, `StepInfo`, etc.). Run `npm run typecheck` before concluding any task.

## Testing Standards

### Critique tests (`tests/standards/`)

The **Definition of Done** for musicality. When you modify a musical engine (bass, drums, soloist, etc.), you **must** run the corresponding critique test (e.g. `npx vitest run tests/standards/funk-bass-critique.test.ts`). They use statistical ranges — never replace with rigid binary snapshots. Check the "Critique Report" output for balance.

### Vitest (logic / unit / integration)

`describe`, `it`, `expect` are global. Use `vi.mock()` to isolate dependencies (especially global state or browser APIs). If you intentionally change musical behavior, update test expectations — do not leave tests failing.

### Playwright (e2e)

Functional smoke tests only — no pixel snapshots. Three projects: **Desktop Chrome**, **Mobile Chrome** (`@mobile`, 390×844), **Mobile Safari** (`@ipad`). Use `@mobile`/`@ipad` tags to scope tests. `data-e2e-mode="true"` is injected to disable heavy animations. Prefer `data-testid="unique-id"` selectors over volatile CSS classes.

### Biome

4-space indent, single quotes, 100-char line width. Run `npm run format` before finishing.

## Commit & PR Conventions

Conventional Commit style, scoped where useful: `feat(soloist): ...`, `fix(ts): ...`, `chore(deps): ...`, `refactor(mobile): ...`. Keep commits focused. PRs should include a short summary, test commands run, linked issues if applicable, and screenshots/recordings for UI changes.

## Self-Building Manual

`public/MANUAL.md` combines hand-written guides with auto-generated tables. Placeholders like `{{GENRE_TABLE}}` and `{{BASS_STYLES}}` are populated by `manual-metadata.ts` — adding a new style to config files updates these automatically. If you add a major new feature, add a "Recipe" or "Pro-Tip" to the Markdown guide. Maintain the "Style Gallery" deep links for new signature genres.

## Misc Conventions

- When adding worker-relevant state, update both `getSyncState()` / `syncWorker()` on the main thread and the worker's sync handling.
- For transport/audio behavior, reuse existing controller entrypoints (`togglePlay`, `setBpm`, `loadDrumPreset`) instead of creating parallel side-effect paths.
- Inline styles only for runtime-calculated values (widths, dynamic grid templates, transition names); static presentation belongs in semantic CSS classes.
- Atomic state changes: batch related updates in a single `dispatch` where possible.
- Semantic prop names: name props after their domain (`isTransportVisible`) rather than visual state (`isBlue`).
- Fail fast in workers: validate payload shapes immediately when sending data to `logic-worker.ts`.

## Active Product Direction

See `docs/VISION.md` for current priorities and open work; `docs/ARCHITECTURE_FOLLOWUPS.md` for known architectural debt.
