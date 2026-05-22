---
name: synth-cycle
description: Run one synth-audit story end-to-end, from picking it off the board through to the listening gate. Composes the synth-audit per-story flow — pick next story → implement → typecheck/jscpd → synth-graph-reviewer → patch → present the A/B audition steps and HALT. The listening gate is a hard human stop, not a confirmation gate, because the synth track has no automated Definition of Done. Re-invoke as `/synth-cycle approved` after auditioning to finalize (Status line + tally + commit) and roll straight into the next story. Usage `/synth-cycle` to start the next story, `/synth-cycle approved` to finalize the awaiting one and continue, `/synth-cycle <epic-N>/S<M>` for a specific story. Plan-first — presents the plan before any agent fires. This is the synth-audit (`docs/synth-audit/`) counterpart to `/cycle`; it does NOT touch the musical-audit track.
---

# /synth-cycle — one synth-audit story to the listening gate

Goal: collapse the synth-audit per-story rhythm into one invocation so a story doesn't need "continue, continue, continue". Plan-first — present the plan before doing any work.

**This skill drives the synth-audit track only** (`docs/synth-audit/`). It is the deliberate counterpart to `/cycle`, which is wired to the musical-audit track (`docs/audit/`). The two tracks share no infrastructure — different board, different reviewer, different Definition of Done. Never let this skill pick a musical-audit story, and never let `/cycle` pick a synth one.

## Why this is not `/cycle`

`/cycle` can chain `--until-blocked` because the musical audit has an automated oracle — critique tests. The synth audit does **not**. The only honest verdict that a synth story is done is the **owner listening through the A/B audition harness** (Epic 0 S1). So:

- **Every story has a mandatory human gate.** This skill runs one story *to* that gate and **halts**. It cannot chain unattended.
- A story splits into a **pre-gate half** (pick → implement → review → patch — all of which run without the owner) and a **post-gate half** (Status line + tally + commit — runs only after the owner approves).

## Forms

- `/synth-cycle` — orient, pick the next unshipped story, run its pre-gate half, halt at the listening gate.
- `/synth-cycle approved` — the owner has auditioned the story currently awaiting the gate and approved it. Run its post-gate half (finalize + commit), then immediately pick up the next story and run *its* pre-gate half. This is the loop: `/synth-cycle` → listen → `/synth-cycle approved` → listen → …
- `/synth-cycle <epic-N>/S<M>` — run a specific story's pre-gate half (e.g. `/synth-cycle epic-1-harmony/S3`).

If the owner auditioned and found a problem, they say so in natural language (not `approved`) — address the feedback, re-run the relevant pre-gate steps, and re-present the gate. Do not finalize.

## Workflow

1. **Orient.** Read `docs/synth-audit/EPICS.md` (the status table + the "Current position / Next" pointer). Run `git status` / `git diff --stat`. Determine the state:
   - **Clean tree** → no story in flight; this is a fresh pickup.
   - **Uncommitted synth changes + the in-flight story has no `**Status:**` line** → a story is mid-flight (either pre-review, or awaiting the listening gate).

