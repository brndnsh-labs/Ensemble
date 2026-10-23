---
name: unblock
description: Clear everything waiting on Brandon in one sitting — decisions answerable from a menu (desk) and things that have to be tried live (hands-on). Restates each in plain English with a recommendation, asks, then applies all the answers together. Read-only until they answer. Usage `/unblock` · `/unblock desk` · `/unblock hands-on`.
---
<!-- cycle:rendered template=skills/unblock.md.tmpl hash=228a56425c97 — managed by the-cycle; edit the template, not this file -->

# /unblock — clear the decisions you owe

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context** (§1 statuses and
commands, §6 merging).

**Two lanes, never mixed in one menu.** *Desk* items are decisions — a scoping call, a parked PR
needing a yes — answered by reading three lines and picking. *Hands-on* items have to be seen,
clicked, heard, or tried; presented as a menu, they invite a guess. When unsure, it's hands-on.

1. **Gather** issues in `status:needs-decision`, open PRs left for Brandon, and anything
   else explicitly waiting on them. Drop items that are stale or already shipped, and say so.
2. **For hands-on items, confirm the thing is actually deployed and current** before asking anyone
   to look at it. If the test environment has one slot, sequence them.
3. **Pick about 5** — more stops being one sitting — and restate each as a card:
   ```
   **#<n> — <title>**
   What it is:             <one or two plain sentences>
   What's needed from you: <the question, or the thing to try>
   My recommendation:      <what I'd do, and why — always present>
   ```
4. **Ask** directly in chat, one item at a time, stating your recommendation first.
   Desk: the real options. Hands-on: **Works** / **Doesn't work** / **Not now** — "Not now" is a
   first-class answer, not a failure.
5. **Apply every answer together**, once all are in: set statuses (`gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit "<n>" --add-label "<status:label>"`),
   merge approved PRs through §6's guard, and turn each "doesn't work" into a `finding` with
   Brandon's words verbatim. "Not now" leaves the item exactly as it was.
6. **Report** what moved, what stayed, and what's still owed.

Here, the lanes map onto the Status vocabulary directly:
- **desk** = `status:needs-decision`, or a backlog issue carrying a `needs-decision`
  caveat label (status-less idea, needs input before it can even be scheduled).
- **hands-on** = `status:needs-ear`, or a backlog issue carrying a `needs-ear` caveat
  label — but see below, it does not get the generic Works / Doesn't work / Not now menu.

**`status:needs-ear` is not verified through this menu at all.** A synth A/B or a musical
listen pass can't be resolved from a menu, and the audition itself already happens
elsewhere — at `/cycle`'s Ship step (Track-awareness: the synth hold deploys to test and asks for the
verdict), once the PR is built and live. `/unblock`'s job for a `status:needs-ear` item is just
to **surface it as a named note** ("still waiting on your ear for #<n>"), never to
present a verdict menu or attempt to verify it live itself.

**The morning-after case:** after an unattended `/cycle --all` run, float `scout`-labelled finds to
the top of their tier and name them ("3 new from last night's a11y lens").

**Ensemble's own desk-verdict vocabulary:** **Promote to Ready** · **Defer** · **Close**
· an item-specific scope choice. When a promote makes the item safe for autonomous
execution, offer a **"Promote to Ready + mark `burndown`"** variant (tags `burndown`).

Never guess an answer to move the queue along; an unanswered item is fine, a wrong answer recorded
as theirs is not. Nothing waiting → say so; that's the good outcome.
