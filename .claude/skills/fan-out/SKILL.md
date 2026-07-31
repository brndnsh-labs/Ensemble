---
name: fan-out
description: Implement 3–5 independent Ensemble issues in parallel on one shared branch. Verifies the stories are file-disjoint FIRST — any overlap is a hard stop — then spawns one agent per story, waits for all, and re-verifies the gates on the combined tree. For mechanical work that repeats a pattern; not for anything needing judgment. Usage `/fan-out #<a> #<b> #<c>`.
---
<!-- cycle:rendered template=skills/fan-out.md.tmpl hash=e5eb3afc62de — managed by the-cycle; edit the template, not this file -->

# /fan-out — build several independent stories at once

Goal: collapse the wall-clock cost of N mechanical stories that genuinely don't touch each other.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §3
(executor choice, re-verify agent claims), §4 (Gates), §5 (nothing here overrides a brake), §9
(branch policy).

## The disjointness gate — the whole reason this skill is safe

**Build the set of files each story will touch. If any two sets intersect, STOP.**

This is not a heuristic to weigh against throughput; it's the precondition. Two agents editing the
same file produce a tree where both "succeeded" and the result is neither change — and the failure
surfaces later, somewhere else, as a mystery.

- Derive each set from the issue's `Touches:` line **and** a quick trace of what the change
  actually implies. `Touches:` is a claim, not a manifest.
- **Shared/index files are the usual collision** — a route index, a barrel export, a schema, a
  registry, a docs map. If two stories both need one, they are not disjoint.
- Overlap → drop the *fewest* stories needed to make the rest disjoint, and say which and why.
  Don't silently proceed with a smaller set.

## What fan-out is for

**Mechanical work that repeats a pattern across independent files.** The same rename in six
modules. The same missing guard in four handlers.

**Not for:** anything needing judgment, anything on a §5 always-brake surface, anything where the
right answer for story B depends on how story A turned out. If you're tempted to fan out
non-mechanical work, run `/burndown` instead — serial, and it stops properly.

## Workflow

1. **Parse the issue refs** (3–5; more than 5 is a queue, not a batch).
2. **Read each issue** and build its file set.
3. **Run the disjointness gate.** Overlap → drop or stop.
4. **Present the batch plan:**

   ```
   ## Fan-out plan
   | # | Title | Files it owns | Why it's mechanical |
   |---|---|---|---|
   **Branch:** <shared batch branch>
   **Disjointness:** verified — no two stories share a file
   **Dropped:** <story + which file it collided on>, if any
   ```

5. **One batched Status write** (§7), then **branch once** — all stories land on one shared branch
   (§9). Separate branches would defeat the point.
6. **Spawn all agents in a single message** so they actually run in parallel. Each prompt names:
   the issue number and its acceptance, **the exact files it owns and that it must touch no
   others**, the §4 gates, and a `## Result` block to return.
7. **Wait for all of them.**
8. **Re-verify the gates yourself on the combined tree** (§3) — this is non-negotiable and it is
   *not* the same as each agent's green. Individually-correct changes can combine into a broken
   tree, and that's exactly what this step catches:
   ```
   npm run typecheck     # tsc over public/**/*.{ts,tsx}
   npm run lint          # Biome lint + format check
   npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)
   npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
   npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)
   ```
9. **Confirm the writes actually landed.** A subagent reporting "completed" is evidence of intent,
   not of a successful write. Check the files changed — by modification time or content, not by
   trusting the report.
10. **Roll back any blocked story's Status** so nothing is stranded, and report per-story.

## Safety

- **The disjointness gate is not negotiable.**
- **Never fan out judgment-shaped work.** Parallel agents multiply a bad call by N.
- **One reviewer pass over the combined diff**, not N independent ones — the interactions are the
  risk, and only a combined review sees them.

## Edge cases

- **An agent returns Blocked:** roll that story back, keep the others, report it.
- **An agent edited a file it didn't own:** treat the batch as suspect. Review the whole combined
  diff carefully before going further — the disjointness guarantee is gone.
- **Gates red on the combined tree but green individually:** that's the interaction this skill
  exists to catch. Bisect by reverting one story at a time; don't patch blindly.
