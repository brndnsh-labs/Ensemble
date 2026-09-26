---
name: intake
description: The front door to the backlog — turn a plain-English idea into an actionable Ensemble issue. Interviews Brandon in frontier rounds — every question askable now, each led by a recommended answer — until the issue is genuinely implementable, then drafts it, classifies it, and files it. Plan-first — always shows the shaped issue before writing. Shares /scout's filing mechanics (DOCTRINE §10). Usage `/intake <the idea>` (or bare, and it'll ask).
---
<!-- cycle:rendered template=skills/intake.md.tmpl hash=127af77ac952 — managed by the-cycle; edit the template, not this file -->

# /intake — turn an idea into an actionable issue

Goal: stop a good idea from evaporating, or from landing as a vague one-liner that blocks later
work. Every other pipeline skill *reads* the tracker (`/next` picks, `/cycle` builds, `/burndown`
grinds); this one *writes* a well-formed issue into it from a plain-English idea.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** The filing
mechanics — dedup, the actionable bar, body format, budget — are **§10**; don't restate them,
apply them. Classification maps onto §2 (Labels) and §1 (Status). The write step uses §7.

**If `.claude/skills/FILING.md` is not already in context, read it before shaping or writing an
issue.** It expands §10's filing procedure without displacing DOCTRINE's certainty and safety
authority.

**The bar is "actionable"** (§10). A filed issue must be implementable from its own text —
`/implement` or `/cycle` should know exactly what "done" looks like without asking again. If the
idea isn't there yet, **interview it up to that bar** before filing. A vague issue is worse than no
issue: it defers the thinking to a moment with *less* context than right now.

## The one rule that makes this skill itself: interview in frontier rounds

Brandon will describe the idea in good faith; your job is sharpening it to actionable —
proposing the shape, filling obvious gaps yourself, asking only where the answer genuinely changes
the issue. Treat the open questions as a small **design tree**: each answer settles a branch and
may expose the questions that hang off it. The **frontier** is every question you can ask *now*
without guessing at an answer you haven't heard yet. So:

- **Ask the whole frontier in one round, then wait.** Number each question and lead it with your
  recommended answer, so a round can be accepted in a word. A question whose answer depends on
  another still open in this round belongs to the *next* round, not this one.
- **Recompute after every round.** Settled answers push the frontier outward. **Reflect each
  answer back** in a sentence as you do, so drift gets caught early.
- **Facts are yours to find; decisions are Brandon's.** Never ask for anything you could
  look up in the repo or the tracker — go look, and ask only the decision that's left.
- Ask only about what's **genuinely missing for the issue to be actionable** — infer the rest. A
  frontier of one question is common and fine; a frontier of five says the idea wants splitting
  (see Edge cases).
- **Stop the moment it's actionable.** One or two rounds is great; five is a slog.

Round format, in chat:

```
❓ **Q1 — <question title>**: <the question; options inline when it's a pick>
➡️ <your recommended answer>

❓ **Q2 — <question title>**: …
➡️ …
```

Use `AskUserQuestion` for a round whose questions are all genuinely discrete
picks (2–4 options each, recommendation first); a round with any free-text question goes in chat in
the format above.

## Workflow

1. **Hear the idea.** If invoked bare, ask what's on Brandon's mind. If it carried text, restate it in
   one plain sentence to confirm alignment before digging.

2. **Dedup first** (§10, read-only): search open issues on the idea's keywords and skim titles. If
   a likely twin exists, surface it — *"We already have #N for this — extend that, or is yours
   different?"* Extending is often the right move; never file a duplicate.

3. **Interview to actionable — in frontier rounds.** The usual gaps, roughly in the order they
   become askable; skip anything already clear:
   - **The symptom / why** — what's actually going wrong or missing, concretely. This usually
     arrives up front; reflect it back rather than re-asking.
   - **Acceptance — the load-bearing one.** What does "done" look like, verifiably? If that's
     fuzzy, this is the question to ask.
   - **Scope boundary** — what's explicitly *not* in this? Keeps it small and stops creep.
   - **Does it touch a §5 always-brake surface** (Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state contract (a `@direct-mutation` outside the sanctioned categories))? If so, say so plainly in the
     drafted body — it still files normally, but `/cycle` will pause there for a human call
     regardless of how the issue reads.
   - **Is it actually a decision, not a task** (no work happens until a direction is picked)? If
     so, write the options into the body ("decide one of: A / B") rather than picking one.

4. **Draft and show the shaped issue** — title, body in §10's Why / Touches / Acceptance format,
   and the classification you'd apply. **This is the checkpoint**: nothing is written until it's
   seen it.

5. **File it** (§7): `gh issue create --title "<title>" --body "<body>" --label "<label>"` — the label is a §2 workflow
   label describing *what kind of work it is* (`bug` and the `area:*` set); no fitting label is
   fine. Then route it by §10.5's certainty call — which the interview already made: an idea that
   reached the actionable bar is pickable, `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit "<n>" --add-label "status:ready"`;
   one that's really a decision (step 3) gets `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit "<n>" --add-label "status:needs-decision"`
   instead. There is nothing to add it *to* — an open issue is already in the queue; the status
   label is the only write.

6. **Report** the issue number and URL, and suggest `/cycle #<n>` if it's ready to build now.

## Batch mode

Given several ideas at once, interview them **one idea at a time** (each in its own rounds) to
actionable, draft them all,
show the set together, then file with a **single batched field write** (§7).

## Guardrails

- **Actionable, or don't file** (§10). If the interview stalls short of that bar, say so and stop —
  a placeholder issue is debt, not capture.
- **Read-only until Brandon confirms the draft.** No issue is created mid-interview.
- **Route honestly** (§10.5) — pickable only when the interview genuinely reached actionable; a
  decision-shaped idea files as `status:needs-decision`, never as pickable-with-caveats.
- **Don't fix anything.** `/intake` files; `/cycle` builds. Even a one-line fix goes through the
  pipeline.

## Edge cases

- **The idea is already an open issue:** extend or comment on it; report which, don't file a twin.
- **The idea is really several:** say so, and split it — several small actionable issues beat one
  umbrella nobody can pick up.
- **The idea is a decision, not work:** file it *as* a decision with the options written out.
- **Tracker unreachable (§7):** stop. Don't lose the idea — echo the drafted issue in the reply so
  it can be filed by hand.
