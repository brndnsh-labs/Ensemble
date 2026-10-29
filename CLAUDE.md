# CLAUDE.md

Operational guide for AI agents working in the Ensemble codebase. Claude Code auto-loads this file. `AGENTS.md` is a pointer to here for tools that look for it instead.

## Primary References

- **CLAUDE.md** (this file) — operational rules and architectural overview.
- **.claude/skills/DOCTRINE.md** — the work-pipeline doctrine (§1–§9): the GitHub-backed tracker, autonomy/merge rules, gates, commit/branch conventions. The work-loop skills (`/next`, `/cycle`, `/review`, `/intake`, `/unblock`, `/scout`, `/wrap-up`, plus `/dep-update`, `/deploy-test`, `/deploy-prod`) reference it by section.
- **AI_MAP.md** — file-by-file navigation index. Every path in it must exist on disk (enforced by `npm run lint:docs`).
- **docs/README.md** — living documentation index.
- **docs/VISION.md** — product direction and open work.
- **docs/archive/ARCHITECTURE_FOLLOWUPS.md** — archived (May 2026): the TS-migration follow-up tracker, all items shipped. Useful historical context for *why* recent architectural decisions were made.
- **docs/guides/** — deep-dive guides (performance, reference tuning, musical-engine patterns, bundle hygiene, listening-gate tools).

If any guide drifts from live code/config, prefer live and update the docs.

## V2 lives on `main` — read before starting a v2 story

The 2026-09-10 branch-only exception is **retired**. `feat/ensemble-v2-foundation` merged to
`main` on 2026-09-12; v2 work now follows the normal work-loop delivery defaults in DOCTRINE
§5/§6 — branch, PR, auto-merge on green. For v2 work, including its shared-engine and test
companions, first read [`web/CLAUDE.md`](web/CLAUDE.md). This is the common
handoff for Claude, Codex and other agents; no previous conversation or private agent memory
is required.

**The v2 music stand IS the site (cutover #1357).** `ensemble.brndn.zip/` serves the
`web/` Next static export built at `/`, inside the `ensemble-web`
image; the old beta path `/v2/...` is a plain 404 (#1742). A merge to `main`
releases it: the CI `deploy` job publishes no files at all any more — it releases this commit's
`ensemble-web` and `ensemble-api` tags to prod and then test, and asserts each host's public
`/build.json` names the commit. So:

- A story touching **`web/**`** is live at `ensemble.brndn.zip/` on merge, gated by
  the required `v2-checks` context (v2 build + its Playwright suite) alongside `checks` and
  `e2e-tests`. There is no other app beside it; it is the release.
- A PR that **cannot reach the app** skips the Playwright legs, and `v2-checks` reports green
  without them: every changed file is under `docs/`, `tests/`, `band/test/`, `.claude/`, or is a
  `*.md` or a `band/**/*.test.ts` (the `changes` job in `ci.yml` holds the list). Anything else
  runs the suite, and so does every push to `main`. Don't widen that list without proving the
  path reaches neither the export nor the suite.
- A story touching **`core/**`** is live production code on that same merge — the shared
  songbook codecs, engine hooks and state slices very much included, since the v2 export
  compiles `core/`, so `v2-checks` must stay green.
- **Nothing of v1 is read or served.** One chart schema, 2: a schema-1 text chart is refused in
  plain words, never converted (#1740; [the chart contract's Compatibility
  section](docs/design/ensemble-v2-charts.md#compatibility)). v1's browser data is never read
  (#1736), an old `?s=` link is ignored (#1735), and `/v1/` and `/v2/...` are plain 404s
  (#1742). Don't add a compatibility path for any of it back without a decision. The plan that
  got here is archived at [`docs/archive/ensemble-v2-rollout.md`](docs/archive/ensemble-v2-rollout.md);
  its numbered decisions are still cited where they bind.

**One app.** Since #1358 `core/` is not an app: it is the engine/state/songbook library that
`web` imports through the `@core/*` alias (`web/next.config.mjs`). The only
UI is `web/app/` (React, Next static export); don't add UI to `core/`. The
engine/state rules below are about `core/` and bind every caller of it.

## Mandatory Checklist (before any change)

1. **State writes** flow through `dispatch(ACTIONS.TYPE, payload)`. Never mutate state objects directly outside reducers (exception: `// @direct-mutation` in performance-critical engine code). A `document`/`preferences`-classified field (`core/songbook/state-ownership.ts`, a type-checked classification, not a persistence switch) is written **only** by user intent — a UI dispatch or hydration; a runtime system's modulation of it lives in a paired `runtime-derived` sibling field, composed at read time — see `docs/design/write-ownership.md`.
2. **UI updates** belong in `web/app/`. A component never calls `dispatch`/`getState` itself: the engine is reached through `web/lib/runtime.ts`, which is the only v2 file that does.
3. **Tests:** `npm test` (unit/integration) AND the v2 suite (`npm run build --prefix web`, then `npm run test:e2e --prefix web`) before concluding — for a `core/` change too, since the v2 export compiles it.
4. **Refactors:** grep the whole repo (`core/`, `web/`, `api/`, `tests/`, `scripts/`, `docs/`, `.github/`) for usages before renaming or moving anything. Update all imports in the same pass.
5. **Typecheck** is green at the end of every task (`npm run typecheck`).

## Strictly npm-based

`npm install`, `npm run <script>`. Never use `pnpm`, `yarn`, or `bun`. Never create non-`package-lock.json` lockfiles.

## Commands

```bash
npm run lint             # Biome lint + format check
npm run format           # Biome write fixes
npm run lint:docs        # repo-specific docs validation
npm run typecheck        # tsc over core/ and scripts/
npm run typecheck:tests  # tsc over tests/ (its own CI gate — typecheck skips tests/)
npm test                 # mutation check + Biome + docs lint + Vitest (node/happy-dom)
npm run test:vitest      # Vitest only — fast targeted iteration, not the full gate
npm run test:browser     # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
npm run test:sync        # v2 account storage contract in real IndexedDB (Chromium + WebKit)
npm run golden           # golden-render check: do fixed notes still sound the same? (--update / --refreeze)
npm run validate         # format + jscpd + `npm run ci` (typecheck, typecheck:tests, knip, knip:prod, npm test)
npm run depcheck         # circular-import gate (Biome noImportCycles) — RUNTIME cycles only

# The app (web), from the repo root:
npm run dev --prefix web       # Next dev server on http://localhost:3100/
npm run build --prefix web     # root + v2 typecheck (web/app's tests too, #1939), next build, offline.mjs → web/out
npm run test:e2e --prefix web  # v2 Playwright suite against the BUILT export (build first)
```

`npm run depcheck` is the focused circular-import check (`biome lint --only=suspicious/noImportCycles`). The same configured rule runs as part of `npm run lint` and therefore `npm test`; CI does not run the focused command a second time. It catches **runtime cycles only** — `import type` edges are invisible to it, and that is a deliberate 2026-07-24 call (#1234), not an oversight. A type-only cycle erases at compile time and cannot cause the load-order bug this gate exists to prevent. (Verified by mutation test in #1191: a planted runtime cycle exits 1 with 3 diagnostics; a planted type-only cycle exits 0, uncaught.) Biome has no config surface to include type edges, and every TS-aware alternative (madge, dpdm, skott, dependency-cruiser) routes through the TypeScript compiler API and hits the TS7 wall. Don't assume type cycles are covered; don't hand-roll a resolver to catch them.

`npm run knip:prod` lists exports that only tests use. The normal `knip` cannot see them, because it treats test files as entry points, so a function whose last real caller is gone still reads as used. It is a gate (part of `npm run ci`) and its report is empty. An export a test needs but no production code calls carries `/** @internal a test seam: … */` in its doc comment, which is the marker knip's production mode skips (a re-export cannot carry one: point the test at the defining module instead). `core/songbook/state-ownership.ts` is the one unused file by design (a `satisfies`-checked classification nothing imports), so `knip.production.json` leaves it out of the project, and `web/app/test/` and `web/lib/**/test/` are test helpers it leaves out too. A new entry means either a dead export (delete it, and its last test caller) or a seam (tag it); read each one before choosing, since some are live code that a test happens to be the only caller of.

Targeted tests:

```bash
npm run test:vitest -- band-chart                   # Vitest filename/name filter
npm run test:vitest -- band/test/critique.test.ts   # the band's critique claims
npx vitest run band/perform.test.ts -t "specific test name"

