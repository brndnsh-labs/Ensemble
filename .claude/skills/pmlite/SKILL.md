---
name: pmlite
description: A lightweight project-management view of the Ensemble work board (GitHub Project #2). Reports per-track and per-milestone progress, recently shipped issues, anything blocked on Brandon, the backlog/finding/inbox pile, and any in-flight uncommitted work. Read-only and action-free — does not pick a story, propose a move, spawn anything, or edit anything. Use at session start to orient, or any time to step back and see the whole board. `/next` is the natural follow-up.
---

# /pmlite — lite project view of the work board

Goal: surface the current state of the work in a single readable summary. Orientation, not action.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** All §1 (Status
model) + §2 (Labels) + §3 (Track) + §7 (gh-project read + the gh-unreachable rule). Read-only.

## Workflow

1. **Pull the board + open set** (§7): `gh project item-list 2 --owner brndnsh --format json` ∩
   `gh issue list --state open` on `number`. gh unreachable → say so and stop (don't read the frozen
   markdown as current).
2. **Tally by Status** (§1): Ready · In progress · In review · Needs-decision · Needs-ear · Blocked.
   And by **Track** (musical / synth / bundle) and **milestone (epic)**.
3. **Recently shipped:** `gh issue list --state closed --limit 8 --json number,title,closedAt` (or
   board items at Status Shipped).
4. **Blocked on Brandon:** the Needs-decision + Needs-ear items, by issue #.
5. **The idea pile:** count `backlog` / `finding` / `inbox` labelled issues (§2).
6. **In-flight:** `git status` — any uncommitted work means mid-session; name the scope + branch.
7. **Present the report:**

   ```
   ## Ensemble — pmlite view (<date>)

   ### By status
   | Status | Count |
   | :- | :-: |
   | Ready | <n> |  In progress | <n> |  In review | <n> |
   | Needs-decision | <n> |  Needs-ear | <n> |  Blocked | <n> |

   ### By track
   | Track | Ready | In flight | Shipped |
   | :- | :-: | :-: | :-: |
   | musical | … | … | … |
   | synth   | … | … | … |
   | bundle  | … | … | … |

   ### By milestone (epic)
   | Milestone | Open / Total | Notes |
   | :- | :-: | :- |
   | <epic> | <n>/<n> | <one-line> |

   ### Recently shipped
   - #<n> <subject>  ·  …

   ### Blocked on you
   <Needs-decision / Needs-ear issues by #, or "None.">

   ### Idea pile
   backlog <n> · finding <n> · inbox <n>  ( findings should trend to empty )

   ### In-flight
   <"Clean working tree." or "Uncommitted: <N files>, scope <…>, branch <…>.">

   ### Suggested entry point
   <one line — e.g. "5 Ready, top is #12 (musical, S) — `/next` to pick. 2 Needs-decision — `/unblock`. inbox has 3 — `/intake`.">
   ```

8. **Stop.** No spawn, no edit, no Status change. Read-only.

## Edge cases

- **Working tree dirty but nothing In-progress on the board:** show the diff scope; don't assume it's
  story work.
- **A closed issue still shows non-Shipped on the board:** note the drift — `/done` sets Shipped
  explicitly; a closed-but-not-Shipped item means a `/done` step was interrupted. (`node
  scripts/gh-project.mjs status <n> "Shipped"` fixes it — but pmlite only *reports*, doesn't write.)
- **`finding` count growing:** flag it — review debt should trend to empty (§2), not accumulate.
- **gh offline:** say so and stop.

## What this skill is NOT

- Not a planner — doesn't pick a story (that's `/next`) or decide anything (that's `/unblock`).
- Not a reviewer or commit assistant. Not a writer — never modifies anything.

Keep it concise — readable in 20 seconds.
