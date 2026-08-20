<!-- cycle:rendered template=DOCTRINE.md.tmpl hash=5ac563892ff6 — managed by the-cycle; edit the template, not this file -->
# Pipeline doctrine (shared)

Single source of truth for the rules the Ensemble work-loop skills share. A skill that says
"see DOCTRINE §X" means *this* file. **If this isn't already in your context, read it once** —
within a session the read amortizes across every pipeline skill you run.

Reconcile here, not in the skills: when a rule changes, edit this file, not the skills that
restate it. The skills hold only their *unique* procedure.

---

## §1 Tracker & readiness

The tracker is the **GitHub repo's issues** (`brndnsh-labs/Ensemble`, public), routed by `status:*` labels. A **story = an issue**: its **body** holds
Why / Touches / Acceptance; routing lives in its **labels** (§3). **Milestones = epics.**

**"The board" is the open issue list** — there is no separate artifact to keep in sync, and
nothing to be on or off. Status is one `status:*` label on the issue itself.

| Status label | Meaning | Pipeline action |
| --- | --- | --- |
| `status:ready` | scoped + pickable | `/next` ranks & picks; `/implement`/`/cycle` build |
| `status:in-progress` | being built | don't re-pick |
| `status:in-review` | built, under review / PR open | don't re-pick |
| `status:needs-decision` | blocked on a human call | surface it; **don't build** |
| `status:needs-ear` | needs a by-ear listening pass before it can ship | surface it; **don’t** call it done on tests alone |
| `status:blocked` | blocked on a dependency | skip; name the blocker |
| *(none)* | the idea pile — filed but not scheduled | triage/scope it first; don't pick |

Exactly one `status:*` label at a time: every write clears the whole set before adding one, so
the states can't overlap. **No label is a real state**, not a gap — it's every issue still waiting
on a §10.5 certainty call (a review-carved observation, §2; a finding the filer couldn't
confidently route), and that untriaged pile is where triage starts.

**Ranking pickable work** (`/next`): milestone (a real numbered epic > a "candidate epic" / no milestone), then Size (S < M < L, read off the `size/*` **label** — Size is not a board field), then issue number. Model is *not* a ranking factor.

**A closed issue is "done."** `Closes #<n>` closes the issue on merge, and that close *is* the
completion record — there is no `status:done`, because a second source of truth can disagree with
the close and will eventually go stale. The last label the pipeline writes is `status:in-review`;
the merge finishes the story. The pipeline doesn't argue with the close; it lets the close speak.

**A stale-*open* issue may already be shipped.** An umbrella/parent issue's slices often ship
under sibling-numbered PRs that never reference the umbrella's own number — `git log --grep=#<n>`
finds nothing even though the work is done. Before building a pickable-looking issue, trace
whether the described *behavior* already exists in live code (`git log -S"<symbol>"`, read the
actual function) — don't trust issue-number absence in history as proof no work has happened.

The `docs/audit/` and `docs/synth-audit/` trees are a **frozen archive** of the old
markdown-tracked cycles — not the live tracker. Never read them as current; if the
tracker is unreachable, stop, don't fall back to them.

## §2 Labels

- **`finding`** — review debt, diff-coupled; **should trend to empty**. A cycle must not *grow*
  this set as a side effect — escalate only with Brandon's nod (§5).
- **`scout`** — provenance stamp on issues filed by a `/scout` sweep, so their origin stays
  visible later. Additive only; doesn't change routing.

**An issue carved from a review's out-of-scope observation arrives unrouted by design** — no
routing values set. Don't treat that as under-specification: routing is decided by the *picking*
skill at `/cycle` time, from what the diff actually touches, not at filing time.

- **`backlog`** — new ideas. May also carry a `needs-ear`/`needs-decision` **caveat
  label** = "needs Brandon's input even to schedule" (a hint, not a blocked story).
- **`inbox`** — raw capture, not yet triaged.
- **`burndown`** — vetted safe for autonomous execution (the safe set); `/burndown`'s
  fast-path fuel. A strong signal, not a blank check — the safe filter still backstops it.
