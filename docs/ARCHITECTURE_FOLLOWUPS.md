# Architecture Follow-Ups

Observations gathered during the TypeScript migration (May 2026). Not emergencies — the codebase is in good shape — but each represents a meaningful improvement worth pursuing.

## High Impact

### 1. Canonical `Chord` type

Across `chords-engine`, `accompaniment`, `bass-engine`, `harmonies`, `soloist`, `tick-logic`: `chord` is sometimes a string (`"Cmaj7"`), sometimes a parsed object, sometimes an object with fields tacked on (`sectionId`, `keyIsMinor`, `localIndex`). Almost every engine file casts it through `any`. A canonical `Chord` discriminated union with a single parse boundary would eliminate dozens of casts and tighten engine APIs. Same pattern at smaller scale for `coordination` and `tsConfig`.

### 2. Circular dependencies

`npm run depcheck` reports ~20 cycle warnings. The worst: `conductor → form-analysis → state → scheduler-core → conductor`. They don't crash because of module hoisting, but they make init order fragile and constrain how modules can split. Worth breaking at least the `state` ↔ `scheduler-core` cycle.

### 3. Build pipeline robustness

Custom bash + sed + esbuild works but is brittle — the `sw.ts` placeholder bug surfaced this during Phase 8. Replacing the two deploy shell scripts (`scripts/deploy-test.sh` and `scripts/deploy-prod.sh`) with a ~100-line TypeScript build script using esbuild's API + metafile would be more robust, testable, and would make the precache asset list strongly typed instead of a string list assembled by `sed`. Also: `npm run dev` lacks HMR — every change requires a full rebuild. Migrating to Vite (which Vitest already uses) would also be a quality-of-life win.

## Medium Impact

### 4. Soloist subsystem complexity

~7,000 lines across 7 files (`soloist`, `soloist-config`, `soloist-devices`, `soloist-pitch-engine`, `soloist-rhythm-engine`, `soloist-seeder`, `synth-soloist`). Session-state objects are described as "sprawling" — there's a real domain model in there (SRDC, Dynamic Head, intent, register profiles) expressed via dynamically-grown plain objects. A typed `SoloistSession` object with explicit phases would unlock simplifications across the system.

### 5. `@direct-mutation` escape hatch

25+ direct mutations in `scheduler-core` alone. The "all writes go through dispatch" rule has a big asterisk, and `check-mutations.js` now only scans `components/*.tsx` after the TS migration. Two ways forward: lean in (mark state slices `readonly` except where `@direct-mutation` annotates, enforced via `tsc`), or refactor the hottest paths to a typed mutation API.

### 6. Tests still in `.test.js`

All 234 test files are JS. Now that production source is fully TS, converting tests would catch type drift in test fixtures and shared utilities, and stress-test whether production types are actually usable from outside. Low-risk, measurable type-safety win.

## Lower Impact / Smaller Cleanups

### 7. Discriminated `dispatch` action types

`dispatch` is typed `(action: any, payload?: any)`. A discriminated union keyed on `ACTIONS` would give exhaustiveness checking in reducers and IntelliSense on payloads.

### 8. Web Audio types reference

A central `/// <reference lib="dom" />` (or just relying on tsconfig's default lib) would make Web Audio type availability explicit rather than implicit across many files.

### 9. Coverage scope sanity-check

`vitest.config.js` `coverage.include` was scanning only the old `.js` glob for most of the migration — coverage reports were ~empty. Fixed in the migration cleanup commit, but worth a second look at the include/exclude globs to confirm the desired report granularity.

## Notes

None of these are emergencies. The codebase has strong test coverage, real critique tests for musicality, clean state architecture, an intentional worker split, and now a completed TS migration. The most impactful next investment is **tightening domain types** (chord, session, coordination) because the benefit ripples out across every downstream module.
