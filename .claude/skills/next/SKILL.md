---
name: next
description: Pick up the next Ensemble work story from the Forgejo tracker (issues + labels). Finds the highest-priority Ready issue (surfacing but not picking Needs-ear / Needs-decision ones blocked on Brandon), the in-flight work, the backlog/idea pile, and raw `inbox` captures. Lays out enough to choose /implement (one issue) vs /cycle (full loop). Plan-first — read-only, no spawn/edit. Use at session start or whenever deciding what to pick up.
---

# /next — surface the next work story (Forgejo-backed)

Goal: tell Brandon what to work on next, with enough context to choose `/implement #<n>` vs
`/cycle #<n>`.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill is
all §1 (Tracker & readiness — the Status model, the ranking, the idea-pile rule) + §2 (Labels) + §3
(Track label + routing labels) + §7 (Forgejo REST mechanics, incl. the "Forgejo unreachable → stop, don't read the
frozen markdown as current" rule). Don't restate them; apply them.

## Data sources (§7)

- **The open issues** — `node scripts/forgejo.mjs list --open`. A JSON array; each issue: `number`,
  `title`, `url`, `body`, `state`, `milestone`, and `labels[]`. The `status`/`track`/`size`/`model`/
  `agent`/`lens` routing is read off `labels[]` by namespace prefix (§3, e.g.
  `labels.find(l => l.startsWith('status/'))?.slice('status/'.length)`) — absent when that namespace
  has no label.
- **Open-only in one call** — `--open` filters to open issues natively (each issue carries its
  `state`), so there's no separate open set to fetch and **intersect on `number`**; the single call
  already excludes closed issues and surfaces every open issue (esp. `inbox` captures).
- **Forgejo unreachable:** say so and **stop** (§7) — do not fall back to the frozen `docs/audit/`
  or `docs/synth-audit/` markdown as if current.

## Workflow

1. **Pull the open issues** — one `node scripts/forgejo.mjs list --open` call (state + labels +
   milestone come back together).
2. **Partition by Status** (§1): Ready (pickable) · Needs-decision/Needs-ear (blocked on Brandon —
   surface, don't pick) · Blocked (skip, name the blocker) · In progress/In review (note, don't
   re-pick) · closed (ignore) · no-Status + `backlog`/`finding` (the idea pile — count +
   sample, don't pick).
3. **Rank the Ready issues** by the §1 rule: milestone (real numbered epic > candidate/none), then
   Size (S<M<L), then issue number. (Model is *not* a ranking factor.)
4. **Read the top pick's body** (already in the issue's `body`) — Why / Touches / Acceptance.
5. **Check the capture inbox** — `node scripts/forgejo.mjs list --open --label inbox`.
6. **Present** (below).
7. **Stop.** Read-only — no spawn, no edit, no Status/issue changes.

## Presentation

```
## Next: #<n> — <title>   ( <milestone> · Track: <musical|synth|bundle> )

**Status:** Ready   **Model:** <sonnet|opus>   **Size:** <S|M|L>
**Agent:** <per §3>   **Review lens:** <per §3>

**Why / Touches / Acceptance:** <from the issue body>

**Suggested next:**
- `/implement #<n>` — ship it (plan-first)
- `/cycle #<n>` — full loop (implement → review → patch → done → PR → CI-gated merge / Track-gated)

**Blocked on you (not picked):**
- #<x> — Needs-decision: <what>   ·   #<y> — Needs-ear: <what>

**In flight:** #<…> (In progress / In review), if any.

**📥 Inbox (raw captures to triage):** #<n> <title> — `/intake` to shape, or close.

**Backlog / findings (idea pile — not scheduled):** N issues (`finding`=review debt M; `backlog`=
ideas K). By track/epic: … . Of these, J carry a `needs-ear`/`needs-decision` caveat.
```

## Edge cases

- **No Ready issues, only Needs-ear/Needs-decision:** say so plainly — the queue is blocked on
  Brandon (his ear / a call), not on more building. List blockers + the backlog count. Suggest
  `/unblock`.
- **Candidate-epic milestones with only backlog (no Ready):** name them as **future epics not yet
  scheduled** (N backlog issues each); to start one, a backlog issue gets scoped + Status `Ready`.
- **All issues closed:** congratulate; suggest synthesizing the next epic (promote a cluster
  into a milestone with `Ready` stories) or a `/scout` sweep to refill the pile.
- **A raw `inbox` capture (untriaged):** surface it; note it should be shaped during triage
  (`/intake`) — the issue existing is already enough (there's no board to add it to).
