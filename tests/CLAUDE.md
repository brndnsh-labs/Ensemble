# tests/ — Vitest (unit/critique), Vitest browser mode, Playwright e2e

Load-bearing traps for writing/reviewing tests in this repo. For the 5 canonical critique-test
smells (tautology, sub-baseline threshold, mislabel, log-vs-assert mismatch, harness-silencing)
and proven patterns (loop-awareness, final-stage multiplier, seeded mulberry32), see
`docs/guides/musical-engine-patterns.md` — this file is sharper traps not covered there.

## Critique tests (`tests/standards/`)

- **A harness that runs a simplified shape (short synthetic seed, per-bar fallback) can be green
  while production (full macro-form, sticky section) is broken.** Production soloist seeds are a
  ~2048-step macro-form; a unit test with `loopLengthSteps = 64` makes an apex/hook recur every
  loop and "confirms" behavior that doesn't hold at 128 bars. Pair fast synthetic unit tests with
  at least one **production-faithful test** that drives the real `generateSessionSeed`/arrangement
  over the real structure with a fixed seed string. Smell: a unit test needing `loopLen ==
  scanWindow` to make an event recur.
- **Groove/drum critique mocks must seed `groove.sectionSeedMap`, or the harness measures the
  per-bar fallback distribution, not production's sticky-per-section one.** `getMotif` and the
  groove-strategy layer derive `sectionSeed` from `sectionSeedMap[sectionId]` in production (one
  seed held across a whole section); with an empty map, every bar gets a different seed and
  motif/flavor decisions flip bar-to-bar. Calibrate thresholds **empirically** (run once, observe,
  set floor with 2-3x headroom) — don't trust an audit-doc's production-math estimate against a
  harness running the fallback path.
- **A groove critique mock for a non-4/4 meter must include `arranger.timeSignature`.**
  `applyGrooveOverrides` recomputes `stepsPerBar`/`loopStep`/`barIndex` internally from
  `arranger.timeSignature`, defaulting to 4/4 (16 steps) when the slice is absent — the
  `stepsPerBar` you pass in `params` is ignored. Without it, meter-derived flags (`isPulseStart`,
  `beatIndex`, etc. from `getStepInfo`) are meter-correct but internal grid math silently runs 4/4,
  producing a plausible-looking but wrong mixed result. Exception: `checkBassActiveStyle` takes
  `ts` as an explicit param and never reads `getState()`. Mutation-test any new guard: revert the
  engine fix, confirm the test goes red.
- **Forcing a specific drum motif index deterministically needs three knobs, not one — the loop
  ceiling is the silent gotcha.** (1) Pin `sectionSeed` via a real `arranger.stepMap` +
  `groove.sectionSeedMap`, not an `{undefined: x}` key. (2) Land the right intensity tier —
  `getMotif(seed, complexity, intensity)` maps the same seed to different motifs per tier. (3)
  `activeMotif = min(getMotif(...), loopMotifCeiling(currentLoopCount))` — `loopMotifCeiling(0)=1`,
  so on the default Head (`currentLoopCount` undefined→0) any motif ≥2 is silently clamped to 1
  with no error. Set `playback.currentLoopCount: 2`+ to exercise full motif range.
- **Motif/hook/"the lick returns" repetition claims are invisible to the single-pass per-genre
  harness** (`getSoloistNote` in a bar loop) — it starts loop 1 with an empty `thematicSeed`, so
  the motif-replay machinery never builds anything to repeat, and sparseness *dilutes* the
  reuse-share metric (a sparse profile measures as less repetitive even when it subjectively loops
  more). Repetition claims need the multi-loop `buildSeedSweep`/`buildSeedSweepSummary` harness
  (`scripts/soloist-analysis-utils.ts`) with fixed head seeds. Placement/sparseness/chromaticism/
  register/device claims are fine on the single-pass harness. Before tuning toward a claim, confirm
  a harness can even *see* the property — some claims (verbatim hook repetition without dedicated
  motif machinery) are genuinely untestable as-is and need new engine machinery, not profile tuning.
