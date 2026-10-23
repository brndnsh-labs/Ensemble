---
name: wrap-up
description: Wind down a Ensemble session — sweep what happened, put status in the tracker and ideas in issues, give an honest read on how the session went, and write only the memories that earn their place (zero is a common, correct outcome). Never pushes, merges, or deploys. Usage `/wrap-up`.
---
<!-- cycle:rendered template=skills/wrap-up.md.tmpl hash=0e7bb34652b1 — managed by the-cycle; edit the template, not this file -->

# /wrap-up — end the session cleanly

Goal: leave the next session, which remembers nothing, better off — without burying it in noise.

1. **Sweep:** `git status`, this session's commits, uncommitted work, and any review findings left
   unfixed.
2. **Sort each notable thing:** *status* (where work stands) → the tracker, as an issue comment or a
   PR; *idea* (something to do later) → an issue via `/intake`, not memory; *lesson* (durable, about
   how to work here) → a memory candidate.
3. **My read:** an honest first-person take on how the session went — what worked, what was
   awkward, where you'd disagree with a call that was made. This part isn't filtered for
   durability; a wrap-up that only ever reports smooth sailing isn't paying attention.
4. **Memory, gated.** Write a lesson only if it's durable (still true in a month), non-obvious (not
   inferable from code, docs, or git history), and not already recorded — update the existing note
   instead of adding a near-duplicate. Write the clear ones, flag the borderline ones. Equally:
   when work ships and its rules now live in docs or code, retire its status memory. The memory
   index loads every session, so every line is a cost paid forever.
5. **Loose ends:** what's unfinished, what's blocked and on whom, and the single most useful next
   move.

```
## Session wrap-up
**Shipped:** <issues/PRs, or "nothing — <what happened instead>">
**My read:** <the honest take>
**Memory:** <written N · updated N · retired N — or "nothing earned a write">
**Loose ends:** <unfinished / blocked on whom>
**Next:** <the one most useful move>
```

Never push, merge, deploy, or tidy code while winding down — note it as an idea instead.
