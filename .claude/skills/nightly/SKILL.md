---
name: nightly
description: The manually-kicked overnight loop — run before signing off. Consumes the vetted safe backlog (/burndown), and when it runs dry, generates tomorrow's candidates by running ONE /scout lens (rotates by day so a11y · security · perf · hygiene · context all cycle weekly, weighted toward the fuel-rich ones). Establishes the standing "overnight go" so the run proceeds unattended through its safe set, deploys what shipped to test, and leaves a clean morning report with a smoke-test checklist. Consume + find + ship-to-test in one invocation. Usage `/nightly` (rotates the scout lens) or `/nightly <a11y|security|perf|hygiene|context>` (pins it).
---

# /nightly — consume the safe queue, then scout for tomorrow's

Goal: one verb Brandon fires before signing off that puts the loop to productive work overnight —
**grind everything already vetted-safe, then discover candidates for next time** — and hands him a
clean morning summary. Not scheduled; **manually invoked**. It composes the two halves of the
autonomous loop and declares the standing go that lets them run without a per-step nod.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This is the
unattended path, so §5 (always-brake set / autonomous safe set) and §6 (the poll-then-merge guard,
never `--auto`) are load-bearing — the standing go below removes the *checkpoint pauses*, not those
*guardrails*.

## What it does, in order

0. **Start the clock.** Before anything, capture a start timestamp — `date +%s` (and note the human
   time) — so the morning report can state how long the run took. A model can't estimate elapsed time
   after the fact.

1. **Consume — `/burndown`.** Grind the safe set: `burndown`-labelled issues first, then other
   filter-passing issues, then standing hygiene. Auto-merge on green CI, all of `/burndown`'s safety
   rules intact. For an unattended run, **relax the 5-item check-in into a checkpoint *note*** — keep
   shipping safe items and record each in the running report rather than pausing — but every *other*
   stop condition (judgment call, gates/CI red, queue dry) still halts that item and logs it.
   - **`verify-on-device` items ARE in the safe set** (§2/§5): build + auto-merge them like any safe
     story — but **track each** so step 3 can put it on the device-verify checklist (its correctness
     is knowable from code; CI green ≠ eyeballed). A true `needs-ear` item (can't tell it's *correct*
     without hearing it — any Track `synth` or by-ear musical work) stays excluded.

