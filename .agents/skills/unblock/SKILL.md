---
name: unblock
description: Batch up everything waiting on Brandon and clear it in one pass. Two lanes — `desk` (decisions answerable from a menu) and `hands-on` (things that have to be looked at or tried, verified live first). Restates each item in plain English with a recommendation, asks via `ask_user_question`, and applies every answer in a single batched write. Read-only until they answer. Usage `/unblock` · `/unblock desk` · `/unblock hands-on`.
---
<!-- cycle:rendered template=skills/unblock.md.tmpl hash=c3244dfcbe76 — managed by the-cycle; edit the template, not this file -->

# /unblock — clear the decisions you owe

Goal: turn a scattered pile of "waiting on Brandon" into one short sitting.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** Leans on §1
(Status), §2 (Labels), §5 (what counts as a judgment call in the first place), §7 (the batch-write
rule).

## The two lanes

The difference is **what it costs to answer**, and it changes everything about how the item
should be presented.

| Lane | The item is… | Answered by… |
| --- | --- | --- |
| **desk** | a decision — a scoping call, an ambiguous choice, a parked PR needing a yes | reading three lines and picking an option |
| **hands-on** | a verification — something that has to be seen, clicked, heard, or tried on a real device | actually going and doing it |

**Never mix them in one menu.** A hands-on item presented as a menu option invites a guess, and a
guess on a "does this actually work?" question is worse than no answer. Bare `/unblock` gathers
both and presents desk first, then hands-on.

## Workflow

1. **Gather.** Two classes: scheduled work explicitly blocked on a decision, and unscheduled items
   carrying a caveat that means "needs input even to schedule."
2. **Sort into lanes.** When unsure, it's hands-on — assuming a decision is desk-decidable is the
   expensive mistake.
3. **For the hands-on lane only: verify it's actually live first.** Confirm the thing Brandon is about to
   go look at is deployed and current. If the test environment has one slot, **sequence them** —
   don't promise five things to check simultaneously when only the last one is actually up.
   Silently asking for a verdict on a stale build burns the whole exercise.
4. **Pick ~5.** More than that stops being one sitting.
5. **Restate each in a fixed card** — plain English, no jargon that would need reloaded context to parse:

   ```
   **#<n> — <title>**
   What it is:             <one or two plain sentences>
   What's needed from you: <the specific question, or the specific thing to try>
   My recommendation:      <what I'd do, and why — always present>
   ```

   **A recommendation is mandatory on every item.** "What do you want to do?" hands the work back;
   the point of this skill is to hand back only the *decision*.

6. **Ask.** Via `ask_user_question` — one question per item, **recommended
   option first and labelled `(Recommended)`**, max 4 per call.
   - **desk** verdicts: the actual options, recommendation first.
   - **hands-on** verdicts: **Works** / **Doesn't work** / **Not now**.
     **"Not now" is a first-class answer, not a failure** — declining to go test something is a
     legitimate outcome, and making it feel like a punt is how a queue becomes a guilt pile.
7. **Read-only until they answer.** Nothing is written during gathering or asking.
8. **Apply all answers in one batched write** (§7): `node scripts/gh-project.mjs batch "<file.json>"` — never a loop.
   - **Works** → unblock it: merge via §6's guard, or close it.
   - **Doesn't work** → capture the description **verbatim** as a `finding`. Their raw words are the
     evidence; don't paraphrase them into your own diagnosis.
   - **Not now** → leave it exactly as it was. No penalty, no nag.
9. **Report** what moved, what stayed, and what's still owed.

Here, the lanes map onto the Status vocabulary directly:
- **desk** = Status `Needs-decision`, or a backlog issue carrying a `needs-decision`
  caveat label (status-less idea, needs input before it can even be scheduled).
- **hands-on** = Status `Needs-ear`, or a backlog issue carrying a `needs-ear` caveat
  label — but see below, it does not get the generic Works / Doesn't work / Not now menu.

**`Needs-ear` is not verified through this menu at all.** A synth A/B or a musical
listen pass can't be resolved from a menu, and the audition itself already happens
elsewhere — at `/cycle`'s merge gate (Track-awareness) or `/done`'s deploy-to-test
check-in, once the PR is built and live. `/unblock`'s job for a `Needs-ear` item is just
to **surface it as a named note** ("still waiting on your ear for #<n>"), never to
present a verdict menu or attempt to verify it live itself.

**The morning-after case:** when following `/nightly`, float `scout`-labelled finds to
the top of their tier and name them ("3 new from last night's a11y lens").

**Ensemble's own desk-verdict vocabulary:** **Promote to Ready** · **Defer** · **Close**
· an item-specific scope choice. When a promote makes the item safe for autonomous
execution, offer a **"Promote to Ready + mark for /burndown"** variant (tags `burndown`).

## Safety

- **Never guess an answer** to move the queue along. An unanswered item is fine; a wrong answer
  recorded as theirs is not.
- **Never present a hands-on item as a desk menu.**
- **Never re-park a "doesn't work" silently** — it becomes a `finding` with their words attached, or
  it didn't happen.

## Edge cases

- **Nothing is blocked:** say so and stop. That's the good outcome.
- **More than ~5 items:** take the highest-value ones and say how many remain.
- **An item is stale** (already shipped, or overtaken): drop it from the menu and say so — don't
  make them adjudicate something that no longer exists.
- **They answer something you didn't ask:** take the answer, and reconcile the item it actually
  applies to.
