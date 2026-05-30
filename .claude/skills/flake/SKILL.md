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

   Also run it **inside a multi-file batch** to test for ordering-dependence:
   `npx vitest run tests/standards/` (or `vitest related` against the file it
   shares an engine with). A flake that only appears in the batch is
   ordering-dependent, not statistical.

2. **Classify** against the three classes in `docs/FLAKY_TESTS.md`:

   | Observation | Class |
   |---|---|
   | Fails standalone ~1-in-N; the failing assertion is a statistical bound; the engine path uses raw `Math.random` and the test does NOT call `installSeededRandom` | **unseeded-statistical** |
   | Passes standalone every time, fails only in a multi-file run | **ordering-dependent** (a prior file leaked a spy / global signal / stale mock) |
   | Playwright hydration-wait timeout, or whole-run import crash | **e2e-timing** |

   Confirm the engine actually draws `Math.random` on the tested path before
   calling it statistical — `grep -n "Math.random" <engine-file>`. If the path
   is fully seeded internally (`scrambleHash`/`sectionSeed`) the flake is
   something else; widen the investigation, don't force a class.

3. **Present the plan.** Format:

   ```
   ## Flake diagnosis

   **Test:** `<path>` — "<failing assertion>"
   **Fail-rate:** <X>/<N> standalone, <Y>/<M> in-batch
   **Class:** <unseeded-statistical | ordering-dependent | e2e-timing>
   **Evidence:** <the failing numbers + the Math.random / ordering finding>

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