- **`verify-on-device`** — deterministic + safe to build and auto-merge unattended, but
  the deliverable's last residual is a real-device visual glance (e.g. a mobile
  safe-area/viewport/touch-target fix headless CI can't eyeball). Not `needs-ear` — the
  change's *correctness* is knowable from code; only its side-effects need an eyeball.
  `/nightly` lands these on the morning device-verify checklist. Pairs with `burndown`.
- **`verify-by-ear`** — the musical analogue: a musical-correctness change whose idiom
  *is* captured by a critique test, so it builds + auto-merges on green, but its last
  residual is a listen pass (ships with a 🎧 checklist: genre/setting to load, what
  changed, old-vs-new to hear). Not `needs-ear` (reserved for genuinely-subjective work
  no critique test can assert). Pairs with `burndown`.
- **`scout`** — provenance stamp on issues filed by a `/scout` sweep, so `/unblock`
  surfaces last night's finds freshest-first.
- **`area:*`** — surface tags inferring the executor when `agent/*` is unset:
  `area:soloist`, `area:bass`, `area:drums`, `area:chords`, `area:harmony`,
  `area:groove`, `area:synth`, `area:state`, `area:worker`, `area:ui`, `area:infra`.

## §3 Routing

- **Model:** `frontier` | `balanced` | `economy` via the `model/*` label (default `frontier` when untagged). The labels are provider-neutral routing tiers: `frontier` = Codex Sol / Claude Opus for ambiguous design, independent diagnosis, §5 brake surfaces, and deceptively complex concurrency or state/worker work; `balanced` = Codex Terra / Claude Sonnet for bounded but non-trivial implementation, including critique-test-verifiable musical work; `economy` = Codex Luna / Claude Haiku for precise, safe, S-sized mechanical work with an existing test seam and centralized verification. **Model never gates autonomy** (§5) — it only picks the executor's model.
- **Executor:** **`orchestrator-inline` by default** — the main thread builds directly,
  keeping accumulated context. **Spawn parallel agents only for
  independent mechanical work** (the same change across several files); keep shared-file edits
  (indexes, schema) and the validation gates on the main thread.
- **Reviewer** (`/review` routes by the diff):
  - The **inline correctness pass** — any non-trivial diff. The orchestrator reviews the diff
    itself (logic, edges, error paths, contracts, invariants). The heavyweight `/code-review` is
    **human-triggered** — the loop cannot invoke it; offer it on a large or risky diff and leave
    the call to Brandon.
  - **`/security-review`** — **additionally**, whenever the diff touches Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop), destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state), the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field).
  - A **second-model angle** (a different model family or tier from the implementer) is a cheap
    way to catch same-prior blind spots on a meaty diff.

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
- `orchestrator-inline` — default for frontier/small/taste stories, for audio-DSP/synthesis
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
otherwise) · a **balanced-tier second-perspective** pass when the implementer was frontier-tier
(or vice versa).

**Re-verify agent claims:** a spawned agent's "gates green / tests pass" is a *claim*. Re-run the
gates **yourself** before trusting it — a spawned "all green" has failed in a clean shell before.

## §4 Gates

Local, before handing to `/review` or `/done` (never proceed over a red gate):

```
npm run typecheck     # tsc over public/**/*.{ts,tsx}
npm run lint          # Biome lint + format check
npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)
npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)
npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)
```

`npm test`, `npm run test:browser`, `npm run test:e2e` are three separate runners
(node · browser-audio · e2e); `npm run ci` covers only the first. `npm run validate`
(typecheck + knip + jscpd + format + `npm test`) is the full sweep — run it before a
`/done` that touches more than one file. CI runs `npm test` + `npm run test:e2e` in
parallel; both must be green to merge.

**Track-specific DoD on top of the gates:**
- **musical** → run the matching critique test
  (`npx vitest run tests/standards/<…>-critique.test.ts`) and read its Critique Report
  for balance. A new musical bias without a passing critique test is not done.
- **synth** → the human listen on the deployed test build IS the gate — `/done` deploys
  the branch at the gate itself, not a local harness.
- **bundle** → a measured KB delta **and** the full suite green.