- **Cross-genre density tests: assert absolute hits/bar bounds keyed to the voice's profile, not a
  ratio against the 4/4 baseline.** Low-baseline genres (funk/hiphop/disco kick/hat) make a "% of
  4/4" ratio fail on musically-correct output — a genre whose 4/4 density is already low can have a
  *correct* 6/8 density that's numerically above its own 4/4 number. Log the 4/4 count as
  informational only.
- **A density bound alone can't distinguish "right count, wrong position."** `hitsPerBar ∈
  [0.5, 2.5]` passed at 1.0/bar when 1.0/bar was the bug (downbeat only, second pulse lost). Add
  explicit per-position assertions (`hitsByStep[N] ≥ threshold`) for every position the fix is
  supposed to guarantee — the position assertion is the actual regression guard, not the density
  bound. Watch the tautology trap too: asserting "hits cluster on positions {X}" when the
  engine-under-test is *defined* to only emit on {X} at that intensity passes for any
  implementation and guards nothing — test at an intensity where the helper allows more spread.
- **A DoD-gating critique test that ships with `it.skip`'d acceptance criteria is not a gate — it's
  a snapshot of broken state.** `it.skip` doesn't enforce, and asserting current (buggy) engine
  behavior as the target calcifies the bug. If a story's critique test comes back with skipped
  acceptance items, don't ship it as Done: promote each skip to its own follow-up story, and
  rewrite the DoD test with correct musical targets only after the gaps land.
- **Reading a critique test's actual metric value:** `npm test` runs vitest `--reporter=dot
  --silent=true`, so `console.log`'d "Critique Report" output is invisible by default — running the
  file directly is also effectively quiet. Force-fail an assertion (`expect(ratio).toBeLessThan(-1)`
  or `expect(\`x=${x}\`).toBe('PROBE')`) to print the real number via the AssertionError message,
  then revert. These tests are deterministic (seeded), so the printed value is stable across runs —
  set thresholds with real headroom below the measured minimum, not a guessed floor.

## Determinism & seeding

- **Proving an engine is fully seeded (no surviving raw `Math.random()`) needs *different* stub
  values per run, not the same one.** `vi.spyOn(Math, 'random').mockReturnValue(0.5)` in both runs
  passes trivially even on a still-broken engine, because both runs see identical input. Use
  bracketing stubs (e.g. `0.05` and `0.95`) that land on opposite sides of every probability
  threshold in the file under test, then assert `run1 === run2`.
- **Default mock state can mask most gated branches in a determinism test.** A null seed, a
  below-threshold `bandIntensity`, or a false coordination flag can silently skip most of the code
  paths a determinism story is supposed to cover. Parameterize the test over multiple fixtures, each
  flipping a different branch prerequisite, and confirm distinct fixtures actually produce distinct
  event counts (proof they're different paths, not the same path twice).
- **When migrating a `Math.random` pin site, pick the sweep pattern by site density and pin
  intent** — read the pin's comment first. A deliberate gate-bypass pin (e.g. "force low to trigger
  sustains reliably") needs a narrow same-side sweep (`[0.05, 0.1, 0.2]`), not a blanket
  `[0.05, 0.5, 0.95]` sweep that would silence the gate at the high end and make the assertion
  meaningless. A neutral "for stability" pin is fine with the blanket 3-point sweep. A file with
  ~20+ pin sites is better served by `installSeededRandom()` (`tests/utils/seeded-random.ts`,
  mulberry32) at the `describe` level than by per-test sweeps. If a migration surfaces a genuine
  threshold failure at an extreme, that's meaningful — stop and report, don't loosen the assertion
  to make it pass.
- **After a read-path refactor (e.g. a consumer moving from `state.x.y` to a `CoordinationContext`
  field), a pre-existing mock can keep tests green while no longer exercising the new path** —
  because the old mock's value still happens to flow through a stale default. Verify by temporarily
  mutating the mock's *new* location to a distinctive value (flip a bool, set a count to 99); if the
  test's output doesn't change, it isn't reading where you think. Same check in reverse when adding
  a new consumer of an existing field: if a new test passes with zero producer changes, suspect it's
  reading a default, not the producer's write.

## Mocking

- **`vi.mock()` factories are hoisted above all top-level `const`/`class` declarations** — any
  test-local symbol a factory references must already be reachable when it runs, or you get
  `ReferenceError: Cannot access 'X' before initialization`. Triggers on (1) converting a source
  file's `import().then()` to a static `import` (the mock factory now evaluates at module-load
  time, before top-level `const`s used to be needed), and (2) a brand-new test whose factory returns
  a hand-rolled fake class referencing an outer `class` declaration. Fix: wrap the referenced
  test-locals in `vi.hoisted()`, or declare a fake class literally inside the factory body when
  nothing outside it needs to reference the class.
