---
name: dep-update
description: Routine dependency hygiene for Ensemble — survey what's outdated, plan the bump, update, run the gates, and land one lockfile commit. Distinguishes a stale test expectation from a real regression. Never uses `audit fix --force`; never auto-pushes. Plan-first. Usage `/dep-update` (or `/dep-update <package>`).
---
<!-- cycle:rendered template=skills/dep-update.md.tmpl hash=461a7c9551b0 — managed by the-cycle; edit the template, not this file -->

# /dep-update — dependency hygiene

Goal: keep dependencies current without turning a routine bump into an outage.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §4
(Gates), §8 (commit conventions — explicit paths), §9 (branch policy).

- **Biome version bumps** can change formatter output (e.g. `it.each(...)` call
  wrapping) and fail `lint` on files it didn't touch — not a regression. Run
  `npm run format` to reformat, and if Biome complains `biome.json`'s `$schema` is
  stale, bump it to match. Re-run `npm test` after.
- **cspell major bumps (9→10 seen before)** — check whether `package.json` already
  declares the new major before treating it as live work; it may already be pinned.

## Workflow

1. **Survey.** ``. Group by risk: patch/minor on a leaf dependency is
   routine; a **major**, a **framework**, or anything with a **native build step** is not.
2. **Present the plan** (a status update, not a gate — §5): what's bumping, from → to, which group
   each falls in, and anything you're deliberately holding back and why.
3. **Branch** (§9).
4. **Update.** `` for the routine set; name specific packages for anything riskier.
   Take majors **one at a time** — a batch of majors makes a failure impossible to attribute.
5. **Watch the install output**, don't just check the exit code. A patch step that silently
   no-ops, a native module that rebuilds against a different ABI, or a postinstall that fails
   soft will all exit 0 and break at runtime.
6. **Advisories.** Fix each on its own terms. An advisory that can
   only be cleared by a major bump is a different change than the one you're making — surface the
   tradeoff rather than folding it in.
7. **Run the gates** (§4):
   ```
   npm run typecheck     # tsc over public/**/*.{ts,tsx}
   npm run lint          # Biome lint + format check
   npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)
   npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
   npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)
   ```
   **A red gate here is one of two things, and they need opposite responses:**
   - **A stale expectation** — the dependency legitimately changed its output, and the test
     encoded the old one. Update the test, and say so in the commit.
   - **A real regression** — the dependency broke something you rely on. Do **not** update the
     test to match. Pin back, and file it.

   If you can't tell which, that's a judgment call (§5) — surface it rather than guessing.
8. **Commit** (§8) — one commit, explicit paths (, plus any test file a
   *stale expectation* legitimately required). Never `-A`.
9. **Report** what moved, what's held back and why, and gate status. **Don't auto-push** — a
   dependency bump lands on Brandon's schedule.

## Edge cases

- **Lockfile drift with nothing outdated:** `` rewrote the lockfile without any
  version change (a transitive resolution moved). That's a legitimate standalone commit — say so, don't
  bury it in an unrelated diff.
- **A formatter or linter bumped** and now reformats files nobody touched: separate the
  reformat-everything commit from the version bump, or the diff is unreviewable.
- **A native or compiled dependency's ABI changed**: the gates may pass locally and fail on the
  deploy target, which runs a different runtime version. Call it out explicitly.
- **A patch/override is in play:** confirm it still applies after the bump. A silently-dropped
  patch is the classic "it worked locally" failure.
- **Nothing is outdated:** say so and stop. Don't manufacture a bump.
