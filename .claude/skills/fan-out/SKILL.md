---
name: fan-out
description: Implement 3-5 Ensemble work stories in parallel. Loads each issue's context from the board, verifies file-disjointness (no two stories edit the same file), determines the right agent + model per story, sets each Status → In progress, and presents a batch plan before spawning. Plan-first — does not spawn until confirmed. Use for disjoint batches; do NOT use for stories that share a hot file (coordination-engine.ts, tick-logic.ts). Usage `/fan-out #<n1> #<n2> #<n3>...`.
---

# /fan-out #<n…> — parallel implementation batch

Goal: take a curated list of disjoint issues, spawn implementer agents in parallel, await all, then
suggest `/review`.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §1
(pickability), §3 (Track → executor + model + reviewer; re-verify agent claims), §4 Gates, §9 Branch
policy, §7 (the **batch** rule for the Status writes). The procedure below is just the ordering.

## Workflow

1. **Parse the issue refs.** `#<n>` each. Require at least 2; warn over 5 (diminishing returns +
   context pressure + a large post-batch review diff).
2. **Load each issue's context** (§7 read + `gh issue view`): Why/Touches/Acceptance, Track, Agent,
   Model, Size, Review lens, files-touched (from Touches). Confirm each is **pickable** (§1).
3. **Verify file-disjointness.**
   - Build the set of files-touched per story. Any file in two stories' sets is a conflict — **do not
     proceed**; present it and suggest which to drop.
   - `coordination-engine.ts`, `tick-logic.ts`, `scheduler-core.ts`, and the worker sync files are
     particularly likely to collide — stories sharing them must run sequentially, not fanned out.
4. **Pick agent + model per story** (§3) — from the Agent/Model fields, sanity-checked against Track +
   Touches. Different models in one batch is fine.
5. **Set each Status → In progress** in **one batch call** (§7):
   `node scripts/gh-project.mjs batch /tmp/fanout-status.json` (one `{issue,field:"Status",value:"In
   progress"}` per story) — never a loop of single writes.
6. **Branch** (§9) — a shared batch branch is fine for a disjoint set (`git checkout -b <batch-slug>`).
7. **Present the batch plan:**

   ```
   ## Plan: fan-out batch (<N> stories)
   | Issue | Track | Agent | Model | Files | DoD |
   | :- | :- | :- | :- | :- | :- |
   | #12 | musical | musical-engine-implementer | sonnet | bass-engine.ts | jazz-bass-critique |
   | #15 | bundle  | claude | sonnet | viz-overlay.tsx | KB delta |
   **File-disjointness:** ✅ verified   **Branch:** <batch-slug>
   **Reviewers (after):** <union per §3 / the combined diff>
   Spawn all <N> in parallel? Or adjust?
   ```

8. **On confirmation, spawn all in parallel** — single message, multiple `Agent` calls,
   `run_in_background: false`. Each prompt = `/implement`'s spawn shape (cite issue #, acceptance,
   Track DoD, file ownership "edit ONLY <files>, report Blocked if you need others", ask for `## Result`).
9. **As each reports, capture its `## Result`.** Don't summarize until all are in.
10. **Independently re-verify** (§3) — re-run the §4 gates + each story's Track DoD **yourself** on the
    combined tree; an agent's "green" is a claim.
11. **Present the batch report:** ✅/⚠️ per story (with the re-verified gate status), combined diff
    stat, and any Blocked ones. Roll a Blocked story's Status back to `Ready` (§7) so the board doesn't
    strand it In-progress.
12. **Suggest `/review`** on the combined diff.

## Edge cases

- **Two stories edit the same file:** drop one; run it sequentially after via `/implement`.
- **A story is opus, bundled with sonnet ones:** fine — spawn it on opus alongside.
- **One agent finishes much faster:** wait. Don't review partial state.
- **An agent reports Blocked:** keep the others running; report the blocker; roll its Status back to
  Ready. Don't kill siblings.
- **Mixed Tracks in one batch:** fine if files are disjoint — the post-batch `/review` unions the
  Track-appropriate reviewers; a synth story in the batch still hits its listening gate at `/done`.