- **happy-dom's `navigator.webdriver` defaults to `true`, and `navigator.serviceWorker` doesn't
  exist at all** — either can silently short-circuit code gated on `!navigator.webdriver` or
  `'serviceWorker' in navigator` with zero error output (the guarded branch just never runs; a spy
  assertion reports 0 calls, looking like a logic bug in the code under test). Stub both explicitly
  in `beforeEach` via `Object.defineProperty` for any happy-dom test touching browser
  feature-detection.
- **`knip` green does not prove a module is production-reachable.** knip counts a test-file import
  as a legitimate consumer, so a module imported only by its own dedicated test files reads as
  "used" indefinitely — even after its last real (non-test) caller was deleted. Before trusting "a
  bug in module X is live, knip's green": `grep -rn "from.*<module>" --exclude tests/` for a
  non-test importer (including dynamic `import(` and worker/postMessage string registration), and
  if the only importers are tests, ask whether the test exercises a live production path or is
  keeping dead scaffolding green. Deleting a confirmed orphan cascades — knip will re-flag whatever
  it was the sole consumer of; resolve that in the same pass.

## Playwright / e2e

- **`@playwright/test` is CommonJS; under this repo's `"type": "module"`, only the default import
  survives its loader at runtime.** `import { chromium } from '@playwright/test'` throws
  `SyntaxError: Named export 'chromium' not found` at load time on `node`/CI (silent under some
  test runners, so it can present as "flaky on this box, fine on that one"); `import * as pkg`
  typechecks but leaves `pkg.chromium` undefined at runtime. The only working form:
  `import pkg from '@playwright/test'; const { chromium } = pkg;`. Specs dodge the type mismatch
  with `// @ts-nocheck`; any file in typecheck scope that isn't `@ts-nocheck` needs
  `as unknown as typeof import('@playwright/test')`.
- **The e2e suite runs against a prebuilt `vite preview` bundle, not the dev server** —
  `playwright.config.ts` `webServer.command` is `npm run build:e2e && npx vite preview`. This
  killed the historical cold-compile hydration-timeout flake class (no on-demand `.ts` transform
  under `fullyParallel` workers); do not "fix" a hydration flake by reverting to `npm run dev` as
  `webServer` — some diagnostic specs (`reverb-stability.spec.ts`) `page.evaluate`-import raw
  source paths that only resolve against a dev server, so a full reversion isn't free either. All
  specs route hydration waits through `gotoHydrated`/`HYDRATION_TIMEOUT`
  (`tests/e2e/helpers/nav.ts`) — tune the timeout there, not per-spec.
- **`docs/FLAKY_TESTS.md` + the `/flake` skill are the canonical flake workflow** — four classes:
  unseeded-statistical (fix: `installSeededRandom()`), ordering-dependent (fix: the leaking file's
  missing `afterEach`/`restoreAllMocks`), e2e-timing, and slow-legitimate (a production-faithful
  sweep whose real runtime crowds the 30s `testTimeout` and tips over under load — fix: raise the
  timeout at the tightest scope, per-test `it(name, { timeout: 60_000 }, fn)`, never globally and
  never by shrinking the sample). Distinguish class 1 from class 2 by running the repro both
  standalone and in-batch; class 4 announces itself as "test timed out" with no failed assertion.
  If a pre-commit hook's `vitest related` fails on a critique test unrelated to your diff, suspect
  a flake and re-run standalone before assuming a regression.
