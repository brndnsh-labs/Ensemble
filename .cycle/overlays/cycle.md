## Track-awareness (the fold-in)

Read the issue's `track:*` label; it sets the loop's tail:
- **musical** → DoD is the **critique test** (run it, read the Critique Report); reviewer
  `music-theory-reviewer` (+ `state-discipline-reviewer` if state changed). A change that changes
  what you hear ships like **synth** below (§5's listening brake: Brandon's listen on the test
  build, or a Fable taste review he has delegated); one that leaves the sound as it was →
  auto-merge on green.
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
