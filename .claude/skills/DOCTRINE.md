# Pipeline doctrine (shared)

Single source of truth for the rules the Ensemble work-loop skills share. A skill that says
"see DOCTRINE §X" means *this* file. **If this isn't already in your context, read it once** —
within a session the read amortizes across every pipeline skill you run.

Reconcile here, not in the skills: when a rule changes, edit this file, not the dozen skills
that used to restate it. The skills hold only their *unique* procedure.

---

## §1 Tracker & readiness

The tracker is **GitHub Project #2** (`brndnsh` → "Ensemble — Work",
<https://github.com/users/brndnsh/projects/2>). A **story = an issue**: its **body** holds Why /
Touches / Acceptance; its **Project fields** hold routing (§3). The `docs/audit/` and
`docs/synth-audit/` trees are a **frozen archive** of the markdown-tracked cycles — *not* the
live tracker; never read them as current. **Milestones = epics.**

**The Status field is for *scheduled* work** (an issue scoped into an epic). Backlog ideas stay
status-less.

| Status | Meaning | Pipeline action |
| --- | --- | --- |
| **Ready** | scoped + pickable | `/next` ranks & picks; `/implement`/`/cycle` build |
| **In progress** | being built | don't re-pick |
| **In review** | built, under review / PR open | don't re-pick |
| **Needs-decision** | blocked on a Brandon call | `/unblock` surfaces; **don't build** |
| **Needs-ear** | blocked on Brandon's ear (listen pass / A/B audition) | `/unblock` tees up; **don't build past the gate** |
| **Blocked** | blocked on a dependency | skip; name the blocker |
| **Shipped** | issue closed (set on merge) | done |
| **(no Status)** + `backlog`/`finding` | the idea pile, not a scheduled story | triage/scope to Ready first; don't pick |

**Ranking Ready** (`/next`): milestone (a real numbered epic > a "candidate epic" / no
milestone), then Size (S < M < L), then issue number. Model is *not* a ranking factor.

