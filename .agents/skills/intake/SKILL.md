---
name: intake
description: The front door to the backlog — turn a plain-English idea into an actionable Ensemble issue. Interviews Brandon ONE question at a time until the issue is genuinely implementable, then drafts it, classifies it, and files it. Plan-first — always shows the shaped issue before writing. Shares /scout's filing mechanics (DOCTRINE §10). Usage `/intake <the idea>` (or bare, and it'll ask).
---
<!-- cycle:rendered template=skills/intake.md.tmpl hash=730f08d22d47 — managed by the-cycle; edit the template, not this file -->

# /intake — turn an idea into an actionable issue

Goal: stop a good idea from evaporating, or from landing as a vague one-liner that blocks later
work. Every other pipeline skill *reads* the tracker (`/next` picks, `/cycle` builds, `/burndown`
grinds); this one *writes* a well-formed issue into it from a plain-English idea.

**Shared rules in `.agents/skills/DOCTRINE.md` — read it if not already in context.** The filing
mechanics — dedup, the actionable bar, body format, budget — are **§10**; don't restate them,
apply them. Classification maps onto §2 (Labels) and §1 (Status). The write step uses §7.

**The bar is "actionable"** (§10). A filed issue must be implementable from its own text —
`/implement` or `/cycle` should know exactly what "done" looks like without asking again. If the
idea isn't there yet, **interview it up to that bar** before filing. A vague issue is worse than no
issue: it defers the thinking to a moment with *less* context than right now.

## The one rule that makes this skill itself: interview ONE question at a time

Brandon will describe the idea in good faith; your job is sharpening it to actionable —
proposing the shape, filling obvious gaps yourself, asking only where the answer genuinely changes
the issue. So:

- Ask **one focused question, then wait.** No batched multi-question forms.
- **Reflect each answer back** in a sentence, so drift gets caught early.
- Ask only about what's **genuinely missing for the issue to be actionable** — infer the rest.
- **Lead with a recommendation** on every judgment-call question. *"I'd scope this to the
  operator-side fix, not both stacks — sound right?"* beats *"what's the scope?"*
- **Stop the moment it's actionable.** Three crisp exchanges is great; ten is a slog.

Use `ask_user_question` only for a genuinely discrete single choice (2–4
options, recommendation first) — never to fire several at once.

## Workflow

1. **Hear the idea.** If invoked bare, ask what's on Brandon's mind. If it carried text, restate it in
   one plain sentence to confirm alignment before digging.

2. **Dedup first** (§10, read-only): search open issues on the idea's keywords and skim titles. If
   a likely twin exists, surface it — *"We already have #N for this — extend that, or is yours
   different?"* Extending is often the right move; never file a duplicate.

3. **Interview to actionable — one question at a time.** Ask about the highest-value *gap* first,
   skipping anything already clear:
   - **The symptom / why** — what's actually going wrong or missing, concretely. This usually
     arrives up front; reflect it back rather than re-asking.
   - **Acceptance — the load-bearing one.** What does "done" look like, verifiably? If that's
     fuzzy, this is the question to ask.
   - **Scope boundary** — what's explicitly *not* in this? Keeps it small and stops creep.
   - **Does it touch a §5 always-brake surface** (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field))? If so, say so plainly in the
     drafted body — it still files normally, but `/cycle` will pause there for a human call
     regardless of how the issue reads.
   - **Is it actually a decision, not a task** (no work happens until a direction is picked)? If
     so, write the options into the body ("decide one of: A / B") rather than picking one.

4. **Draft and show the shaped issue** — title, body in §10's Why / Touches / Acceptance format,
   and the classification you'd apply. **This is the checkpoint**: nothing is written until it's
   seen it.

5. **File it** (§7): `gh issue create --title "<title>" --body "<body>" --label "<label>"` — the label is a §2 workflow
   label describing *what kind of work it is* (`bug` and the `area:*` set), never a routing value:
   §10.5 leaves routing to the picking skill. No fitting label is fine; file it bare., then
   add it to the board and set Status: `node scripts/gh-project.mjs status "<n>" "Ready"`.
   Batch the field writes into one call (§7).

6. **Report** the issue number and URL, and suggest `/cycle #<n>` if it's ready to build now.

## Batch mode

Given several ideas at once, interview them **one at a time** to actionable, draft them all,
show the set together, then file with a **single batched field write** (§7).

## Guardrails

- **Actionable, or don't file** (§10). If the interview stalls short of that bar, say so and stop —
  a placeholder issue is debt, not capture.
- **Read-only until Brandon confirms the draft.** No issue is created mid-interview.
- **Don't over-classify** (§10) — set what you know; routing is the picking skill's job.
- **Don't fix anything.** `/intake` files; `/cycle` builds. Even a one-line fix goes through the
  pipeline.

## Edge cases

- **The idea is already an open issue:** extend or comment on it; report which, don't file a twin.
- **The idea is really several:** say so, and split it — several small actionable issues beat one
  umbrella nobody can pick up.
- **The idea is a decision, not work:** file it *as* a decision with the options written out.
- **Tracker unreachable (§7):** stop. Don't lose the idea — echo the drafted issue in the reply so
  it can be filed by hand.
