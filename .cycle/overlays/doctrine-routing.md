`track:*` is the load-bearing routing namespace — it picks the Definition
of Done and the reviewer set:

| Track | DoD | Reviewer | Merge |
| --- | --- | --- | --- |
| **musical** | a critique test in `tests/standards/` (statistical ranges, an automated oracle) | `music-theory-reviewer` | auto-merge on green; audible-but-theory-provable work ships `verify-by-ear` (§5); only genuinely-subjective feel is a `status:needs-ear` hard stop |
| **synth** | a human listen on the deployed test build — `/done` deploys the branch to test and runs the verdict check-in right there, no automated oracle | `synth-graph-reviewer` (graph hygiene only, not "does it sound good") | **always `status:needs-ear`** at the merge gate — "Works" merges immediately, "Haven't checked" parks it |
| **bundle** | a measured KB delta (`npm run build`/size check) **and** the full suite green (behavior-preserving) | `bundle-hygiene-reviewer` | auto-merge on green |
| **ui** | e2e smoke + `npm run typecheck` green, no new generative behavior/synth voice/bundle-shrink claim | `state-discipline-reviewer` if it touches state, else `/code-review` | auto-merge on green; pair with `verify-by-ear` if it routes audible voices (routing an already-approved voice isn't itself a synth hard stop) |

**Executors** (`agent/*`, sanity-checked against what the issue touches):
- `musical-engine-implementer` — generative engine behavior (`public/engine/**`,
  `public/state/**` engine slices); follows the repo's musical patterns (final-stage
  multiplier, deterministic phrasing, register slotting, coordination-context discipline).
- `critique-test-author` — when the deliverable **is** a new/tightened critique test
  (not a one-line threshold bump an engine implementer can do inline).
- `orchestrator-inline` — default for opus/small/taste stories, for audio-DSP/synthesis
  voices (`synth-*.ts`, `initAudio()`, `reverb.ts`, `synth-utils.ts`, scheduler audio-graph
  wiring), and for finicky infra (state-slice schema, worker sync contract, hydration) —
  anywhere a cold agent re-derives brittle detail and ships latent bugs.
- `claude` — general UI, non-engine `public/**`, mechanical work.

**Reviewers**, additive (union what fires):
`music-theory-reviewer` (engine/`tests/standards/`, Track musical) ·
`synth-graph-reviewer` (`synth-*.ts`/audio-graph, Track synth) ·
`state-discipline-reviewer` (state slices, new actions, `coordination-engine.ts`, any
`signal.x = y` that might bypass `dispatch`) ·
`worker-contract-reviewer` (state read by the logic worker — `getSyncState()`/
`syncWorker()`, worker-mirrored slices, new `WORKER_MSG.*`) ·
`bundle-hygiene-reviewer` (Track bundle) ·
`/code-review` (correctness pass, any non-trivial diff) ·
a **test-quality lens** for test-only diffs (coverage gaps, intent-vs-implementation,
vacuous/brittle asserts — `critique-test-author`'s lens for a critique test, `/code-review`
otherwise) · a **Sonnet second-perspective** pass when the implementer was Opus.