**Repo-specific gotchas the gates enforce:**
- A new `public/engine/*.ts` file must be registered in `AI_MAP.md` or the pre-commit
  docs-lint hook blocks the commit — add the row during `/done` staging.
- `// @direct-mutation` is only sanctioned in the three categories in `CLAUDE.md`
  (real-time hot paths, init-only, pre-mount). Everywhere else routes through
  `dispatch` — `state-discipline-reviewer` enforces it.

## §5 Judgment calls & autonomy

**Default: run the whole chain unattended** for self-contained, gate-verifiable, non-destructive
stories; Brandon reviews the *result*. **Tier does not gate autonomy** — it only picks the
executor's model. What gates a pause is a **judgment call**.

**Stop and surface — the always-brake set:**
- **Track `synth` and genuinely-subjective musical work (no critique-test oracle for the idiom, the Needs-ear stop)** — Brandon wants to *see* these even when the cycle could proceed.
- **destructive data ops (drops/rewrites persisted sessions, share-URL schema, preset data, or a state-slice migration that breaks saved state)** — Brandon wants to *see* these even when the cycle could proceed.
- **the state/worker contract (a `@direct-mutation` outside the sanctioned categories, a half-synced worker field)** — Brandon wants to *see* these even when the cycle could proceed.
- A review finding needs a **design decision**, is **P0**, or **contradicts a memory note**.
- An **implementation choice is genuinely ambiguous** with no obvious default — surface options +
  a recommendation, don't guess.
- **Gates/CI red**, an agent returned **Blocked**, or a spawned "green" that doesn't reproduce.

When the work is well-specified, run it. When in doubt about a *decision*, surface it.

**Findings get actioned, not parked:** `/patch` fix-now is the default (P0/P1/bounded-P2); too-big
= *escalate* to a `finding` issue with Brandon's nod, never a silent defer. An implementer's
own "out of scope, defer to follow-up" tag does **not** override this — if the deferred item would
falsify the story's stated `Acceptance:` criterion, it's in scope regardless of the tag.

**Plans are status updates, not confirmation gates.** Every pipeline skill presents its plan
(`## Plan` / `## Cycle plan` / `## Review plan` / `## Patch plan`) before acting — that's for
visibility, so Brandon can see and redirect. It is **not** a "Proceed?" prompt to wait on.
Present the plan, then continue in the same turn unless the plan *itself* surfaces a judgment call
from this section. This applies whether a skill is driven by `/cycle` or invoked directly.

**The autonomous safe set (`/burndown`).** The unattended grinders operate on the **negation of the
always-brake set**: an item is safe only if it is *none* of the classes above AND is
well-specified, small-to-medium, single-area, and **gate-verifiable** (provable by §4). When
unsure, **exclude and surface** — a mis-graded autonomous merge costs trust; a skipped-safe item
only costs throughput.

**The fast path (`/implement` → `/review` → `/done`).** Ceremony should scale with risk, not apply
uniformly. A story is fast-path eligible only when it is **all** of: touches **one or two files**,
every one of them **docs and/or config** (no application/library code), the change is
**deterministic** — the diff would be the same no matter who wrote it — and §4's gates can **prove**
it, and it is **none** of the always-brake classes above. When unsure, it is **not** eligible; fall
back to the normal flow. A mis-graded fast path costs more than the ceremony it was meant to save.

On the fast path, `/implement` fetches the issue once, states a **one-sentence plan** in place of
the full `## Plan` block, skips task-list/subagent ceremony, makes the edit, runs §4's gates, and
emits a **verification receipt** instead of a separate narrative report:

