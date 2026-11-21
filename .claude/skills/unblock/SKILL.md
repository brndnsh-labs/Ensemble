---
name: unblock
description: Clear everything waiting on Brandon in one sitting — decisions answerable from a menu (desk) and things that have to be tried live (hands-on). Restates each in plain English with a recommendation, asks, then applies all the answers together. Read-only until they answer. Usage `/unblock` · `/unblock desk` · `/unblock hands-on`.
---
<!-- cycle:rendered template=skills/unblock.md.tmpl hash=6e476d6e5439 — managed by the-cycle; edit the template, not this file -->

# /unblock — clear the decisions you owe

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context** (§1 statuses and
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
4. **Ask** via `AskUserQuestion`, one question per item, recommended option first and labeled `(Recommended)`.
   Desk: the real options. Hands-on: **Works** / **Doesn't work** / **Not now** — "Not now" is a
   first-class answer, not a failure.
5. **Apply every answer together**, once all are in: set statuses (`gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:blocked,status:needs-decision,status:needs-ear" && gh issue edit "<n>" --add-label "<status:label>"`),
   merge approved PRs through §6's guard, and turn each "doesn't work" into a `finding` with
   Brandon's words verbatim. "Not now" leaves the item exactly as it was.
6. **Report** what moved, what stayed, and what's still owed.

## The listening lane

Most hands-on items here are `status:needs-ear`: built, merged, on the test site, and waiting on Brandon's ear or eye. Gather them with the decisions.

- **Before asking**, check the page exists under `out/<name>/` and was rendered from the commit now on `main`; re-render it if not. Serve it with `pnpm audition --host 0.0.0.0 --port 8765` and give him the address of the page. For something in the app itself, check the test site's `/build.json` names the commit, and say whether it wants his phone.
- **The card** adds one line: `What was measured: <the properties and scorecard numbers beside each clip>`. Where the change went to his ear because it left what he has passed, the measures that left their range come first, each with its value and the range (`pnpm score` on the branch printed them; the PR body has them). The recommendation says which clip to start with and what to listen for, never which one sounds better.
- **Verdicts**: **Passed** / **Not right** / **Not now**. His words are usually a few; record them verbatim.
- **Passed** → close the issue with his words in a comment, and a `DECISIONS.md` line if a choice was made (a setting chosen from a study).
- **Not right** → his words go verbatim into a `finding` issue, which first becomes a property or a critic metric and then a code change (the standing rule); the original closes pointing at it.
- **Not now** → stays `status:needs-ear`, untouched.
- **Every verdict about the notes becomes an ear case**, or the ranges a change is sorted against never move. Commit his words first (the `DECISIONS.md` line, or the `finding` issue's number in it), then add the case to `scorecard/ear-cases.json` with that commit as its `recorded`: the band he heard is the one before it. A pass widens what later changes may do unheard; a "not right" with its answer's commit takes back the passes before it on that seat. `pnpm ears` reads the result.

Never guess an answer to move the queue along; an unanswered item is fine, a wrong answer recorded
as theirs is not. Nothing waiting → say so; that's the good outcome.
