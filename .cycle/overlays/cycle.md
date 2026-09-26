## Track-awareness (the fold-in)

Read the issue's `track:*` label; it sets the loop's tail:
- **musical** → DoD is the **critique test** (run it, read the Critique Report); reviewer
  `music-theory-reviewer` (+ `state-discipline-reviewer` if state changed). Safe → auto-merge on green.
- **synth** → DoD is a **human listen on the deployed test build**; reviewer `synth-graph-reviewer`
  (graph hygiene only). Pick these up freely — the loop runs the same as any other Track right up
  to the gate. `/done` builds + opens the PR, then **deploys the branch to test** (`/deploy-test`,
  no merge needed first) and hands Brandon the checklist + a Works/Something's-off/Haven't-
  checked verdict prompt right there — **that's the audition**, not a separate local harness step.
  "Works" merges immediately (the verdict *is* the approval); "Haven't checked" parks it (`status:needs-ear`) — re-invoke `/cycle #<n> approved` once he's listened. The merge itself still always
  waits on his ear; nothing here auto-merges unheard.
- **bundle** → DoD is a **measured KB delta** (the v2 export, `prototypes/v2/out/_next/static/`) **and** the full suite
  green (behavior-preserving); reviewer `bundle-hygiene-reviewer`. Safe → auto-merge on green.
