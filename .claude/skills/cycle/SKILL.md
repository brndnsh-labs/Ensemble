---
name: cycle
description: Run the full musical-audit loop on a single story or a chain of them. Composes /implement → /review → /patch → /done with confirmation gates only at meaningful decision points (start, P0 finding, commit). Usage `/cycle <story-id>` for one story, `/cycle next` to start by picking from /next (runs whatever /next picks, including opus stories), or `/cycle next --until-blocked` to keep going after /done until a P0 finding, an opus-tagged next-story, an epic boundary (retrospective pause), or user interrupt. Plan-first — presents the chain before any agent fires.
---

# /cycle — full loop on one story or a chain

Goal: collapse the routine `/implement → /review → /patch → /done` rhythm into one invocation so high-confidence stories don't need 4 manual round-trips. Plan-first — present the chain before doing any work.

## Forms

- `/cycle <story-id>` — one story, full loop, stops at `/done`.
- `/cycle next` — same as above, but starts by running `/next` first to pick the story. Runs whatever `/next` picks (sonnet or opus) without pausing on model tag — the user invoked this consciously.
- `/cycle next --until-blocked` — after each `/done`, auto-call `/next` and continue. Stops on:
  - A P0 reviewer finding (design call you should weigh in on)
  - The next picked story is tagged `Model: opus` (taste-driven; user should re-engage)
  - An epic boundary — the just-shipped story was the last unfinished one in its epic (retrospective pause: lessons learned, doc updates, memory writes)
  - User interrupt
  - A `/done` produces an empty diff or fails

## Workflow

1. **Parse args.** Determine: single story-id, or `next`, or `next --until-blocked`. Note the mode for the plan.

2. **For `next` / `next --until-blocked`:** run the `/next` workflow internally (read `docs/audit/EPICS.md`, identify phase, pick highest-priority unfinished story, surface it). Report the picked story to the user.

3. **Present the cycle plan.** Format:

   ```
   ## Cycle plan

   **Story:** `<epic-slug>/S<N>` — <title>
   **Phase:** <1|2|3>
   **Model:** <opus|sonnet>
   **Chain to run:**
   1. `/implement` (agent: <name>, model: <opus|sonnet>)
   2. `/review` (reviewers: <list>)
   3. `/patch` if findings are mechanical; pause if P0
   4. `/done` (commit + tally update)

   **Auto-pause points:**
   - P0 reviewer finding → surface, ask for direction
   - Tests fail post-patch → surface, ask for direction
   - <--until-blocked only>: next story is opus, epic boundary (retrospective), empty next-result

   Start the cycle?
   ```

4. **On confirmation, run the chain.** Use the existing skills (`/implement`, `/review`, `/patch`, `/done`) as composable steps — invoke their workflows inline rather than re-deriving. Between steps, surface a brief status line ("✅ implement done, running review...") so the user sees momentum.

5. **Decision gates (no user prompt unless required):**

   | After step | Auto-continue if | Pause if |
   |---|---|---|
   | implement | agent Status: Done, typecheck green | Status: Blocked, typecheck red, critique tests regressed |
   | review | findings are all P1 or P2 | any P0 finding, or a finding contradicts a project memory note |
   | patch | tests + typecheck green | tests failing, ambiguous fix requires design decision |
   | done | commit succeeds | hook failure that's not a trivial fix (cspell/biome small fixes are OK to retry inline) |

6. **On `--until-blocked`, after `/done` succeeds:**
   - Check: was the story just shipped the **last unfinished story in its epic**? If yes → stop and surface the retrospective prompt (see below). Don't auto-call `/next` past an epic boundary.
   - Otherwise, run `/next` internally.
   - If next story is sonnet + no orchestrator interrupt → loop back to step 3 (auto-confirm; surface "starting cycle N+1: <story>")
   - Else surface why we stopped: "Stopping the chain: next story is opus / no more stories / etc."

   **Epic-boundary retrospective prompt** (when the last story in an epic ships under `--until-blocked`):

   ```
   ## Epic <N> complete — <epic title>

   **Shipped this chain:** <story-ids>
   **Stories shipped this epic in total:** <N>/<N>

   Before continuing to Epic <N+1>, consider:
   - What surprised us? Anything to add to `MEMORY.md` (feedback / project / reference memories)?
   - Did any audit-doc premises break? Update `docs/audit/<area>.md` if so.
   - Should `docs/MUSICAL_AUDIT.md` "Shipped" history record anything noteworthy?
   - Any follow-ups deferred during the epic worth surfacing as new stories?

   Resume with `/cycle next --until-blocked` when ready, or run `/pmlite` to step back.
   ```

   This is a pause, not a hard stop — the user resumes by re-invoking.

7. **End-of-chain summary.**

   ```
   ## Cycle done

   **Shipped:** <list of story-ids committed>
   **Time:** <wall clock>
   **Skipped/paused:** <story-id if any + reason>

   ## Next:
   - `/next` to see what's left
   - `/cycle next --until-blocked` to keep going
   - or step back into normal manual mode
   ```

## Cost discipline

Each cycle spawns 1 implementer + 1-3 reviewers. Across many stories this compounds. Two guards:

- **Max-stories cap:** `--until-blocked` should self-cap at 5 stories per invocation. After 5, stop and surface a "continue?" prompt.
- **Wall-clock check:** If a single cycle takes >30 min, pause and ask before starting the next — something is probably wrong (test loop diverging, agent confused, etc.).

## Chain references

- Bottom of the chain. Composes `/next`, `/implement`, `/review`, `/patch`, `/done`.
- For parallel sonnet batches use `/fan-out`, not `/cycle`. `/cycle` is methodical, one-story-at-a-time.

## Edge cases

- **Story tagged opus in `--until-blocked` mode:** stop; user should engage manually for taste-driven work. (Plain `/cycle next` runs opus without pausing — the user invoked it consciously.)
- **Last story of an epic ships in `--until-blocked` mode:** stop with the retrospective prompt above. Don't roll into the next epic unattended.
- **Reviewer fails (timeout, no findings returned):** treat as a pause-worthy event; don't auto-`/done` without review.
- **Patch can't fix a P1 mechanically:** surface, treat as P0 for cycle purposes (pause).
- **EPICS.md missing / corrupt:** stop the chain, don't fabricate.

## Safety rules

- Same as `/done`: never `git add -A`, never `--no-verify`, never auto-push, never amend.
- Never override a pause gate without explicit user direction in the current turn.
- Don't accept "looks fine" from a reviewer agent without parsing the actual findings — empty findings is a valid clean result, but missing findings is a failure.
