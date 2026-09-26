# tests/ — Vitest (unit/critique), Vitest browser mode

Load-bearing traps for writing/reviewing tests in this repo. There is no Playwright suite here
any more (#1358 deleted v1's e2e suite): functional UI testing is the v2 suite in
`prototypes/v2/checks/`, run with `npm run build --prefix prototypes/v2` then
`npm run test:e2e --prefix prototypes/v2` and gated in CI by `v2-checks` — see
`prototypes/v2/CLAUDE.md` § Verification. For the 5 canonical critique-test
smells (tautology, sub-baseline threshold, mislabel, log-vs-assert mismatch, harness-silencing)
and proven patterns (loop-awareness, final-stage multiplier, seeded mulberry32), see
`docs/guides/musical-engine-patterns.md` — this file is sharper traps not covered there.

## Critique tests

The old engine's critique suite and its harness (`tests/standards/` per-genre critiques, the
groove/soloist mocks, the seed sweeps) were deleted with it (#1404). The band engine's claims and
critique harness live in `band/test/` — read `band/CLAUDE.md`. These lessons from the old suite
still hold for any statistical claim:

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

## Playwright

- **`@playwright/test` is CommonJS; under this repo's `"type": "module"`, only the default import
  survives Node's loader at runtime.** Today that means the root-package scripts that drive a
  browser (`scripts/mix-report.ts` under `tsx`); `prototypes/v2` is a separate package without
  `"type": "module"`, and its specs import by name. In a root script,
  `import { chromium } from '@playwright/test'` throws `SyntaxError: Named export 'chromium' not
  found` at load time and `import * as pkg` leaves `pkg.chromium` undefined; the working form is
  `import pkg from '@playwright/test'; const { chromium } = pkg;`, which is what `mix-report.ts`
  does.

## Flakes

- **`docs/FLAKY_TESTS.md` + the `/flake` skill are the canonical flake workflow** — four classes:
  unseeded-statistical (fix: `installSeededRandom()`), ordering-dependent (fix: the leaking file's
  missing `afterEach`/`restoreAllMocks`), e2e-timing, and slow-legitimate (a production-faithful
  sweep whose real runtime crowds the 30s `testTimeout` and tips over under load — fix: raise the
  timeout at the tightest scope, per-test `it(name, { timeout: 60_000 }, fn)`, never globally and
  never by shrinking the sample). Distinguish class 1 from class 2 by running the repro both
  standalone and in-batch; class 4 announces itself as "test timed out" with no failed assertion.
  If a pre-commit hook's `vitest related` fails on a critique test unrelated to your diff, suspect
  a flake and re-run standalone before assuming a regression.