**Board auto-flip IS configured** (confirmed firing 2026-06-20 via #631). GitHub's built-in
**"Item closed → Status: Shipped"** workflow is enabled in the Project (UI-only, not
CLI/API-configurable), so closing an issue — which `Closes #<n>` does on merge — **auto-sets
`Status: Shipped`**. The pipeline no longer writes Shipped itself; the workflow owns that field.
A **closed issue is the source-of-truth "done"** regardless of the board field, so even if the
workflow is ever toggled off, nothing downstream breaks (the board just lags reality).

## §2 Labels

- **`finding`** — review debt, diff-coupled; **should trend to empty**. A cycle must not *grow*
  this set as a side effect — only genuinely new ideas become `backlog`.
- **`backlog`** — new ideas (the pipeline). May *also* carry a `needs-ear`/`needs-decision`
  **caveat label** = "needs Brandon's input even to schedule" (a hint, not a blocked story).
- **`inbox`** — raw capture, not yet triaged.
- **`burndown`** — vetted **safe for autonomous execution** (§5 safe set); `/burndown`'s fast-path
  fuel. A strong signal, not a blank check — the safe filter still backstops it.
- **`verify-on-device`** — deterministic + safe to build *and* auto-merge unattended, but the
  deliverable's last residual is a **real-device visual glance** (e.g. a mobile safe-area / viewport
  / touch-target fix that CI's headless run can't eyeball). **Not** `needs-ear`: the change's
  *correctness* is knowable from code; only its *side-effects* need an eyeball. `/nightly` runs these
  and lands each on the morning device-verify checklist. Pairs with `burndown` (it's in the safe set).
- **`verify-by-ear`** — the **musical analogue of `verify-on-device`** (§5): a musical-correctness
  change whose idiom *is* captured by a critique test, so it builds + auto-merges on green, but its
  last residual is a **listen pass** to confirm it feels right. Ships with a 🎧 listen checklist
  (genre/setting to load, what changed, old-vs-new to hear). **Not** `needs-ear` (which is reserved for
  genuinely-subjective work where no critique test can assert the idiom). Pairs with `burndown`.
- **`scout`** — provenance stamp on issues filed by a `/scout` sweep, so `/unblock` can surface last
  night's finds freshest-first.
- **`area:*`** — surface tags inferring the executor when Agent is unset: `area:soloist`,
  `area:bass`, `area:drums`, `area:chords`, `area:harmony`, `area:groove`, `area:synth`,
  `area:state`, `area:worker`, `area:ui`, `area:infra`.
- **`track:*`** is **not** a label — the **Track field** (§3) owns musical/synth/bundle/ui.

## §3 Fields & routing

**Fields** (single-select; note **`Review lens`** has a space in its key):
- **Track** — `musical` | `synth` | `bundle` | `ui`. **The load-bearing routing field** — it picks
  the Definition of Done and the reviewer set (below). The tracks differ on their DoD:
  - **musical** → gated by a **critique test** in `tests/standards/` (statistical ranges, an
    automated oracle). Most musical stories are fully auto-mergeable on green; when the change is
    audible, ship it `verify-by-ear` (auto-merge on green + a 🎧 listen checklist — §5). Only
    genuinely-subjective feel (no test can assert the idiom) is a `Needs-ear` hard stop.
  - **synth** → gated by a **human A/B audition** through the audition harness
    (`scripts/audition-link.ts`); there is no automated oracle. A synth story is **`Needs-ear`**
    at the merge gate (§5) — build + PR, but **never auto-merge unheard**.
  - **bundle** → gated by a **measurable KB delta** (`npm run build` / size check) **and**
    behavior-preservation (full suite green). Auto-mergeable on green.
  - **ui** → UI/UX surface work (`public/components/**`, non-engine `public/**`) with no new
    generative behavior, synth voice, or bundle-shrink claim. Gated by **e2e smoke +
    `npm run typecheck`** green; reviewer is `state-discipline` when it touches state, else
    `/code-review`. Auto-mergeable on green (same safe posture as `bundle`). When a `ui` change
    routes audible voices (e.g. a sound-source picker), pair it with `verify-by-ear` for a 🎧 pass —
    but routing already-approved voices is **not** a `synth` Needs-ear hard stop.
- **Model** — `sonnet` | `opus` (default **opus** — standing call: spawn agents on opus).
  **Model does not gate autonomy** (§5) — it only picks the executor's model.
- **Size** — S | M | L.
- **Agent** — the executor (below).
- **Review lens** — `music-theory` | `synth-graph` | `state-discipline` | `worker-contract` |
  `bundle-hygiene` | `code-review` | `both`.

**Executors** (the Agent field, sanity-checked against what the issue touches):
- **`musical-engine-implementer`** — generative engine behavior: bass, drums, soloist,
  harmonies, chords, accompaniment, coordination, conductor, arranger (`public/engine/**`,
  `public/state/**` engine slices). Follows the repo's musical patterns (final-stage multiplier,
  deterministic phrasing, register slotting, coordination-context discipline).
- **`critique-test-author`** — when the deliverable **is** a new/tightened critique test in
  `tests/standards/` (NOT a one-line threshold bump an engine implementer can do inline).
- **`synth-implementer`** — audio-DSP / synthesis voices (`public/engine/synth-*.ts`,
  `engine.ts` `initAudio()`, `reverb.ts`, `synth-utils.ts`, scheduler audio-graph wiring).
- **`orchestrator-inline`** — the main thread builds directly. **Default for opus / small / taste
  stories** and finicky-infra / deep-internals (state-slice schema, worker sync contract,
  hydration) where a cold agent re-derives brittle detail and ships latent bugs. The
  orchestrator's existing context is the defense.
- **`claude`** — general UI (`public/components/**`), non-engine `public/**`, mechanical work.

**Reviewers** (`/review` routes by Track + the diff):
- **`music-theory-reviewer`** — any generative-engine or `tests/standards/` change (Track musical).
- **`synth-graph-reviewer`** — any `synth-*.ts` / audio-graph change (Track synth).
- **`state-discipline-reviewer`** — state slices, new actions, `coordination-engine.ts`, anywhere
  a `signal.x = y` might bypass `dispatch`.
