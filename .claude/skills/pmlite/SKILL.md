---
name: pmlite
description: A lightweight project-management view of the musical-audit work. Reports overall phase progress, per-epic completion tallies, recently shipped stories, anything blocked, and any in-flight uncommitted work. Read-only and action-free — does not pick a story, propose a move, spawn anything, or edit anything. Use at session start to orient, or any time during a session to step back and see the whole board. `/next` is the natural follow-up if you want a specific story to work on.
---

# /pmlite — lite project view of the audit backlog

Goal: surface the current state of the musical-audit work in a single readable summary. Orientation, not action.

## Workflow

1. **Read the index.** `docs/audit/EPICS.md`. Pull the status table.

2. **Compute phase-level tallies.**
   - Phase 1: Epic 1 stories + Epic 3 S1 + Epic 3 S2.
   - Phase 2: stories tagged `Model: sonnet` outside Phase 1.
   - Phase 3: remaining opus stories outside Phase 1.
   - For each phase: count total / done / blocked.

3. **Check epic files for Status markers.** Each shipped story should have `**Status:** Shipped <date>` in its block (added by `/done`). Count those per epic.

4. **Scan for blockers.** Look for `**Status:** Blocked` markers in any epic file, plus stories whose acceptance criteria reference a not-yet-shipped story (cross-epic dependencies).

5. **Check the git log.** Run `git log --oneline -10 -- docs/audit/ public/engine/ tests/standards/` to surface recently shipped audit work (heuristic — not every commit is a story, but the scope filter catches most).

6. **Check the working tree.** Run `git status` to surface any in-flight uncommitted work — if there's a diff, the user is mid-session.

7. **Present the report.** Format:

   ```
   ## Musical Audit — pmlite view (<date>)

   ### Phase progress
   | Phase | Total | Done | Blocked | Status |
   | :- | :-: | :-: | :-: | :- |
   | 1 (sequential, opus) | 8 | <N> | <N> | <Active | Done | Not started> |
   | 2 (parallel, sonnet) | <N> | <N> | <N> | <Active | Done | Locked behind Phase 1> |
   | 3 (parallel, opus) | <N> | <N> | <N> | <Active | Done | Locked behind Phase 2> |

   ### Per-epic
   | Epic | Done / Total | Notes |
   | :- | :-: | :- |
   | 1 Coordination Contract | <N>/6 | <one-line status> |
   | 2 Form & Arrangement | <N>/7 | |
   | 3 Deterministic Phrasing | <N>/5 | |
   | 4 Soloist Idiom | <N>/6 | |
   | 5 Bass Voice Leading | <N>/7 | |
   | 6 Chords Voicing | <N>/6 | |
   | 7 Drums Idiom | <N>/7 | |
   | 8 Harmony Polish | <N>/5 | |

   ### Recently shipped (last 5 commits touching audit scope)
   - <commit hash> <subject>
   - ...

   ### Blocked
   <Either a list of blocked story IDs with their blockers, or "None.">

   ### In-flight
   <Either "Clean working tree." or "Uncommitted: <N files>, scope <e.g. bass + tests>. Last touched: <file>.">

   ### Suggested entry point
   <One line — e.g. "Phase 1 in progress; run `/next` to pick the highest-priority remaining story." OR "Phase 1 done; ready to fan out Phase 2 — `/next` will propose a batch.">
   ```

8. **Stop.** No spawn, no edit, no commit. Read-only.

## Chain references

- Pairs naturally with `/next` (the action-picker). `/pmlite` answers "where are we?"; `/next` answers "what do I do?".
- Useful at session start, after a long break, or when an autonomous loop run reports back and you want to confirm the state before continuing.

## Edge cases

- **Working tree is dirty but no story is in flight** (e.g., editing docs, exploratory poking): show the diff scope but don't assume it's audit work.
- **EPICS.md tally is out of sync with epic-file Status markers**: surface the discrepancy. The Status markers in epic files are the source of truth for done; EPICS.md tally is a derived count that `/done` updates. Drift here means a `/done` step was skipped or hand-edited — worth flagging.
- **Phase 1 has shipped stories AND blocked stories**: mark Phase 1 as "Active (with blockers)" and list the blockers — don't auto-advance to Phase 2.
- **The audit tree itself has changed** (new stories added to an existing epic, new epic file): the counts in EPICS.md may not match reality. Cross-check by counting `### S<N>` headers in each epic file. If they disagree, flag it.

## What this skill is NOT

- Not a kanban board. No grouping by owner, no priorities, no "in progress" lane.
- Not a planner. Doesn't suggest specific stories — that's `/next`'s job.
- Not a reviewer or commit assistant — that's `/review` and `/done`.
- Not a writer — never modifies any file.

Keep the output concise. A user running `/pmlite` should be able to read the whole report in 20 seconds.
