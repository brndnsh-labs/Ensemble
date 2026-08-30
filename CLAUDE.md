# CLAUDE.md

Operational guide for AI agents working in the Ensemble codebase. Claude Code auto-loads this file. `AGENTS.md` is a pointer to here for tools that look for it instead.

## Primary References

- **CLAUDE.md** (this file) — operational rules and architectural overview.
- **.claude/skills/DOCTRINE.md** — the work-pipeline doctrine (§1–§9): the GitHub-backed tracker, autonomy/merge rules, gates, commit/branch conventions. The work-loop skills (`/next`, `/cycle`, `/implement`, `/review`, `/patch`, `/done`, `/intake`, `/unblock`, `/scout`, `/burndown`, `/nightly`, `/wrap-up`) reference it by section.
- **AI_MAP.md** — file-by-file navigation index. Every path in it must exist on disk (enforced by `npm run lint:docs`).
- **docs/README.md** — living documentation index.
- **docs/VISION.md** — product direction and open work.
- **docs/archive/ARCHITECTURE_FOLLOWUPS.md** — archived (May 2026): the TS-migration follow-up tracker, all items shipped. Useful historical context for *why* recent architectural decisions were made.
- **docs/guides/** — deep-dive guides (worker contract, coordination & register slotting, performance, reference tuning, musical-engine patterns, bundle hygiene, listening-gate tools).

If any guide drifts from live code/config, prefer live and update the docs.

## Mandatory Checklist (before any change)

1. **State writes** flow through `dispatch(ACTIONS.TYPE, payload)`. Never mutate state objects directly outside reducers (exception: `// @direct-mutation` in performance-critical engine code). A `document`/`preferences`-owned field (`public/songbook/state-ownership.ts`) is written **only** by user intent — a UI dispatch or hydration; a runtime system's modulation of it lives in a paired `runtime-derived` sibling field, composed at read time — see `docs/design/write-ownership.md`.
2. **UI updates** belong in `public/components/`. Use Preact functional components and `useEnsembleState()` for reactivity.
3. **Tests:** `npm test` (unit/integration) AND `npm run test:e2e` (Playwright) before concluding.
4. **Refactors:** grep the whole repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for usages before renaming or moving anything. Update all imports in the same pass.
5. **Typecheck** is green at the end of every task (`npm run typecheck`).

## Strictly npm-based

`npm install`, `npm run <script>`. Never use `pnpm`, `yarn`, or `bun`. Never create non-`package-lock.json` lockfiles.

## Commands

```bash
npm run dev          # Vite dev server on http://localhost:5173 with HMR
npm run build        # production bundle into dist/ via Vite (mode=test)
npm run lint         # Biome lint + format check
npm run format       # Biome write fixes
npm run lint:docs    # repo-specific docs validation
npm run typecheck    # tsc over public/**/*.{ts,tsx}
npm test             # mutation check + Biome + docs lint + Vitest (node/happy-dom)
npm run test:browser # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
npm run test:e2e     # run Playwright against a `vite preview` build of the shipped bundle
npm run validate     # typecheck + knip + jscpd + format + npm test
npm run depcheck     # circular-import gate (Biome noImportCycles) — RUNTIME cycles only
```

`npm run depcheck` is the circular-import gate (`biome lint --only=suspicious/noImportCycles`). It catches **runtime cycles only** — `import type` edges are invisible to it, and that is a deliberate 2026-07-24 call (#1234), not an oversight. A type-only cycle erases at compile time and cannot cause the load-order bug this gate exists to prevent. (Verified by mutation test in #1191: a planted runtime cycle exits 1 with 3 diagnostics; a planted type-only cycle exits 0, uncaught.) Biome has no config surface to include type edges, and every TS-aware alternative (madge, dpdm, skott, dependency-cruiser) routes through the TypeScript compiler API and hits the TS7 wall. Don't assume type cycles are covered; don't hand-roll a resolver to catch them.

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

Local-dev note: `npm run dev` runs Vite's dev server with HMR on port 5173. The build pipeline lives in `vite.config.ts`; deploy scripts are thin wrappers around `vite build` + `rsync`.

Agent-environment note: hosted agent sessions are headless unless audio/display access has been
explicitly verified. Never claim a by-ear check from local execution. For an audible review, use
`/deploy-test` so Brandon can listen to the test build; automated browser-audio guards remain
deterministic evidence, not a substitute for the `Needs-ear` gate.

## Architecture

Ensemble is a browser-based "virtual band" PWA: a Preact UI, deep-signal state slices, a real-time logic worker for generative note creation, and a separate OffscreenCanvas worker for visuals.

### Bootstrap (`public/main.ts`)

Orchestration entrypoint. Hydrates persisted/URL state **before** mounting the Preact tree, then initializes the logic worker and subscribes state changes so `syncWorker()` and `handleEffects()` run on every dispatch. Hydration-before-mount order is intentional.

### State (`public/state/`, `public/ui-bridge.ts`, `public/state/state-effects.ts`)

- Domain slices: `playback`, `arranger`, `groove`, `chords`, `bass`, `soloist`, `harmony`, `midi`, `vizState`, `conductor` — each a `deepSignal`.
- **All writes go through `dispatch(ACTIONS.TYPE, payload)`.** Never mutate state directly in components or controllers.
- `useEnsembleState()` in `public/ui-bridge.ts` — reading a property inside the selector establishes reactivity.
- `public/state/state-effects.ts` owns cross-module side effects kept deliberately outside reducers.
- **Write-ownership invariant** (`docs/design/write-ownership.md`): a `document`- or `preferences`-owned field (per `public/songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST`, which governs persistence) is written only by user intent, never by a runtime system (conductor, trade block, worker). Runtime modulation of one lands on a paired `runtime-derived` sibling field (e.g. `playback.conductorVelocity`, `soloist.tradeSilenced`) and is composed at the read site. This is the ownership-domain analogue of `docs/design/timing-model.md`'s one-authority-per-domain law for timing.
#### `@direct-mutation` policy

`// @direct-mutation` is a sanctioned escape hatch. Use it only in these categories:

