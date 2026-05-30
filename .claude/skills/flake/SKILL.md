---
name: flake
description: Diagnose and fix a flaky test, then record it in docs/FLAKY_TESTS.md. Takes a test path (or reads the last failure from conversation context), runs it in isolation N times to measure an empirical fail-rate, classifies the root cause against the three known classes (unseeded-statistical, ordering-dependent, e2e-timing), applies the canonical fix for that class, and appends a registry entry. Use when a test failed once and you suspect nondeterminism, or after a pre-commit/CI hook trips on a test that passes on retry. Plan-first.
---

# /flake — diagnose, fix, and record a flaky test

Goal: turn "this test failed once and I don't know why" into a root-caused,
fixed, and documented flake. Ensemble is flake-prone by design (random
generative engines + statistical critique bounds + a live dev server for e2e),
so flakes recur — this skill makes diagnosis repeatable instead of re-derived.

The tracker is [`docs/FLAKY_TESTS.md`](../../../docs/FLAKY_TESTS.md). Read its
"three flake classes" table first — it's the classifier this skill applies.

## When to use

- A test failed in a pre-commit hook (`vitest related`) or CI but passes on retry.
- A critique test failed once and you suspect an unlucky `Math.random` roll.
- A Playwright spec timed out under parallel workers.
- NOT for a test that fails *deterministically* — that's a real bug or a stale
  expectation, fix it directly (or via `/patch`), don't route it through here.

## Inputs

- `$ARGUMENTS` is the test path (e.g. `tests/standards/rock-bass-critique.test.ts`),
  optionally with a `-t "test name"` filter.
- If no argument: read the most-recent test failure from conversation context
  (the failing file + assertion). If none is in context, ask the user for the
  failing test path — don't guess.

## Workflow

