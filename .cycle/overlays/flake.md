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
