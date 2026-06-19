---
name: intake
description: The front door to the backlog — turn a plain-English idea into an actionable, fully-classified GitHub Project item. Interviews Brandon ONE question at a time (quick back-and-forth, plain English) until the issue is genuinely implementable, then drafts it, sets the Project fields (Status/Track/Size/Model/Agent/Review lens) + labels, and tags the safe ones `burndown` so the autonomous loop can pick them up. Plan-first — always shows the shaped issue before writing. The capture companion to /unblock (decisions) and /burndown (grind), and the inverse of /wrap-up (ideas→backlog). Usage `/intake <the idea>` (or bare, and it'll ask).
---

# /intake — turn an idea into actionable, classified backlog

Goal: stop good ideas from evaporating or landing as vague one-liners. `/intake` is the **capture
verb**: every other skill *reads* the GitHub Project (`/next` picks, `/cycle` builds, `/unblock`
decides, `/burndown` grinds); this one *writes* a well-formed item into it from a plain-English idea.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** Classification
(step 4) maps an idea onto §2 (Labels) + §3 (Track/fields/executors/reviewers); the `burndown` tag
uses §5's safe set; the field-writes use §7's batch rule. The vocab lives in DOCTRINE — this skill is
how to *map an idea onto it*.

**The bar is "actionable."** A filed issue must be implementable from its own text — `/implement` or
`/burndown` should know exactly what "done" looks like without asking again. If the idea isn't there
yet, **interview it up to that bar** before filing.

## The one rule that makes this skill itself: interview ONE question at a time

Brandon works best talking through a problem in plain English. This is a **partnership, not an
interrogation**: his half is the idea; your half is sharpening it to actionable — propose the shape,
fill the obvious gaps yourself, ask only where his answer genuinely changes the issue.

- Ask **one focused question, in plain English, then wait.** Quick back-and-forth.
- **Reflect each answer back** in a sentence so he can correct drift.
- Ask only about what's **genuinely missing for the issue to be actionable** — infer the rest.
- **Lead with a recommendation** on every judgment-call question — "I'd call this Size S because …,
  sound right?" beats "what size is this?"
- **Stop the moment it's actionable.** Over-interrogation is a failure mode too.

Use `AskUserQuestion` only for a genuinely discrete single choice (one question, 2–4 options, rec
first) — never to fire several at once.

## Workflow

1. **Hear the idea.** If bare, ask what's on his mind. If it carried text, restate it in one plain
   sentence to align before digging.

2. **Dedup first** (read-only). `gh issue list --state open --search "<keywords>"` + a title skim.
   If a twin exists, surface it: *"We already have #N — extend that, or is yours different?"* Never
   file a duplicate; extending an existing issue is often right.

3. **Interview to actionable — one question at a time.** Ask the highest-value *gap* first:
   - **The symptom / why** — what musical/playing moment does this serve? Frame it as the experience
     ("you hit play on a 6/8 chart and the drums feel jumbled"), so acceptance stays grounded.
   - **Acceptance — the load-bearing one.** What does "done" look like, concretely enough to verify?
     For a **musical** story that's a **critique test**; for **synth** an **A/B audition**; for
     **bundle** a **KB delta**. (§3 / §4.)
   - **Scope boundary** — what's explicitly *not* in this? Keeps it S/M.
   - **Decision / ear dependency** — open design question, or only-his-ear call? → `Needs-decision` /
     `Needs-ear`, not `Ready` (step 4).

4. **Classify — infer, then confirm in one light pass.** Map to the Project's real fields + labels:
   - **Track** — `musical` (generative engine behavior) · `synth` (audio/DSP voices) · `bundle`
     (size/dead-code). The Track sets the DoD + reviewer (§3).
   - **`area:*` label** — `soloist · bass · drums · chords · harmony · groove · synth · state ·
     worker · ui · infra`.
   - **Kind label** — `finding` (a bug/cleanup in code that exists) vs `backlog` (a new idea).
   - **Status** (readiness triage):
     - well-specified **and** safe **and** gate-verifiable → **`Ready`**
     - blocked on a design/scope call → **`Needs-decision`** (+ `needs-decision` label)
     - blocked on his ear (synth audition / musical listen pass) → **`Needs-ear`** (+ `needs-ear`)
     - real but not yet shaped → **leave Status unset + `backlog` label** (the inbox)
   - **Size** — `S` / `M` / `L`. Infer; confirm only on a real toss-up.
   - **Model** — `sonnet` (mechanical, well-scoped) vs `opus` (design / judgment); default opus.
   - **Agent** — `musical-engine-implementer` · `critique-test-author` (test is the deliverable) ·
     `synth-implementer` · `claude` (UI/general) · `orchestrator-inline` (state/worker schema,
     hydration, finicky internals — do it inline). (§3.)
   - **Review lens** — `music-theory` · `synth-graph` · `state-discipline` · `worker-contract` ·
     `bundle-hygiene` · `code-review` · `both`.
   - **`burndown` label — apply conservatively.** Tag ONLY if it passes **DOCTRINE §5's safe set**:
     not destructive / not a state-or-worker-contract design call / **not Track synth or by-ear
     musical** / well-specified / S/M / single area / **gate-verifiable** (a passing critique test or
     a measured KB delta, not by ear). When in doubt, **don't tag**. (A `verify-on-device` mobile-UI
     fix can be `burndown` + `verify-on-device`.)

