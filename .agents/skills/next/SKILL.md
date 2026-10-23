---
name: next
description: What should we work on next in Ensemble? Reads the open issues and recommends the top pickable story, with what's in flight, what's waiting on Brandon, and the untriaged pile. Add `--board` for the whole queue at a glance. Read-only.
---
<!-- cycle:rendered template=skills/next.md.tmpl hash=305d925c9bf2 — managed by the-cycle; edit the template, not this file -->

# /next — what to work on

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context** (§1: statuses,
ranking, commands, and the stop-on-unreachable rule).

1. **Pull the open set** — `gh issue list --state open --json number,title,labels,milestone,url`, one call. Status lives in each issue's labels.
2. **Partition** by status: pickable · in flight · waiting on Brandon · the `finding` pile ·
   **untriaged** (no status label — count it and name the top few so they can be routed; never drop
   it silently).
3. **Rank** pickable issues by §1's rule, read the top pick's body, and make sure it isn't already
   shipped (§1).
4. **Present** briefly: the pick (number, title, milestone, one line of why/acceptance, and a
   heads-up if it lands on a §5 brake), then in flight, waiting on Brandon, findings and
   untriaged as counts with the notable ones named. Suggest `/cycle #<n>`.

**`--board`:** instead of one pick, tally the whole queue by status and milestone, add what closed
recently (`gh issue list --state closed --limit 20 --json number,title,closedAt,url`), uncommitted work from `git status`, and one suggested entry
point. Readable in 20 seconds.

Read-only: no edits, no status changes. Nothing pickable → say the queue is drained and suggest
`/intake` or `/scout`.
