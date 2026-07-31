---
name: flake
description: Diagnose one flaky Ensemble test. Runs it in isolation N times to measure an empirical fail rate, but decides on VARIANCE not pass-count — byte-identical output across runs means it isn't a flake at all. Classifies against four causes, applies the canonical fix for that class, and registers it. Never seeds or skips to hide a real bug. One flake per invocation. Usage `/flake <test>`.
---
<!-- cycle:rendered template=skills/flake.md.tmpl hash=083be1268a44 — managed by the-cycle; edit the template, not this file -->

# /flake — diagnose one flaky test

Goal: find out *why* a test is unreliable, and fix that — rather than making the symptom go away.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §4
(Gates), §5 (a flake that's actually a real bug is a judgment call).

## The load-bearing insight: variance decides, not pass count

The instinct is to run the test 20 times and read the pass rate. **That's the secondary signal.**

The decisive one is **variance in the test's own observed values across runs.** Log what the test
actually computes on each run, then compare:

- **Values differ across runs** → genuinely non-deterministic. Now classify it (below).
- **Values are byte-identical across runs, but the test still failed somewhere** → **it is not a
  flake.** The input is stable, so the failure came from outside the test's own logic — ordering,
  shared state, a resource, the environment, or a real intermittent bug in the code. **Say so and
  stop**; a "fix" aimed at nondeterminism will do nothing here except hide the trail.

That second case is the one that gets misdiagnosed, and the cost is high: the test gets seeded or
retried, looks fixed, and the real intermittent bug stays in the product.

**Anti-heuristic warning.** Grepping for `Math.random` / a missing seeded helper **over-counts
badly** — plenty of tests reference randomness and are perfectly stable, and plenty of unstable
tests contain none. Measure; don't pattern-match.

## The four classes

| Class | Tell | Canonical fix |
| --- | --- | --- |
| **Unseeded statistical** | values differ every run; failures cluster near a threshold | seed the generator **at the test boundary**, or assert a range wide enough to be true rather than a point that's usually true |
| **Ordering-dependent** | passes alone, fails in suite (or vice-versa) | find the shared state — a module-level cache, a global, a leaked handle — and isolate it. Don't just reorder the file. |
| **Timing / async** | fails under load or in CI, passes locally | wait on the actual condition, never on a duration. A raised timeout is a deferral, not a fix. |
| **Slow but legitimate** | never actually fails; trips a timeout | it isn't flaky. Raise the budget, or split the test, and say which. |

## Workflow

1. **Run it in isolation, N times** (start at ~20), capturing the values it computes, not just
   pass/fail.
2. **Read the variance first.** No variance → the "not a flake" exit above.
3. **Measure the empirical fail rate** as the secondary signal, and note it — a 1-in-50 flake and a
   1-in-3 flake justify very different responses.
4. **Classify** against the table. **Confirm the class before fixing** — the fixes are mutually
   wrong, and applying the seeding fix to an ordering problem hides it perfectly.
5. **Apply that class's canonical fix.**
6. **Re-run N times to confirm**, then run the full suite (§4) — an isolation fix that breaks a
   neighbor is common.
7. **Register it** — comment the record on the issue you filed for this flake (§7):
   test, class, fix, and the measured before/after rate. If it was fixed without an issue, file
   one closed rather than inventing a new home for the record — one durable, searchable place is
   what turns "this feels flaky lately" into evidence next time.

## Safety — the rules that keep this from causing harm

- **Never seed to hide a real bug.** If the test only passes with one seed, the code is wrong for
  the other seeds and you have found a bug, not a flake. Surface it (§5).
- **Never `.skip` as the fix.** A skipped test is a deleted test that still shows up in the count.
  Skipping to unblock a release is a decision for Brandon, taken explicitly and with a
  filed issue — not a diagnosis.
- **Never raise a timeout to make timing flakiness go away.** Wait on the condition.
- **One flake per invocation.** Batching diagnoses is how the wrong fix gets applied to the wrong
  class.

## Edge cases

- **It won't reproduce in N runs:** report the measured rate (possibly zero) and stop. Don't fix
  what you can't observe.
- **The fix is in the product code, not the test:** that's a real bug — file it and route it
  through `/cycle`.
- **Several tests share one root cause:** fix the cause once; note the others in the registry entry
  rather than opening four of them.

**No separate registry file** — a fixed flake is recorded by commenting on the issue
you filed for it (or filing one closed if there wasn't one), same as any other finding.
The tracker is the durable record.

**Repro:**
```bash
# unit / critique (vitest) — capture the LOGGED VALUES, not just pass/fail
for i in $(seq 1 10); do
  npx vitest run <path> --reporter=verbose 2>&1 \
    | grep -iE "Tests .*(passed|failed)|AssertionError|<the metric labels the test logs>" \
    | sed "s/^/[run $i] /"
done
# e2e (playwright)
for i in $(seq 1 5); do npx playwright test <path> 2>&1 | tail -3; done
# ordering-dependence check — run inside the full multi-file batch too
npx vitest run tests/standards/
```

**The decisive signal is variance in the LOGGED values, not pass count** — a test that
passes 10/10 can still be a latent flake one unlucky roll from its bound. Byte-identical
values across runs = deterministic on that path (seeded `scrambleHash`/`sectionSeed`) =
**not a flake**, stop there; don't seed it. The `Math.random`-grep / `installSeededRandom`-
absence heuristic over-counts badly — the engines were migrated to seeded hashing, so
variance across runs is the only reliable tell.

**Fixes:**
- **unseeded-statistical** → `import { installSeededRandom } from '<rel>/utils/seeded-random.js';`
  (path from repo root: `tests/utils/seeded-random.ts`), call `installSeededRandom()` at
  the top of the `describe`. Remove a redundant `beforeEach(() => vi.restoreAllMocks())`
  (the helper does it in before+after). Verify the seeded draw lands with comfortable
  margin — a default seed sitting right at the bound needs `reseed()` to a representative
  passing value, noted in a `// why:` comment. Never pick a seed that masks a genuinely
  out-of-range distribution.
- **ordering-dependent** → find the leaking file (ran earlier, left a spy/mock/signal
  dirty); add the missing `afterEach(() => vi.restoreAllMocks())` or convert to
  `installSeededRandom` (restores both sides). Confirm by re-running the batch.
- **e2e-timing** → timeout: ensure the spec uses the `gotoHydrated` helper and the
  `globalSetup` warm-up is intact (don't introduce `vite preview`). Import crash:
  default-import `@playwright/test` only.
