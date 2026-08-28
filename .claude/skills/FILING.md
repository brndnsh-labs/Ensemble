<!-- cycle:rendered template=references/FILING.md.tmpl hash=aa4a62ecee9c — managed by the-cycle; edit the template, not this file -->
# Filing mechanics (shared)

This file is the procedural expansion of DOCTRINE §10. **DOCTRINE remains the authority:** if this
file ever conflicts with its filing, certainty, or brake invariants, stop and follow DOCTRINE.
Read this reference only when a workflow will shape or file an issue.

Shared by `/scout` (machine-found) and `/intake` (human-described). Both *find or interview, then
file* — neither fixes, branches, or merges.

1. **Dedup first — and a rejection has memory.** Search open issues before filing; a
   near-duplicate gets a comment on the existing issue, not a new one. Then check recently
   *closed* issues too: a twin that was closed without shipping is a decision already made, and
   re-filing it because the cited code still exists turns recurring discovery into a nag. Mention
   the match in the report; do not re-file it.
2. **The bar is actionable.** An issue nobody could pick up and start is noise. If it cannot be
   stated as Why / Touches / Acceptance, keep interviewing or do not file.
3. **Shape it so the smallest human input unlocks it.** Prefer a pre-drafted fix with a yes/no
   decision over an open-ended question. A finding that arrives with the diff already written
   costs Brandon one glance; the same finding as a paragraph costs a work session.
4. **Body format:**
   ```
   **Why:** <the problem, and what's wrong today — with file:line evidence>
   **Touches:** <files / surfaces>
   **Fix (drafted):** <the concrete change — a diff, or the exact edit>
   **Acceptance:** <the observable condition that means it's done>
   ```
   The **Fix** line is mandatory for a machine-found finding (`/scout` read the code; the draft is
   the point) and best-effort for a human-described idea (`/intake` interviews toward it but files
   without it when the idea is scope, not a defect).
5. **Classify by kind, route by certainty.** Kind labels (`bug`, `area:*`, DOCTRINE §2's stamps)
   record what is known — set them freely. The `status:*` label is a **certainty call**, made at
   filing time, with three outcomes:
   - **Deterministic** — the fix would be the same no matter who wrote it, and DOCTRINE §4's gates
     can prove it → `status:ready`. That is real scheduling: an unattended grinder
     may build it, so the bar is "this exact diff should ship," not "something here should change."
   - **Interpretive** — a judgment call anywhere in it, however small →
     `status:needs-decision`, **with the fix pre-drafted** so the decision costs one glance,
     not a work session.
   - **Unsure → no status label.** It lands in the untriaged pile (DOCTRINE §1) for a human look —
     the filing-time twin of §5's "when unsure, exclude and surface."

   On a §5 brake surface, test the **direction of the change, not the surface it touches**. A
   finding there is deterministic only when it *tightens* — more validation, more redaction,
   stricter gates, fewer accepted inputs — **and** §4's gates demonstrate both the tightening and
   that nothing legitimate was lost. Anything that loosens, exempts, widens, or re-opens is never
   deterministic, however small the diff: certainty and safety are different axes, and pickable
   requires both.

   Tightening is not automatically safe. A redaction rule greedy enough to eat the evidence a
   validator needs, or a gate strict enough to reject legitimate traffic, fails closed — the quiet
   direction, and the one that hides. If the gates prove only the tightening, the result remains
   interpretive.

   A brake entry describing an **irreversible action** rather than a code change — running a
   destructive verb, writing to production — has no direction to test and never becomes pickable.
6. **Budget.** Filing zero is a success. A focused pass caps at **3–5** findings; a multi-lens
   sweep caps per lens and stays in single digits overall. Rank by impact × actionability and file
   only the top candidates; mention the rest without filing.