- **Sanctioned (real-time hot paths):** `public/engine/scheduler-core.ts` and the `synth-*.ts` family — direct audio param writes for scheduling and synthesis. Also `public/controllers/app-controller.ts`'s BPM reschedule (`nextNoteTime`/`unswungNextNoteTime`) and `public/controllers/instrument-controller.ts`'s `flushBuffer()` voice-continuity writes, which are the same real-time class outside the engine dir.
- **Sanctioned exception (init-only):** `public/engine/engine.ts` `initAudio()`, `public/engine/audio-recovery.ts` — one-shot audio-graph setup that runs before any dispatch subscriber exists.
- **Sanctioned exception (pre-mount only):** `public/state/state-hydration.ts` — runs before Preact mounts, so no reactive listeners are attached yet.
- **Sanctioned exception (detached render clone):** `public/export/audio-export.ts`'s `cloneStateForRender` output and `scripts/mix-report.ts`'s inline clone. These write a throwaway copy of the state tree for an offline render — dispatching would write the *live* slices and corrupt the running app mid-export. `public/engine/chords-engine.ts`'s `validateProgression` belongs here too: it writes `arranger.progression` on **its passed-in `state`**, which is the live tree on the main path and a detached clone on the export path, so a dispatch there would silently corrupt live state during an offline stem render.
- **Everything else routes through reducers.** Any site not in the four categories above must dispatch.

Enforced by `npm run check-mutations` over `public/**/*.{ts,tsx}` — it catches the bare, cast (`(slice as Mutable<…>).f =`), and aliased-handle assignment idioms, treating a `@direct-mutation`/`@worker-mutation` marker anywhere in the statement as the exemption. The skip list is **content-based, not path-based**: a file is exempt only if it *declares* a slice (contains `deepSignal<`), plus `*reducer*` by name. That deliberately keeps the non-slice plumbing that lives alongside the slices (`state/state-effects.ts`, `state/state-hydration.ts`, `state/history.ts`, `state/persistence.ts`, `state/share-codec.ts`) inside the guard — a blanket `state/` path skip would exempt them the moment they moved into that directory. Two known limits: **`scripts/` is not in scope** (it has its own unmigrated sites), and **array-method mutation is invisible** to an assignment-based guard — `state/history.ts`'s `arranger.history.push/shift/pop` is unmarked and unenforced.

