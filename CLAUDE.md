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

## V2 lives on `main` — read before starting a v2 story

The 2026-09-10 branch-only exception is **retired**. `feat/ensemble-v2-foundation` merged to
`main` on 2026-09-12; v2 work now follows the normal work-loop delivery defaults in DOCTRINE
§5/§6 — branch, PR, auto-merge on green. For v2 work, including its shared-engine and test
companions, first read [`prototypes/v2/CLAUDE.md`](prototypes/v2/CLAUDE.md). This is the common
handoff for Claude, Codex and other agents; no previous conversation or private agent memory
is required.

**The v2 music stand IS the site (cutover #1357).** `ensemble.brndn.zip/` serves the
`prototypes/v2/` Next static export built at `ENSEMBLE_V2_BASE=/`, inside the `ensemble-web`
image; `/v2/*` is an edge redirect to the same path without the prefix. A merge to `main`
releases it: the CI `deploy` job publishes no files at all any more — it releases this commit's
`ensemble-web` and `ensemble-api` tags to prod and then test, and asserts each host's public
`/build.json` names the commit. So:

- A story touching **`prototypes/v2/**`** is live at `ensemble.brndn.zip/` on merge, gated by
  the required `v2-checks` context (v2 build + its Playwright suite) alongside `checks` and
  `e2e-tests`. There is no longer a v1 app beside it for it to regress; it is the release.
- A story touching **`public/**`** is live production code on that same merge — the shared
  songbook codecs, engine hooks and state slices very much included, since the v2 export
  compiles `public/`, so `v2-checks` must stay green. v1's own UI shell is gone (#1358).
- **The cutover is a hard cut.** No `/v1/` grace path. v1's browser data is reachable only
  through v2's import (#1274), and an old `?s=` share link opens best-effort (#1279). The plan
  and its decisions are [`docs/design/ensemble-v2-rollout.md`](docs/design/ensemble-v2-rollout.md)
  (DECISION 2026-09-15): API online → document API → accounts in the product → core parity →
  hard cut.

**One app.** Since #1358 `public/` is not an app: it is the engine/state/songbook library that
`prototypes/v2` imports through the `@engine/*` alias (`prototypes/v2/next.config.mjs`). The only
UI is `prototypes/v2/app/` (React, Next static export); don't add UI to `public/`. The
engine/state/worker rules below are about `public/` and bind every caller of it.

## Mandatory Checklist (before any change)

1. **State writes** flow through `dispatch(ACTIONS.TYPE, payload)`. Never mutate state objects directly outside reducers (exception: `// @direct-mutation` in performance-critical engine code). A `document`/`preferences`-owned field (`public/songbook/state-ownership.ts`) is written **only** by user intent — a UI dispatch or hydration; a runtime system's modulation of it lives in a paired `runtime-derived` sibling field, composed at read time — see `docs/design/write-ownership.md`.
2. **UI updates** belong in `prototypes/v2/app/`. A component never calls `dispatch`/`getState` itself: the engine is reached through `prototypes/v2/lib/runtime.ts`, which is the only v2 file that does.
3. **Tests:** `npm test` (unit/integration) AND the v2 suite (`npm run build --prefix prototypes/v2`, then `npm run test:e2e --prefix prototypes/v2`) before concluding — for a `public/` change too, since the v2 export compiles it.
4. **Refactors:** grep the whole repo (`public/`, `prototypes/`, `tests/`, `scripts/`, `docs/`, `.github/`) for usages before renaming or moving anything. Update all imports in the same pass.
5. **Typecheck** is green at the end of every task (`npm run typecheck`).

## Strictly npm-based

`npm install`, `npm run <script>`. Never use `pnpm`, `yarn`, or `bun`. Never create non-`package-lock.json` lockfiles.

## Commands

```bash
npm run lint             # Biome lint + format check
npm run format           # Biome write fixes
npm run lint:docs        # repo-specific docs validation
npm run typecheck        # tsc over public/ and scripts/
npm run typecheck:tests  # tsc over tests/ (its own CI gate — typecheck skips tests/)
npm test                 # mutation check + Biome + docs lint + Vitest (node/happy-dom)
npm run test:vitest      # Vitest only — fast targeted iteration, not the full gate
npm run test:browser     # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
npm run test:sync        # v2 account storage contract in real IndexedDB (Chromium + WebKit)
npm run validate         # format + jscpd + `npm run ci` (typecheck, typecheck:tests, knip, npm test)
npm run depcheck         # circular-import gate (Biome noImportCycles) — RUNTIME cycles only

# The app (prototypes/v2), from the repo root:
npm run dev --prefix prototypes/v2       # Next dev server on http://localhost:3100/v2/
npm run build --prefix prototypes/v2     # root + v2 typecheck, next build, offline.mjs → prototypes/v2/out
npm run test:e2e --prefix prototypes/v2  # v2 Playwright suite against the BUILT export (build first)
```

`npm run depcheck` is the focused circular-import check (`biome lint --only=suspicious/noImportCycles`). The same configured rule runs as part of `npm run lint` and therefore `npm test`; CI does not run the focused command a second time. It catches **runtime cycles only** — `import type` edges are invisible to it, and that is a deliberate 2026-07-24 call (#1234), not an oversight. A type-only cycle erases at compile time and cannot cause the load-order bug this gate exists to prevent. (Verified by mutation test in #1191: a planted runtime cycle exits 1 with 3 diagnostics; a planted type-only cycle exits 0, uncaught.) Biome has no config surface to include type edges, and every TS-aware alternative (madge, dpdm, skott, dependency-cruiser) routes through the TypeScript compiler API and hits the TS7 wall. Don't assume type cycles are covered; don't hand-roll a resolver to catch them.

Targeted tests:

```bash
npm run test:vitest -- band-chart                   # Vitest filename/name filter
npm run test:vitest -- band/test/critique.test.ts   # the band's critique claims
npx vitest run band/perform.test.ts -t "specific test name"

# v2 Playwright — from prototypes/v2, after a build; projects are `laptop` and `webkit-phone`
(cd prototypes/v2 && npx playwright test checks/semantic-playback.spec.ts --project=laptop)
```

Local-dev note: the v2 dev server serves the default `/v2` base (`ENSEMBLE_V2_BASE` unset;
production builds at `/`). Offline install and sound-pack downloads only work against the built
export, served by `node scripts/serve.mjs` in `prototypes/v2/` — see `prototypes/v2/README.md`.
There is no local deploy script: a merge to `main` is the release (see above).

Agent-environment note: hosted agent sessions are headless unless audio/display access has been
explicitly verified. Never claim a by-ear check from local execution. For an audible review, use
`/deploy-test` so Brandon can listen to the test build; automated browser-audio guards remain
deterministic evidence, not a substitute for the `Needs-ear` gate.

## Architecture

Ensemble is a browser-based "virtual band" PWA. One app, two layers: the music stand in `prototypes/v2/` (React, Next static export — the only UI) and the library it compiles from `public/` — deep-signal state slices, the Web Audio engine and voices, the songbook codecs, and the old worker-based generator (no longer run by the app; being deleted, #1404). The band that plays is `band/` (below).

### Runtime bootstrap (`prototypes/v2/lib/runtime.ts`)

One runtime per page, independent of React mounts. `initialize()` seeds the installed sounds, subscribes to dispatches so `handleEffects()` and `syncBand()` (the band host's settings) run on every one, then `rebuild()`s: `validateProgression` → `analyzeFormUI` → `flushBuffers()`. No logic worker runs (the old engine's, retiring in #1404). Play, stop and the exports go through the band host (`lib/band-host.ts`). The React shell (`prototypes/v2/app/ensemble.tsx`) owns documents and hands the runtime authored content; it never writes engine state. v1's `hydrateState()` is not part of this path — v2 opens charts from its own songbook, and `public/state/persistence.ts` is swapped for a no-op at compile time (the `NormalModuleReplacementPlugin` in `prototypes/v2/next.config.mjs` → `lib/legacy-persistence.ts`).

### State (`public/state.ts`, `public/state/`)

- Domain slices: `playback`, `arranger`, `groove`, `chords`, `bass`, `soloist`, `harmony`, `midi`, `vizState`, `conductor` — each a `deepSignal`.
- **All writes go through `dispatch(ACTIONS.TYPE, payload)`.** Never mutate state directly in components or controllers.
- Hosts read with `getState()` and listen with `subscribe()` (`public/state.ts`). In v2 only `lib/runtime.ts` does either; React state lives in the shell, not in the slices.
- `public/state/state-effects.ts` owns cross-module side effects kept deliberately outside reducers.
- **Write-ownership invariant** (`docs/design/write-ownership.md`): a `document`- or `preferences`-owned field (per `public/songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST`, which governs persistence) is written only by user intent, never by a runtime system (conductor, trade block, worker). Runtime modulation of one lands on a paired `runtime-derived` sibling field (e.g. `playback.conductorVelocity`, `soloist.tradeSilenced`) and is composed at the read site. This is the ownership-domain analogue of `docs/design/timing-model.md`'s one-authority-per-domain law for timing.
#### `@direct-mutation` policy

`// @direct-mutation` is a sanctioned escape hatch. Use it only in these categories:

- **Sanctioned (real-time hot paths):** the `synth-*.ts` family — direct audio param writes for synthesis. Also `public/controllers/app-controller.ts`'s BPM reschedule (`nextNoteTime`/`unswungNextNoteTime`) and `public/controllers/instrument-controller.ts`'s `flushBuffer()` voice-continuity writes, which are the same real-time class outside the engine dir.
- **Sanctioned exception (init-only):** `public/engine/engine.ts` `initAudio()`, `public/engine/audio-recovery.ts` — one-shot audio-graph setup that runs before any dispatch subscriber exists.
- **Sanctioned exception (pre-mount only):** `public/state/state-hydration.ts`'s `hydrateState`/`loadFromUrl` — written to run before any reactive listener is attached. Since #1358 no app code calls them (v2 opens charts from its own songbook and imports only this file's validators), so extend them only with a live caller in hand.
- **Sanctioned exception (detached render clone):** the clone `prototypes/v2/lib/band-export.ts`'s `renderBandPasses` renders from (written by it and by the render bridge's `prepare` hook). These write a throwaway copy of the state tree for an offline render — dispatching would write the *live* slices and corrupt the running app mid-export. `public/engine/chords-engine.ts`'s `validateProgression` belongs here too: it writes `arranger.progression` on **its passed-in `state`**, which is the live tree on the main path and a detached clone on the export path, so a dispatch there would silently corrupt live state during an offline stem render.
- **Everything else routes through reducers.** Any site not in the four categories above must dispatch.

Enforced by `npm run check-mutations` over `public/**/*.{ts,tsx}` — it catches the bare, cast (`(slice as Mutable<…>).f =`), and aliased-handle assignment idioms, treating a `@direct-mutation`/`@worker-mutation` marker anywhere in the statement as the exemption. The skip list is **content-based, not path-based**: a file is exempt only if it *declares* a slice (contains `deepSignal<`), plus `*reducer*` by name. That deliberately keeps the non-slice plumbing that lives alongside the slices (`state/state-effects.ts`, `state/state-hydration.ts`, `state/history.ts`, `state/persistence.ts`, `state/share-codec.ts`) inside the guard — a blanket `state/` path skip would exempt them the moment they moved into that directory. Two known limits: **`scripts/` is not in scope** (it has its own unmigrated sites), and **array-method mutation is invisible** to an assignment-based guard — `state/history.ts`'s `arranger.history.push/shift/pop` is unmarked and unenforced.

`// @worker-mutation` was the sibling marker for the old engine's worker copy of the tree. No worker runs any more (#1404), so no new site should use it.

### The band engine (`band/`) — the only engine since 2026-09-26

Every page plays the ground-up band engine: `band/` is a pure, deterministic `performPass` over the
score's timeline, driven live by `prototypes/v2/lib/band-host.ts` and exported through the same
event stream (`.mid`, WAV). Read `band/CLAUDE.md` and `docs/design/band-engine.md` before touching
it. The old worker-based generator is gone (#1404): `public/engine` now holds the voices, sample
packs and audio graph the band plays through, plus the chord parser the measure-less charts'
display still uses (`chords-engine.ts`'s `validateProgression`).

The listening-gate tools (`npm run mix:report` and `mix:ab`/`mix:verify`/`mix:spectro`/`mix:plant`
built on it) render the band engine: `scripts/band-scene.ts` composes each scene in node
(`compileTimeline` → `performPass`), and `prototypes/v2/lib/render-bridge.ts` renders the events
in the app through `renderBandPasses` (`lib/band-export.ts`, the export's own offline render) on
`window.ensemble`. The v2 runtime installs the bridge only in a build made with
`NEXT_PUBLIC_RENDER_BRIDGE=1`, which `mix:report` makes for itself; a production build compiles it
out. See `docs/guides/listening-gate-tools.md`.

There is no visualizer. `vizState` and `public/visualizer/visualizer-events.ts`'s types survive only as leftovers of the old engine's scheduler; nothing turns `vizState` on.

### UI (`prototypes/v2/app/`)

The music stand: songbook home, chart sheet, transport, edit panel and sounds panel. Ownership and boundaries per surface are in `prototypes/v2/CLAUDE.md`'s navigation table — read it before a UI story.

### Data / Config split

- UI metadata (menus, categories): `public/data/instrument-styles.ts`
- Musical behavior: the band engine's styles, `band/styles/` (one file per genre)
- Styles live beside the components in `prototypes/v2/app/` (`style.css` plus per-surface `.css` files). `public/` holds no CSS.

**Layering (documented, deliberately not gated).** The UI should reach the engine through `prototypes/v2/lib/runtime.ts`, data/config modules and state, not by importing generative engine internals; engine modules should receive state via parameters or specific slices rather than importing the global state manager. Both were once `dependency-cruiser` rules, but at `severity: 'warn'` they never failed a build, and a 2026-07-24 measurement found only 8 sites — 7 of which are legitimate registry/policy lookups that merely live under `engine/` (`instrument-registry`, `soloist-mode-policy`, `pack-runtime`, `sample-voice`, `arc`, `note-spelling`) plus the old scheduler's sanctioned real-time state import (both since deleted with the old engine). Enforcing the rule as written would flag mostly-correct code, so it stays prose (#1232). **If you ever want a real gate, narrow "engine" to generative modules first** — that redefinition is the actual work, not the checker.

## Musical Logic & Generative Standards

### Musical intent

In generative logic, always document **why** a probability or offset exists (e.g. `// 15% ghost note on step 14 for jazz feel`). Musical intent is part of the implementation, not disposable tuning noise. When musical correctness and programmer convenience conflict, favor musicality.

### Deterministic phrasing

Prefer **deterministic, seeded motif generation** (`barIndex`, `sectionId`) over raw `Math.random()`. Keeps critique tests and looped playback coherent. The band draws every choice from `rng(seed, …keys)` (`band/core/random.ts`), so a pass is byte-identical for its inputs.

### Weight-based selectors: final-stage multipliers win

For any weight-based picker, if you want a new bias to actually shift the chosen distribution, apply it as a **final-stage `weight *= mult`** after all the additive bonuses, not as a multiplier on one factor's `+= bonus` line. Generative engines accumulate many simultaneous biases (chord-tone bonus, profile boost, common-tone reward, etc.); scaling just one of them gets washed out. Confirmed during the May 2026 SRDC bias work — additive multiplier gave 0pt phase gap; final-stage multiplier gave 30pt+ gap.

### Registers

Each band lane keeps to its register slot — bass 23–57, keyboard comp 52–84 (`docs/design/band-engine.md`, "Register slots") — and the invariant suite (in `band/test/`) checks every style against its lane ranges.

### Naming / Canonicalization

- **Supported-genre canon (the 13):** `Rock`, `Jazz`, `Funk`, `Disco`, `Hip Hop`, `Blues`, `Neo-Soul`, `Reggae`, `Acoustic`, `Bossa`, `Country`, `Metal`, `Ska-Punk`. This is the matrix's column axis and the **exact set the UI exposes** — the genre picker (`prototypes/v2/app/transport-bar.tsx`, via `lib/runtime.ts`'s re-export) renders straight over `GENRE_NAMES` (= `Object.keys(GENRE_OVERRIDES)` in `public/data/smart-genres.ts`), so there's no config-vs-UI drift. Pinned by `tests/standards/genre-canon-guard.test.ts`. **Don't add a 14th genre or resurrect a retired one without updating the canon + that guard.** The phantom routing keys (`Shred`, `Latin`, `Afrobeat`, `Soul`) that once lingered in the old engine's routing maps are retired. Don't reintroduce them.
- One canonical internal name per concept. UI labels can be friendlier, but state keys, config keys, persisted payloads, and code paths normalize to the canonical form.
- Aliases live near the data/config that owns the concept — don't scatter alias checks across components, tests, docs, and controllers.
- Before any rename: grep the entire repo (`public/`, `prototypes/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
- Preserve compatibility shims when a rename touches saved sessions, share URLs, or presets.
- Split labels from logic: display labels in UI/data layer, behavior keys in engine/config layer. A pretty label should not silently become a runtime enum unless that is the intended canonical key.
- Known alias family: `Neo-Soul`/`Neo` — the live pairing, in `GENRE_OVERRIDES` (`public/data/smart-genres.ts`). Add new aliases to that same map instead of creating one-off fixes. **`Rock`/`Shred` is NOT a live alias** — `Shred` is a retired phantom key (see the canon bullet above) with no alias map anywhere in `public/`; don't resurrect the pairing.

### TypeScript

All `public/` source is `.ts`/`.tsx` (migration complete May 2026). `tsconfig.json` has `strict: true` and `moduleResolution: "Bundler"` — import specifiers can keep `.js`/`.jsx` suffixes; the resolver finds the `.ts`/`.tsx` source. Use global interfaces in `public/types.ts` (`EnsembleState`, `StepInfo`, etc.). Run `npm run typecheck` before concluding any task.

## Testing Standards

### Critique claims (`band/test/`)

The **Definition of Done** for musicality. Each style's claims (`band/test/claims/<style>.ts`) are statistical ranges the critique harness measures (`band/test/critique.test.ts`); the invariant suite (in `band/test/`) holds every style to the band's laws. When you change a style or a player, run them — never replace a range with a rigid snapshot. `band/CLAUDE.md` has the details. The old engine's critique suite in `tests/standards/` went with it; what remains there are genre and routing guards, a disco piano critique and the security ledger.

### Vitest (logic / unit / integration)

`describe`, `it`, `expect` are global. Use `vi.mock()` to isolate dependencies (especially global state or browser APIs). If you intentionally change musical behavior, update test expectations — do not leave tests failing.

### Playwright (e2e) — the v2 suite

The only Playwright suite is the app's: `prototypes/v2/checks/`, config in `prototypes/v2/playwright.config.ts`, run by the required `v2-checks` CI context. Two projects: **`laptop`** (Desktop Chrome) and **`webkit-phone`** (iPhone 13, WebKit); `*.chromium.spec.ts` specs (passkeys via a CDP virtual authenticator) are Chromium-only. It runs against the **built static export** (`checks/fixtures.ts` starts a preview server per worker), not the dev server — build first, or it tests a stale export. Functional checks, no pixel snapshots. `prototypes/v2/CLAUDE.md` § Verification has the full gate list.

### Vitest browser mode (`tests/browser/`)

The few engine tests that need a **real `OfflineAudioContext`** (reverb-tail decay, harmony click-free) run here — headless Chromium via `@vitest/browser-playwright`, config in `vitest.browser.config.ts`, command `npm run test:browser`. Node-mode `npm test` (happy-dom) has no Web Audio, so these can't live there. Not folded into `npm run ci` (the `checks` job installs no browser); the CI `e2e-tests` job runs them, with `npm run test:sync`.

### Biome

4-space indent, single quotes, 100-char line width. Run `npm run format` before finishing.

## Commit & PR Conventions

Conventional Commit style, scoped where useful: `feat(soloist): ...`, `fix(ts): ...`, `chore(deps): ...`, `refactor(mobile): ...`. Keep commits focused. PRs should include a short summary, test commands run, linked issues if applicable, and screenshots/recordings for UI changes. Commit-message and PR-body trailers, branch policy, and `git add`-explicit-paths rules live in **DOCTRINE §8/§9**.

## Work Pipeline (GitHub-backed)

Scheduled work is tracked in **GitHub issues** on `brndnsh-labs/Ensemble` (public), routed by **labels** — **not** in markdown. A story = an issue (body holds Why/Touches/Acceptance); milestones = epics; a **closed issue is done**. All routing is labels, one namespace per dimension: `status:*` (loop state, exactly one at a time), `track:*`, `lens:*`, plus `size/*`, `model/*`, `agent/*` and `area:*` — every one of them read off `gh issue list --json labels` in a single call. The `docs/audit/` and `docs/synth-audit/` trees are a **frozen archive** of the markdown-tracked cycles — historical context, not the live tracker. The full rules are in **`.claude/skills/DOCTRINE.md`** (command-level tracker mechanics in its §7); the tracker is driven by `gh` alone. Run the pipeline with the work-loop skills (`/next`, `/cycle`, `/intake`, `/unblock`, `/scout`, `/nightly`, …). Forgejo (`git.brndn.zip`) is now a read-only pull mirror.

**Issue numbers `#N` are continuous up to #935.** Ensemble started on GitHub, moved to Forgejo in 2026-07 — where the counter *continued* rather than restarting — and came back on 2026-08-04 via a repo transfer that kept all 224 issues and 710 PRs at their original numbers. So a bare `#N` in an old commit or doc resolves correctly for **N ≤ 935**. Only the Forgejo-only window (#936–#1355) is renumbered; that map lives in homelab-maintenance `migration-maps/Ensemble-issue-map.tsv`. Only the **8 issues still open** at migration carried over to GitHub — those are the map's rows. Everything **closed** in that window stayed behind, readable in the read-only archive repo `git.brndn.zip/brandon/Ensemble-archive` (private + archived; `brandon/Ensemble` itself is now a pull mirror with its issue tracker disabled, so look in `-archive`, not there). So an unmapped `#N` in 936–1355 is archive provenance, not a live GitHub link.

**Autonomy posture (DOCTRINE §5/§6):** the pipeline runs **full-auto** — well-specified, gate-verifiable, non-destructive stories build → branch → PR → **auto-merge to `main`** (CI-gated, via `gh pr merge --auto --squash` — GitHub holds the merge until the required `checks`, `e2e-tests` and `v2-checks` contexts pass; no client-side polling) without a per-step nod. It **stops and surfaces** on a judgment call: a **synth or by-ear** story (the listening gate is a hard human stop → `Needs-ear`), a destructive data op (persisted sessions / share-URL schema / preset data / state migration), a state-or-worker-contract design call, a P0 finding, or a genuinely ambiguous choice. A merge to `main` **is** a prod deploy: `main` is continuously deployed to `ensemble.brndn.zip` by the CI `deploy` job once those three contexts and the two image builds pass on the merged commit (DOCTRINE §6). Because `Needs-ear`/synth work is a *pre-merge* stop, nothing un-auditioned ships. Since the cutover (#1357) a deploy is a container-tag release, so the break-glass path is a re-run of that job (`workflow_dispatch` on `main`) and an immediate rollback is the previous `ensemble-web` tag on the box. The normal correction is still roll-forward via `git revert` → PR.

## Agent skills

The general-purpose engineering skills (the `mattpocock-skills` Claude Code plugin, plus
user-level copies for Codex, OpenCode, Pi and Copilot) read their repo config from
`docs/agents/`. They sit alongside the work pipeline above: they shape the work (grilling, TDD,
bug diagnosis, ticket slicing, review), while the pipeline owns delivery and is the only writer
of `status:in-progress` and `status:in-review`. Where the two disagree, DOCTRINE wins.

### Issue tracker

GitHub issues on `brndnsh-labs/Ensemble`, in Why / Touches / Acceptance shape. See
`docs/agents/issue-tracker.md`.

### Triage labels

No separate triage vocabulary. The five triage roles map onto `status:*`, and `ready-for-agent`
becomes `status:ready` only for deterministic, gate-provable work. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context, with no `CONTEXT.md` glossary and no ADR folder. The glossary is *Naming /
Canonicalization* above, and decisions are dated entries in `docs/design/`. See
`docs/agents/domain.md`.

## Misc Conventions

- For transport/audio behavior, go through the runtime's band paths (`startBand`/`stopBand`, `syncBand`) instead of creating parallel side-effect paths.
- Inline styles only for runtime-calculated values (widths, dynamic grid templates, transition names); static presentation belongs in semantic CSS classes.
- Atomic state changes: batch related updates in a single `dispatch` where possible.
- Semantic prop names: name props after their domain (`isTransportVisible`) rather than visual state (`isBlue`).
- Cross-reference comments name a symbol (a function/`const`/interface like `isDepartureCategory`), never a `file.ts:NNNN` line number — line numbers rot on every edit above them, but a symbol name is easy to `grep` and survives.
- **Prototype guard on `TABLE[untrusted]` (Forgejo-era #1266 — archive provenance, *not* GitHub #1266, which is an unrelated v2 story; code comments citing `#1266` mean this rule) — pick by consumer count, not taste.** A lookup table indexed by a persisted/share-URL value must not be a plain literal: `TABLE['constructor']` returns the `Object` constructor, a truthy hit that sails past `|| fallback` and is then read as config. **Null-prototype the declaration** (`Object.assign(Object.create(null), {…})`, or `Object.create(null)` as a `reduce` seed) when the table has many `|| fallback` consumers — `TIME_SIGNATURES`, `LEGACY_THEME_MAP`, `STYLE_CONFIG`, the `smart-genres.ts` feel tables. **`Object.hasOwn` at the guard** when the table is read in one place — the runtime's `STYLE_FOR_GENRE` lookup. (Don't add new `Object.prototype.hasOwnProperty.call` guards.) **A null prototype on a STATE SLICE field is not available** — a reducer that re-creates the field (`groove.ts`'s `sectionSeedMap = {}`) drops it too; deepsignal also refuses to proxy a null-prototype object (`SUPPORTED.has(value.constructor)`), silently costing nested reactivity. For slice data, reject the bad KEY at the reader and type-check the VALUE at each read instead. Best of all, validate at the reader so nothing downstream is untrusted — `state-hydration.ts` is where that happens, and **both** readers there must use the *same* predicate.

## Active Product Direction

See `docs/VISION.md` for current priorities and open work.
