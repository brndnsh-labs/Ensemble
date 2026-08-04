---
name: next
description: Pick up the next Ensemble work story. Finds the highest-priority pickable issue, the in-flight work, and the finding pile, and lays out enough to choose /implement (one issue) vs /cycle (full loop). Add `--board` for the whole-queue orientation view instead of a single pick. Plan-first — read-only, no spawn, no edit. Use at session start or whenever deciding what to pick up.
---
<!-- cycle:rendered template=skills/next.md.tmpl hash=b013923912ab — managed by the-cycle; edit the template, not this file -->

# /next — surface the next work story

Goal: say what to work on next, with enough context to choose `/implement #<n>` vs `/cycle #<n>`.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** This skill is
all §1 (Tracker & readiness — the Status model, the ranking), §2 (Labels) and §7 (tracker
mechanics, including the "unreachable → stop" rule). Don't restate them; apply them.

## Forms

- **`/next`** — the single best pick, with enough context to start. The default.
- **`/next --board`** — orientation instead of a pick: the whole queue tallied by Status and
  milestone, what's in flight, what's blocked on Brandon, and the idea pile. Readable in 20
  seconds. **This is not a planner, a reviewer, or a writer** — it reports, then stops.

## Data sources (§7)

- **The open set** — `gh issue list --state open --json number,title,labels,milestone,url`
- **The board** — `gh project item-list 1 --owner brndnsh-labs --format json`. `item-list` carries no open/closed state, so **intersect on
  `number`** to keep only open issues — a closed item can linger on the board until archived, and
  this also catches an open issue not yet on the board.
- **Unreachable → stop** (§7). Say so plainly; never guess tracker state or fall back to a cached
  list.

## Workflow

1. **Pull the open set** and the board; join by issue `number`.
2. **Partition by Status** (§1): pickable · in flight (note, don't re-pick) · done/closed (ignore) ·
   the `finding` pile (review debt — count and sample, don't pick) · **unrouted** (no Status at all).
   Unrouted is not an empty bucket: §10 has `/intake` and `/scout` file without routing on purpose,
   so everything they file lands here. Never silently drop it — count it, and surface the top
   candidates under **Untriaged** so it can be promoted.
3. **Rank the pickable issues** by the §1 rule: milestone (a real numbered epic > a "candidate epic" / no milestone), then Size (S < M < L, read off the `size/*` **label** — Size is not a board field), then issue number. Model is *not* a ranking factor.
4. **Read the top pick's body** — Why / Touches / Acceptance.
5. **Check it hasn't already shipped** (§1) — an umbrella issue's slices often land under
   sibling-numbered PRs that never reference its number. If the body describes behavior that looks
   familiar, trace it in live code before recommending it.
6. **Present** (below).
7. **Stop.** Read-only — no spawn, no edit, no Status or issue changes.

## Presentation

```
## Next: #<n> — <title>   ( <milestone> )

**Status:** Ready   **Executor:** orchestrator-inline (default, §3)
**Reviewer:** inline pass<, + /security-review if the diff touches an always-brake surface (§3)>

**Why / Touches / Acceptance:** <from the issue body>

**Suggested next:**
- `/implement #<n>` — ship it (plan-first)
- `/cycle #<n>` — full loop (implement → review → patch → done → PR → CI-gated merge)

**In flight:** #<…>, if any.
**Findings (review debt — not scheduled):** N issues.
```

With `--board`, replace the single pick with: tallies by Status and milestone, what closed
recently (`gh issue list --state closed --limit 20 --json number,title,closedAt,url` — the open set won't tell you), anything blocked on
Brandon, the untriaged pile, and `git status` in-flight work — then a one-line
**Suggested entry point**.

## Edge cases

- **No pickable issues:** say so plainly — the queue is drained. List anything in flight (a merge
  may be pending, §6) and the `finding` count. Suggest scoping the next epic, or a `/scout` sweep.
- **All issues shipped/closed:** say so; suggest scoping the next milestone's stories.
- **An open issue not on the board:** surface it; note it should be added during triage.
- **A pickable issue that's really a design call:** `/next` still surfaces it (it *is* pickable),
  but flag in the body read that it lands on a §5 always-brake surface — `/cycle` will pause there.