2. **Resolve the invocation:**
   - `approved` → there must be an awaiting-gate story (uncommitted, reviewed, patched). Go to **step 7** (post-gate half), then fall through to step 3 for the next story.
   - explicit `<epic-N>/S<M>` → that story.
   - bare `/synth-cycle` → if a story is awaiting the gate, **stop** and re-present its listening gate (don't start a new story on top of an un-auditioned one). Otherwise pick the next story: lowest epic number, then lowest story number, first story with no `**Status:**` line.

3. **Load the story.** Open `docs/synth-audit/epic-<N>-<slug>.md`, read the chosen story's full text — its prose, **Acceptance**, **Effort**, **Model**, **Reviewer**, **Source**.

4. **Present the plan and stop for confirmation:**

   ```
   ## Synth-cycle plan

   **Story:** `epic-<N>-<slug>/S<M>` — <title>
   **Model:** <opus|sonnet>   **Reviewer:** <synth-graph-reviewer [+ state-discipline-reviewer]>
   **Acceptance:** <one-line paraphrase>

   **Pre-gate half (this invocation):**
   1. Implement — <main-thread orchestrator | general-purpose agent>
   2. typecheck + Biome + `npm run jscpd` + targeted vitest / critique test
   3. synth-graph-reviewer on the diff [+ state-discipline-reviewer if a state slice changed]
   4. Patch P0/P1 findings
   5. Present the A/B listening gate — then HALT

   **Post-gate half (after you audition + `/synth-cycle approved`):**
   Status line + EPICS.md tally + Current-position pointer + AI_MAP (if a new file) + one commit.

   Start?
   ```

5. **On confirmation, run the pre-gate half:**
   - **Implement.** For a per-instrument voice story, fill in `play<X>New` in the relevant `synth-*.ts`. **Never touch `play<X>Current`** — it is the bit-identical original and the `current` toggle position. There is no audio-DSP implementer agent (only `synth-graph-reviewer` was ever built) — implement on the main thread for foundation-sized work, or spawn a `general-purpose` agent (model per the story's `Model:` tag) for a larger voice rebuild.
   - **Verify.** `npm run typecheck`, Biome, `npm run jscpd`, and the relevant targeted test. **jscpd has a 5% clone threshold** — a `New` voice must be genuinely *different* from its `Current` (that is the design intent, not just a lint rule); a near-copy will trip it.
   - **Review.** Spawn `synth-graph-reviewer` on the uncommitted diff. Also spawn `state-discipline-reviewer` if a `public/state/*` slice changed. Parse the actual findings — empty findings is a valid clean result, *missing* findings is a failure.
   - **Patch.** Fix P0 and mechanical P1 inline. A P0 that needs a design decision → surface and pause. P2 is judgment — defer to a note in the relevant epic/area doc.

6. **Present the listening gate and HALT.** This is the hard stop. Format:

   ```
   ## Listening gate — needs you

   `epic-<N>-<slug>/S<M>` is implemented and reviewed (synth-graph-reviewer: <verdict>).
   Left **uncommitted** pending your ear.

   **A/B audition steps:**
   <for a mix-side change: "Just play — it affects `current` output directly.">
   <for a voice change: "Open <instrument> settings → enable New Sound. Play <what to play>.
    Listen for <the specific change>. Toggle back to Current for the A/B.">

   Approve with `/synth-cycle approved` (finalizes + commits, then starts the next story).
   If something's off, just say what — I'll fix and re-present.
   ```

   Do not commit. Do not proceed. Stop here.

7. **Post-gate half (only on `/synth-cycle approved`):**
   - Add a `**Status:** Shipped <date>. <2–4 sentence summary of what landed, what the reviewer found/that it was fixed, verification, owner approved.>` line to the story in its epic file.
   - Bump the `Done` count in that epic's row in the `docs/synth-audit/EPICS.md` status table; bump the `**Total: N / 46**` line.
   - Update the `**Current position:**` / `**Next:**` pointer in `EPICS.md`.
   - If the story added a new `public/**` file, register it in `AI_MAP.md` (the pre-commit docs-lint hook blocks otherwise).
   - Commit — one commit per story, Conventional Commit (`feat(synth-audit): … (Epic <N> S<M>)`). Never `git add -A` blindly (review the staged set), never `--no-verify`, never auto-push, never amend.
   - If the just-shipped story was the **last unfinished story in its epic**, stop with the epic-boundary retrospective prompt (below) instead of rolling into the next epic.
   - Otherwise fall through to step 3 and run the next story's pre-gate half.

## Epic-boundary retrospective prompt

When the last story in an epic ships:

```
## Epic <N> complete — <epic title>

**Shipped this epic:** <story count>/<total>

Before Epic <N+1>, consider:
- The epic-0 note says do a **full listening pass** after the foundation epic — and a lighter cross-genre pass after each per-instrument epic.
- What surprised us? Anything for `MEMORY.md` (feedback / project memories)?
- Did any discovery-report premise (`docs/synth-audit/<area>.md`) break? Update it.
- Any carry-over notes left in a later epic file that are now actionable?

Resume with `/synth-cycle` when ready.
```

This is a pause, not a hard stop — the owner resumes by re-invoking.

## Decision gates (no user prompt unless required)

| After step | Auto-continue if | Pause / halt if |
|---|---|---|
| implement | typecheck + Biome + jscpd green, targeted test green | typecheck red, jscpd over 5%, test regressed, `play*Current` was touched |
| review | findings are all P1/P2 (P1 mechanically fixable) | any P0, a P1 needing a design call, or a finding contradicts a project memory |
| patch | tests + typecheck green after the fix | tests still failing, fix is ambiguous |
| listening gate | — | **always halt** — this is the Definition of Done |
| commit | hook passes (cspell/Biome auto-fixes OK to retry inline) | non-trivial hook failure |

## Edge cases

- **A story is already awaiting the gate when `/synth-cycle` is invoked bare:** re-present that gate; don't stack a new story on an un-auditioned one.
- **`/synth-cycle approved` with no awaiting story:** nothing to finalize — say so, then offer to start the next story.
- **`play<X>Current` shows up in the diff:** stop. `current` must stay bit-identical; the change belongs in `play<X>New` or a shared helper that `Current` does not consume.
- **`synth-graph-reviewer` not invocable** (e.g. the session that *created* it): fall back to `general-purpose` for the audio-graph hygiene pass and note the substitution.
- **EPICS.md missing / corrupt:** stop; don't fabricate the board.
- **A P0 needs a musical/mix design decision:** surface it — don't patch a design call silently.

## Chain references

- Self-contained — the synth track has no `/implement` `/review` `/patch` `/done` skills of its own (those are musical-audit). This skill performs all four steps inline.
- Single-story only. There is no `--until-blocked`: every story gates on the owner's ear, so unattended chaining is impossible by design.
- `/pmlite` and `/next` are musical-audit tools — they will not see synth-audit progress. Read `docs/synth-audit/EPICS.md` directly to check the board.