```
## Verification receipt
**Issue:** #<n>
**Files:** <changed files, exhaustive>
**Diff fingerprint:** <first 12 hex chars of sha256(`git diff -- <files>`)>
**Gates:**
- `npm run typecheck     # tsc over public/**/*.{ts,tsx}` — <PASS/FAIL>
- `npm run lint          # Biome lint + format check` — <PASS/FAIL>
- `npm test              # mutation check + Biome + docs lint + Vitest (node/happy-dom)` — <PASS/FAIL>
- `npm run test:browser  # Vitest browser-mode audio guards (real OfflineAudioContext, headless Chromium)` — <PASS/FAIL>
- `npm run test:e2e      # Playwright vs a `vite preview` build (Desktop Chrome, Mobile Chrome, Mobile Safari)` — <PASS/FAIL>
```

`/review` and `/done` may **consume** that receipt — skipping the reads and re-derivations it
already proves — but only while a **freshly recomputed** fingerprint over the same file list still
matches the one in the receipt and every gate in it reads PASS. A stale fingerprint (the tree
changed since), a missing receipt (a new session, or a normal-path `/implement`), or any gate
reading FAIL all mean the same thing: fall back to that skill's normal verification, silently and
without complaint — a receipt is an optimization a skill can always live without, never a
requirement it depends on.

The fast path still performs tracker status, branch policy, §4's gates, and normal delivery safety
in full; it compresses **ceremony and duplicate reads**, never the checks themselves. Each phase
still answers its own question — implement proves acceptance, review looks for what implement's own
proof can't see (missed defects, contradictory wording, unintended edits), patch resolves what
review finds, done handles delivery and freshness — the receipt lets a later phase skip *re-proving*
an earlier one's answer, not skip asking its own question.

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

## §6 Merge guard

The pipeline pushes + opens PRs. **Auto-merge SAFE stories** (none of §5's always-brake classes,
AND green CI); **a judgment-call story's PR is left open for Brandon's manual merge** —
report "ready for your merge: <url>" + *why* it's gated.

**Server-side auto-merge is enabled here**, and the forge enforces the required checks — so queue
the merge and let it do the waiting:

```bash
gh pr merge "<pr>" --auto --squash
```

It cannot merge early: `--auto` waits until the repo's merge requirements are satisfied, and with
required status checks configured those requirements *are* the checks. Prefer this to a
client-side poll — enforcement survives a killed session, a crashed harness, or a denied background
command, and it costs no polling quota.

If it errors `Auto merge is not allowed for this repository`, the forge setting was turned off:
the declaration in `.cycle/config.jsonc` is now a lie. Re-enable it, or drop
`backend_overrides.auto_merge` and fall back to the poll guard. `cycle check --verify-forge`
catches that drift before it bites.

Closing rides on the PR body's `Closes #<n>` keyword — GitHub fires it anywhere in the body
regardless of surrounding prose (§8), so a multi-phase PR must never place that token next to an
issue number it shouldn't close.

**Reading a red gate.** Logs come from `gh run view "<run>" --log`.
`gh run view "<run>" --log-failed`
narrows one run to its failed steps, but it does **not** search backwards: list the runs first
(`gh run list`) and pass the id of the one that actually failed. A red CI is diagnosable, so **"retry and see" is not
an acceptable first move** — read the log, then decide transient-vs-real. §5 still makes an
unexplained red a hard stop.

After a safe merge: **sync local main** (`git checkout main && git fetch origin && git reset --hard
origin/main`) and prune the branch.

**The harness's own auto-mode classifier can independently deny the background merge command**, even
on a safe story with everything above satisfied. That's an environment-level permission gate, not a
pipeline judgment call, and no skill text can route around it. If it fires: report the open,
CI-pending PR and ask Brandon for a one-turn approval to re-run the merge (or to
merge it himself). Don't treat the denial as a §5 pause, and don't retry with `--no-verify` or
other workarounds.

**Static-file app, CD: `main` IS live.** `vite build` → `rsync --delete dist/` to
`/var/www/html/` on the box — no app server, no DB, no migrations, no restart; nginx
serves the new files the instant rsync finishes. `scripts/deploy.sh <test|prod>` owns
the mechanics for both.

**Prod is continuous.** A push to `main` only happens via a green PR merge (branch-
protected, required CI contexts `checks` + `e2e-tests`), so the CI `deploy`
job ships every merge to `ensemble.brndn.zip` automatically — including unattended
overnight `/burndown`/`/nightly` merges. `/deploy-prod` is now the manual break-glass
path (CI down, or forcing a known-good build), not the normal route.