Plan-first: present the diagnosis plan (which test, how many repeats, what
you'll measure) before running anything long.

1. **Reproduce + measure fail-rate.** Run the test *in isolation* N times and
   count failures. Start with N=10; bump to 20-30 if it's clean but you have
   strong evidence it flakes (rare flakes need many runs to surface).

   ```bash
   # unit / critique (vitest)
   for i in $(seq 1 10); do
     npx vitest run <path> 2>&1 \
       | grep -E "Tests .*(passed|failed)|AssertionError|expected .* to be" \
       | sed "s/^/[run $i] /"
   done

   # e2e (playwright)
   for i in $(seq 1 5); do npx playwright test <path> 2>&1 | tail -3; done
   ```

   **The decisive signal is variance, not a clean pass-count.** A test that
   passes 10/10 can still be a latent flake sitting one unlucky roll from a
   bound. For a critique test, capture the *logged statistical values* across
   runs (the report lines — ghost %, jump counts, ratios) — vitest hides
   `console.log` on pass, so use `--reporter=verbose`:

   ```bash
   for i in $(seq 1 8); do
     npx vitest run <path> --reporter=verbose 2>&1 \
       | grep -iE "<the metric labels the test logs>" | sed "s/^/[run $i] /"
   done
   ```

   - **Values byte-identical across runs → the path is already deterministic
     (seeded `scrambleHash`/`sectionSeed`). NOT A FLAKE — stop here.** Do not
     seed it: a deterministic test gains nothing and the change falsely brands
     it as formerly-flaky. Report "not a flake" (step 3) and exit. This is the
     common case — the `Math.random`-grep / `installSeededRandom`-absence
     heuristic over-counts badly, because the *engines* were migrated to seeded
     hashing, so most "unseeded" tests never actually roll a die on their path.
   - **Values vary but all passed → latent flake.** Measure how close the
     varying value gets to its bound. Near the edge → proceed to fix. Wide
     margin → note it in the tracker as `🟡` (watch) but a fix is optional.
   - **Values vary and some failed → active flake.** Proceed to classify + fix.

   Also run it **inside a multi-file batch** to test for ordering-dependence:
   `npx vitest run tests/standards/` (or `vitest related` against the file it
   shares an engine with). A flake that only appears in the batch is
   ordering-dependent, not statistical.

2. **Classify** against the three classes in `docs/FLAKY_TESTS.md`:

   | Observation | Class |
   |---|---|
   | Logged values **vary** across standalone runs; the failing assertion is a statistical bound | **unseeded-statistical** (the engine rolls raw `Math.random` on this path) |
   | Logged values **identical** standalone, fails only in a multi-file run | **ordering-dependent** (a prior file leaked a spy / global signal / stale mock) |
   | Playwright hydration-wait timeout, or whole-run import crash | **e2e-timing** |

   The variance check in step 1 already did the disambiguation: a test whose
   values are identical standalone is deterministic on its path, so a failure
   that only appears in-batch must be an *external* perturbation (an ordering
   leak), not the engine. Don't classify on the `Math.random`-grep or the
   absence of `installSeededRandom` — both over-count, because the engines were
   migrated to seeded hashing. Variance across runs is the only reliable tell.

3. **Present the verdict.** If the step-1 variance check showed identical
   values (deterministic), this is the **not-a-flake exit** — report and stop,
   no fix, no tracker entry:

   ```
   ## Not a flake

   **Test:** `<path>`
   **Evidence:** logged values byte-identical across <N> runs (<the values>) — deterministic on the tested path (seeded scrambleHash/sectionSeed).
   **Verdict:** no fix. The unseeded-test heuristic over-counted; the engine path never rolls a die.
   ```

   Otherwise present the fix plan:

   ```
   ## Flake diagnosis

   **Test:** `<path>` — "<failing assertion>"
   **Fail-rate:** <X>/<N> standalone, <Y>/<M> in-batch
   **Class:** <unseeded-statistical | ordering-dependent | e2e-timing>
   **Evidence:** <the varying numbers + the Math.random / ordering finding>

   **Fix:** <canonical fix for the class — see table below>
   **Validation:** re-run <path> <N>x to confirm determinism + comfortable margin

   Apply the fix?
   ```

4. **Apply the canonical fix** for the class:

   | Class | Fix |
   |---|---|
   | unseeded-statistical | Add `import { installSeededRandom } from '<rel>/utils/seeded-random.js';` and call `installSeededRandom();` at the top of the `describe`. Remove any redundant `beforeEach(() => vi.restoreAllMocks())` (the helper does it in before+after). Then **verify the seeded draw lands with comfortable margin** — read the report numbers; if the default seed sits right at the bound, `reseed()` to a representative passing value and say so in a `// why:` comment. Never pick a seed that hides a genuinely out-of-range distribution — that converts a flake into a masked bug. |
   | ordering-dependent | Find the leaking file (the one that ran before and left a spy / mock / signal dirty). Add the missing `afterEach(() => vi.restoreAllMocks())` or convert it to `installSeededRandom` (restores both sides). Confirm by re-running the batch. |
   | e2e-timing | Timeout → ensure the spec uses the `gotoHydrated` helper and the `globalSetup` warm-up is intact (do not introduce `vite preview`). Import crash → default-import `@playwright/test` only. |

   Add a `// why:` comment at the fix site explaining the flake (per CLAUDE.md
   "Musical intent" / comment discipline), citing `docs/FLAKY_TESTS.md`.

5. **Validate the fix.** Re-run the test 5x standalone — all must pass — and
   confirm the seeded draw has margin (not a borderline pass). For
   ordering-dependent, re-run the batch that exposed it.

6. **Record it.** Append an entry to `docs/FLAKY_TESTS.md` under "Registry"
   matching the existing heading format
   (`### <status-emoji> <path> — "<assertion>"`), all five fields filled
   (class, symptom, root cause, fix, last seen). Status `🟢 fixed` once the
   patch is in and validation is green.

7. **Report.**

   ```
   ## Flake fixed

   **Test:** `<path>`
   **Class:** <class> | **Was:** <X>/<N> fail-rate → **Now:** 5/5 pass, margin <m>
   **Fix:** <one-line>
   **Tracker:** entry added to docs/FLAKY_TESTS.md

   ## Next:
   - `/done` to commit (test + tracker together)
   ```

## Chain references

- Often triggered by a `/done` or `/cycle` pre-commit hook failure that passes on retry.
- Hands off to `/done` to commit the fix + tracker entry together.
- If diagnosis reveals the failure is *deterministic* (a real regression, not a flake), stop and route to `/patch` or `/implement` instead.

## Safety rules

- **Never seed to hide a bug.** Seeding makes a test deterministic; if the
  deterministic draw is genuinely out of the intended musical range, that's a
  real regression — surface it, don't pick a luckier seed.
- **Don't `.skip` a flake as the "fix."** Quarantine (`🟡`) is a last resort
  for a flake you can't yet root-cause, and it must get a tracker entry with a
  follow-up. The default is to actually fix it.
- **Confirm the class before fixing.** A misclassified ordering-leak "fixed" by
  seeding the wrong file will keep flaking. Run the in-batch repro.
- **One flake per invocation.** If the repro surfaces a second unrelated flake,
  record it as `🔴 open` in the tracker and finish the one you came for.