2. **Find — one `/scout` lens.** When `/burndown` reports the safe queue **dry** (or it was dry to
   begin with), run a single `/scout` pass to refill the candidate pipeline:
   - **Lens by rotation:** default picks by day so all five cycle weekly, **weighted toward the
     fuel-rich lenses** — `hygiene` (Mon/Fri), `context` (Tue/Sat), `a11y` (Wed), `perf` (Thu),
     `security` (Sun). Hygiene and context repeat (most auto-grind fuel); security runs once weekly
     (`npm audit` doesn't change daily). A passed arg pins it. *(Update this table if a lens changes.)*
   - Scout's budget (top ~3–5), dedup, and conservative `burndown`-tagging all apply. The standing go
     lets scout file its slate without the interactive checkpoint.
   - **The feedback loop:** the dead-safe items scout files tonight (hygiene, off-path perf [Track
     bundle], deterministic a11y `+verify-on-device`, factual-sync context, CVE bumps) become
     `burndown` fuel the *next* `/nightly`; the `Needs-decision`-shaped finds become fuel one
     `/unblock` later. Discovery and consumption compound over nights.

3. **Ship to test + build the eyeball list.** If the run **merged anything**, deploy what shipped so
   Brandon can see it over coffee — run the **`/deploy-test`** skill (the single source of truth for
   the staging push: `scripts/deploy-test.sh` + the live-asset-hash confirm against
   `git rev-parse --short HEAD`). Then assemble a **smoke-test checklist from the night's
   diff**, grouped the way a human checks:
   - **Lead with the highest-value / riskiest *visible* change** — the one thing most worth a look.
   - **New visible features/fixes**, one line each: what to do + where to click + the issue #.
   - **A one-line sanity sweep** (app loads, a chart plays through, no red console errors).
   - **List the shipped items with NO UI surface** (dead-code / dep bumps / comments / type-tightening)
     as "nothing to check," so Brandon doesn't hunt for an invisible change. **Only user-visible
     surfaces get a checkbox.**
   - **A dedicated "Verify on your phone/device" block** for every `verify-on-device` item merged
     tonight — kept *separate* from the desktop smoke sweep. One entry each: **what changed**, **what
     should now be true**, **what to confirm it *didn't* break** (the adjacent surface — e.g. for a
     `safe-area-inset` change, check the top of the chart didn't slide under the status bar), and **the
     one-line revert** (`git revert <sha>`). These landed on `main` on CI-green trust — the checklist
     is how Brandon closes the loop, so make the revert frictionless.
   **Nothing merged** (dry queue, or all halted for review) → **skip the deploy** and say so. Prod is
   never part of this — promoting to prod is Brandon's awake, gated call (`scripts/deploy-prod.sh`).

4. **Report.** One morning-ready summary, in order: **lead with the run duration** (`date +%s` again
   minus the step-0 start, human-readable — "ran 4h 12m, 23:40 → 03:52"); then what `/burndown`
   **shipped** (issue/PR links); the **test-deploy SHA + the step-3 smoke-test checklist**; what
   `/scout` **filed** (links + Status / whether `burndown`); and what **stopped and why** (judgment
   calls → "`/unblock` next sitting") plus what's now grind-ready. Brandon reads *one thing* over
   coffee and knows the state.

## The standing overnight "go"

Invoking `/nightly` **is** the authorization for the run's safe set — `/burndown` auto-merges and
`/scout` files without per-step confirmation, because Brandon explicitly started the unattended loop.
This does **not** widen the safe filter: **§5's always-brake classes still stop and surface**, exactly
as in an attended `/burndown`. The standing go removes the *checkpoint pauses*, not the *guardrails*.

## Guardrails (inherited — the unattended path leans on them hardest)

- **The safe filter (§5) is unchanged and conservative.** Excluding a safe-ish item costs throughput;
  including an unsafe one costs trust — exclude when unsure.
- **Auto-merge = §6's poll-then-merge guard only, never `gh pr merge --auto`** (no server-side
  required checks here, so `--auto` can land before gates finish).
- **Prod is never touched.** The standard finish deploys to **test** (step 3); `/nightly` never runs
  `deploy-prod.sh`. Promoting to prod is always Brandon's explicit, awake decision.
- **Scout finds, never fixes.** Step 2 only files issues; never branches/merges speculative work.
- **Re-verify gates yourself** — never trust a spawned "green."
- **Honor every hard stop:** judgment call, red CI, dry queue, or interrupt. A clean halt with a good
  report beats grinding past a real signal.

## Edge cases

- **Safe queue dry AND scout finds nothing** (clean on tonight's lens) → a legitimate quiet night.
  Report "nothing safe to grind, clean on `<lens>`" and stop — don't widen the filter to stay busy.
- **`/burndown` stops early on a judgment call** → still run the `/scout` step (discovery is
  independent and safe), then report both the halted item and the scouted slate.
- **Pinned lens** (`/nightly perf`) → skip rotation, run that lens; everything else identical.

## How it fits the pipeline

- **`/nightly`** = the unattended composition: `/burndown` (consume) + `/scout` (discover) +
  deploy-test (ship) + report-with-checklist.
- **`/burndown`** / **`/scout`** = its two halves, also runnable standalone.
- **`/unblock`** / **`/intake`** = where Brandon picks up what `/nightly` surfaces and files.
- **`/wrap-up`** = the *session-end* bookend (lessons → memory); `/nightly` is the *sign-off* one.