`// @worker-mutation` is the sibling marker for writes to the **worker's own copy** of the tree — reconstructed from `getSyncState()`, never round-tripped back to the main thread. It is *not* interchangeable with `@direct-mutation`: using it on a main-thread file sends the next reader hunting for a worker boundary that doesn't exist.

### Generative Engine Pipeline (worker thread)

- `public/worker-client.ts` — main-thread bridge; sends full snapshots (`getSyncState()`) or deltas (`syncWorker()`).
- `public/logic-worker.ts` — orchestrates live note generation, buffer fills, and resolution handling.
- `public/midi-export-worker.ts` — owns one detached MIDI export in a fresh module-worker realm.
- `public/engine/scheduler-core.ts` — real-time scheduler consuming worker buffers; timing is based on `playback.audio.currentTime`, not UI clocks.
- Musical engines: `soloist-phrase-first.ts`, `bass-engine.ts`, `accompaniment.ts`, `chords-engine.ts`, `harmonies.ts`, `grooves/` (13 genre strategies).

### Visualizer Pipeline (separate OffscreenCanvas worker)

- `public/visualizer/visualizer-proxy.ts` — main-thread wrapper.
- `public/visualizer-worker.ts` — `VisualizerEngine` with `OffscreenCanvas`.
- Clock sync is message-based; the worker interpolates time locally.

### UI (`public/components/`, `public/App.tsx`)

Single chart-first surface (`ChartSurface`): the chord chart is always visible, with transport and key/time controls in a topbar, the instrument rail always accessible along one edge, and a 🌈 button that opens a full-screen visualizer overlay. There are no workspace tabs. New UI work should follow this model — controls radiate outward from the chart rather than living in separate navigable views.

**Reserved surfaces:** the **section-label tap** and a **one-line sticky slot at the chart's edge** are earmarked for the banked #937 conductor lens (was Forgejo #1019; "lead, don't play" — see the #937 issue thread). Don't spend them on ad-hoc affordances, and don't further overload the section headers; new section-header gestures must be designed against that banked contract (mode-owned tap, queued-pill horizon), not added piecemeal.

### Data / Config split

- UI metadata (menus, categories): `public/data/instrument-styles.ts`
- Generative behavior: `public/engine/bass-styles.ts`, `public/engine/chords-styles.ts`, `public/engine/grooves/`
- `public/styles.css` is an import manifest only — put feature CSS in `public/css/`.

**Layering (documented, deliberately not gated).** UI components should reach the engine through data/config modules and state, not by importing generative engine internals; engine modules should receive state via parameters or specific slices rather than importing the global state manager. Both were once `dependency-cruiser` rules, but at `severity: 'warn'` they never failed a build, and a 2026-07-24 measurement found only 8 sites — 7 of which are legitimate registry/policy lookups that merely live under `engine/` (`instrument-registry`, `soloist-mode-policy`, `pack-runtime`, `sample-voice`, `arc`, `note-spelling`) plus `scheduler-core.ts`'s sanctioned real-time state import. Enforcing the rule as written would flag mostly-correct code, so it stays prose (#1232). **If you ever want a real gate, narrow "engine" to generative modules first** — that redefinition is the actual work, not the checker.

## Musical Logic & Generative Standards

### Musical intent

In generative logic, always document **why** a probability or offset exists (e.g. `// 15% ghost note on step 14 for jazz feel`). Musical intent is part of the implementation, not disposable tuning noise. When musical correctness and programmer convenience conflict, favor musicality.

### Deterministic phrasing

Prefer **deterministic, seeded motif generation** (`barIndex`, `sectionId`) over raw `Math.random()`. Keeps critique tests and looped playback coherent. Reference: `getDrumMotif` in `groove-engine.ts`.

### Weight-based selectors: final-stage multipliers win

For any weight-based picker (e.g. the pitch-weighting block in `getBassNote` in `bass-engine.ts`), if you want a new bias to actually shift the chosen distribution, apply it as a **final-stage `weight *= mult`** after all the additive bonuses, not as a multiplier on one factor's `+= bonus` line. Generative engines accumulate many simultaneous biases (chord-tone bonus, profile boost, common-tone reward, etc.); scaling just one of them gets washed out. Confirmed during the May 2026 SRDC bias work — additive multiplier gave 0pt phase gap; final-stage multiplier gave 30pt+ gap.

