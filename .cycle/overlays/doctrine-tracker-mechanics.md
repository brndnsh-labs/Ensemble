- **Two kinds of routing, and they live in different places** (changed at the 2026-08-04
  GitHub flip — under Forgejo *everything* below was a label namespace):
  - **Board fields** on org project #1, written with `gh-project.mjs status` / `set-field`
    / `batch`:
    - `Status`: Ready · In progress · In review · Needs decision · Needs ear · Blocked · Done
    - `Track`: musical · synth · bundle · ui — the load-bearing routing dimension here;
      it picks the DoD, reviewer, and merge behavior (see doctrine-routing).
    - `Review lens`: code-review · music-theory · synth-graph · state-discipline ·
      worker-contract · bundle-hygiene · test-quality · practice-ux ·
      audio-stems-reviewer · both
    These are **exact strings** — the helper matches with `===`, so `needs ear` or
    `Needs-ear` fails to route with no error at all. Copy them, don't retype them.
  - **Plain issue labels**, read straight off `gh issue list --json labels` and never
    written through the board helper: `size/*`, `model/*`, `agent/*`, `area:*`, plus the
    bare `backlog` · `finding` · `bug` · `burndown` · `verify-by-ear` markers. These are
    static attributes rather than loop state, so they didn't earn a board column.
    `/next`'s size tiebreak reads the `size/*` label.
- **An issue can be open and not on the board.** `gh project item-list` carries no
  open/closed state, so intersect it with `gh issue list --state open` — that catches
  both a closed item lingering on the board and an open issue nobody added to it.
- The real done-signal is `issue close`. `Done` exists as a board option, but a closed
  issue is what actually means shipped here.
- **Issue numbers are continuous across the Forgejo era, up to #935.** Ensemble began on
  GitHub, moved to Forgejo in 2026-07 (Forgejo's counter *continued* from #935 rather
  than restarting), and came back 2026-08-04. So a bare `#N` for **N ≤ 935 resolves
  correctly** — same issue, same number, all 224 issues and 710 PRs still here. Only the
  Forgejo-only window (#936–#1355) is renumbered; that map lives in homelab-maintenance
  `migration-maps/Ensemble-issue-map.tsv`, and those closed issues stayed behind in the
  read-only archive at `git.brndn.zip/brandon/Ensemble-archive`.