5. **Draft + show it (plan-first — the checkpoint).** Present the shaped issue before writing:
   - **Title** — crisp, imperative.
   - **Body** — *symptom/why* (grounded), *acceptance* (verifiable, Track-appropriate), *scope /
     non-goals*, *notes* (related issues/memories `[[…]]`).
   - **Classification** — Track + labels + Project fields, each with a half-line of why.
   - **Readiness verdict** — *"Ready + `burndown`-safe — the grinder can take it hands-off"* /
     *"Ready for a human `/cycle`"* / *"Needs your decision on X → Needs-decision"* / *"Parked in the
     inbox until shaped."*

   Get a yes (or tweaks) before writing.

6. **Create + classify** (the only writing step):
   ```
   gh issue create --title "<title>" --body "<body>" \
     --label "area:<x>" --label "<backlog|finding>" \
     [--label burndown] [--label needs-decision|needs-ear] [--milestone "<epic>"]
   ```
   Then set ALL Project fields in **one `batch` call** (`batch` auto-adds to the board):
   ```
   cat > /tmp/intake-fields.json <<JSON
   [
     { "issue": <n>, "field": "Status", "value": "<Status>" },
     { "issue": <n>, "field": "Track",  "value": "<musical|synth|bundle>" },
     { "issue": <n>, "field": "Size",   "value": "<S|M|L>" },
     { "issue": <n>, "field": "Model",  "value": "<sonnet|opus>" },
     { "issue": <n>, "field": "Agent",  "value": "<…>" },
     { "issue": <n>, "field": "Review lens", "value": "<…>" }
   ]
   JSON
   node scripts/gh-project.mjs batch /tmp/intake-fields.json
   ```
   Drop the Status line if no Status applies (a status-less backlog item is correct). gh unreachable
   → say so and stop (§7).

7. **Report.** Created issue(s) + links, each Status, and what's now actionable: `Ready`+`burndown`
   → "`/burndown` can grind these"; `Ready` (human) → "`/cycle next` when you want it";
   `Needs-decision`/`Needs-ear` → "`/unblock` next sitting."

## Batch mode

Several ideas at once → run each through the same loop (dedup → quick interview → classify → confirm
→ create), crisp exchanges. **Field-writes go in ONE `batch` at the very end** — `gh issue create`
each first (collecting numbers), accumulate every `{issue,field,value}` into one
`/tmp/intake-fields.json`, run `node scripts/gh-project.mjs batch` once (§7 rate-limit).

## Guardrails

- **Actionable-or-don't-file.** Can't reach a verifiable acceptance → park a clearly-labelled rough
  `backlog`/`inbox` note, or stop and say it needs more thinking. Be honest which.
- **Infer aggressively, confirm lightly.** Don't interrogate fields he doesn't care about.
- **Conservative `burndown` tagging.** When unsure, leave it off.
- **Read-only until the step-5 confirmation.**
- **One question at a time.** If you catch yourself stacking questions, stop and ask just the first.

## How it fits the pipeline

- **`/intake`** = ideas → backlog (capture). **`/scout`** = code → backlog (machine discovery,
  reuses this classification). **`/unblock`** = clears decisions owed. **`/next` / `/cycle`** = build
  Ready items. **`/burndown`** = grind the safe `burndown` set — `/intake` keeps it fed.
  **`/wrap-up`** = the inverse capture (lessons → memory).
