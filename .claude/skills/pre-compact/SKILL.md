---
name: pre-compact
description: Snapshot the live session state before a context boundary. The deliberate inverse of /wrap-up — over-capture rather than restraint, because the output is ephemeral and cheap. Writes a scratch session file AND echoes it inline so it also rides the compaction summary. Does nothing else — no commit, no push, no edit. Usage `/pre-compact`.
---
<!-- cycle:rendered template=skills/pre-compact.md.tmpl hash=1cac080453a7 — managed by the-cycle; edit the template, not this file -->

# /pre-compact — snapshot before the context boundary

Goal: make the post-compaction session pick up exactly where this one left off.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.**

## The governing rule: over-capture

This is the **inverse of `/wrap-up`**, and the inversion is deliberate.

`/wrap-up` is governed by restraint because its output is *durable* — every saved line is a tax on
every future session. `/pre-compact`'s output is **ephemeral**: a scratch file that is gitignored
and overwritten on the next run. Bloat costs nothing here, and a dropped detail costs a
re-derivation.

So: **when in doubt, include it.** The gate that governs `/wrap-up` does not apply.

## What to capture

- **The current task** — what's being worked on, and why *this* approach.
- **The live TODO state** — done, in flight, not started.
- **Decisions made but not yet visible in code** — the ones that exist only in the conversation.
  These are the single most expensive thing to lose.
- **Fresh landmines** — what was tried and failed, dead ends already ruled out, the surprising
  behavior discovered an hour ago. Without these the next session will cheerfully redo them.
- **Branch / uncommitted / unpushed / deploy state.**
- **Open threads** — questions asked and not answered, things waiting on Brandon.

## Output

Write the snapshot to a scratch file **and echo it inline in the reply.** Both, always: the file
survives compaction, and the inline copy rides the compaction summary itself — belt and braces,
and the inline copy is the one that actually gets read first.

End with an explicit resume marker:

```
PAUSED: <what was happening at the moment of the snapshot>
TO DO:  <the ordered next steps>
RESUME BY: <the single concrete first action>
```

## Safety

- **Does nothing else.** No commit, no push, no deploy, no code edit, no memory write. Snapshotting
  is the entire job; anything else risks leaving the tree in a state the notes don't describe.