### Dynamic Head / Chorus Evolution (Soloist)

The soloist generates a session-wide `sessionSeed` (SRDC structure: Statement, Restatement, Departure, Conclusion) at playback start. The live mechanism (`getSoloistNotePhraseFirst` in `soloist-phrase-first.ts`, see `docs/design/soloist-phrase-first.md` §6/§9 for the full design):

- **Loop 0 (The Head):** the seed itself is pre-baked with Imperfect Symmetry — `generateSessionSeed` in `soloist-seeder.ts` drifts repeated 'A' measures at a 15–30% rate (`symmetryMutationProb`, tightest for HOOK contours, loosest outside jazz) so Loop 0 doesn't clone verbatim; the live engine then plays the frozen seed straight (head-bypass).
- **Loop 1+:** `loopLift` (a concave entrance ramp reaching ~0.56 at loop 4 — front-loaded per #858, replacing the older linear 0.14/loop; `loopCount` clamped to 4) layers onto `intensityLift`/`tempoFill`; a per-step sine-swell `activityAt` shapes note density across the loop. `developmentDepth`/`DEPTH_DEGREES` drives cyclical diatonic transposition of the whole line, keyed to `loopCount` so pitch only shifts at a loop boundary (never mid-phrase) — with periodic theme-return (`depth 0` = verbatim head) and one apex/money-note peak per cycle.

### Coordination & Register Slotting

Source of truth: `public/engine/coordination-engine.ts`. Always pass `CoordinationContext` to instrument generators. `tick-logic.ts` enforces ranges via `enforceRegisterSlotting` (exported from `coordination-engine.ts`):

- **Bass:** 23–57
- **Chords/Harmony:** 52–84
- **Soloist:** priority 60–90 (only clamp when a note would fall below MIDI 52)

### Naming / Canonicalization

- **Supported-genre canon (the 13):** `Rock`, `Jazz`, `Funk`, `Disco`, `Hip Hop`, `Blues`, `Neo-Soul`, `Reggae`, `Acoustic`, `Bossa`, `Country`, `Metal`, `Ska-Punk`. This is the matrix's column axis and the **exact set the UI exposes** — the genre picker (`InstrumentRail.tsx`) and Surprise Me render straight over `GENRE_NAMES` (= `Object.keys(GENRE_OVERRIDES)` in `public/data/smart-genres.ts`), so there's no config-vs-UI drift. Pinned by `tests/standards/genre-canon-guard.test.ts`. **Don't add a 14th genre or resurrect a retired one without updating the canon + that guard.** The phantom routing keys (`Shred`, `Latin`, `Afrobeat`, `Soul`) that once lingered in engine routing maps have all been retired (verified 2026-07-23); `tests/standards/genre-feel-canon-guard.test.ts` keeps them out. Don't reintroduce them. Note `Minimal` is a live **drum-preset** name (`public/data/drum-presets.ts`), not a genre key — the two namespaces are different.
- One canonical internal name per concept. UI labels can be friendlier, but state keys, config keys, persisted payloads, and code paths normalize to the canonical form.
- Aliases live near the data/config that owns the concept — don't scatter alias checks across components, tests, docs, and controllers.
- Before any rename: grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
- Preserve compatibility shims when a rename touches saved sessions, share URLs, or presets.
- Split labels from logic: display labels in UI/data layer, behavior keys in engine/config layer. A pretty label should not silently become a runtime enum unless that is the intended canonical key.
- Known alias family: `Neo-Soul`/`Neo` — the live pairing, in `GENRE_OVERRIDES` (`public/data/smart-genres.ts`). Add new aliases to that same map instead of creating one-off fixes. **`Rock`/`Shred` is NOT a live alias** — `Shred` is a retired phantom key (see the canon bullet above) with no alias map anywhere in `public/`; don't resurrect the pairing.

### TypeScript

All `public/` source is `.ts`/`.tsx` (migration complete May 2026). `tsconfig.json` has `strict: true` and `moduleResolution: "Bundler"` — import specifiers can keep `.js`/`.jsx` suffixes; the resolver finds the `.ts`/`.tsx` source. Use global interfaces in `public/types.ts` (`EnsembleState`, `StepInfo`, etc.). Run `npm run typecheck` before concluding any task.

## Testing Standards

### Critique tests (`tests/standards/`)

The **Definition of Done** for musicality. When you modify a musical engine (bass, drums, soloist, etc.), you **must** run the corresponding critique test (e.g. `npx vitest run tests/standards/funk-bass-critique.test.ts`). They use statistical ranges — never replace with rigid binary snapshots. Check the "Critique Report" output for balance.

### Vitest (logic / unit / integration)

`describe`, `it`, `expect` are global. Use `vi.mock()` to isolate dependencies (especially global state or browser APIs). If you intentionally change musical behavior, update test expectations — do not leave tests failing.

### Playwright (e2e)

Functional smoke tests only — no pixel snapshots. Three projects: **Desktop Chrome**, **Mobile Chrome** (`@mobile`, 390×844), **Mobile Safari** (`@ipad`). Use `@mobile`/`@ipad` tags to scope tests. `data-e2e-mode="true"` is injected to disable heavy animations. Prefer `data-testid="unique-id"` selectors over volatile CSS classes.

The suite runs against a **`vite preview` build** of the shipped bundle (built with `VITE_E2E_BRIDGE=1` so the `window.ensemble` test bridge survives tree-shaking — see `public/main.ts`), **not** the dev server — so it exercises the minified, `DEV === false` artifact we actually deploy, and there is no on-demand compile to flake on.

### Vitest browser mode (`tests/browser/`)

The few engine tests that need a **real `OfflineAudioContext`** (reverb-tail decay, harmony click-free) run here — headless Chromium via `@vitest/browser-playwright`, config in `vitest.browser.config.ts`, command `npm run test:browser`. Node-mode `npm test` (happy-dom) has no Web Audio, so these can't live there. Not folded into `npm run ci` (the `checks` job installs no browser); the CI **e2e** job runs them.

### Biome

4-space indent, single quotes, 100-char line width. Run `npm run format` before finishing.

## Commit & PR Conventions

Conventional Commit style, scoped where useful: `feat(soloist): ...`, `fix(ts): ...`, `chore(deps): ...`, `refactor(mobile): ...`. Keep commits focused. PRs should include a short summary, test commands run, linked issues if applicable, and screenshots/recordings for UI changes. Commit-message and PR-body trailers, branch policy, and `git add`-explicit-paths rules live in **DOCTRINE §8/§9**.

## Work Pipeline (GitHub-backed)

Scheduled work is tracked in **GitHub issues** on `brndnsh-labs/Ensemble` (public), routed by **labels** — **not** in markdown. A story = an issue (body holds Why/Touches/Acceptance); milestones = epics; a **closed issue is done**. All routing is labels, one namespace per dimension: `status:*` (loop state, exactly one at a time), `track:*`, `lens:*`, plus `size/*`, `model/*`, `agent/*` and `area:*` — every one of them read off `gh issue list --json labels` in a single call. The `docs/audit/` and `docs/synth-audit/` trees are a **frozen archive** of the markdown-tracked cycles — historical context, not the live tracker. The full rules are in **`.claude/skills/DOCTRINE.md`** (command-level tracker mechanics in its §7); the tracker is driven by `gh` alone. Run the pipeline with the work-loop skills (`/next`, `/cycle`, `/intake`, `/unblock`, `/scout`, `/nightly`, …). Forgejo (`git.brndn.zip`) is now a read-only pull mirror.

**Issue numbers `#N` are continuous up to #935.** Ensemble started on GitHub, moved to Forgejo in 2026-07 — where the counter *continued* rather than restarting — and came back on 2026-08-04 via a repo transfer that kept all 224 issues and 710 PRs at their original numbers. So a bare `#N` in an old commit or doc resolves correctly for **N ≤ 935**. Only the Forgejo-only window (#936–#1355) is renumbered; that map lives in homelab-maintenance `migration-maps/Ensemble-issue-map.tsv`. Only the **8 issues still open** at migration carried over to GitHub — those are the map's rows. Everything **closed** in that window stayed behind, readable in the read-only archive repo `git.brndn.zip/brandon/Ensemble-archive` (private + archived; `brandon/Ensemble` itself is now a pull mirror with its issue tracker disabled, so look in `-archive`, not there). So an unmapped `#N` in 936–1355 is archive provenance, not a live GitHub link.

**Autonomy posture (DOCTRINE §5/§6):** the pipeline runs **full-auto** — well-specified, gate-verifiable, non-destructive stories build → branch → PR → **auto-merge to `main`** (CI-gated, via `gh pr merge --auto --squash` — GitHub holds the merge until the required `checks` + `e2e-tests` contexts pass; no client-side polling) without a per-step nod. It **stops and surfaces** on a judgment call: a **synth or by-ear** story (the listening gate is a hard human stop → `Needs-ear`), a destructive data op (persisted sessions / share-URL schema / preset data / state migration), a state-or-worker-contract design call, a P0 finding, or a genuinely ambiguous choice. A merge to `main` **is** a prod deploy: `main` is continuously deployed to `ensemble.brndn.zip` by the CI `deploy` job once `checks` + `e2e-tests` pass on the merged commit (DOCTRINE §6). Because `Needs-ear`/synth work is a *pre-merge* stop, nothing un-auditioned ships. `scripts/deploy.sh prod` remains as the manual break-glass path (CI down / forced redeploy); rollback is roll-forward via `git revert` → PR.

## Self-Building Manual

`public/MANUAL.md` combines hand-written guides with auto-generated tables. Placeholders like `{{GENRE_TABLE}}` and `{{BASS_STYLES}}` are populated by `manual-metadata.ts` — adding a new style to config files updates these automatically. If you add a major new feature, add a "Recipe" or "Pro-Tip" to the Markdown guide. Maintain the "Style Gallery" deep links for new signature genres.

## Misc Conventions

- When adding worker-relevant state, update both `getSyncState()` / `syncWorker()` on the main thread and the worker's sync handling.
- For transport/audio behavior, reuse existing controller entrypoints (`togglePlay`, `setBpm`, `loadDrumPreset`) instead of creating parallel side-effect paths.
- Inline styles only for runtime-calculated values (widths, dynamic grid templates, transition names); static presentation belongs in semantic CSS classes.
- Atomic state changes: batch related updates in a single `dispatch` where possible.
- Semantic prop names: name props after their domain (`isTransportVisible`) rather than visual state (`isBlue`).
- Fail fast in workers: validate payload shapes immediately when sending data to `logic-worker.ts`.
- Cross-reference comments name a symbol (a function/`const`/interface like `isDepartureCategory`), never a `file.ts:NNNN` line number — line numbers rot on every edit above them, but a symbol name is easy to `grep` and survives.
- **Prototype guard on `TABLE[untrusted]` (#1266) — pick by consumer count, not taste.** A lookup table indexed by a persisted/share-URL value must not be a plain literal: `TABLE['constructor']` returns the `Object` constructor, a truthy hit that sails past `|| fallback` and is then read as config. **Null-prototype the declaration** (`Object.assign(Object.create(null), {…})`, or `Object.create(null)` as a `reduce` seed) when the table has many `|| fallback` consumers — `TIME_SIGNATURES`, `LEGACY_THEME_MAP`, `STYLE_CONFIG`, the `smart-genres.ts` feel tables. **`Object.hasOwn` at the guard** when the table is read in one place — `resolveMappedStyle`, `loadDrumPreset`, `harmonies.ts`'s `STYLE_CONFIGS`. (`Object.prototype.hasOwnProperty.call` in `theory-scales.ts` is the same thing pre-`Object.hasOwn`; don't add new ones.) **A null prototype on a STATE SLICE field is not available** — `toRaw` in `worker-client.ts` rebuilds every synced object as a plain `{}` before `postMessage`, and a reducer that re-creates the field (`groove.ts`'s `sectionSeedMap = {}`) drops it too; deepsignal also refuses to proxy a null-prototype object (`SUPPORTED.has(value.constructor)`), silently costing nested reactivity. For slice data, reject the bad KEY at the reader and type-check the VALUE at each read instead. Best of all, validate at the reader so nothing downstream is untrusted — `state-hydration.ts` is where that happens, and **both** readers there must use the *same* predicate.

## Active Product Direction

See `docs/VISION.md` for current priorities and open work.