# v2 Playwright — from web, after a build; projects are `laptop` and `webkit-phone`
(cd web && npx playwright test checks/band-engine.spec.ts --project=laptop)
```

Local-dev note: the v2 dev server serves at `http://localhost:3100/`, the same base as
production. Offline install and sound-pack downloads only work against the built
export, served by `node scripts/serve.mjs` in `web/` — see `web/README.md`.
There is no local deploy script: a merge to `main` is the release (see above).

Agent-environment note: hosted agent sessions are headless unless audio/display access has been
explicitly verified. Never claim a by-ear check from local execution. For an audible review, use
`/deploy-test` so Brandon can listen to the test build; automated browser-audio guards remain
deterministic evidence, not a substitute for the `Needs-ear` gate.

## Architecture

Ensemble is a browser-based "virtual band" PWA. One app, two layers: the music stand in `web/` (React, Next static export — the only UI) and the library it compiles from `core/` — deep-signal state slices, the Web Audio engine and voices, and the songbook codecs. The band that plays is `band/` (below).

### Runtime bootstrap (`web/lib/runtime.ts`)

One runtime per page, independent of React mounts. `initialize()` seeds the installed sounds, subscribes to dispatches so `handleEffects()` and `syncBand()` (the band host's settings) run on every one, then `rebuild()`s: `flushBuffers()`, gains and reverb sends. No logic worker runs. Play, stop and the exports go through the band host (`lib/band-host.ts`). The React shell (`web/app/ensemble.tsx`) owns documents and hands the runtime authored content; it never writes engine state. v2 opens charts from its own songbook and saves one only when the musician asks; v1's load/save layer (`hydrateState`, `loadFromUrl`, `saveCurrentState`) was deleted in #1424.

### State (`core/state.ts`, `core/state/`)

- Domain slices: `playback`, `arranger`, `groove`, `chords`, `bass`, `soloist` — each a `deepSignal`. A field nothing reads gets removed, not kept as a leftover: the old engine's `conductor` and `vizState` slices, its toast/flash state and its scheduler scratch fields went that way on 2026-10-11. The soloist's per-phrase `session` went the same way. So did the fields live code read but nothing ever set to a new value, together with the branches that waited on them: `playback.step`, `sustainActive`, `heldNotes`, `debugSoloist`, `nextNoteTime` and `unswungNextNoteTime`, the lane `buffer` Maps, and `lastFreq`/`lastPlayedFreq` on bass and soloist. So did the arranger's step maps (`progression`, `totalSteps`, `stepMap`, `sectionMap`) and `ACTIONS.PROG_VALIDATED`, with the old chord parser that wrote them (#1740); `arranger.sections` stays, because the runtime mirrors the score's sections into it for `isInstrumentEverActive`. The tree holds no field that nothing sets. Don't assume a field is live because it is declared: check for a writer.
- **All writes go through `dispatch(ACTIONS.TYPE, payload)`.** Never mutate state directly in components or controllers.
- Hosts read with `getState()` and listen with `subscribe()` (`core/state.ts`). In v2 only `lib/runtime.ts` does either; React state lives in the shell, not in the slices.
- `core/state/state-effects.ts` owns cross-module side effects kept deliberately outside reducers.
- **Write-ownership invariant** (`docs/design/write-ownership.md`): a `document`- or `preferences`-owned field (per `core/songbook/state-ownership.ts`'s `STATE_OWNERSHIP_MANIFEST`: a `satisfies`-checked classification that makes a new state field fail typecheck until it is classified. Nothing reads it at run time, so it does not decide what is saved: a chart stores what `captureContent` captures and the schema-2 codec accepts) is written only by user intent, never by a runtime system (conductor, trade block, worker). Runtime modulation of one lands on a paired `runtime-derived` sibling field and is composed at the read site. No such field is live today: the last, `playback.conductorVelocity`, went with the old engine's conductor (#1437), so the next runtime system to modulate a setting sets the precedent. This is the ownership-domain analogue of `docs/design/timing-model.md`'s one-authority-per-domain law for timing.
#### `@direct-mutation` policy

`// @direct-mutation` is a sanctioned escape hatch. Use it only in these categories:

- **Sanctioned (real-time hot paths):** the `synth-*.ts` family — direct audio param writes for synthesis. No site outside the engine dir is sanctioned today: the BPM reschedule in `app-controller.ts` and `flushBuffer()`'s voice-continuity writes were deleted with the state they wrote.
- **Sanctioned exception (init-only):** `core/engine/engine.ts` `initAudio()`, `core/engine/audio-recovery.ts` — one-shot audio-graph setup that runs before any dispatch subscriber exists.
- **Sanctioned exception (detached render clone):** the clone `web/lib/band-export.ts`'s `renderBandPasses` renders from (written by it and by the render bridge's `prepare` hook). These write a throwaway copy of the state tree for an offline render — dispatching would write the *live* slices and corrupt the running app mid-export.
- **Everything else routes through reducers.** Any site not in the three categories above must dispatch.

Enforced by `npm run check-mutations` over `core/**/*.{ts,tsx}` — it catches the bare, cast (`(slice as Mutable<…>).f =`), and aliased-handle assignment idioms, treating a `@direct-mutation` marker anywhere in the statement as the exemption. The skip list is **content-based, not path-based**: a file is exempt only if it *declares* a slice (contains `deepSignal<`), plus `*reducer*` by name. That deliberately keeps the non-slice plumbing that lives alongside the slices (`state/state-effects.ts`) inside the guard — a blanket `state/` path skip would exempt them the moment they moved into that directory. Two known limits: **`scripts/` is not in scope** (it has its own unmigrated sites), and **array-method mutation is invisible** to an assignment-based guard (`arr.push/shift/pop` on a slice field is unmarked and unenforced; `state/history.ts`, the one known site, was deleted).

`// @worker-mutation` was the sibling marker for the old engine's worker copy of the tree. No worker runs any more (#1404), and the check no longer accepts it.

### The band engine (`band/`) — the only engine since 2026-09-26

Every page plays the ground-up band engine: `band/` is a pure, deterministic `performPass` over the
score's timeline, driven live by `web/lib/band-host.ts` and exported through the same
event stream (`.mid`, WAV). Read `band/CLAUDE.md` and `docs/design/band-engine.md` before touching
it. The old worker-based generator is gone (#1404): `core/engine` now holds the voices, sample
packs and audio graph the band plays through. A chart is one schema, 2
(`core/songbook/document-v2.ts`), its music a score; the old text-chart parser is gone (#1740).

The listening-gate tools (`npm run mix:report` and `mix:ab`/`mix:verify`/`mix:spectro`/`mix:plant`
built on it) render the band engine: `scripts/band-scene.ts` composes each scene in node
(`compileTimeline` → `performPass`), and `web/lib/render-bridge.ts`'s `renderBand`
renders the events through `renderBandPasses` (`lib/band-export.ts`, the export's own offline
render). By default (`--engine=node`, since 2026-10-09) that runs in node on `node-web-audio-api`
with `scripts/node-webaudio.ts` standing in for the browser — no build, no browser.
`--engine=chromium` renders in the app instead, on `window.ensemble`: the v2 runtime installs the
bridge only in a build made with `NEXT_PUBLIC_RENDER_BRIDGE=1`, which `mix:report` then makes for
itself; a production build compiles it out. See `docs/guides/listening-gate-tools.md`.

`npm run golden` is the one of them CI runs on every PR (#1577): it renders four frozen band
requests in node and compares each stem's fingerprint with
`tests/golden/fixtures/fingerprints.json`. A change to a voice, bus, pack or the master chain
turns it red; a change to what the band plays does not, because the notes are frozen (a
change to how a score becomes time still does: `--refreeze`). If you meant to change
the sound, run `npm run golden -- --update` and commit the fingerprints with the change — it
is evidence for the `Needs-ear` stop, never a substitute for it.

There is no visualizer, and no state for one.

### UI (`web/app/`)

The music stand: songbook home, chart sheet (edited in place: bars typed on the chart with their bar menu, a section from its letter, the whole song from the Song menu — #1726), transport and sounds panel. Ownership and boundaries per surface are in `web/CLAUDE.md`'s navigation table — read it before a UI story.

### Data / Config split

- Musical behavior: the band engine's styles, `band/styles/` (one file per genre)
- Styles live beside the components in `web/app/` (`style.css` plus per-surface `.css` files). `core/` holds no CSS.

**Layering (documented, deliberately not gated).** The UI should reach the engine through `web/lib/runtime.ts`, data/config modules and state, not by importing generative engine internals; engine modules should receive state via parameters or specific slices rather than importing the global state manager. Both were once `dependency-cruiser` rules, but at `severity: 'warn'` they never failed a build, and a 2026-07-24 measurement found only 8 sites — 7 of which are legitimate registry/policy lookups that merely live under `engine/` (`instrument-registry`, `soloist-mode-policy`, `pack-runtime`, `sample-voice`, `arc`, `note-spelling`) plus the old scheduler's sanctioned real-time state import (both since deleted with the old engine). Enforcing the rule as written would flag mostly-correct code, so it stays prose (#1232). **If you ever want a real gate, narrow "engine" to generative modules first** — that redefinition is the actual work, not the checker.

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

- **Supported-genre canon (the 13):** `Rock`, `Jazz`, `Funk`, `Disco`, `Hip Hop`, `Blues`, `Neo-Soul`, `Reggae`, `Acoustic`, `Bossa`, `Country`, `Metal`, `Ska-Punk`. This is the matrix's column axis and the **exact set the UI exposes** — the genre picker (`web/app/transport-bar.tsx`, via `lib/runtime.ts`'s re-export) renders straight over `GENRE_NAMES` (= `Object.keys(GENRE_OVERRIDES)` in `core/data/smart-genres.ts`), so there's no config-vs-UI drift. Pinned by `tests/standards/genre-canon-guard.test.ts`. **Don't add a 14th genre or resurrect a retired one without updating the canon + that guard.** The phantom routing keys (`Shred`, `Latin`, `Afrobeat`, `Soul`) that once lingered in the old engine's routing maps are retired. Don't reintroduce them.
- One canonical internal name per concept. UI labels can be friendlier, but state keys, config keys, persisted payloads, and code paths normalize to the canonical form.
- Aliases live near the data/config that owns the concept — don't scatter alias checks across components, tests, docs, and controllers.
- Before any rename: grep the entire repo (`core/`, `web/`, `api/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every usage. Update code, tests, persistence, sharing, docs, and allowlists in the same pass.
- A rename that touches a field saved charts or `#chart=` links carry needs a decision on stored data: the chart codec is strict, so a chart still holding the old name stops opening.
- Split labels from logic: display labels in UI/data layer, behavior keys in engine/config layer. A pretty label should not silently become a runtime enum unless that is the intended canonical key.
- Known alias family: `Neo-Soul`/`Neo` — the live pairing, in `GENRE_OVERRIDES` (`core/data/smart-genres.ts`). Add new aliases to that same map instead of creating one-off fixes. **`Rock`/`Shred` is NOT a live alias** — `Shred` is a retired phantom key (see the canon bullet above) with no alias map anywhere in `core/`; don't resurrect the pairing.

### TypeScript

All `core/` source is `.ts`/`.tsx` (migration complete May 2026). `tsconfig.json` has `strict: true` and `moduleResolution: "Bundler"` — import specifiers can keep `.js`/`.jsx` suffixes; the resolver finds the `.ts`/`.tsx` source. Use global interfaces in `core/types.ts` (`EnsembleState`, `ArrangerState`, etc.). Run `npm run typecheck` before concluding any task.

## Testing Standards

### Critique claims (`band/test/`)

The **Definition of Done** for musicality. Each style's claims (`band/test/claims/<style>.ts`) are statistical ranges the critique harness measures (`band/test/critique.test.ts`); the invariant suite (in `band/test/`) holds every style to the band's laws. When you change a style or a player, run them — never replace a range with a rigid snapshot. `band/CLAUDE.md` has the details. The old engine's critique suite in `tests/standards/` went with it; what remains there are the genre canon guard and the security ledger.

### Vitest (logic / unit / integration)

`describe`, `it`, `expect` are global. Use `vi.mock()` to isolate dependencies (especially global state or browser APIs). If you intentionally change musical behavior, update test expectations — do not leave tests failing.

### Playwright (e2e) — the v2 suite

The only Playwright suite is the app's: `web/checks/`, config in `web/playwright.config.ts`, run by the required `v2-checks` CI context. Two projects: **`laptop`** (Desktop Chrome) and **`webkit-phone`** (iPhone 13, WebKit); `*.chromium.spec.ts` specs (passkeys via a CDP virtual authenticator) are Chromium-only. It runs against the **built static export** (`checks/fixtures.ts` starts a preview server per worker), not the dev server — build first, or it tests a stale export. Functional checks, no pixel snapshots. `web/CLAUDE.md` § Verification has the full gate list.

### Vitest browser mode (`tests/browser/`)

The few engine tests that need a **real `OfflineAudioContext`** (reverb-tail decay, reverb stability) run here — headless Chromium via `@vitest/browser-playwright`, config in `vitest.browser.config.ts`, command `npm run test:browser`. Node-mode `npm test` (happy-dom) has no Web Audio, so these can't live there. Not folded into `npm run ci` (the `checks` job installs no browser); the CI `e2e-tests` job runs them, with `npm run test:sync`.

### Biome

4-space indent, single quotes, 100-char line width. Run `npm run format` before finishing.

## Commit & PR Conventions

Conventional Commit style, scoped where useful: `feat(soloist): ...`, `fix(ts): ...`, `chore(deps): ...`, `refactor(mobile): ...`. Keep commits focused. PRs should include a short summary, test commands run, linked issues if applicable, and screenshots/recordings for UI changes. Commit-message and PR-body trailers, branch policy, and `git add`-explicit-paths rules live in **DOCTRINE §8/§9**.

## Work Pipeline (GitHub-backed)

Scheduled work is tracked in **GitHub issues** on `brndnsh-labs/Ensemble` (public), routed by **labels** — **not** in markdown. A story = an issue (body holds Why/Touches/Acceptance); milestones = epics; a **closed issue is done**. All routing is labels, one namespace per dimension: `status:*` (loop state, exactly one at a time), `track:*`, `lens:*`, plus `size/*`, `model/*`, `agent/*` and `area:*` — every one of them read off `gh issue list --json labels` in a single call. The `docs/audit/` and `docs/synth-audit/` trees are a **frozen archive** of the markdown-tracked cycles — historical context, not the live tracker. The full rules are in **`.claude/skills/DOCTRINE.md`** (command-level tracker mechanics in its §7); the tracker is driven by `gh` alone. Run the pipeline with the work-loop skills (`/next`, `/cycle`, `/intake`, `/unblock`, `/scout`, `/wrap-up`, …). Forgejo (`git.brndn.zip`) is now a read-only pull mirror.

**Issue numbers `#N` are continuous up to #935.** Ensemble started on GitHub, moved to Forgejo in 2026-07 — where the counter *continued* rather than restarting — and came back on 2026-08-04 via a repo transfer that kept all 224 issues and 710 PRs at their original numbers. So a bare `#N` in an old commit or doc resolves correctly for **N ≤ 935**. Only the Forgejo-only window (#936–#1355) is renumbered; that map lives in homelab-maintenance `migration-maps/Ensemble-issue-map.tsv`. Only the **8 issues still open** at migration carried over to GitHub — those are the map's rows. Everything **closed** in that window stayed behind, readable in the read-only archive repo `git.brndn.zip/brandon/Ensemble-archive` (private + archived; `brandon/Ensemble` itself is now a pull mirror with its issue tracker disabled, so look in `-archive`, not there). So an unmapped `#N` in 936–1355 is archive provenance, not a live GitHub link.

**Autonomy posture (DOCTRINE §5/§6):** the pipeline runs **full-auto** — well-specified, gate-verifiable, non-destructive stories build → branch → PR → **auto-merge to `main`** (CI-gated, via `gh pr merge --auto --squash` — GitHub holds the merge until the required `checks`, `e2e-tests` and `v2-checks` contexts pass; no client-side polling) without a per-step nod. It **stops and surfaces** on a judgment call: a **synth or by-ear** story (the listening gate is a hard human stop → `Needs-ear`), a destructive data op (persisted sessions / share-URL schema / preset data / state migration), a state-contract design call, a P0 finding, or a genuinely ambiguous choice. A merge to `main` **is** a prod deploy: `main` is continuously deployed to `ensemble.brndn.zip` by the CI `deploy` job once those three contexts and the two image builds pass on the merged commit (DOCTRINE §6). Because `Needs-ear`/synth work is a *pre-merge* stop, nothing un-auditioned ships. Since the cutover (#1357) a deploy is a container-tag release, so the break-glass path is a re-run of that job (`workflow_dispatch` on `main`) and an immediate rollback is the previous `ensemble-web` tag on the box. The normal correction is still roll-forward via `git revert` → PR.

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
- **Prototype guard on `TABLE[untrusted]` (Forgejo-era #1266 — archive provenance, *not* GitHub #1266, which is an unrelated v2 story; code comments citing `#1266` mean this rule) — pick by consumer count, not taste.** A lookup table indexed by a persisted/share-URL value must not be a plain literal: `TABLE['constructor']` returns the `Object` constructor, a truthy hit that sails past `|| fallback` and is then read as config. **Null-prototype the declaration** (`Object.assign(Object.create(null), {…})`, or `Object.create(null)` as a `reduce` seed) when the table has many `|| fallback` consumers — `TIME_SIGNATURES`, the `smart-genres.ts` feel tables. **`Object.hasOwn` at the guard** when the table is read in one place — the runtime's `STYLE_FOR_GENRE` lookup. (Don't add new `Object.prototype.hasOwnProperty.call` guards.) **A null prototype on a STATE SLICE field is not available** — a reducer that re-creates the field with a plain `{}` drops it too; deepsignal also refuses to proxy a null-prototype object (`SUPPORTED.has(value.constructor)`), silently costing nested reactivity. For slice data, reject the bad KEY at the reader and type-check the VALUE at each read instead. Best of all, validate at the reader so nothing downstream is untrusted; every reader of one value must use the *same* predicate.

## Active Product Direction

See `docs/VISION.md` for current priorities and open work.