- **`worker-contract-reviewer`** — state read by the logic worker (`getSyncState()` / `syncWorker()`,
  worker-mirrored slices, new `WORKER_MSG.*`).
- **`bundle-hygiene-reviewer`** — any bundle-shrink / dead-code diff (Track bundle).
- **`/code-review`** — correctness pass on any non-trivial diff.
- **test-quality lens** — a **test-only** diff reviews the *tests as the subject* (use
  `critique-test-author` for critique tests; `/code-review` otherwise): coverage gaps,
  intent-vs-implementation, vacuous/brittle asserts.
- **Sonnet angle** — opus-reviews-sonnet (or vice-versa) catches same-prior blind spots.

**Re-verify agent claims:** a spawned agent's "gates green / tests pass" is a *claim*. Re-run the
gates **yourself** — a spawned "green" has failed in a clean shell before.

## §4 Gates

Local, before handing to `/review` or `/done` (never proceed over a red gate):
```
npm run typecheck     # tsc over public/**/*.{ts,tsx}
npm run lint          # Biome lint + format check
npm test              # mutation check + Biome + docs lint + Vitest
npm run test:e2e      # Playwright (Desktop Chrome, Mobile Chrome, Mobile Safari)
```
`npm run validate` (typecheck + knip + jscpd + format + npm test) is the full sweep — run it
before a `/done` that touches more than one file. **CI** runs `npm test` and a parallel
`npm run test:e2e` job (both must be green to merge).

**Track-specific DoD on top of the gates (§3):**
- **musical** → run the matching **critique test** (`npx vitest run tests/standards/<…>-critique.test.ts`)
  and read its "Critique Report" for balance. A new musical bias without a passing critique test
  is not done.
- **synth** → the **A/B audition** is the gate; it's a **human listening stop**, not an automated
  check (→ `Needs-ear`, §5).
- **bundle** → a **measured KB delta** from the size check **and** the full suite green
  (behavior-preserving).

**Repo-specific gotchas the gates enforce:**
- A **new `public/engine/*.ts` file** must be registered in **`AI_MAP.md`** or the pre-commit
  docs-lint hook blocks the commit — add the row during `/done` staging.
- `// @direct-mutation` is only sanctioned in the three categories in `CLAUDE.md`
  (real-time hot paths, init-only, pre-mount). Everywhere else routes through `dispatch` —
  `state-discipline-reviewer` enforces it.

## §5 Judgment calls & autonomy

**Default: full-auto + merge-to-`main` for self-contained, gate-verifiable, non-destructive
stories of *any* tier (sonnet OR opus).** Run the whole chain unattended; Brandon reviews the
result. **Tier does not gate autonomy** — it only picks the executor's model. What gates a pause
is a **judgment call**.

**Stop and surface — the always-brake set:**
- **Track `synth`** and **genuinely-subjective** musical work (timbre / feel with **no idiom a
  critique test can assert**): the A/B audition / listen pass is a **`Needs-ear`** human stop.
  Build + open the PR, but **leave it for Brandon's ear + merge** — never auto-merge unheard.
  This is **not** the same as musical work whose idiom *is* theory-specifiable + critique-testable —
  that is `verify-by-ear`, see below.
- A diff is a **destructive data op** (drops/rewrites persisted sessions, share-URL schema,
  preset data, or a state-slice migration that breaks saved state) — Brandon wants to *see* these
  even if the cycle could proceed; offer a human `/code-review`.
- A diff trips the **state/worker contract** in a way that needs a design call (a
  `@direct-mutation` outside the sanctioned categories, a half-synced worker field) — surface it.
- A story is **`Needs-decision`** — can't proceed without his input.
- A review finding needs a **design decision**, is **P0**, or **contradicts a memory note**.
- An **implementation choice is genuinely ambiguous** with no obvious default — surface options +
  a recommendation, don't guess.
- **Gates/CI red**, an agent returned **Blocked**, or a spawned "green" that doesn't reproduce.