**Environments:**
- **test** (`ensembletest.brndn.zip`) — the pre-merge audition box; deploy a branch here
  to hear/preview before merging, especially `status:needs-ear` work. Low ceremony, private.
- **prod** (`ensemble.brndn.zip`) — the public origin; CD on merge, or the gated manual
  `/deploy-prod` break-glass path.

**Verification is free, and it's the whole trick:** `vite.config.ts`'s `computeBuildRev`
bakes the revision into every asset filename (`index.<REV>.js`), so the live `index.html`
names the exact build. There is **no stored deploy ref** — the running site is the only
source of truth; `scripts/deploy.sh` curls it before (to print the real delta) and after
(to verify the right bundle landed).

**Rollback = roll forward:** no DB, no migration, so `git revert` → PR → green → the CI
deploy job redeploys (or a manual `workflow_dispatch` on `main`, no new commit).

## §7 Tracker mechanics

Routing values are labels on the issue. `gh issue list --state open --json number,title,labels,milestone,url` is the entire read path: it returns
`number`, `title`, `labels`, `milestone` and `url` for every open issue, and because it queries
issues directly it carries open/closed state intrinsically — there is nothing to intersect, and
no way for a stale row to linger.

- **Read the tracker:** `gh issue list --state open --json number,title,labels,milestone,url` (one label: `gh issue list --state open --label "<label>" --json number,title,labels,milestone,url`)
- **Read one issue:** `gh issue view "<n>" --json number,title,state,url,labels,milestone,body`
- **Write a routing value:** `gh issue edit "<n>" --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" --add-label "<status:label>"` — clears the other status
  labels and sets this one, in a single call. Non-status labels: `gh issue edit "<n>" --add-label "<label>"` ·
  `gh issue edit "<n>" --remove-label "<label>"`
- **Bulk writes:** an ordinary loop, one call per issue. These are REST calls against the
  5,000/hr core pool, not GraphQL points, so there is nothing to batch around.
- **Issue/PR ops:** `gh issue create --title "<title>" --body "<body>" --label "<label>"` · `gh issue comment "<n>" --body "<text>"` ·
  `gh issue close "<n>"` · `gh pr create --head "<branch>" --base main --title "<title>" --body "<body>"`

A status label that doesn't exist in the repo makes `gh` **fail loudly** — that is the intended
behavior. Create the label rather than working around the error, and never invent a status value
that isn't in the §1 table.

**Unreachable → STOP.** `gh` unauthenticated or offline: say so and stop. Never guess tracker state.

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

## §8 Commit & PR conventions

- **Conventional Commit** (`feat(scope)` / `fix` / `docs` / `chore` / `test`), scoped to the area;
  body names the story. Ends with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **`git add <explicit paths>` — never `-A` / `.`**. Never `--no-verify`; never amend; never
  **force**-push.
- **PR:** base `main`, a "what shipped + which findings were actioned" narrative as the body,
  **with `Closes #<n>`** (closing the issue is the done-signal), title = the Conventional-Commit
  subject. PR bodies end with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- The `Closes/Fixes/Resolves #N` keyword fires **anywhere** in the body regardless of surrounding
  prose — writing "Closes #844 is NOT set" still closes #844 — **except inside a code span or code
  block, which suppresses it entirely.** Never backtick the token when the close is wanted, and
  never leave it bare next to a number that shouldn't close. When carving one item out of a
  multi-item umbrella issue, never put that token next to the umbrella's number at all, not even to
  deny it — write "part of #844" instead.
- Post a one-line issue comment linking the PR; the narrative lives in the PR body.

## §9 Branch policy

- **Issue work → a feature branch + PR**, always. Never build on `main`; `/implement` branches
  (`git checkout -b <short-slug>`), reusing an epic branch if one exists.
- **No minor-edit carve-out.** `main` is protected against *all* direct pushes — skills, scripts,
  ops notes and docs each need their own branch + PR, even though most auto-merge immediately (§6).
