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

---

## 1. Break the worst circular dependency: `state` ↔ `scheduler-core`

**Why first:** Small, contained, and unblocks cleaner module boundaries elsewhere. Doing this before #2 (Chord type) means the chord refactor doesn't have to navigate cycles.

`npm run depcheck` reports ~20 cycle warnings. The worst is `conductor → form-analysis → state → scheduler-core → conductor`. The cycles don't crash (module hoisting saves them) but they make init order fragile and constrain how modules can split.

Most likely cut: extract the small piece of `state.ts` that `scheduler-core.ts` imports into a low-level module both can depend on without re-entering the cycle. Re-run `npm run depcheck` to confirm the warning count drops.

**Approach:** Opus end-to-end. Single-author work — the cycles are interconnected and benefit from one consistent mental model. No parallelization win here.

---

## 2. Canonical `Chord` type

**Why second:** Single biggest source of `any` debt; the benefit ripples across every engine. Doing this after #1 means a cleaner dependency graph to work in; doing it before #4 (soloist refactor) means the soloist work inherits the tighter types.

Across `chords-engine`, `accompaniment`, `bass-engine`, `harmonies`, `soloist`, `tick-logic`: `chord` is sometimes a string (`"Cmaj7"`), sometimes a parsed object, sometimes an object with fields tacked on (`sectionId`, `keyIsMinor`, `localIndex`). Almost every engine file casts through `any`. A canonical `Chord` discriminated union with a single parse boundary would eliminate dozens of casts and tighten engine APIs. Same pattern at smaller scale for `coordination` and `tsConfig`.

**Approach:** Opus designs the discriminated union and picks the parse boundary (likely `chords-engine.ts` or a new `chord-type.ts`). Then 4–6 Sonnet subagents in parallel, one per major consuming module (`accompaniment`, `bass-engine`, `harmonies`, `soloist`, `tick-logic`, `scheduler-core`). Each replaces `any` casts with the new type. Main thread runs `npm run typecheck` between batches and commits per-engine.

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

## 5. Build pipeline rewrite — and consider Vite

**Why fifth:** Independent quality-of-life improvement. The current deploy scripts work; this is hygiene plus a possible HMR upgrade.

Custom bash + sed + esbuild works but is brittle — the `sw.ts` placeholder bug surfaced this during Phase 8. Replacing the two deploy shell scripts (`scripts/deploy-test.sh` and `scripts/deploy-prod.sh`) with a ~100-line TypeScript build script using esbuild's API + metafile would be more robust, testable, and would make the precache asset list strongly typed instead of a string list assembled by `sed`. Also: `npm run dev` lacks HMR — every change requires a full rebuild. Migrating to Vite (which Vitest already uses) would be a quality-of-life win.

**Approach:** Two flavors depending on appetite.

- **Small win:** Sonnet ports the existing bash logic to a TS build script using esbuild's API and metafile.
- **Bigger investment:** Migrate to Vite for HMR + toolchain alignment with Vitest. Opus should evaluate the migration cost (custom esbuild flags, deploy hashing, service worker compile) vs. benefit before committing; if go, Sonnet executes with Opus reviewing.

---

## 6. Discriminated `dispatch` action types

**Why sixth:** Lower impact than the previous items; it's a nice ergonomics win that doesn't unblock anything.

`dispatch` is typed `(action: any, payload?: any)`. A discriminated union keyed on `ACTIONS` would give exhaustiveness checking in reducers and proper IntelliSense on payloads.

**Approach:** Opus defines `ActionPayloadMap` over the ~50+ actions and picks the dispatch signature (overloaded vs. generic). Sonnet then applies the typed signature across reducers and dispatch call sites in parallel batches grouped by state slice.

---

## 7. `@direct-mutation` tightening

**Why seventh:** Low-stakes hardening. The current discipline is documented via comments; this enforces it at the type level.

25+ direct mutations in `scheduler-core` alone. The "all writes go through dispatch" rule has a big asterisk, and `check-mutations.js` now only scans `components/*.tsx` after the TS migration. Two ways forward: lean in (mark state slices `readonly` except where `@direct-mutation` annotates, enforced via `tsc`), or refactor the hottest paths to a typed mutation API.

**Approach:** Opus picks the strategy — readonly types is the smaller, safer diff. Sonnet applies the chosen approach across state slices and engine files in parallel.

---

## 8. Web Audio types reference

**Why now (or whenever):** Trivial. Just makes type availability explicit.

A central `/// <reference lib="dom" />` (or just relying on tsconfig's default lib) would make Web Audio type availability explicit rather than implicit across many files.

**Approach:** Haiku. One-line tsconfig or reference comment. Five minutes.

---

## 9. Coverage scope sanity-check

**Why now (or whenever):** Trivial. Verify what the coverage glob actually captures.

`vitest.config.js` `coverage.include` was scanning only the old `.js` glob for most of the migration — coverage reports were ~empty. Fixed in the migration cleanup commit, but worth a second look at the include/exclude globs to confirm the desired report granularity.

**Approach:** Haiku. Read `vitest.config.js`, run `npx vitest run --coverage`, inspect the HTML report, adjust globs if anything looks off.

---

## Notes

None of these are emergencies. The codebase has strong test coverage, real critique tests for musicality, clean state architecture, an intentional worker split, and now a completed TS migration. The biggest single-investment payback is #2 (Chord type) — it ripples out across every engine and pays back across every downstream module.
