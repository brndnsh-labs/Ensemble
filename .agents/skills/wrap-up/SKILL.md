---
name: wrap-up
description: Wind down a Ensemble session — sweep what happened, triage each notable thing as status vs lesson vs idea, give an honest read on how the session went, and write only the memories that genuinely earn their place. Governed by restraint: saving zero memories is a common and correct outcome. Never pushes, merges, or deploys. Usage `/wrap-up`.
---
<!-- cycle:rendered template=skills/wrap-up.md.tmpl hash=909ab31eb780 — managed by the-cycle; edit the template, not this file -->

# /wrap-up — end the session cleanly

Goal: leave the next session (which remembers nothing) better off, without burying it in noise.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.**

## The governing rule: restraint

**Most of this skill's value is in what it does NOT save.** The memory index loads wholesale every
session, so every line is a tax paid forever. **Saving zero memories is a common, correct
outcome** — say so plainly rather than manufacturing an insight to look thorough.

## Workflow

### 1. Sweep

`git status`, `git log` for the session, the working tree, and any findings raised but not
actioned. What actually happened?

### 2. Triage every notable thing into exactly one of three

| Kind | What it is | Where it goes |
| --- | --- | --- |
| **Status** | where the work stands right now | the tracker — an issue, a PR, a comment |
| **Lesson** | something durable we learned about how to work, or about this repo | memory, if it clears the gate below |
| **Idea** | something we might do later | an issue via `/intake` — **not** memory |

Most items are status or ideas. Only lessons are memory candidates.

### 3. My read

**An honest first-person take on how the session went — deliberately exempt from the memory gate.**

Say what you actually think: what went well, what was awkward, where the approach was wrong, where
you disagree with how the session was run or with a decision that got made. This is the one place
that isn't filtered for durability, so use it. A wrap-up that only ever reports smooth sailing
isn't being read carefully.

### 4. Memory pass — the write gate

A lesson is written **only if all three hold**:

1. **Durable** — it'll still be true in a month. Not "the build is currently broken."
2. **Non-obvious** — a competent reader wouldn't infer it from the code, the docs, or git history.
3. **Not already recorded** — check the index first; update the existing note instead of adding
   a near-duplicate.

Write the clear ones without asking. Flag the borderline ones and let Brandon call it.

**And the retire gate — symmetric, and just as important.** When an epic ships and its rules land
in docs or code, **archive its status memory** and drop the index line. Keep the per-incident
lessons; retire the "this is in progress" records. An index that only grows is an index that stops
being read.

### 5. Loose ends

What's unfinished, what's blocked and on whom, and the single most useful next move.

## Output

```
## Session wrap-up

**Shipped:** <issues/PRs, or "nothing — <what happened instead>">
**Status:** <where things stand>

**My read:** <the honest take — including disagreement>

**Memory:** <written: N · updated: N · retired: N · or "nothing earned a write this session">
**Loose ends:** <unfinished / blocked on whom>
**Next:** <the one most useful move>
```

## Safety

- **Never push, merge, or deploy as part of winding down.** A wrap-up that ships something is a
  wrap-up that shipped something unreviewed.
- Don't restructure docs or "tidy" code here — note it as an idea and let it go through the
  pipeline.
- Don't write a memory to feel productive. Zero is fine.
