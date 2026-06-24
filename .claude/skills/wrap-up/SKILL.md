---
name: wrap-up
description: Wind down an Ensemble work session — sweep what happened, triage status-vs-lesson, share an honest first-person read of the session, write the memories worth keeping (restraint-first), and leave a clean handoff for next session. The session-end bookend to /next. Writes the clear-cut lesson memories itself and flags only the borderline ones; reports what it saved. Use at the end of a working session, when the user asks to "wrap up / wind down / document for future selves," or before a long break.
---

# /wrap-up — wind down a session

Goal: close a session deliberately. Capture the **lessons** worth keeping, confirm the **status** is
already recorded where it belongs (the board / commits), and leave next-session-me a clean handoff.
The bookend to `/next`.

## The governing rule: restraint

**Most of this skill's value is in what it DOESN'T save.** A wind-down that manufactures artifacts
every time produces memory bloat. **Saving zero memories is a common, correct outcome.** Treat "I
saved 0" and "I saved 2" as equally good; the win is *accuracy*, not volume. If you feel obligated to
write something, that's the smell — stop and re-check the gate.

## Workflow

1. **Sweep the session.** Gather, don't act:
   - `git log --oneline @{u}..HEAD` (unpushed) and the diff/log since the session began — what
     shipped/changed.
   - Working tree: anything uncommitted? Anything merged-but-undeployed (on `main`, not on test/prod
     via `scripts/deploy.sh test` / `scripts/deploy.sh prod`)?
   - Anything **blocked on Brandon** on the board (Status `Needs-ear` / `Needs-decision`), and any
     open `finding` issues (review debt — should trend to empty).
   - Did a story or **epic (milestone)** close? (If an epic completed, fold in `/cycle`'s
     epic-boundary retrospective prompt.)

2. **Triage every notable thing: status, lesson, or idea.**
   | Kind | Definition | Home |
   |---|---|---|
   | **Status** | *What got done* this session | the **board** (issues closed → Shipped via `/done`), commit messages — **verify it's there; do not duplicate into memory** |
   | **Lesson** | *What we learned about how to work*, or a **non-obvious project fact** | memory (see the gate) |
   | **Idea** | New scope/feature surfaced, not a flaw | a `backlog` issue (`/intake`), not memory |

   Status is almost always *already captured* by `/done` (the closed issue) + commits — your job is to
   **confirm**, not re-record. Only lessons and ideas produce new writing; ideas go to the board.

3. **My read — the orchestrator's own take.** Before the memory pass, say the part the restraint gate
   would otherwise drop: an honest, first-person read of the session — **deliberately *not* filtered
   by the memory gate**, because its home is *this conversation*, not a file:
   - what went well or badly, and what *surprised* you;
   - risks or loose threads you're carrying into next session that aren't yet a finding/blocked item;
   - a strategic hunch, or a recommendation or two — **including disagreement with how we worked.**

   **Same honesty discipline, pointed the other way:** restraint governs *persistence* (don't write
   bloat), **not candor**. Say something real, or "nothing notable this time." Never soften a genuine
   concern to seem agreeable — a wind-down is the moment to voice it.

4. **Memory pass — write AND retire (restraint-first).** Two symmetric halves: write the lessons
   worth keeping, then retire the ones whose job is done. For each *lesson* candidate, apply the
   write gate — it must be **all three**:
   - **Durable** — useful in a *future* session, not just this conversation.
   - **Non-obvious** — a future-you wouldn't re-derive it for free.
   - **Not already recorded** — not in code, git history, CLAUDE.md, the board, or an existing memory.

   Fails any one → **drop it.** If it passes:
   - **Search existing memories first** (`memory/` + `MEMORY.md`). Prefer **updating** the memory that
     already covers the area over a near-duplicate.
   - Write/update the memory file with correct frontmatter (`type: user | feedback | project |
     reference`; for feedback/project add **Why:** + **How to apply:**; link related with `[[name]]`).
   - Keep `MEMORY.md` honest: one-line pointer for a new memory, or update the existing line.

   **Autonomy: write the clear ones, flag the borderline.** Clearly passes all three → just write it.
   Genuinely unsure (borderline durable/obvious, or might duplicate) → **don't write silently;
   surface it** and let Brandon call it. Always **report what you saved/updated**.

   **Then the retire half.** `MEMORY.md` loads *wholesale* every session (no ranked retrieval) → the
   index is per-session **retrieval budget, not storage**; a stale line is taxed every session, and a
   write-gate without a retire-gate is the ADD-only bloat trap. After writing:
   - **Epic/milestone closed this session?** Once its reusable rules are in `docs/guides/` or the
     code, its `project_*` status memory's job is done — move the file to `../archived-memory/` and
     drop its `MEMORY.md` line. Retire only the "epic shipped" record; keep the per-incident
     `feedback_*` lessons. Live `project_*` facts (pending epics, infra, product gaps) stay.
   - **`MEMORY.md` near its limit (> ~22 KB)?** Archive any completed-status logs, and merge only
     *true* same-lesson-different-trigger duplicates — don't over-merge distinct lessons (a precise
     index hook beats the bytes). Re-verify links resolve + no orphans after.
   - Full rationale + mechanics: [[feedback-memory-lifecycle-retire-gate]].

5. **Loose-ends handoff.** A short, scannable report:
   - **Unpushed / undeployed:** N commits ahead of origin; anything on `main` not yet on test/prod.
     (Surface — do NOT push or deploy as part of wrap-up; Brandon's calls.)
   - **Blocked on Brandon:** open `Needs-ear` / `Needs-decision` items, by issue #.
   - **Open `finding` issues:** review debt (target: empty).
   - **Where we are + next pickup:** one line of state + what `/next` would surface.

## Output shape

```
## Session wind-down
**Shipped:** <issue #s / one-line>      **State:** <where the project is, one line>
**My read:** <honest first-person take — what surprised you, a risk you're carrying, a recommendation; or "nothing notable this time">
**Saved to memory:** <files written/updated, or "nothing — already covered">
**Retired/merged:** <archived status logs + merged duplicates, or "none"> · index <N entries / KB>
**Flagged for your call:** <borderline memory candidates, or none>
**Loose ends:** unpushed <N> · undeployed <…> · blocked-on-you <#…> · open findings <#…>
**Next:** <what /next would pick>
```

## What this skill is NOT

- **Not `/done`** — it doesn't commit/ship story work (that's already happened). It reflects.
- **Not a deploy/push step** — it *surfaces* unpushed/undeployed work; never performs it.
- **Not a status logger** — story status lives on the board via `/done`; don't re-record "what
  shipped" into memory.
- **Not obligated to produce output** — "nothing new to save, here's the handoff" is a complete run.

## Safety

- Read-and-propose for anything outside memory. **Never push, merge, or deploy** as part of
  wind-down — surface them as loose ends.
- Don't let `MEMORY.md` grow with low-value lines; a swelling index is the bloat smell — the retire
  half of step 4 is the cure (archive to `../archived-memory/`, drop the line). Archiving preserves
  the file; it never deletes knowledge, just removes it from the always-loaded set.
- When unsure whether something clears the memory gate, it probably doesn't — flag it instead.
