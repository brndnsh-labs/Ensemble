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

Done in commit `522aaa82`. `form-analysis.ts` no longer imports `state.ts` (only the `ArrangerState` type). `analyzeForm` takes the arranger as a parameter; the four callers (main, arranger-controller, conductor, midi-worker-logic) pass it from their existing state references. The named cycle `conductor → form-analysis → state → scheduler-core → conductor` is gone. Depcheck warning count dropped from 20 → 19; the remaining cycles all involve `state.ts` ↔ `scheduler-core.ts` directly and are smaller in scope. **Open follow-up:** sweep the remaining 19 cycles when there's appetite — none are individually as load-bearing as the form-analysis one.

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

## 5. Build pipeline rewrite — and consider Vite

**Why fifth:** Independent quality-of-life improvement. The current deploy scripts work; this is hygiene plus a possible HMR upgrade.

Custom bash + sed + esbuild works but is brittle — the `sw.ts` placeholder bug surfaced this during Phase 8. Replacing the two deploy shell scripts (`scripts/deploy-test.sh` and `scripts/deploy-prod.sh`) with a ~100-line TypeScript build script using esbuild's API + metafile would be more robust, testable, and would make the precache asset list strongly typed instead of a string list assembled by `sed`. Also: `npm run dev` lacks HMR — every change requires a full rebuild. Migrating to Vite (which Vitest already uses) would be a quality-of-life win.

**Approach:** Two flavors depending on appetite.

- **Small win:** Sonnet ports the existing bash logic to a TS build script using esbuild's API and metafile.
- **Bigger investment:** Migrate to Vite for HMR + toolchain alignment with Vitest. Opus should evaluate the migration cost (custom esbuild flags, deploy hashing, service worker compile) vs. benefit before committing; if go, Sonnet executes with Opus reviewing.

---

## 6. Discriminated `dispatch` action types 🟡 PARTIAL

**Done so far:** `ActionPayloadMap` exists in `types.ts` covering all 51 actions, plus 14 distinct `ActionPayload*` interfaces and 3 `ActionPayloadUpdate*` type aliases. `dispatch` in `state.ts:253` has a typed generic overload `<T extends keyof ActionPayloadMap>(action: T, payload: ActionPayloadMap[T])` so call sites get IntelliSense on payloads. A loose `(action: string, payload?: any)` overload remains as a fallback.

**Still open:** Reducers (the per-slice files under `public/state/`) all still take `(action: string, payload?: any)` — no exhaustiveness check at the switch level. To finish, retype each reducer to discriminate on `ActionPayloadMap` keys (or convert the per-slice subsets to their own union) so missing cases fail `tsc`. Sonnet per-slice job once Opus picks the pattern.

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

## 9. Coverage scope sanity-check ✅ DONE (May 2026)

`vitest.config.ts` now has `coverage.include: ['public/**/*.{ts,tsx}']` (TS-only glob) with appropriate excludes for `components/**`, `data/**`, `sw.ts`, `main.ts`, `ui-root.tsx`, `App.tsx`. The original `.js`-only glob that produced empty reports is gone. **Open follow-up if curious:** run `npx vitest run --coverage` and inspect the HTML report to confirm the chosen excludes still match intent — but no known issue.

---

## Notes

None of these are emergencies. The codebase has strong test coverage, real critique tests for musicality, clean state architecture, an intentional worker split, and now a completed TS migration. The biggest single-investment payback is #2 (Chord type) — it ripples out across every engine and pays back across every downstream module.
