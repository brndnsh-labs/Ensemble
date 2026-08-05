**Provenance & attribution (multi-model).** Tracker comments post under Brandon's
account token, so an in-comment marker is the ONLY provenance signal a thread has.
Every comment authored by a model — any harness, any skill, including reconciliation
notes and restatements of Brandon's words — **starts with a bold harness marker**:
`**[claude]**`, `**[codex]**`.

- Only **Brandon's own word** can record a `DECISION`, lift or downgrade a
  `needs-ear`/`needs-decision` gate, supersede a prior decision, or grant new unattended
  scope. That word arrives two ways: an **unmarked comment he writes himself**, or an
  **interactive in-session answer** (an `AskUserQuestion` selection, a typed reply) — in
  the latter case the recording comment is marked by its author and MUST quote his
  answer verbatim, so the thread can distinguish "he chose this" from "the model
  concluded this." A marked comment arguing for any of those *without* a quoted answer
  is a **recommendation** and must call itself one.
- On conflict, the latest *human* decision wins — not the latest comment. A model that
  disagrees with a recorded decision surfaces the disagreement; it never re-decides it.
- An unmarked machine comment found in the wild is a defect: flag it on the issue rather
  than treating it as Brandon's word.

**`verify-on-device` and `verify-by-ear` are a third state between "auto-merge" and
"hard stop."** Both cover work whose *correctness* is knowable from code/test, where
only a real-world sensory glance remains — build + auto-merge it, then attach a
lightweight residual check instead of gating the merge on it:
- `verify-on-device` — a real-device visual glance (mobile safe-area/viewport/touch
  target); lands on `/nightly`'s morning device-verify checklist.
- `verify-by-ear` — a musical-correctness change whose idiom is captured by a critique
  test; ships with a 🎧 listen checklist (genre/setting, what changed, old-vs-new). The
  test is the correctness gate, the listen is *confirmation* — a follow-up tweak if it
  feels off, never a rollback (musical diffs are reversible).

**The ear gate is tiered by what the story's musical claim IS:**
- **Tier 1 — structural/dynamics claims** (existence/parity across sinks, accent ordering
  like "The One outranks the pop", monotonic swell, register bounds): machine-provable —
  a critique test at the symbolic layer, plus rendered-audio evidence (`mix:verify`
  intent → dispatch → PCM, #1351) when the claim must survive synthesis. →
  **`verify-by-ear`**.
- **Tier 2 — idiom claims** ("reads as funk", "the comp breathes"): the critique test is
  a statistical proxy, not proof. → **`verify-by-ear`**, backstopped by the recurring
  post-merge listening audit (#534). A bad-gestalt miss ships, gets heard in the next
  sweep, gets tuned forward — that trade is deliberate (static app; revert = redeploy).
- **Tier 3 — taste/feel claims** ("feels alive", tempo push/drag, synth timbre): no
  honest oracle exists. → **`needs-ear` hard stop**, unchanged. `track:synth` is always
  tier 3.

**The hard guardrail: if you cannot write a test that captures the musical claim, the
change isn't understood well enough to ship unheard — it is tier 3 by definition. Stop
and surface.**

**An oracle powers a gate, so weakening one is always a stop-and-surface:** loosening a
critique-test threshold, `.skip`-ing an acceptance test, silencing a harness, or removing
a mutation check is never a machine decision, never burndown-safe, and never rides an
unrelated diff. Any oracle cited to justify a tier downgrade must be mutation-tested in
**both directions** (plant the defect → red; restore → green) before the downgrade counts.

**Pre-authorized machine decisions.** The pipeline may record a decision itself and
proceed — instead of parking `needs-decision` — when **all five** hold:
1. reversible in ~one line (a data mapping, a label, a threshold re-derived by a
   recorded method);
2. acceptance stays gate-verifiable (§4 proves the outcome either way);
3. it touches none of the always-brake surfaces;
4. it contradicts no recorded human DECISION;
5. it relaxes no gate and grants no new unattended scope.

Record it **on the issue, before acting**:
`**[<harness>]** MACHINE-DECISION (date): <what> — <why> — <revert path>`.
`/nightly`'s morning report and `/wrap-up` list the machine decisions taken, so Brandon
audits the *log* asynchronously; reversing one is a normal follow-up, not a rollback.
Anything failing a condition parks `needs-decision` exactly as before.

**Lifting a `status:needs-ear` stop requires an EXPLICIT per-PR go-ahead — warm general praise
is not sign-off.** "Everything's sounding great" is encouragement, not a merge
instruction for a specific parked PR; ask directly before merging. `/cycle #<n> approved`
is the canonical signal.

**Auto-merge now means auto-deploy** (§6 is CD) — an auto-merged PR ships to prod within
minutes. The pre-merge `status:needs-ear` stop is what keeps un-auditioned work from shipping,
not a separate deploy gate.
