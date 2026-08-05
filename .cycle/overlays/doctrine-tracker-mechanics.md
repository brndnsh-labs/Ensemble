- **Routing is all labels, in one namespace-per-dimension scheme** (the Projects v2 board was
  retired 2026-08-05; before that the first three lived as board fields, and under Forgejo
  before that they were label namespaces again):
  - `status:*` — loop state, one at a time: `status:ready` · `status:in-progress` ·
    `status:in-review` · `status:needs-decision` · `status:needs-ear` · `status:blocked`.
    Written with `gh issue edit`; every write clears the whole set first, so they can't overlap.
  - `track:*` — musical · synth · bundle · ui. **The load-bearing routing dimension here**: it
    picks the DoD, reviewer, and merge behavior (see doctrine-routing).
  - `lens:*` — code-review · music-theory · synth-graph · state-discipline · worker-contract ·
    bundle-hygiene · test-quality · practice-ux · audio-stems-reviewer · both.
  - Static attributes, unchanged: `size/*`, `model/*`, `agent/*`, `area:*`, plus the bare
    `backlog` · `finding` · `bug` · `burndown` · `verify-by-ear` markers. `/next`'s size
    tiebreak reads the `size/*` label.
  - Every one of these is read straight off `gh issue list --json labels` — **one call returns
    the work and all of its routing.** A label that doesn't exist in the repo makes `gh` fail
    loudly, which is the intended behavior: the board it replaced misrouted in silence.
- **There is no "not on the board" state any more.** An open issue is in the queue by
  definition; the only question is whether it carries a `status:*` label yet. One with none is
  the untriaged pile, not a lost item.
- The real done-signal is `issue close`. There is no `status:done` — a closed issue is what
  means shipped here, and a second marker would only go stale against it.
- **Issue numbers are continuous across the Forgejo era, up to #935.** Ensemble began on
  GitHub, moved to Forgejo in 2026-07 (Forgejo's counter *continued* from #935 rather
  than restarting), and came back 2026-08-04. So a bare `#N` for **N ≤ 935 resolves
  correctly** — same issue, same number, all 224 issues and 710 PRs still here. Only the
  Forgejo-only window (#936–#1355) is renumbered; that map lives in homelab-maintenance
  `migration-maps/Ensemble-issue-map.tsv`, and those closed issues stayed behind in the
  read-only archive at `git.brndn.zip/brandon/Ensemble-archive`.
