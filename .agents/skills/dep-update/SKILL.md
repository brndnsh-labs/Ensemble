---
name: dep-update
description: Routine dependency hygiene for Ensemble — survey what's outdated, bump it in risk-sized steps, run the gates, and land one dependency commit. Tells a stale test expectation from a real regression. Never force-fixes advisories; never auto-pushes. Usage `/dep-update` (or `/dep-update <package>`).
---
<!-- cycle:rendered template=skills/dep-update.md.tmpl hash=40855090e2ec — managed by the-cycle; edit the template, not this file -->

# /dep-update — dependency hygiene

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context** (§4 gates, §6
branch and commit policy).

- **Biome version bumps** can change formatter output (e.g. `it.each(...)` call
  wrapping) and fail `lint` on files it didn't touch — not a regression. Run
  `npm run format` to reformat, and if Biome complains `biome.json`'s `$schema` is
  stale, bump it to match. Re-run `npm test` after.
- **cspell major bumps (9→10 seen before)** — check whether `package.json` already
  declares the new major before treating it as live work; it may already be pinned.

1. **Survey:** `npm outdated` and `npm audit`. Patch/minor bumps of leaf packages are routine; a
   major, a framework, or anything with a native build step is not — take those **one at a time**,
   so a failure can be attributed.
2. **Branch** (§6), then update: `npm update` for the routine set; name packages for the rest.
   Read the install output, not just the exit code — a silently skipped patch or a native rebuild
   against the wrong ABI exits 0 and breaks at runtime.
3. **Advisories:** `npm audit fix` if needed, **never with a force flag** — forcing installs semver-major
   changes nobody reviewed. An advisory only a major bump clears is a separate change —
   surface the tradeoff.
4. **Gates (§4).** A red gate is one of two opposite things: a **stale expectation** (the dependency
   legitimately changed its output — update the test and say so in the commit) or a **real
   regression** (pin back and file it; don't bless it). Can't tell which → surface it.
5. **Commit once** (§6) with explicit paths: `package.json`, `package-lock.json`, plus any test a stale
   expectation required. A formatter bump that reformats untouched files gets its own commit.
6. **Report** what moved, what's held back and why, and gate status. **Don't push** — a dependency
   bump lands on Brandon's schedule.

**Lockfile drift with nothing outdated** (`npm install` rewrote `package-lock.json` with no version change) is a legitimate
standalone commit — say so; don't bury it in another diff. Nothing outdated → say so and stop.
