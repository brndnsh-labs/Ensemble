# Flaky-test registry

A living record of every test in this repo that has been observed to pass and
fail on the **same code**. Ensemble is unusually flake-prone by nature: the
generative engines lean on randomness, the critique suite asserts *statistical*
ranges, and the e2e suite drives a live browser. This file is where we
track each flake, its root-cause class, and its fix so we don't re-diagnose the
same thing twice.

Use the [`/flake`](../.claude/skills/flake/SKILL.md) skill to diagnose a new
flake (measure its fail-rate, classify it, and append an entry here).

## The flake classes in this app

| Class | Smell | Where it lives | Canonical fix |
|---|---|---|---|
| **Unseeded-statistical** | Passes alone, passes in suite, fails ~1-in-N on an unlucky roll. A critique test asserts a bound the engine's raw `Math.random` occasionally crosses. | `tests/standards/*-critique.test.ts` | Seed the RNG with `installSeededRandom()` (`tests/utils/seeded-random.ts`) at the `describe` level — the house pattern. Makes the multi-bar sample reproducible while still asserting a real range. Widening the bound is the band-aid; seeding is the fix. |
| **Ordering-dependent** | Passes alone, fails only inside a multi-file run (`vitest related`, full suite). A prior file leaked global state (an un-restored `Math.random` spy, a live `deepSignal`, a `vi.mock` that didn't reset). | anywhere | Find the leaking file's missing `vi.restoreAllMocks()` / `afterEach` cleanup. `installSeededRandom` already restores in `before`+`after`, so converting both files to it usually fixes the leak too. |
| **e2e-timing** | Playwright hydration-wait timeouts under parallel workers, or a whole-run crash from a bad import. | `tests/e2e/*.spec.ts` | Cold-compile timeouts → **retired at the root (#1096)**: the suite runs against a prebuilt `vite preview` bundle, so there is no on-demand dev-server compile to time out (the old `globalSetup` warm-up is gone; the `gotoHydrated` hydration wait remains). Import crashes → `@playwright/test` is CJS; use the default import only (`import pkg; const { chromium } = pkg`). |
| **slow-legitimate** | Passes alone on an idle box, reddens a full/CI run under load. Fails with vitest's *"test timed out"*, **not** a failed assertion — and the reported duration sits just over `testTimeout`. The work is real (a production-faithful multi-seed engine sweep), not a hang. | `tests/standards/*-critique.test.ts` | Raise the timeout at the **tightest scope that covers it** — per-test `it('...', { timeout: 60_000 }, () => {...})`, or per-file if several tests are near the line. **Never raise the global `testTimeout` in `vitest.config.ts`** (masks genuine hangs everywhere) and **never trim the sample or loosen an assertion** to buy speed — that's harness-silencing, the #1 critique-test smell. Mutation-test the knob (set it to `100`, confirm red) so you know it's honored and correctly scoped. |

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

### 🟢 `tests/standards/soloist-cry-critique.test.ts` — "fires sparingly on sustained blues landings, targeting a chord tone"

- **Class:** slow-legitimate (timing — *not* unseeded-statistical; the assertions here are seeded and deterministic).
- **Symptom:** vitest `Test timed out in 30000ms` on the one test, reddening a full `npm test` / CI run on **any** branch, ~intermittently and unrelated to the diff under test. No assertion ever failed — the cry counts are stable run-to-run.
- **Root cause:** legitimate runtime sitting too close to the global 30s `testTimeout`, with no headroom for machine load. The test is production-faithful by design: it drives the real `generateSessionSeed` + live `getSoloistNotePhraseFirst` over a **6-seed** sweep (added by #1058 — a single seed yields only ~8-10 cries, too small for the hold-vs-release ratio to mean anything), each seed simulating `loopLen * 3 + 64` steps. Measured 2026-07-23 on a 7-core box: **16.9s / 16.9s / 16.9s** standalone idle, **20.9s** in-suite (`tests/standards/`, parallel workers), **21.7s** with a second `tests/standards/` sweep running concurrently. The reporting box saw **36.5s (FAIL) / 24.5s / 28.3s** — a 12s spread straddling the limit; under contention a `standards/` sweep went 45.9s → 99.7s wall (~2.2×), which puts a 17s test at ~37s. So the failure is pure headroom, not content.
- **Fix (2026-07-23, #1188):** per-test `{ timeout: 60_000 }` on the blues test only — `it('fires sparingly...', { timeout: 60_000 }, () => {...})` (vitest 4's options-object form). ~3× headroom over the idle 17s and ~2.8× over the loaded 21.7s. Deliberately **not** global: `vitest.config.ts` `testTimeout` stays 30s so a genuine hang anywhere else still trips. The file's other two tests (~1.2s rock, ~2.6s jazz) keep the global limit. The seed count and every assertion are untouched — the sample size *is* the test's validity, so trimming it to buy speed would have been harness-silencing. Verified: knob mutation-tested at `timeout: 100` (goes red, siblings stay green — proves it's honored and per-test scoped), then **10/10 consecutive standalone passes** plus a green run under a concurrent sweep.
- **Last seen:** 2026-07-23 (measured during #1188; fixed).
- **Near neighbors (not fixed, informational):** on the same box the next-slowest critique tests are `compound-soloist-phrasing-critique.test.ts` "jazz 12/8: phrase-starts stay on the eighth grid" (**15.6s**) and `soloist-expression-rate-critique.test.ts` "is fully deterministic across runs" / "prints the per-genre Critique Report" (**12.5s / 12.4s**). At the ~2.2× contention multiplier above, the 15.6s one lands ~34s — these are the most likely next offenders in this class.

### 🟢 `tests/browser/harmony-click-free.browser.test.ts` — "worst sample step must stay below half peak"

- **Class:** unseeded-statistical (the offline-render variant — unseeded `Math.random` in the audio render, not a critique test).
- **Symptom:** `expect(metrics.maxStep).toBeLessThan(metrics.maxAbs * 0.5)` failed intermittently (failed the full e2e run of #533, #650, and #668; green on most re-runs). Same `@diagnostic` render every time; `maxStep`/`maxAbs` varied run-to-run.
- **Root cause:** the harmony voice's per-note panning + timbre jitter draw unseeded `Math.random()`, so the offline render's `maxStep`/`maxAbs` varied each run. Worse, the `0.5×maxAbs` bound was calibrated against a couple of *lucky* unseeded renders — the legitimate worst step (sawtooth slew + constructive overlap of the stacked stab voices) actually reaches ~0.60×peak, *above* the 0.5 line. So the bound sat below real content and tripped on any unlucky roll.
- **Fix (2026-06-22, #654):** both halves of the canonical fix. (1) Seed the render — a mulberry32 `Math.random` stub at the top of the `page.evaluate` callback (before importing the voice), the in-page analogue of `installSeededRandom`. Render is now exactly `maxStep=0.7523, maxAbs=1.2598` every run. (2) Re-anchor the threshold to the real failure boundary: legit content ~0.60×peak, a true full-scale hard-stop ~1.0×peak → `0.7×maxAbs` clears content (margin ~0.10) while still failing a full-scale discontinuity (margin ~0.30). The guard's intent (catch NaN + gross full-scale jumps; the fine click mechanism is unit-asserted in `harmonies-synthesis.test.ts`) is unchanged.
- **Last seen:** 2026-06-22 (CI on PR #668, since fixed).
- **Note (2026-07-14, #1096):** relocated from a Playwright `@diagnostic` spec (`tests/e2e/`, ran in `page.evaluate` against the dev server) to **Vitest browser mode** (`tests/browser/`, headless Chromium). The mulberry32 seed and the `0.7×peak` bound carried over verbatim — the guard is unchanged, only its host runner moved.

### 🟢 `tests/standards/bass-chord-change-approach-critique.test.ts` — "approach bend fires for an allowlisted genre (Jazz) and never for an excluded genre (Rock)"

- **Class:** unseeded-statistical
- **Symptom:** `expect(jazzRate).toBeLessThan(0.35)` failed at `0.3548387096774194 < 0.35` — over by **0.005** — on CI run 283 (PR #1190, 2026-07-23) and passed on retry. Recorded as root-cause-unknown at the time because job logs were unreadable; #1194's `ci-logs` made them readable and this was the assertion.
- **Root cause:** `approachBend` (`bass-styles.ts`) rolls a flat raw `Math.random() < 0.2` whenever the chromatic-approach branch is taken, and Jazz above intensity 0.75 forces `chromaticProb = 0.95`, so the true expected bend rate is ≈0.19 against a `[0.05, 0.35]` band. Measured 2026-07-24 over **50 isolated runs**: mean **19.1%**, sd **5.3%**, range **9.7–33.9%** (0/50 failures locally, but the max sits 1.1pt under the ceiling). The sample size is exactly **62 every run** (`bendSamples` is deterministic), so the exact binomial applies: `P(≥22/62 | p=0.19) = 1.7e-3`, ~1 in 590. Pure unlucky roll, not an ordering leak and not an engine change.
- **Fix:** `installSeededRandom()` at the `describe` level (2026-07-24). With the default mulberry32 seed the draw is `11/62 = 17.7%` every run — near the measured mean, 12.7pt above the floor and 17.3pt below the ceiling. Verified 10/10 consecutive identical runs.
- **Last seen:** 2026-07-23 (CI run 283 on PR #1190; since fixed).
- **Follow-up:** #1254 re-derives this band from the seeded value (the reviewer's read is that `[0.05, 0.35]` passes at audibly different bend rates); that is deliberately **not** done here — a flake fix must not also move the goalposts. Three stale "empirically we observe …" comments in the same file were corrected to measured values in this pass; the Jazz 128-bar rate had drifted from a documented "22-35%" to an actual 31.5–43.3%, which would have made the seeded 41.7% read as a regression.

### 🟢 `tests/standards/disco-bass-critique.test.ts` — "should implement Root-Octave alternating at high intensity"

- **Class:** unseeded-statistical (rare tail — ~1 in 670 runs)
- **Symptom:** `expect(score).toBeGreaterThan(0.8)` failed at `0.7560975609756098 > 0.8` on CI run 283 (same run as the entry above), passed on retry. The 4.4pt miss looked too large for run-to-run variance, so this one was **classified before being fixed** — a seed pin on a genuinely under-delivering engine would have hidden a real regression.
- **Root cause:** unseeded binomial after all, on a **much smaller sample than the test's own comment claimed**. The disco octave pump rolls `Math.random() < octaveProb`, `octaveProb = 0.4 + intensity * 0.6 = 0.94` at the test's `bandIntensity: 0.9` (`bass-engine.ts` passes `bandIntensity` through unscaled, so 0.94 is exact). Measured 2026-07-24 over **300 isolated runs**: pooled **94.2%**, per-run mean 94.2% / sd 3.4% / min 81.8% — i.e. the engine delivers **exactly** its designed 0.94 and the threshold is not over-tight. The variance comes from sample size: `checks` counts only beat-start→"and" pairs, and the gallop claims the 'e' slot in between. Its gate is `Math.random() < gallopProb - 0.1`, so the *effective* rate is `0.474 - 0.1 ≈ 0.37` (**not** the 0.474 the variable holds — that mis-read predicts 34 checks and contradicts the measurement), voiding ~37% of the 64 beat-starts. Measured `checks` is therefore **29–52 (mean 40.1)**, *not* the "~64 checks/run" the assertion's comment asserted. A **2000-iteration in-process sweep** crossed the 0.80 floor **3 times (1 in 667; exact binomial marginalized over the `checks` distribution: 1 in 621)**; the CI value `31/41 = 75.6%` is one step further into the same tail — exact `P(X≤31 | n=41, p=0.94) = 1.2e-4`, ~1 in 8.3k. Verdict: variance, not a threshold or engine finding. Corroborating: `git log -L` on the disco octave branch shows it last touched **2026-03-20**, with no bass-engine/bass-styles change since 2026-07-20.
- **Fix:** `installSeededRandom(0x1234)` at the `describe` level (2026-07-24). The seed choice matters: the shared default `0xc0ffee` draws `29/34 = 85.3%`, *below* the measured 86.1% minimum of the first 120 unseeded runs — a bottom-1% sample. It still **passes** the 0.80 floor, so this was not threshold-shopping; but #1254 re-derives the band *from the pinned value*, and anchoring a musical target to a verified bottom-1% draw would freeze RNG noise 9pt under the engine's true centre. `0x1234` draws `45/48 = 93.8%`, nearest the mean of twelve candidates. Pinned at the **describe** level, not per-test: `reseed()` mutates the handle's persistent seed and `installSeededRandom`'s `beforeEach` replays it, so a per-test `rng.reseed()` silently governs every later test in the file — making three unrelated critique tests' streams a function of test ordering. The stale `~64 checks` / `82-100% across 20 runs` comment was corrected in the same pass. Verified 10/10 consecutive identical runs; the other three tests in the file were confirmed unchanged (gallop 70 vs floor 50 — dead on the theoretical `128 × 0.546`).
- **Cost of this fix, until #1254 lands:** the seed pin makes the guard **weaker**, not just quieter. Unseeded, an engine drop from 0.94 → 0.85 reddened ~6% of runs — annoying, but visible as "another flake". Pinned at 93.8% against a 0.80 floor, that same 9pt regression never reddens at all, and 19-of-20 upbeats falling to 17-of-20 is audible: the pocket loosens and the octave stops being the hook. Treat #1254 as the completing half of this fix, not an optional follow-up.
- **Last seen:** 2026-07-23 (CI run 283 on PR #1190; since fixed).
- **On "why did two independent ~1-in-600 gates red out together?":** they failed in the **same attempt** of the same job (`ci-logs 283`: `Test Files 2 failed | 346 passed`), and the independent joint probability is ~2e-7. Both common-cause hypotheses were chased and killed: (a) cross-file `Math.random` spy leakage is **structurally impossible** here — probed directly, an unrestored `vi.spyOn(Math, 'random')` in one file does not reach the next, because `isolate: true` gives each file a fresh context; (b) no code drift (see the March date above). So coincidence stands — but the honest framing is that the suite plausibly holds **dozens** of unseeded critique gates with ~1-in-500 tail margins, which makes "*some* pair reds out together" more like 1-in-300 runs than 1-in-350k. The actionable follow-up is a tail-margin sweep of the remaining unseeded `tests/standards/` files, not a leak hunt.
- **Follow-ups:** #1254 re-derives this band (it sits ~4σ below the mean, so it asserts "octaves weren't suppressed entirely" rather than the name's "Root-Octave alternating"); the diagnosis it was blocked on is the entry above, so its prerequisite is now satisfied. It should also fix *what* the test measures, not only the band: the metric reads the "and" via array adjacency, so on the ~37% of beats where the gallop interposes a note the pump's alternation is **invisible** — dropped from the sample rather than counted as a miss, and dropped precisely on the busiest bars a disco listener would judge hardest. Looking the "and" up by step index restores all 64 pairs. #1255 is the separate by-ear question of whether 0.94 is itself too mechanical for the idiom; the engine is behaving as designed, so that is a taste call, not a bug.

### 🟢 e2e hydration-wait timeouts (dev-server cold compile)

- **Class:** e2e-timing
- **Symptom:** Playwright specs intermittently time out waiting for hydration under parallel workers.
- **Root cause:** Vite's dev server compiles routes on-demand; the first worker to hit a cold route eats the compile latency and blows the hydration wait.
- **Fix (superseded 2026-07-14, #1096):** originally a `globalSetup` warm-up that pre-compiled before the workers fanned out. Now **retired at the root** — the e2e suite runs against a prebuilt `vite preview` bundle, so there is no on-demand dev-server compile to warm (the `gotoHydrated` hydration wait remains as a slow-box guard). The old caveat *"don't switch to preview, it breaks the reverb `.ts` import"* no longer applies: those two offline-audio guards moved to Vitest browser mode (`tests/browser/`).
- **Last seen:** 2026-05-29 (fixed; class eliminated 2026-07-14).

### 🟢 `tests/e2e/chart-surface.spec.ts` — "opens on 🌈 button click and closes with Esc"

- **Class:** e2e-timing
- **Symptom:** `expect(overlay).toHaveCount(0)` failed after pressing Escape (`Received: 1`). Failed 3/5 standalone at `--retries=0`; the flake is real and reproduces readily.
- **Root cause:** `useModalA11y` (`public/components/use-modal-a11y.ts`) attaches its `document.addEventListener('keydown', ...)` inside a mount `useEffect`, which can still be pending when `.viz-overlay` first paints and passes `toBeVisible()`. The test pressed Escape immediately, occasionally beating the listener attach. The identical race was already solved elsewhere in the same file (`section settings popover › opens via kebab and closes on Escape`, #1082) by waiting for `role="dialog"` — set inside that same effect, right before the listener — before sending Escape; this test never adopted that pattern when #1082 wired `useModalA11y` onto the visualizer overlay.
- **Fix:** `await expect(overlay).toHaveAttribute('role', 'dialog')` after the visibility check and before `Escape` (2026-07-14, #1101).
- **Last seen:** 2026-07-14 (measured during #1101; 5/5 clean after the fix).

### 🟢 `public/components/editor/ChordPicker.tsx` Escape-to-close (2 e2e sites)

- **Class:** e2e-timing
- **Symptom:** `tests/e2e/section-practice.spec.ts:94` ("during playback the section label stays live but chord cards go inert") intermittently failed at `expect(page.locator('.chord-picker')).toHaveCount(0)` after Escape (`Received: 1`). ~3/15-20 standalone at `--retries=0` once isolated to this assertion (a separate, unrelated state-transition race in the same test was fixed first — see note below — before this one surfaced as the residual failure).
- **Root cause:** `ChordPicker`'s own inline Escape/click-outside effect (not `useModalA11y`) attaches its `keydown` listener inside a mount `useEffect`, same class as the visualizer flake above — but `.chord-picker` renders `role="dialog"` as **static JSX**, present at first paint, so (unlike `useModalA11y`) it can't serve as a post-effect readiness signal.
- **Fix:** the effect now sets `data-dismiss-ready="true"` on the root element right after attaching the `keydown` listener (`ChordPicker.tsx`); the test waits for that attribute before pressing Escape (2026-07-14, #1101).
- **Note:** the same test also had a second, independent race fixed in this pass — clicking `.chord-card` immediately after "Start from here" could beat the batched re-render that detaches `onPick` (`ChordVisualizer.tsx`, gated on `playback.isPlaying`). Fixed by waiting for `.measure-box[role="button"]` to hit count 0 (same re-render, same `isPlaying` read) before that click. Not registered as its own entry — same test, same investigation, same commit.
- **Last seen:** 2026-07-14 (measured during #1101; 20/20 clean after both fixes).

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
