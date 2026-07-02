---
name: pmlite
description: A lightweight project-management view of the Ensemble Forgejo tracker (issues + labels). Reports per-track and per-milestone progress, recently shipped issues, anything blocked on Brandon, the backlog/finding/inbox pile, and any in-flight uncommitted work. Read-only and action-free — does not pick a story, propose a move, spawn anything, or edit anything. Use at session start to orient, or any time to step back and see the whole tracker. `/next` is the natural follow-up.
---

# /pmlite — lite project view of the tracker

Goal: surface the current state of the work in a single readable summary. Orientation, not action.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** All §1 (Status
model) + §2 (Labels) + §3 (Track) + §7 (Forgejo REST read + the Forgejo-unreachable rule). Read-only.

## Workflow

1. **Pull the open issues** (§7): `node scripts/forgejo.mjs list --open` — one call returns the open
   issues with `state` + `labels[]` (routing read off `labels[]` by namespace prefix); no separate
   open set to intersect. Forgejo unreachable → say so and stop (don't read the frozen markdown as
   current).
2. **Tally by Status** (§1): Ready · In progress · In review · Needs-decision · Needs-ear · Blocked.
   And by **Track** (musical / synth / bundle) and **milestone (epic)**.
3. **Recently shipped:** `node scripts/forgejo.mjs list --state closed` — a closed issue is done
   (§1; "Shipped" is retired).
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
   | Track | Ready | In flight | Closed |
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

- **Working tree dirty but nothing In-progress in the tracker:** show the diff scope; don't assume it's
  story work.
- **A closed issue still carries a stale `status/*` label:** harmless — a closed issue is done (§1;
  "Shipped" is retired, and nothing reads `status/*` once an issue is closed). Closing the issue *is*
  the done action (`node scripts/forgejo.mjs issue close <n>`) — but pmlite only *reports*, doesn't write.
- **`finding` count growing:** flag it — review debt should trend to empty (§2), not accumulate.
- **Forgejo unreachable:** say so and stop.

## What this skill is NOT

- Not a planner — doesn't pick a story (that's `/next`) or decide anything (that's `/unblock`).
- Not a reviewer or commit assistant. Not a writer — never modifies anything.

Keep it concise — readable in 20 seconds.