- **Branch off freshly-fetched `origin/main`, not local `main`.** A squash-merge PR is based
  against `origin/main` HEAD, not your local HEAD — if local `main` carries commits never pushed to
  origin, cutting a branch off it silently folds those unpushed commits into your feature's squash
  commit (content survives, but loses its own commit identity). `git checkout main && git fetch
  origin && git reset --hard origin/main` before branching avoids it; the tell after the fact is
  `git pull --ff-only` refusing to fast-forward with local-ahead commits that aren't yours.
- **Local branches don't clean up on their own.** The merge guard deletes the *remote* branch but
  never the local one, and they pile up silently across sessions. Periodically: `git fetch --prune
  origin`, confirm zero open PRs, then bulk `git branch -D` everything but `main` and the current
  branch (`-D` because a squash-merged branch is never a literal ancestor, so plain `-d` refuses
  every one) — safe, since the commits stay recoverable via reflog.

## §10 Filing an issue

Shared by `/scout` (machine-found) and `/intake` (human-described). Both *find or interview, then
file* — neither fixes, branches, or merges.

1. **Dedup first — and a rejection has memory.** Search open issues before filing; a
   near-duplicate gets a comment on the existing issue, not a new one. Then check recently
   *closed* issues too: a twin that was closed without shipping is a decision already made, and
   re-filing it because the code it cites still exists is how a recurring sweep turns the queue
   into a nag. Mention the match in the report; don't re-file it.
2. **The bar is *actionable*.** An issue nobody could pick up and start is noise. If it can't be
   stated as Why / Touches / Acceptance, it isn't ready to file — keep interviewing, or don't file.
3. **Shape it so the smallest human input unlocks it.** Prefer a pre-drafted fix with a
   yes/no decision over an open-ended question. A finding that arrives with the diff already
   written costs Brandon one glance; the same finding as a paragraph costs a work session.
4. **Body format:**
   ```
   **Why:** <the problem, and what's wrong today — with file:line evidence>
   **Touches:** <files / surfaces>
   **Fix (drafted):** <the concrete change — a diff, or the exact edit>
   **Acceptance:** <the observable condition that means it's done>
   ```
   The **Fix** line is mandatory for a machine-found finding (`/scout` read the code; the draft
   is the point) and best-effort for a human-described idea (`/intake` interviews toward it but
   files without it when the idea is scope, not a defect).
5. **Classify by kind, route by certainty.** Kind labels (`bug`, `area:*`, §2's stamps) record
   what you know — set them freely. The `status:*` label is a **certainty call**, made at filing
   time, with three outcomes:
   - **Deterministic** — the fix would be the same no matter who wrote it, and §4's gates can
     prove it → `status:ready`. That is real scheduling: an unattended grinder may
     build it (§5), so the bar is "this exact diff should ship," not "something here should change."
   - **Interpretive** — a judgment call anywhere in it, however small → `status:needs-decision`,
     **with the fix pre-drafted** (rule 3) so the decision costs one glance, not a work session.
   - **Unsure → no status label.** It lands in the untriaged pile (§1) for a human look — the
     filing-time twin of §5's "when unsure, exclude and surface."

   On a §5 brake surface, test the **direction of the change, not the surface it touches**. A
   finding there is deterministic only when it *tightens* — more validation, more redaction,
   stricter gates, fewer accepted inputs — **and** §4's gates can demonstrate both the tightening
   and that nothing legitimate was lost. Anything that loosens, exempts, widens, or re-opens is
   **never** deterministic, however small the diff: certainty and safety are different axes, and
   pickable requires both.

   The second half of that test is load-bearing, because tightening is not automatically safe. A
   redaction rule greedy enough to eat the evidence a validator needs, or a gate strict enough to
   reject legitimate traffic, fails *closed* — which is the quiet direction, and the one that
   hides. Pickable means the gates prove both halves; if they can only prove the tightening, it is
   interpretive.

   A brake entry describing an **irreversible action** rather than a code change — running a
   destructive verb, writing to production — has no direction to test and never becomes pickable.
6. **Budget.** Filing zero is a success. A sweep that files 20 low-grade issues has made the queue
   worse, not better. Cap a focused pass at **3–5** findings; a multi-lens sweep caps *per lens* and
   stays in single digits overall. Rank by (impact × how-actionable) and file only the top ones —
   mention the rest in the report without filing.
