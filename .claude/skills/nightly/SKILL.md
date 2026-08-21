---
name: nightly
description: The unattended overnight composition for Ensemble — timestamp, grind the safe queue via /burndown, then when it's dry run ONE /scout lens by day-of-week rotation, deploy what merged to test, and leave a morning report with a smoke-test checklist derived from the night's diff. Runs under a standing go. Usage `/nightly`.
---
<!-- cycle:rendered template=skills/nightly.md.tmpl hash=bc395bf125fb — managed by the-cycle; edit the template, not this file -->

# /nightly — the unattended overnight run

Goal: convert idle hours into merged safe work plus a refilled queue, and leave behind a report
Brandon can act on over coffee.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill
composes `/burndown` and `/scout`; it adds no new autonomy of its own. Every §5 brake still applies
exactly as written.

## The standing go

The overnight run has a **standing go**: it removes the *checkpoint pauses* that exist so
Brandon can redirect in real time. Nobody is there, so those pauses would just stall the run
until morning.

**It does not remove a single guardrail.** Every §5 always-brake surface still stops the work and
parks it for morning. The distinction matters: a pause exists for convenience; a brake exists
because the change needs a human. Only the first one is lifted.

## Workflow

0. **Timestamp first.** Capture `date +%s` before anything runs. A model cannot estimate elapsed
   time after the fact, and "how long did this take" is the first thing worth knowing in the
   morning.

1. **`/burndown`** — grind the safe queue (run its workflow inline).

2. **When the queue is dry, run ONE `/scout` lens** by day-of-week rotation. One lens, not all —
   depth beats breadth when nobody's watching, and a full sweep every night floods the queue.

   | Day | Lens |
   | --- | --- |
   | Mon | hygiene |
   | Tue | context |
   | Wed | a11y |
   | Thu | performance |
   | Fri | hygiene |
   | Sat | context |
   | Sun | security |

   Weighted toward the lenses that reliably produce fuel. Anything filed lands in *tomorrow's*
   `/burndown` queue — deliberately (see Safety).

3. **Deploy what merged** to test, so the morning checklist is checkable.

4. **Write the morning report.**

## The morning report

Lead with **run duration** (from step 0), then what shipped.

The smoke-test checklist is the part that earns its keep, so build it properly:

- **Derive it from the night's diff and each shipped issue's `Acceptance:` line.** Derive; don't
  invent. A generic "check the app still works" teaches the reader to skim past it.
- **Only user-visible surfaces get a checkbox.** A refactor that shipped correctly and changed
  nothing observable gets a line in "what shipped," not a checkbox.
- **Each item names three things:** what changed · what should now be true · what to confirm
  didn't break nearby.
- **Group by how it would actually get checked** — everything at the desk together, everything on a phone
  together. Don't force six device switches.
- **Give each item its one-line revert.** If something's wrong at 7am, the fix should be one
  command, not an investigation.

```
## Overnight run — <date>   (<duration>)

**Shipped:** <issue → PR, one line each>
**Filed:** <what /scout found, which lens>
**Parked for you:** <anything that hit a §5 brake, and why>
**Deployed to test:** <revision>

### Check at your desk
- [ ] <what changed> → <what should be true> · <what to confirm didn't break>
      revert: `git revert <sha>`

### Check on your phone
- [ ] …

**Blocked / needs you:** <or "nothing">
```

## Safety

- **Never deploys to prod.** That's `/deploy-prod`, and it requires an explicit human go that
  cannot exist at 3am.
- **Never lifts a §5 brake.** Parked work stays parked.
- Continues through `/burndown`'s five-item visibility checkpoints; its real stop conditions stay
  unchanged.
- **Scout output is never built in the run that filed it.** `/burndown` runs first and the run
  never loops back, so everything `/scout` files sits in at least one morning report before any
  unattended path can pick it up. That one-night latency is the loop's only guaranteed human
  look at machine-found work (§10.5 routes the deterministic subset straight to pickable) —
  don't "optimize" it away by re-running `/burndown` after the scout step.

## Edge cases

- **Nothing safe in the queue and the scout lens comes up clean:** that's a good night. Report it
  in two lines; don't manufacture work to fill the report.
- **A cycle fails mid-run:** stop that item, park it, continue with the next. Report both.
- **The run is interrupted:** the report is still owed — write it from whatever completed.
