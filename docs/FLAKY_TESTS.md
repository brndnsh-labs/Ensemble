# Flaky-test registry

A living record of every test in this repo that has been observed to pass and
fail on the **same code**. Ensemble is unusually flake-prone by nature: the
generative engines lean on randomness, the critique suite asserts *statistical*
ranges, and the e2e suite drives a live Vite dev server. This file is where we
track each flake, its root-cause class, and its fix so we don't re-diagnose the
same thing twice.

Use the [`/flake`](../.claude/skills/flake/SKILL.md) skill to diagnose a new
flake (measure its fail-rate, classify it, and append an entry here).

## The three flake classes in this app

| Class | Smell | Where it lives | Canonical fix |
|---|---|---|---|
| **Unseeded-statistical** | Passes alone, passes in suite, fails ~1-in-N on an unlucky roll. A critique test asserts a bound the engine's raw `Math.random` occasionally crosses. | `tests/standards/*-critique.test.ts` | Seed the RNG with `installSeededRandom()` (`tests/utils/seeded-random.ts`) at the `describe` level — the house pattern. Makes the multi-bar sample reproducible while still asserting a real range. Widening the bound is the band-aid; seeding is the fix. |
| **Ordering-dependent** | Passes alone, fails only inside a multi-file run (`vitest related`, full suite). A prior file leaked global state (an un-restored `Math.random` spy, a live `deepSignal`, a `vi.mock` that didn't reset). | anywhere | Find the leaking file's missing `vi.restoreAllMocks()` / `afterEach` cleanup. `installSeededRandom` already restores in `before`+`after`, so converting both files to it usually fixes the leak too. |
| **e2e-timing** | Playwright hydration-wait timeouts under parallel workers, or a whole-run crash from a bad import. | `tests/e2e/*.spec.ts` | Cold-compile timeouts → `globalSetup` warm-up + the centralized `gotoHydrated` helper (NOT `vite preview` — it breaks the reverb-stability runtime `.ts` import). Import crashes → `@playwright/test` is CJS; use the default import only (`import pkg; const { chromium } = pkg`). |

## How to read the registry

- **Status** is one of: `🔴 open` (reproducing, no fix yet), `🟡 quarantined` (known-flaky, retry-on-fail or `.skip`'d pending a fix), `🟢 fixed` (root-caused and patched; kept here as a reference so the same symptom isn't re-diagnosed).
- **Last seen** is when the flake last actually failed (not when the entry was edited).

## Registry

### 🟢 `tests/standards/rock-bass-critique.test.ts` — "chromatic leading tones on beat-4 push-points"

- **Class:** unseeded-statistical
- **Symptom:** `expect(chromaticHits).toBeLessThan(anticipationHits * 0.4)` failed at `12 < 10.4`. Passed the full suite + 3/3 standalone; surfaced once under a `vitest related` pre-commit batch.
- **Root cause:** the bass engine's chromatic-vs-root-anticipation push-point choice draws raw `Math.random`; across a 192-bar sample the chromatic count has enough binomial variance to occasionally cross the (deliberately tight) `0.4` ceiling. Not an ordering leak — pure unlucky roll.
- **Fix:** `installSeededRandom()` at the `describe` level (commit on 2026-05-30). With the default mulberry32 seed the sample is now `chromatic=3, anticipation=28` (`3 < 11.2`, comfortable margin) every run — deterministic, still a representative statistical draw.
- **Last seen:** 2026-05-30 (pre-commit hook, since fixed).

### 🟢 `tests/standards/hiphop-bass-critique.test.ts` — "chord-boundary slides at high intensity (frequent chord changes)"

- **Class:** unseeded-statistical
- **Symptom:** `expect(slideRate).toBeGreaterThan(0.3)` failed at `0.2903 > 0.3` (9/31 boundaries slid). Passed 5/5 standalone locally; surfaced on a post-merge CI run on `main`.
- **Root cause:** the 808-slide gate fires `Math.random() < 0.55` independently per chord boundary (n=31 trials at intensity 0.75). The slide-rate is therefore an unseeded binomial centered ~0.5 that ranged 32–65% across 8 standalone runs — wide enough to occasionally dip below the deliberately-low 0.30 floor. Not an ordering leak; pure unlucky roll. (`BASS_SPACE_FEELS` / #554 ruled out — it doesn't reach the bass engine.)
- **Fix:** `installSeededRandom()` at the `describe` level (replaces the redundant `beforeEach(vi.restoreAllMocks)`; 2026-06-20). With the default mulberry32 seed the draw is now `20/31 = 64.5%` every run (margin 0.345 above the floor, 0.205 below the 0.85 ceiling) — deterministic, still a representative draw. Full file 7/7 and the `standards/` batch 968/968 green.
- **Last seen:** 2026-06-20 (post-merge CI on main, since fixed).

### 🟢 `tests/e2e/harmony-click-free.spec.ts` — "worst sample step must stay below half peak"

- **Class:** unseeded-statistical (the e2e variant — unseeded `Math.random` inside `page.evaluate`, not a critique test).
- **Symptom:** `expect(metrics.maxStep).toBeLessThan(metrics.maxAbs * 0.5)` failed intermittently (failed the full e2e run of #533, #650, and #668; green on most re-runs). Same `@diagnostic` render every time; `maxStep`/`maxAbs` varied run-to-run.
- **Root cause:** the harmony voice's per-note panning + timbre jitter draw unseeded `Math.random()`, so the offline render's `maxStep`/`maxAbs` varied each run. Worse, the `0.5×maxAbs` bound was calibrated against a couple of *lucky* unseeded renders — the legitimate worst step (sawtooth slew + constructive overlap of the stacked stab voices) actually reaches ~0.60×peak, *above* the 0.5 line. So the bound sat below real content and tripped on any unlucky roll.
- **Fix (2026-06-22, #654):** both halves of the canonical fix. (1) Seed the render — a mulberry32 `Math.random` stub at the top of the `page.evaluate` callback (before importing the voice), the in-page analogue of `installSeededRandom`. Render is now exactly `maxStep=0.7523, maxAbs=1.2598` every run. (2) Re-anchor the threshold to the real failure boundary: legit content ~0.60×peak, a true full-scale hard-stop ~1.0×peak → `0.7×maxAbs` clears content (margin ~0.10) while still failing a full-scale discontinuity (margin ~0.30). The guard's intent (catch NaN + gross full-scale jumps; the fine click mechanism is unit-asserted in `harmonies-synthesis.test.ts`) is unchanged.
- **Last seen:** 2026-06-22 (CI on PR #668, since fixed).

### 🟢 e2e hydration-wait timeouts (dev-server cold compile)

- **Class:** e2e-timing
- **Symptom:** Playwright specs intermittently time out waiting for hydration under parallel workers.
- **Root cause:** Vite's dev server compiles routes on-demand; the first worker to hit a cold route eats the compile latency and blows the hydration wait.
- **Fix:** `globalSetup` warm-up that pre-compiles before the workers fan out, plus a centralized `gotoHydrated` helper. Do **not** switch to `vite preview` — it breaks the reverb-stability spec's runtime `.ts` import.
- **Last seen:** 2026-05-29 (fixed).

### 🟢 Playwright run-wide crash (CJS import)

- **Class:** e2e-timing (import)
- **Symptom:** the entire Playwright run crashes with a `SyntaxError`, presenting as "flaky e2e."
- **Root cause:** `@playwright/test` is CommonJS. Under Playwright's loader with `type: module`, a **named** import SyntaxError-crashes the whole run and a **namespace** import resolves `undefined` at runtime.
- **Fix:** default import only — `import pkg from '@playwright/test'; const { chromium } = pkg;` (globalSetup, 2026-05-29).
- **Last seen:** 2026-05-29 (fixed).

## Adding an entry

When you hit a flake, run `/flake <test-path>` — it measures the fail-rate,
classifies it against the table above, applies the canonical fix, and appends
the entry here. If you're recording one by hand, match the heading format above
(`### <status-emoji> <test path or short name> — "<failing assertion>"`) and
fill all five fields (class, symptom, root cause, fix, last seen).
