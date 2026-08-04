<!-- cycle:rendered template=DOCTRINE.md.tmpl hash=a5e2b017095a — managed by the-cycle; edit the template, not this file -->
# Pipeline doctrine (shared)

Single source of truth for the rules the Ensemble work-loop skills share. A skill that says
"see DOCTRINE §X" means *this* file. **If this isn't already in your context, read it once** —
within a session the read amortizes across every pipeline skill you run.

Reconcile here, not in the skills: when a rule changes, edit this file, not the skills that
restate it. The skills hold only their *unique* procedure.

---

## §1 Tracker & readiness

The tracker is the **GitHub repo's issues** (`brndnsh-labs/Ensemble`, public), routed on org project #1. A **story = an issue**: its **body** holds
Why / Touches / Acceptance; routing lives on the board (§3). **Milestones = epics.**

| Status | Meaning | Pipeline action |
| --- | --- | --- |
| **Ready** | scoped + pickable | `/next` ranks & picks; `/implement`/`/cycle` build |
| **In progress** | being built | don't re-pick |
| **Needs decision** | blocked on a Brandon call | `/unblock` surfaces; **don't build** |
| **Needs ear** | blocked on Brandon's ear (a listen pass or synth A/B audition) | `/unblock` tees up; **don't build past the gate** |
| **Blocked** | blocked on a dependency | skip; name the blocker |
| **(closed issue)** | done — a closed issue is the real done-signal, whatever Status says | done |
| **(no Status)** | + `backlog`/`finding`: the idea pile, not a scheduled story. Note an issue can be open and NOT on the board at all — `gh project item-list` carries no open/closed state, so intersect it with `gh issue list --state open` | triage/scope to Ready first; don't pick |

**Ranking pickable work** (`/next`): milestone (a real numbered epic > a "candidate epic" / no milestone), then Size (S < M < L, read off the `size/*` **label** — Size is not a board field), then issue number. Model is *not* a ranking factor.

**A closed issue is "done."** `Closes #<n>` closes the issue on merge. If the board has no closed→Done automation, set Status explicitly after the merge lands. The pipeline doesn't argue with the
close; it lets the close speak.

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

- **Model:** `sonnet` | `opus` via the `model/*` label (default opus when untagged). Tag `sonnet` for well-specified, gate-verifiable stories — including musical work, where the critique tests + the `Needs-ear` stop gate the result regardless of executor; reserve `opus` for design-call / open-investigation stories (which usually carry `Needs-decision` anyway). **Model never gates autonomy** (§5) — it only picks the executor's model.
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
  - A **second-model angle** (a Sonnet pass over an opus diff, or vice-versa) is a cheap way to
    catch same-prior blind spots on a meaty diff.

**Track** (`track/*`) is the load-bearing routing namespace — it picks the Definition
of Done and the reviewer set:

| Track | DoD | Reviewer | Merge |
| --- | --- | --- | --- |
| **musical** | a critique test in `tests/standards/` (statistical ranges, an automated oracle) | `music-theory-reviewer` | auto-merge on green; audible-but-theory-provable work ships `verify-by-ear` (§5); only genuinely-subjective feel is a `Needs-ear` hard stop |
| **synth** | a human listen on the deployed test build — `/done` deploys the branch to test and runs the verdict check-in right there, no automated oracle | `synth-graph-reviewer` (graph hygiene only, not "does it sound good") | **always `Needs-ear`** at the merge gate — "Works" merges immediately, "Haven't checked" parks it |
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
  honest oracle exists. → **`needs-ear` hard stop**, unchanged. Track `synth` is always
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

**Lifting a `Needs-ear` stop requires an EXPLICIT per-PR go-ahead — warm general praise
is not sign-off.** "Everything's sounding great" is encouragement, not a merge
instruction for a specific parked PR; ask directly before merging. `/cycle #<n> approved`
is the canonical signal.

**Auto-merge now means auto-deploy** (§6 is CD) — an auto-merged PR ships to prod within
minutes. The pre-merge `Needs-ear` stop is what keeps un-auditioned work from shipping,
not a separate deploy gate.

## §6 Merge guard

The pipeline pushes + opens PRs. **Auto-merge SAFE stories** (none of §5's always-brake classes,
AND green CI); **a judgment-call story's PR is left open for Brandon's manual merge** —
report "ready for your merge: <url>" + *why* it's gated.

There is **no server-side auto-merge-on-green** here, so the **poll-then-merge guard IS the
enforcement**. Never use a fire-and-forget auto-merge flag — with nothing to wait on it merges
immediately. Run the guard in the **background** (the poll takes minutes; a foreground `sleep` is
harness-blocked):

```bash
(until gh pr checks "<pr>" >/dev/null 2>&1; do sleep 5; done; gh pr checks "<pr>" --watch --fail-fast && gh pr merge "<pr>" --squash --delete-branch) &
```

Closing rides on the PR body's `Closes #<n>` keyword — GitHub fires it anywhere in the body regardless of surrounding prose (§8), so a multi-phase PR must never place that token next to an issue number it shouldn't close.

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
protected, required CI contexts `CI / checks` + `CI / e2e-tests`), so the CI `deploy`
job ships every merge to `ensemble.brndn.zip` automatically — including unattended
overnight `/burndown`/`/nightly` merges. `/deploy-prod` is now the manual break-glass
path (CI down, or forcing a known-good build), not the normal route.

**Environments:**
- **test** (`ensembletest.brndn.zip`) — the pre-merge audition box; deploy a branch here
  to hear/preview before merging, especially `Needs-ear` work. Low ceremony, private.
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

Routing values are Project fields on the board item, not labels. `gh project item-list` returns `content` (`.number`, `.title`, `.url`, `.body`) alongside `status` and any custom fields. item-list carries no open/closed state, so intersect with `gh issue list --state open` on `number` — a closed item can linger on the board until archived, and this also catches an open issue not yet added to the board.

- **Read the tracker:** `gh issue list --state open --json number,title,labels,milestone,url`
- **Read one issue:** `gh issue view "<n>" --json number,title,state,url,labels,milestone,body`
- **Write a routing value:** `node scripts/gh-project.mjs status "<n>" "<Status>"` (or `node scripts/gh-project.mjs set-field "<n>" "<Field>" "<Value>"`)
- **Bulk writes:** **always** `node scripts/gh-project.mjs batch "<file.json>"` — an array of `{issue, field, value}`,
  grouped into one read + one write per issue. Never loop single-op writes.
- **Issue/PR ops:** `gh issue create --title "<title>" --body "<body>" --label "<label>"` · `gh issue comment "<n>" --body "<text>"` ·
  `gh issue close "<n>"` · `gh pr create --head "<branch>" --base main --title "<title>" --body "<body>"`

**Unreachable → STOP.** `gh` unauthenticated or offline: say so and stop. Never guess board state.

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
  🤖 Generated with [Codex CLI](https://developers.openai.com/codex/cli)
  ```
- The `Closes/Fixes/Resolves #N` keyword fires **anywhere** in the body regardless of surrounding
  prose — writing "`Closes #844` is NOT set" still closes #844. When carving one item out of a
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

1. **Dedup first.** Search open issues before filing. A near-duplicate gets a comment on the
   existing issue, not a new one.
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
5. **Classify, don't over-classify.** Set what you know; leave routing to the picking skill (§2).
6. **Budget.** Filing zero is a success. A sweep that files 20 low-grade issues has made the queue
   worse, not better. Cap a focused pass at **3–5** findings; a multi-lens sweep caps *per lens* and
   stays in single digits overall. Rank by (impact × how-actionable) and file only the top ones —
   mention the rest in the report without filing.