When the work is well-specified, run it — opus included. When in doubt about a *decision*,
surface it. **Findings get actioned, not parked:** `/patch` fix-now is the default
(P0/P1/bounded-P2); too-big = *escalate* to a `finding` issue with Brandon's nod, never a silent
defer.

**`verify-by-ear` — musical correctness is not a work-blocker.** Most "by-ear" musical work is
*not* subjective: its idiom is a music-theory **fact** (rock harmony = harmonized 3rds/6ths; ska
soloist favors the offbeats; blues b3 landing-tone rate sits in an idiomatic band). When the claim
is expressible as a **critique test that asserts the idiom** (not merely "a weight moved"), it is
gate-verifiable: implement with a music-theory/correctness lens → critique test + `music-theory-reviewer`
→ **auto-merge on green** (Brandon's standing call 2026-06-19), deploy to test, and attach a **🎧 listen
checklist** (tag `verify-by-ear`): genre/setting to load, what changed, old-vs-new to hear. The test
is the correctness gate; Brandon's ear is *confirmation* — a follow-up tweak if it feels off, never a
rollback (musical diffs are reversible). **The hard guardrail (no programmer's math):** if you cannot
write a test that captures the musical claim, that is the signal the change isn't understood well
enough to ship unheard — **stop and surface.** Mirrors `verify-on-device`: correctness knowable from
code/test, only a real-world sensory glance remains. (Track `synth` and genuinely-subjective feel
stay the `Needs-ear` hard stop above — no oracle exists for "does it *sound* good.")

**The autonomous safe set (`/burndown` / `/nightly`).** The unattended grinders operate on the
**negation of the always-brake set**: an item is `burndown`-safe only if it is *none* of the classes
above AND is well-specified, S/M, single-area, and **gate/CI-verifiable** (provable by §4, not by ear
or a device). `verify-on-device` is the one bright-line exception — build + auto-merge it, but it must
land on `/nightly`'s morning device-verify checklist (correctness is knowable from code; only a
real-device visual glance remains). **`verify-by-ear`** is the musical sibling: theory-provable
musical correctness **is** in the autonomous set — its critique test is the §4 gate, it merges on
green, and only a confirming listen remains. Track `synth` and **genuinely-subjective** musical work
(no critique-test oracle for the idiom) are **never** `burndown`-safe (their DoD is a human listen →
`Needs-ear`). When unsure, **exclude and surface** — a mis-graded autonomous merge costs trust; a
skipped-safe item only costs throughput.

## §6 Merge guard

The pipeline pushes + opens PRs. **Auto-merge SAFE stories** (none of §5's always-brake classes,
AND green CI); **a judgment-call story's PR is left open for Brandon's manual merge** (Status stays
In review, or Needs-ear for synth; report "ready for your merge: <url>" + why).

This repo has **no server-side required checks** (branch protection is unconfigured, verified
2026-06-18), so **`gh pr merge --auto` merges *immediately* with nothing to wait on — NEVER use
it**. The **poll-then-merge guard IS the enforcement**, run in the **background** (the poll +
`--watch` take minutes; a foreground `sleep` is harness-blocked):
```bash
# 1. Wait for the run to REGISTER (gh pr checks --watch errors "no checks reported" if run
#    before any check exists, instead of waiting).
until [ "$(gh pr view <pr> --json statusCheckRollup --jq '.statusCheckRollup | length')" -gt 0 ]; do sleep 5; done
# 2. Block until checks FINISH; --fail-fast exits non-zero the moment one fails. Watch ALL
#    checks (test + e2e), NOT --required (there are none server-side). The && is the guard.
gh pr checks <pr> --watch --fail-fast && gh pr merge <pr> --squash --delete-branch
```
After a safe merge: the **"Item closed → Status: Shipped"** Project workflow flips the board field
automatically (§1) — no explicit status write needed. Just **sync local main** (`git checkout main
&& git fetch origin && git reset --hard origin/main`) and prune the branch. (If you ever spot a
merged-but-not-Shipped item, the workflow was toggled off — `node scripts/gh-project.mjs status <n>
"Shipped"` is the manual fallback.)

**Deploy (static-file app).** Ensemble ships as **static files on nginx behind Caddy** —
`vite build` → `rsync --delete dist/` to `/var/www/html/` on the box. No app server, no DB,
no migrations, no restart; nginx serves the new files the instant rsync finishes. Two skills
wrap the scripts:
- **`/deploy-test`** (`scripts/deploy-test.sh` → `ensembletest.brndn.zip`) — low ceremony, the
  staging push. **May run unattended from the pipeline after a merge to `main`** (private box,
  non-destructive static rsync). Confirms the live asset hash matches HEAD.
- **`/deploy-prod`** (`scripts/deploy-prod.sh` → `ensemble.brndn.zip`) — **gated, awake-only,
  never automatic** (§5 always-brake). Full `validate` + clean pushed `main` → one explicit
  "go" → deploy → verify the public origin. **A merge to `main` is NOT a prod deploy — it ships
  nothing on its own.**

Both scripts move a **`refs/deploys/{test,prod}`** ref to the deployed HEAD on success, so
`git log refs/deploys/<env>..HEAD` is the pending set. **Verification needs no `/api/version`:**
`vite.config.ts` bakes `git rev-parse --short HEAD` into every asset filename, so the live
`index.html` names the exact build — curl it and match the hash to HEAD.

## §7 gh-project mechanics

- **Read the board:** `gh project item-list 2 --owner brndnsh --limit 600 --format json` (each item:
  `content.{number,title,body,url,type}`, `status`, `track`, `size`, `model`, `agent`,
  `review lens`, `milestone.title`, `labels`). **Always pass `--limit` (board has ~57 items, default
  cap is 30)** — without it, recent issues silently fall off the result and read as "not on board".
  Single-selects flatten to the option name
  (absent/`None` when unset). Intersect with `gh issue list --state open` on `number` to keep only
  open issues (a closed item can linger on the board until archived; this also catches an open
  issue **not yet on the board**, e.g. an `inbox` capture).
- **Write a field:** `node scripts/gh-project.mjs status <n> "<Status>"` or
  `set-field <n> "<Field>" "<Value>"` (e.g. `set-field 12 Track synth`).
- **Bulk writes:** **always** `node scripts/gh-project.mjs batch <file.json>` — a *single*
  memoized call. Never loop single-op writes: each refetches the 500-item list and drains the
  5000 pt/hr GraphQL quota. REST-side changes (`gh issue edit`/`comment`/`close`/`--add-label`)
  are fine per-item.
- **Add an off-board issue:** `gh project item-add 2 --owner brndnsh --url <url>` (or the helper's
  `ensure <n>`).
- **UI workflows (not CLI-configurable):** **"Item closed → Status: Shipped"** is **enabled** and
  owns the Shipped field (§1/§6 — confirmed 2026-06-20). Do NOT also enable "Item added → Status:
  Ready": Status is for *scheduled* work, and auto-Ready-on-add would mis-mark raw `inbox`/`backlog`
  captures (let `/intake` set Ready deliberately).
- **gh offline/unauthed:** say so and stop — don't fall back to the frozen markdown as current.

## §8 Commit & PR conventions

- **Conventional Commit** (`feat(soloist)` / `fix(ts)` / `chore(deps)` / `refactor(mobile)` /
  `docs` / `test`), scoped to the area; body lists the story. Ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
- **`git add <explicit paths>` — never `-A` / `.`**. Never `--no-verify`; never amend; never
  **force**-push.
- **PR:** `gh pr create --base main`, a rich "what shipped + which findings were actioned"
  narrative as the body, **with `Closes #<n>`**, title = the Conventional-Commit subject. PR bodies
  end with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- Post a one-line issue comment linking the PR; the narrative lives in the PR body.

## §9 Branch policy

- **Issue work → a feature branch + PR** (the PR's `Closes #<n>` + CI gate earn their keep). Never
  build on `main`; `/implement` branches (`git checkout -b <short-slug>`), reusing an epic branch
  if one exists.
- **Minor tooling / skills / docs edits → straight to `main`**, no branch/PR (`.claude/skills/*`,
  `scripts/gh-project.mjs`, ops notes, `docs/*` that aren't story deliverables).
