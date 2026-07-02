---
name: unblock
description: Batch the decisions Brandon owes so they get cleared in one sitting. Reads the Forgejo tracker (issues + labels) for the highest-leverage blocked-on-Brandon items (scheduled stories with Status Needs-decision/Needs-ear + backlog issues carrying a needs-ear/needs-decision caveat label), restates each in plain English, and presents them as an AskUserQuestion menu — one question per item, recommended option first. Read-only to present; applies his picks (promote to Ready / close / capture). Plan-first. The decision-first companion to /next.
---

# /unblock — clear the decisions Brandon owes, in one sitting

Goal: stop "blocked on Brandon" items from quietly piling up. Surface a small batch, make each
trivially decidable (plain English + a recommendation), then apply his calls.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Leans on §1
(Status model — the scheduled-story-vs-caveat-label distinction is load-bearing), §2 (Labels —
finding/backlog/burndown), §3 (fields to set on a promote), §7 (Forgejo REST mechanics + the **batch**
rule for the writes). **Why it's separate from `/next`:** `/next` is Ready-first (the blocked pile is
a side note); `/unblock` is decision-first — the blocked pile **is** the job.

## What counts as "blocked on Brandon"

From the open issues (§7):
1. **Scheduled stories** with Status **`Needs-decision`** or **`Needs-ear`** (§1).
2. **Backlog issues** carrying a **`needs-decision`** / **`needs-ear`** *caveat label* — status-less
   ideas that need his input before they can even be scheduled (the Status-vs-caveat distinction is §1).

**The morning-after case (`scout` label).** When `/unblock` follows `/nightly`, the freshest blocked
items carry the **`scout`** provenance label. Still class 1/2 — but **surface them first and name
them** ("3 new from last night's scout — a11y lens") so the morning pass clears what the night found.

## Workflow

1. **Gather** the blocked set (both classes). Forgejo unreachable → say so and stop (§7).
2. **Pick ~5** — decidable in one sitting. Priority: scheduled **Needs-decision** first (they block
   buildable work), then **Needs-ear**, then high-leverage backlog caveats. After `/nightly`, float
   `scout`-labelled finds to the top of their tier. If >5 qualify, say how many remain.
3. **Read each issue** (`node scripts/forgejo.mjs issue view <n>`) and restate as:
   ```
   ### <n>. <plain-English title>   ( Needs-decision | Needs-ear · story | idea )
   **What it is:** <1–2 plain sentences — the gist at a glance>
   **What's needed from you:** <the *specific* question / ear-pass / scope call — concrete>
   **My recommendation:** <a clear path + one line of why — ALWAYS lead with a rec; if it genuinely
   needs his ear and you can't recommend without it, say so plainly>
   ```
4. **Present the batch as a menu** via **`AskUserQuestion`** (Brandon prefers a menu): one question
   per item, 2–4 tailored options, **recommended first + labelled `(Recommended)`**. Caps at 4
   questions/call — present up to 4, note overflow.
   - **Reserve the menu for desk-decidable (`Needs-decision`) items.** A `Needs-ear` item (a synth
     A/B audition, a musical listen pass) can't be resolved from a menu — present those as a **brief
     note** (usually "leave parked"); they need him at the speakers, not a click.
   - **Typical options** (tailor): **Promote to Ready** · **Defer** · **Close** · an item-specific
     scope choice. When a promote makes the item **safe for autonomous execution** (§5 safe set —
     not destructive / not a state-or-worker-contract design call / not synth-or-by-ear, build-
     verifiable, small), offer a **"Promote to Ready + mark for /burndown"** variant (tags it
     `burndown`).
5. **Stop — read-only so far.** No edits until he picks.
6. **On his answers, apply them** (the only writing step). **Collect every Status/field change
   across ALL picks into one batch file → a single `node scripts/forgejo-project.mjs batch
   /tmp/unblock-writes.json`** — never loop single-op writes (§7). REST changes
   (`forgejo.mjs issue edit`/`comment`/`close`/`--add-label`) are fine per-item. Per pick:
   - **Scope/design decision that unblocks a story** → queue `Status=Ready` + the missing fields (§3),
     and edit the issue body to **record the decision**. "+ /burndown" variant → also
     `node scripts/forgejo.mjs issue edit <n> --add-label burndown`.
   - **Needs-ear verdict** → apply ("good enough" → close; "needs work" → keep + note; "promote" →
     queue Status=Ready).
   - **"Not worth doing"** → `node scripts/forgejo.mjs issue comment <n> --body "<one-line why>"`
     then `node scripts/forgejo.mjs issue close <n>`.
   - **A new follow-up the decision spawns** → capture as a `backlog`/`finding` issue (§2).
   - **"Skip / decide later"** → leave untouched; resurfaces next `/unblock`.
   Apply the one `batch` after assembling all entries.
7. **Report** what was applied (promoted / closed / captured), what's newly **Ready**, and suggest
   `/cycle next` (or `/burndown`) if anything became buildable.

## Edge cases

- **Nothing blocked:** say so — the queue is all Ready (→ `/next`) or empty.
- **All `Needs-ear`:** surface them but note they need him *at the speakers*, not a keyboard —
  `/unblock` tees them up, can't resolve them.
- **A recommendation needs context you don't have:** ask the clarifying question, don't guess.
- **He answers some but not all:** apply those, leave the rest, report the remainder.

## Safety

- **Read-only until he answers** — never promote/close/edit on the presenting pass.
- Promoting to `Ready` doesn't build anything — it makes the issue pickable; building is still
  `/implement` / `/cycle` / `/burndown`.
- Never close an issue he didn't say to close.
