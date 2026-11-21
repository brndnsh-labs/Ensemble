---
name: cycle
description: Build and ship ensemble work end to end — read the issue, build it, run the gates, review it at the depth its risk deserves, fix what review finds, and open the PR (queuing server-side auto-merge for a safe story). Stops only on a brake or a real judgment call. Usage `/cycle #<n>` · `/cycle next` · `/cycle --all` · `/cycle <plain-English idea>` · add `--deploy`.
---
<!-- cycle:rendered template=skills/cycle.md.tmpl hash=5546e6e159b7 — managed by the-cycle; edit the template, not this file -->

# /cycle — build and ship

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill is the
ordering; the rules live there: §1 tracker, §3 review, §4 gates, §5 when to stop, §6 delivery.

## Forms

- **`/cycle #<n>`** — one issue, built and shipped.
- **`/cycle next`** — pick the top pickable issue (§1 ranking), then cycle it.
- **`/cycle --all`** — work through the pickable queue unattended. Skip, without stopping, any
  issue that would hit a §5 brake, poses an open decision, or can't be proven by the gates — and
  **when unsure, skip it** — listing each skip with its reason in the report. Stop when the queue
  is dry, a gate or CI goes red, or at a milestone boundary. Post a one-line progress note every 5
  stories.
- **`/cycle <idea>`** — no issue yet: shape it with `/intake` first (it asks only what it must), then
  build the issue it files.
- **`--deploy`** — after a merge, run `/deploy-test` if this repo has a test environment.

## Steps

1. **Read the story.** `gh issue view "<n>" --json number,title,state,url,labels,milestone,body,comments` — body *and* comments, where the real ask often lives
   — plus the docs it points at. `status:needs-decision` or unclear Acceptance → stop and
   surface; don't guess. Already `status:in-progress` or `status:in-review` → someone
   may be mid-flight; check for an open branch or PR and confirm before rebuilding. No status label
   → untriaged; build it only when asked for by number and it's genuinely scoped. Check it isn't
   already shipped (§1).
2. **Start.** `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:blocked,status:needs-decision,status:needs-ear" && gh issue edit "<n>" --add-label "status:in-progress"`, then branch from fresh `origin/main`
   (§6) unless an epic branch already exists. Say in one line what you're about to build.
3. **Build** it, then run the §4 gates.
4. **Review** at the depth §3 calls for. Fix every finding about this diff, re-run the gates, and
   have the reviewer confirm the fixes. Stop for Brandon if a finding needs a design call.
   A review that errored or timed out is not a clean one — never ship on it. (A reviewer subagent
   that can't be launched at all is different: fall back to an in-thread review, per `/review`.)
5. **Ship** (§6): commit, push, open the PR with `Closes #<n>`, mark it `status:in-review`,
   and comment the link on the issue. A safe story:
   server-side merge queued; issue closes when the forge lands it.
   A story that hit a §5 brake: leave the PR open and say what needs Brandon's eyes.
6. **Report** in a few lines: what shipped (PR links), what review caught, anything left open and
   why, and the next pickable issue.

**Abandoning a build** (blocked, or the spec turned out wrong): set it back with
`gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:blocked,status:needs-decision,status:needs-ear" && gh issue edit "<n>" --add-label "status:ready"` (or `status:needs-decision` if it now
needs a call) and comment why, so nothing is stranded in progress.

**Unattended runs** stop for no progress, not elapsed time: if a story has produced no new diff,
green gate, or CI transition for about 30 minutes, stop and report what's stuck.

## Building here

- Read the docs the change touches before building: `docs/CHART_FORMAT.md` for the format, `docs/MUSIC_NOTES.md` and its part under `docs/music-notes/` for a player, `docs/AUDIO_NOTES.md` for audio.
- A change prompted by Brandon's ear lands as a property or a critic metric first, in its own commit, failing or moving; then the code that satisfies it.
- If goldens moved on purpose: `pnpm goldens`, and the `DECISIONS.md` line saying why.
- If the change can be heard or seen: write its page under `out/<name>/` (not committed), each clip or picture with what was measured beside it, before and after where that applies. `pnpm levels` before asking an ear about loudness.
- App work: look at it (`node scripts/look.ts`, light and dark, phone size) before calling it built.

## Shipping here

- `DECISIONS.md` gets the entry for any call made along the way (in the PR, not after it). The state of the work goes on the issue and the PR, not in `PLAN.md`.
- **Whether a change that can be heard waits on his ear is measured, not assumed** (DOCTRINE, "Measured before asked"): paste the last block of each moved style's `pnpm score` report ("against what he has passed by ear") into the PR body. Inside in every style, no new kind of sound, and not the one in five: `Closes #<n>`, and the closing comment says "inside what he has passed".
- **Work that waits on Brandon's ear or eye does not close on merge.** Write `part of #<n>` in the PR body, not `Closes #<n>`. Once it has merged, set the issue to `status:needs-ear` and comment where the page is (`out/<name>/`) and what was measured. `/unblock` closes it on his verdict.
- The PR body reports scorecard movement and which goldens changed, in numbers, and makes no claim about how it sounds.
