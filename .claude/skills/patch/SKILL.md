---
name: patch
description: Address reviewer findings on the uncommitted diff. Reads the most-recent /review output from conversation context, classifies findings by severity (P0 escalate, P1 auto-fix if mechanical, P2 defer to follow-up), presents a fix plan with file:line citations, then patches inline. No agent spawn — orchestrator does the edits since reviewer findings are usually small and surgical. Use after /review surfaces findings, before /done. Plan-first.
---

# /patch — address reviewer findings

Goal: close the review→done seam by sorting /review's findings and applying inline fixes. Plan-first — present the triage and fix plan before doing any edits.

## When to use

- Right after `/review` surfaces findings.
- Before `/done` — patch first, then commit.
- NOT for design-level changes — those go back to `/implement` with a fix-focused prompt.

## Workflow

1. **Load findings.** Read the most-recent reviewer output(s) from conversation context. Each finding should have:
   - Severity (P0 / P1 / P2 — or inferred from the reviewer's language)
   - File path + line number
   - Verbatim line quote
   - Suggested direction

   If findings aren't already in context (e.g., new session), surface that gap — ask the user to re-run `/review` or paste the findings.

2. **Triage.** Classify each finding into one of:

   | Triage | Criteria | Action |
   |---|---|---|
   | **Fix now** | P0; OR P1 with a clear mechanical fix (threshold tweak, ordering swap, missing comment) | Patch inline this turn |
   | **Defer to follow-up** | P2 latent issues, P1 issues that need a design decision, or P1s that would expand scope (e.g., "this whole subsystem has the same bug") | Note in commit body or open a follow-up story |
   | **Escalate to /implement** | Design-level findings: a finding asking "should we go with approach A or B?" | Stop the cycle, surface the question, recommend `/implement <story> --redesign` |

   Be conservative on "Fix now" — if a fix touches more than 2-3 lines of engine code and isn't obviously mechanical, defer.

3. **Present the patch plan.** Format:

   ```
   ## Patch plan

   **Source:** /review findings from <reviewer-name(s)>, <timestamp>

   **Fix now (<N>):**
   - **P0** | `<file:line>` — <one-line finding> → <fix sketch>
   - **P1** | `<file:line>` — <one-line finding> → <fix sketch>

   **Defer to follow-up (<N>):**
   - **P2** | `<file:line>` — <one-line finding> — reason: <why deferring>

   **Escalate (<N>):**
   - **P0** | `<file:line>` — <one-line finding> — needs decision: <design question>

   **Validation after patches:**
   - `npx vitest run <relevant critique tests>`
   - `npm run typecheck`

   Apply the Fix-Now patches?
   ```

4. **On confirmation, apply patches inline.** Use Edit / Write tools directly — no agent spawn. The orchestrator's context already has the diff and the findings; spawning a subagent would force it to re-derive that. Save the agent budget for the next `/implement` or `/review`.

   Order edits by file to minimize Read churn. Add a `**Why:**` comment line at the patch site for any non-obvious change (per CLAUDE.md "Musical intent").

5. **Run validation.**
   - The critique test most directly tied to the touched engine
   - `npm run typecheck`
   - Any reviewer that flagged a structural concern: re-run that specific reviewer if the patch touched their lane (e.g., state-discipline-reviewer if patch touched coordination shape)

6. **Report.**

   ```
   ## Patches applied

   | Finding | File | Fix |
   |---|---|---|
   | <P0 verbatim> | `<file:line>` | <one-line fix description> |
   | <P1 verbatim> | `<file:line>` | <one-line fix description> |

   **Deferred (<N>):** <list with one-line reasons>

   **Tests:** <pass/fail counts>
   **Typecheck:** <green/red>

   ## Next:
   - `/done` to commit (recommended if validation green)
   - `/review` again if patches were substantive (touched engine math, not just thresholds)
   - `/implement <story-id> --redesign` if escalated findings remain
   ```

## Chain references

- Comes after `/review`.
- Hands off to `/done` (if clean) or back to `/implement` (if escalated).
- Composed into `/cycle` automatically; can also run standalone.

## What to put in commit body vs follow-up story

- **Commit body:** Deferred P2s that are notes-for-future, not bugs. Keep it tight — one bullet each, file:line citation, one-line reason.
- **Follow-up story:** Deferred P1s that warrant their own audit-tree slot. Open as `<area>.md` entries or new epic stories.
- **Drop entirely:** P2s the reviewer logged that are wrong on reflection (e.g., contradicts a project memory note that overrides the reviewer's heuristic).

## Edge cases

- **No findings to patch (reviewer was clean):** report it, suggest `/done` directly. Don't spawn or pretend to fix.
- **All findings are P0 design decisions:** don't patch any. Surface the design questions, suggest `/implement <story> --redesign` with the questions inline.
- **A "Fix now" patch fails validation:** stop, surface the failure with the test output, ask whether to revert the patch or chase the failure.
- **Two findings conflict (e.g., reviewer A says "tighten threshold," reviewer B says "loosen it"):** present both, ask which the user wants — don't auto-pick.
- **Finding cites a line that has since moved:** the diff was edited between /review and /patch. Re-Read the file, find the new location by content match, note the drift in the patch plan.

## Safety rules

- Never patch a file the most recent /review didn't flag — that's scope creep masquerading as cleanup.
- Never silently re-classify a P0 finding as P1 or P2 to avoid escalation. If you think a P0 is overblown, name it explicitly in the patch plan and let the user decide.
- Don't run reviewers as part of /patch — that's /review's job. /patch just applies what /review already found.
