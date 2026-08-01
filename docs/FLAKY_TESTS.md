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
- **Follow-up — DONE (2026-07-25, #1254).** The band is re-derived and the flake margin is no longer the binding constraint. Three stale "empirically we observe …" comments in the same file were corrected to measured values in the #1228 pass; the Jazz 128-bar rate had drifted from a documented "22-35%" to an actual 31.5–43.3%, which would have made the seeded 41.7% read as a regression.
- **Band re-derivation (#1254)** — three changes, in this order, because each one enabled the next.
  1. **The denominator was wrong for the claim.** `sampleCount` counted *every* step-14 approach, but `getBassNote` has two approach branches and both set `approachTargetRoot` — only the chromatic leading-tone branch can bend; the ±5/±7 fallback passes bend `0` unconditionally. So the metric was `chromaticProb × bendProb`, while its name attributed it to the bend alone. A musically-motivated retune of Jazz's `chromaticProb`, touching no bend logic, would have reddened the *bend* test with a misleading failure. Now filtered to leading-tone landings (`|midi − approachTargetRoot| mod 12 ∈ {1, 11}`, mod-12 because the chromatic branch runs its candidate through `clampAndNormalizeMidi`), so the rate equals `bendProb`. Decoupling mutation-verified: at `chromaticProb = 0.7` the rate stays in band (17.6%) and nothing reddens.
  2. **The sample had to grow.** At 128 bars, n = 62 and sd = 5.1%, so `[0.05, 0.35]` spanned audibly different basses (6% ≈ never scoops, 34% ≈ scoops into every other change). 1024 bars gives 476 approaches / **370 chromatic**, sd **2.08%**. The 476 total is *structurally* deterministic (the step-14 activity gate runs on `scrambleHash`, not `Math.random`) so it is now asserted as `toBe(476)` — a harness-integrity check, not a statistical one.
  3. **The band comes from the AUDIBLE boundary, not from σ.** New band **`[0.13, 0.32]`**. Listener-distinct categories are ~0-5% (gone), ~10% (rare), ~20% (occasional), ~40%+ (a tic); nobody hears 15% vs 25% — ~9 vs ~15 scoops over 128 bars — so a band that reddened there would flag a change no ear can detect and would rightly be loosened later. Mutation-verified across a bend sweep: p = 0.10 → 10.3% and p ≥ 0.30 → 34.1/43.2% **fail** (the audible changes); p = 0.15 → 15.4% and p = 0.25 → 27.8% **pass** (the inaudible ones, tolerated on purpose). Honest limit: the ceiling catches p = 0.40 essentially always but p = 0.30 only ~20% of stream positions — the accepted cost of not gating on inaudible differences.
- **The general lesson:** an intermediate draft set `[0.15, 0.25]` from ±2.73σ at the achieved n. That answers *how tight can this be*, not *how tight should it be* — **σ sets the floor on precision, the ear sets the target.** Re-derive the metric's denominator first, then the sample size, then the threshold.

### 🟢 `tests/standards/disco-bass-critique.test.ts` — "should implement Root-Octave alternating at high intensity"

- **Class:** unseeded-statistical (rare tail — ~1 in 670 runs)
- **Symptom:** `expect(score).toBeGreaterThan(0.8)` failed at `0.7560975609756098 > 0.8` on CI run 283 (same run as the entry above), passed on retry. The 4.4pt miss looked too large for run-to-run variance, so this one was **classified before being fixed** — a seed pin on a genuinely under-delivering engine would have hidden a real regression.
- **Root cause:** unseeded binomial after all, on a **much smaller sample than the test's own comment claimed**. The disco octave pump rolls `Math.random() < octaveProb`, `octaveProb = 0.4 + intensity * 0.6 = 0.94` at the test's `bandIntensity: 0.9` (`bass-engine.ts` passes `bandIntensity` through unscaled, so 0.94 is exact). Measured 2026-07-24 over **300 isolated runs**: pooled **94.2%**, per-run mean 94.2% / sd 3.4% / min 81.8% — i.e. the engine delivers **exactly** its designed 0.94 and the threshold is not over-tight. The variance comes from sample size: `checks` counts only beat-start→"and" pairs, and the gallop claims the 'e' slot in between. Its gate is `Math.random() < gallopProb - 0.1`, so the *effective* rate is `0.474 - 0.1 ≈ 0.37` (**not** the 0.474 the variable holds — that mis-read predicts 34 checks and contradicts the measurement), voiding ~37% of the 64 beat-starts. Measured `checks` is therefore **29–52 (mean 40.1)**, *not* the "~64 checks/run" the assertion's comment asserted. A **2000-iteration in-process sweep** crossed the 0.80 floor **3 times (1 in 667; exact binomial marginalized over the `checks` distribution: 1 in 621)**; the CI value `31/41 = 75.6%` is one step further into the same tail — exact `P(X≤31 | n=41, p=0.94) = 1.2e-4`, ~1 in 8.3k. Verdict: variance, not a threshold or engine finding. Corroborating: `git log -L` on the disco octave branch shows it last touched **2026-03-20**, with no bass-engine/bass-styles change since 2026-07-20.
- **Fix:** `installSeededRandom(0x1234)` at the `describe` level (2026-07-24). The seed choice matters: the shared default `0xc0ffee` draws `29/34 = 85.3%`, *below* the measured 86.1% minimum of the first 120 unseeded runs — a bottom-1% sample. It still **passes** the 0.80 floor, so this was not threshold-shopping; but #1254 re-derives the band *from the pinned value*, and anchoring a musical target to a verified bottom-1% draw would freeze RNG noise 9pt under the engine's true centre. `0x1234` draws `45/48 = 93.8%`, nearest the mean of twelve candidates. Pinned at the **describe** level, not per-test: `reseed()` mutates the handle's persistent seed and `installSeededRandom`'s `beforeEach` replays it, so a per-test `rng.reseed()` silently governs every later test in the file — making three unrelated critique tests' streams a function of test ordering. The stale `~64 checks` / `82-100% across 20 runs` comment was corrected in the same pass. Verified 10/10 consecutive identical runs; the other three tests in the file were confirmed unchanged (gallop 70 vs floor 50 — dead on the theoretical `128 × 0.546`).
- **~~Cost of this fix, until #1254 lands:~~ RESOLVED 2026-07-25 by #1254.** The seed pin had made the guard **weaker**, not just quieter: unseeded, an engine drop from 0.94 → 0.85 reddened ~6% of runs — annoying, but visible as "another flake"; pinned at 93.8% against a 0.80 floor, that same 9pt regression never reddened at all, and 19-of-20 upbeats falling to 17-of-20 is audible. #1254 was the completing half, and it now catches that drop deterministically (0.859 → 80.3%, below the new 0.85 floor).
- **Last seen:** 2026-07-23 (CI run 283 on PR #1190; since fixed).
- **On "why did two independent ~1-in-600 gates red out together?":** they failed in the **same attempt** of the same job (`ci-logs 283`: `Test Files 2 failed | 346 passed`), and the independent joint probability is ~2e-7. Both common-cause hypotheses were chased and killed: (a) cross-file `Math.random` spy leakage is **structurally impossible** here — probed directly, an unrestored `vi.spyOn(Math, 'random')` in one file does not reach the next, because `isolate: true` gives each file a fresh context; (b) no code drift (see the March date above). So coincidence stands — but the honest framing is that the suite plausibly holds **dozens** of unseeded critique gates with ~1-in-500 tail margins, which makes "*some* pair reds out together" more like 1-in-300 runs than 1-in-350k. The actionable follow-up is a tail-margin sweep of the remaining unseeded `tests/standards/` files, not a leak hunt.
- **Follow-ups — DONE (2026-07-25, #1254),** and the metric fix changed the picture more than expected. Looking the "and" up **by step index** instead of by array adjacency restores all 64 pairs (measured: `checks` = 64.0, sd 0.0, vs 40.0 ± 3.7 before) — but the mean drops from **94.5% to 89.3%**. The pairs the old lookup silently discarded were the *worse* ones: on the ~37% of beats where the gallop interposes a 16th, alternation runs **~81%** versus ~94.5% on clean beats. So the old metric was reporting the clean-beat rate while claiming to measure everything, and the engine's real all-beats rate was never 0.94.
  That in turn made the band un-derivable at 64 pairs: the 0.94 → 0.859 regression only moves the mean 7pt while sd is 4.05%, so the healthy and regressed distributions overlap and **no threshold separates them**. Measured sd by sample size (300 runs each): 64 pairs 4.05%, 128 pairs 2.81%, 256 pairs 2.01%, 512 pairs 1.43% — clean 1/√n, with the mean holding at 88.8–89.2% throughout (which also rules out any loop- or section-dependent drift over the longer run). The test now simulates **128 bars = 512 pairs** with a floor of **`> 0.85`**: 2.7σ below the design mean and 1.7σ *above* the regression's mean. **The old `> 0.80` sat below the regression's own mean** — which is exactly why it was a fence: the 0.859 mutant scores 80.3% and would have passed it by 0.3pt. Honest about headroom: 0.85 is slightly *above* the 300-run min of 84.2%, so it sits just inside the healthy lower tail (~1 unseeded run in 300 fails it) — costless while seeded, ~0.3% stream-shift risk.
- **No ceiling, and why the obvious one was wrong.** An intermediate draft added `< 0.935`. Review killed it on three counts and it was dropped: (a) `octaveProb = 0.4 + intensity*0.6` reaches **exactly 1.0** at intensity 1.0, so the engine's own design says "alternate on every upbeat" is correct at the top of the range — an upper bound demanding the pump *miss* some upbeats contradicts the curve it tests, and relentlessness is the disco idiom; (b) it would **block the anchor fix** below, which raises the rate to ≈94% and would redden a 0.935 ceiling ~69% of the time; (c) its stated derivation was internally impossible ("above the design max 93.2 **and** below the mechanical min 91.0" — the two distributions overlap), and its real power against `octaveProb = 1.0` was ~80%, not the ~98% claimed. **Both-directions now comes from a two-point intensity scan** — a real musical claim ("the octave emerges as energy builds"), immune to the level shift the anchor fix will cause, and *strictly stronger*: measured gap i=0.3 → 58.8% vs i=0.9 → 90.4% = **31.6pt**, asserted `> 15pt`. Mutation-verified: a constant `octaveProb = 0.94` gives gap −0.8pt and a mechanical `1.0` gives −4.7pt, both **failing deterministically**, where the ceiling caught the mechanical case only ~80% of the time.
- **⚠️→✅ Confirmed ENGINE DEFECT — #1271, filed 2026-07-25, FIXED the same day; the corrected metric is what exposed it.** The 88.84% design mean is not the 94% `octaveProb` implies, and the gap is not a soft tendency. Split by what the gallop's interposed 'e' played: when the 'e' repeats the root, alternation is **88–94%**; when the 'e' jumps the octave, it collapses to **5–9%**. `normalizeToRange` (`bass-engine.ts`) recomputes the register anchor from `prevMidi` every step (60/40 against the center), so the gallop's octave drags the "and"'s `baseRoot` up an octave; the disco branch's `absMax` fold then collapses `baseRoot + 12` back onto the downbeat's own pitch — **a unison, from an octave roll that succeeded.** The same feedback costs the downbeat its anchor: the low root lands on only ~49% of beats and the pump descends (245) more often than it ascends (201), so the bass stops locking the One with the kick, which is the gesture's entire structural function. This was initially mis-called as possibly idiomatic ("a player may not jump the octave when the gallop already supplies motion") — that describes *probabilistic* restraint, not a deterministic register collision. `normalizeToRange`'s neck-drift prevention is right for walking/melodic styles and categorically wrong for a fixed-anchor pump style. **The `> 0.85` floor will want re-deriving upward once that lands.** #1255 remains the separate by-ear question of whether 0.94 is itself too mechanical.
- **Fixed 2026-07-25 (#1271) — and the floor re-derived upward to `> 0.90` as predicted, from measurement rather than from σ.** `PUMP_ANCHOR_STYLES` (in `bass-pump.ts` since #1291; `bass-engine.ts` at the time of writing) now resolves disco's register from the chord root's pitch class **alone** — a pure lookup into `[comfortMin, comfortMax - 12]` = [28, 39], a window exactly twelve semitones wide so each pitch class has precisely one representative and there is no nearest-candidate choice left to make. The pair therefore occupies exactly the bass comfort range (28-39 + 40-51). **The clean confirmation the diagnosis was right:** the measured rate now matches `octaveProb` at every intensity to within 0.4pt (i=0.9 → 93.90% vs 0.94 · i=0.7 → 81.94% vs 0.82 · i=0.5 → 70.00% vs 0.70 · i=0.3 → 58.16% vs 0.58, 512 pairs × 200-300 runs each). The old 5pt gap *was* the defect; nothing unexplained is left, and the floor is now readable straight off the engine's own curve instead of off an empirical offset. Sanity check against the records: an A chart anchors 33/45 (A1→A2), which is "Good Times" / "Le Freak" exactly.
- **⚠️ The first draft of the fix shipped the same class of bug it was removing, and only a ramping-intensity probe could see it.** That draft picked the anchor as the candidate *nearest `safeCenterMidi`* out of the wider `[absMin, absMax - 12]` window — which made the supposedly fixed anchor a **step function of live `bandIntensity`**, since `safeCenterMidi = 36 + floor(intensity * 7)` moves a semitone every 1/7. Any pitch class with two candidates in that window flipped a **whole octave** at the boundary (Gb at i≈1/7, G at 2/7, Ab at 3/7, A at 4/7), and the default-on auto-conductor ramps intensity roughly per step. Measured on an A root ramping 0.50→0.65: a single beat produced `33 → 57`, a **24-semitone leap**, with the reverse crossing giving `45 → 45`, a unison. **Neither artifact is a `delta < 0` inversion and neither dents a 94% rate**, so every assertion added for #1271 stayed green — and every test in the file held intensity constant, which is precisely where the hazard lived. Two lessons worth keeping: a "fixed" value is only fixed with respect to the inputs you varied, and for a pump, intensity belongs on `octaveProb` and velocity, never on neck position (a bassist digs in; they don't move up the neck). Guarded now by `holds the anchor still while the conductor ramps intensity`, which sweeps all four boundaries and asserts the whole line uses exactly two pitches an octave apart.
- **The ceiling was wrong twice over, and the second way was audible rather than glitchy.** `absMax - 12` (45) let E/F/Gb/G/Ab/A park **every** upbeat at 52-57 — above the 51 comfort ceiling and inside the chords/harmony slot (52-84), so the octave stopped reading as a bass lift and started doubling the comper, on ~94% of upbeats, forever. The file's own `should stay strictly within the bass spectral slot` test asserts 28-51 and passed only because it used the default C root, while the new invariant test blessed 57 — the two contradicted each other in the same file. `comfortMax - 12` fixes this and the intensity flip in one stroke. 52-57 is headroom for an occasional melodic fill, not somewhere to park a genre's whole vocabulary.
- **Two more mechanisms broke the same anchor, found by measuring rather than by reading the issue.** (1) `withOctaveJump` — disco reaches it through the **generic `isStraightStyle` return**, not its own style branch, which claims every `stepInChord === 0` downbeat before `getBassNoteStyle` runs; it displaced 6 of 128 measure downbeats, every one of them a unison or a descent, and was the *only* remaining source of either once the anchor landed. Pump styles are now exempt: the gesture's premise is that an octave displacement reads as a "dig-in", which only works in a line whose ordinary vocabulary isn't octaves. (2) **Imperfect Symmetry**, which had to move the *pair* — for a normal line it displaces one note and relies on the cascade through `prevMidi`'s hand-position bonuses, and a fixed-anchor style has no cascade by design, so a single-note shift put the displaced downbeat on its own upbeat's pitch. Both were pre-existing and invisible at occurrence 1, which is where every other test in the file runs.
- **Metric is now DIRECTIONAL (`and − beat === +12`), and that is the bigger half of the change.** `Math.abs(...) === 12` scored an inverted pump — octave on the downbeat, root on the upbeat — as a perfect 100%, and that was not hypothetical: the measured line descended 243 times against 209 ascents while the metric read 88.8%. Under the directional metric the pre-fix engine scores **~41%**, so the floor no longer has to be a fine statistical judgement to catch an anchor regression. `illegalDeltas`, `inversions === 0`, `lowRootOnBeat === 1` and `distinctBeatMidis === 1` are asserted separately, as hard equalities — the anchor is deterministic once it stops reading `prevMidi`, so there is nothing left to band. **`illegalDeltas` (every beat→"and" move must be `0` or `+12`) is the tightest of them and the one that earns its keep:** a rate can absorb 32 damaged beats in 512, and `inversions` counts only `delta < 0`, so both are blind to the `+24` leap and the drift-arrived-at unison that the intensity-flip bug produced. Measured 0 illegal deltas across 900 unseeded runs and 100.0% anchoring across ~1,200. Note `lowRootOnBeat` takes its minimum over **every note**, not over downbeats only — over downbeats it is arithmetically the same statement as `distinctBeatMidis === 1`, which is how a draft of this file ended up asserting one thing twice and reporting a constant as a measurement.
- **Mutation-verified in both directions, including one honest gap.** Reverting `PUMP_ANCHOR_STYLES` → 12 failures; restoring the first draft's center-relative anchor → caught by the intensity-ramp test and *only* it (18 others green — precise discrimination, and proof the ramp test isn't decorative); shifting the anchor window an octave → 6; dropping the `withOctaveJump` exemption → 11; and each of three separate mutations of the pump's Imperfect-Symmetry path → caught by exactly the new occurrence-2 test and nothing else. **Not covered:** restoring the inverting fold in `bass-styles.ts` (`note = baseRoot - 12`) leaves all 18 tests green, because the fixed anchor makes that branch **unreachable by construction** — no mutation of it can redden anything. It is kept as a non-inverting fallback rather than deleted, and what the new per-pitch-class invariant test pins is its *precondition* (`anchor + 12 ≤ absMax`), so a future change to the anchor's ceiling gets caught instead of silently re-arming the inversion.

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

## Tail-margin sweep (#1262) — full `tests/standards/` enumeration

The disco/rock/hip-hop/bass-chord-change entries above ended on a shared
observation: the suite plausibly holds **dozens** of unseeded critique gates
with ~1-in-500 tail margins, making "some pair reds out together" nearer
1-in-300 runs than naive independence would suggest. #1262 is the enumeration
that turns that hypothesis into a ranked list, per its own sizing note
("the enumeration is cheap and is the part worth doing first").

**Method.** `tests/standards/*.test.ts` has 157 files; 8 already call
`installSeededRandom()` (out of scope, already fixed) and 149 don't. Of
those, 133 contain a `toBeGreaterThan`/`toBeLessThan`/`toBeCloseTo`-shaped
assertion. Rather than measure all 133 blind, the search was narrowed by
tracing **which engines still contain a live (non-comment, non-audio,
non-test-fixture) `Math.random()` call reachable from a critique test** —
because a critique test's statistical assertion can only be unseeded-flaky
if the engine path it drives actually rolls unseeded dice. `grep -rn
"Math\.random(" public/engine/ public/engine/grooves/` and a symbol-by-symbol
trace of every hit found the surface is now **narrow**: prior epics (#790,
#792, #841, #1083, #1256, #1271, #1277, #1295, #1300, the
deterministic-phrasing epic, Epic 12 S4) have already migrated the large
majority of per-step decision points to `scrambleHash`/seeded draws. What's
left:

| Engine | Live `Math.random()` sites | Reachable from a critique-tested statistical assertion? |
|---|---|---|
| `synth-drums/chords/harmonies/soloist/utils.ts`, `scheduler-core.ts`, `engine.ts` | Real-time audio-graph jitter, DSP buffers | No — `tests/standards/` never touches audio synthesis; covered by `tests/browser/` instead |
| `public/engine/grooves/utils.ts` (`roll`/`humanizeDraw`/`placementSkew`) | Legacy fallback, gated on `context.rollBaseSeed === undefined` | No — `rollBaseSeed` is computed **internally** by `applyGrooveOverrides` (`groove-engine.ts:506`) from `(sectionId, barIndex, loopStep, inst.name)`, not supplied by the caller. Every one of the ~40 drum critique tests that calls `applyGrooveOverrides` (confirmed by grep: zero files set `rollBaseSeed` directly, because none need to) gets the seeded path automatically. The legacy fallback is dead from `tests/standards/`'s perspective. |
| `public/engine/comping-cells.ts`, `accompaniment.ts`, `groove-engine.ts`, `grooves/latin.ts`, `grooves/jazz.ts`, `hash-utils.ts`, `bass-pump.ts`, `conductor.ts` | 0 live — every hit in these files is a `why:`-comment documenting a **past** migration off `Math.random()` | N/A |
| `public/engine/chords-engine.ts` (`mutateProgression`, 4 sites) | Live, but only reachable from a "surprise me" progression-randomizer UI feature (`InlineEditor.tsx`, re-exported by `arranger-controller.ts`) | No — grepped every `tests/standards/*.test.ts` import of `chords-engine.js`; all 36 importers use `validateProgression`/`getBestInversion`, none call `mutateProgression`. Dead from the critique suite. |
| `public/engine/resolution.ts` (`getStagger`, timing jitter ±15ms) | Live, drives final-cadence note stagger | No — the two cadence critique files (`final-bar-cadence.test.ts`, `ending-cadence-tonic-critique.test.ts`) assert pitch/duration/register, never raw `timingOffset`; the latter's own comment explicitly notes this ("a timing stagger, never a pitch — so these are pinned" on pitch only). |
| `public/engine/midi-worker-logic.ts` (velocity humanize jitter) | Live, MIDI-export-only | No critique test asserts a velocity range on MIDI-export output. |
| `public/engine/bass-styles.ts`, `bass-engine.ts` | Live — the one genuinely exercised surface (see below) | **Yes, on 4 genre bass styles** — measured below |

**The bass-engine surface, measured.** Six genre bass styles (Acoustic,
Metal, Ska-Punk, Jazz, Blues, Funk) still route pitch decisions through raw
`Math.random()` in specific branches (`bass-styles.ts`'s acoustic/metal/
walking-ska/quarter-beat-3 branches; `bass-engine.ts`'s blues walk-up,
quiet-rock/funk-offbeat ghost, and generic chromatic-approach fallback —
the last one only reachable by Jazz, since `country`/`neo`/`dub`/`rock`/
`disco`/`hiphop` all return a defined result on every style-function call
and never fall through to it). Reggae/Country/Neo-Soul were traced and
found to have **zero** statistical-assertion exposure (Reggae's only raw
draw is a ±5% velocity jitter that no test asserts a range on; Country and
Neo-Soul's pitch pickers are 100% `scrambleHash`-seeded already). For the
remaining five files, each candidate assertion was measured over
150-1000 isolated `getBassNote`/`getStepInfo` trials (a throwaway vitest
harness, not `test:loop`, since the metric needed is a per-trial numeric
draw, not a pass/fail count) and the tail probability derived from the
measured mean/sd against the file's actual threshold:

| File | Assertion | Measured mean / sd (n) | Threshold | Margin | Verdict |
|---|---|---|---|---|---|
| `acoustic-bass-critique.test.ts` | 4 assertions, all `toBe(1.0)`/exact counts | N/A — invariant | N/A | ∞ | **Not at risk.** Every random branch (5th-vs-octave pitch choice) still lands on a pitch-class the assertion accepts regardless of the draw — the test is invariant under the engine's own randomness, not merely lucky. |
| `metal-bass-critique.test.ts` | `gallopCount > 10` | 21.0 / 2.00 (n=200) | 10 | 5.5σ | **Not at risk.** The file's own stale comment ("observed 14-22 across 10 runs") undersold the margin from an n=10 sample; n=200 shows min=15. |
| `metal-bass-critique.test.ts` | `hitDensity > 0.72` | 0.805 / 0.0148 (n=200) | 0.72 | 5.7σ | **Not at risk** (comment also stale, same n=10 cause). |
| `metal-bass-critique.test.ts` | density-scaling `ratio > 1.6` | 1.996 / 0.063 (n=200) | 1.6 | 6.3σ | **Not at risk.** |
| `ska-punk-bass-critique.test.ts` | `rootRatio < 0.7` | 0.358 / 0.033 (n=200) | 0.7 | 10.4σ | **Not at risk.** |
| `jazz-bass-critique.test.ts` | `chromaticApproachRate > 0.5` | 0.749 / 0.051 (n=100, 128-bar sweep each) | 0.5 | ~4.9σ | **Not at risk**, but flagged: at Jazz/high-intensity the engine's designed rate is ≈0.76-0.95×0.8, so a floor of 0.5 also has real regression headroom (an engine drop to ~0.55 would still pass) — a candidate for a future **band re-derivation** story (out of this story's scope per its acceptance item 3), not urgent. |
| `funk-bass-critique.test.ts` | low-intensity `octavePops ≤ high/3` | low: 7.98 / 2.39, high: 52 (deterministic) (n=300, 32-bar sweep) | high/3 ≈ 17.3 | 3.9σ | **Not at risk.** An initial measurement pass found an apparent ~1.5% fail rate that would have crossed this story's action threshold — traced to a bug in the throwaway harness (it fed a raw MIDI number where the engine expects a frequency in Hz for `prevFreq`, degenerating the simulated line). Re-measured with the harness corrected to mirror the real test's `getFrequency(lastMidi)` conversion; margin is comfortable. Recorded here as a cautionary note on measurement methodology, not as an engine or test finding. |
| `blues-bassist-critique.test.ts` | all assertions | N/A — invariant | N/A | ∞ | **Not at risk.** The one raw-`Math.random()`-exposed branch (walk-up variation, `intensity > 0.7`) only changes which scale tone a downbeat plays; every assertion in the file checks either duration, count, or the *following* upbeat's pitch mirroring `prevMidi` (which holds regardless of which scale tone the downbeat drew) — none samples downbeat pitch class at `intensity > 0.7`. |
| `reggae-bass-critique.test.ts`, `country-bass-critique.test.ts`, `neo-soul-bass-critique.test.ts` | all assertions | N/A | N/A | N/A | **Not at risk** (engine paths are deterministic/`scrambleHash`-seeded or the only random draw is velocity jitter with no assertion on it — see table above). |

**Result: nothing crosses the ~1-in-500 action threshold this pass.**
Every measured margin is ≥3.9σ (funk, the tightest), most are 5-10σ+,
corresponding to tail probabilities from ~1e-5 down to <1e-15 — several
orders of magnitude inside the safety bar the disco/hip-hop/bass-approach
fixes sat just outside of. Nothing was seeded (seeding a file with no real
flake risk would only cost sensitivity for no reliability gain — see
`feedback_weight_tuning_multiplier_placement`'s sibling caution on paying a
determinism cost without a matching benefit). Nothing is deferred as
"ambiguous/contentious to seed" either, since nothing reached the decision
point of picking a representative seed. The one soft finding —
`jazz-bass-critique.test.ts`'s `chromaticApproachRate > 0.5` floor being
loose relative to the engine's designed ≈0.76 mean — is flagged for a
possible future band-tightening story, per this story's acceptance item 3,
not actioned here.

**Why this differs from the disco/hip-hop/bass-approach precedents.** Those
three were found *reactively*, from an actual CI red — i.e. they were
already known to be near a tail. This sweep is *proactive*: it traces the
engine surface first and only measures where a live unseeded
`Math.random()` genuinely reaches a statistical assertion. The proactive
trace turned up a much narrower surface than "dozens of unseeded gates"
might suggest, because the intervening epics (#790, #792, #1083, #1256,
#1271, #1277, #1295, #1300, Epic 12 S4) had already migrated most of the
suite's random draws to `scrambleHash` for unrelated musical reasons
(deterministic looped playback), and seeding-for-flake-safety came along as
a free side effect. The remaining raw-`Math.random()` sites are deliberate
per-loop-variety choices (bass.md `#1083`'s "Raw Math.random here … is
deliberate: per-loop variety on this ornament is wanted") whose consuming
assertions, when actually traced to a metric, turn out to have been
authored with real headroom already.

## Adding an entry

When you hit a flake, run `/flake <test-path>` — it measures the fail-rate,
classifies it against the table above, applies the canonical fix, and appends
the entry here. If you're recording one by hand, match the heading format above
(`### <status-emoji> <test path or short name> — "<failing assertion>"`) and
fill all five fields (class, symptom, root cause, fix, last seen).
