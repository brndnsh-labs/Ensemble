---
name: cycle
description: Build and ship Ensemble work end to end — read the issue, build it, run the gates, review it at the depth its risk deserves, fix what review finds, and open the PR (queuing server-side auto-merge for a safe story). Stops only on a brake or a real judgment call. Usage `/cycle #<n>` · `/cycle next` · `/cycle --all` · `/cycle <plain-English idea>` · add `--deploy`.
---
<!-- cycle:rendered template=skills/cycle.md.tmpl hash=c93f7ffd6861 — managed by the-cycle; edit the template, not this file -->

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
2. **Start.** `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit "<n>" --add-label "status:in-progress"`, then branch from fresh `origin/main`
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
`gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit "<n>" --add-label "status:ready"` (or `status:needs-decision` if it now
needs a call) and comment why, so nothing is stranded in progress.

**Unattended runs** stop for no progress, not elapsed time: if a story has produced no new diff,
green gate, or CI transition for about 30 minutes, stop and report what's stuck.

## Building here

Before building, read the `CLAUDE.md` section matching the story's Track/area (always
§ Musical Logic & Generative Standards for a musical story; § State for state writes) and the
nested guide for the directory you touch — `band/CLAUDE.md` for a musical story,
`core/engine/CLAUDE.md` for a synth story.

A new `core/engine/*.ts` file needs an `AI_MAP.md` row — remind a spawned agent; the
pre-commit docs-lint hook blocks the commit without it.

## Track-awareness (the fold-in)

Read the issue's `track:*` label; it sets the loop's tail:
- **musical** → DoD is the **critique test** (run it, read the Critique Report); reviewer
  `music-theory-reviewer` (+ `state-discipline-reviewer` if state changed). Safe → auto-merge on green.
- **synth** → DoD is a **human listen on the deployed test build**; reviewer `synth-graph-reviewer`
  (graph hygiene only). Pick these up freely — the loop runs the same as any other Track right up
  to the Ship step. There, **open the PR but do NOT queue the merge** (no `gh pr merge --auto`),
  even though auto-merge is on: `/deploy-test` the branch (no merge needed first) and hand Brandon
  the checklist + a Works/Something's-off/Haven't-checked verdict prompt right there — **that's
  the audition**, not a separate local harness step. "Works" merges (the verdict *is* the
  approval); "Haven't checked" parks it (`status:needs-ear`) — resume with `/cycle #<n> approved`
  once he's listened. The merge itself always waits on his ear; nothing here auto-merges unheard.
- **bundle** → DoD is a **measured KB delta** (the v2 export, `web/out/_next/static/`) **and** the full suite
  green (behavior-preserving); reviewer `bundle-hygiene-reviewer`. Safe → auto-merge on green.
