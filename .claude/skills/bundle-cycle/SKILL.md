---
name: bundle-cycle
description: Run one bundle-audit story end-to-end, from picking it off `docs/bundle-audit/README.md` through to a committed shrink (or a verified no-op). Composes the bundle-audit per-story flow — pick next story → grep-for-survivors → implement → typecheck + Vitest → bundle-hygiene-reviewer → patch → measure KB delta → commit. Plan-first — presents the plan before any agent fires. This is the bundle-audit (`docs/bundle-audit/`) counterpart to `/cycle` (musical) and `/synth-cycle` (synth). Most bundle stories are surgical (delete this function, simplify these branches), so the orchestrator implements inline — there is no dedicated implementer agent. The Definition of Done is **measurable** (KB delta from `npm run build:size`) + **behavior-preserving** (full test suite passes), so this skill can chain `--until-blocked` like `/cycle`. Usage `/bundle-cycle` for the next unshipped story, `/bundle-cycle S<N>` for a specific story (e.g. `/bundle-cycle S2`), `/bundle-cycle --until-blocked` to keep going until a P0 finding, a speculative-tagged story, or user interrupt.
---

# /bundle-cycle — one bundle-audit story to a committed shrink

Goal: collapse the bundle-audit per-story rhythm into one invocation. Plan-first — present the plan before doing any work.

**This skill drives the bundle-audit track only** (`docs/bundle-audit/`). It is the deliberate counterpart to `/cycle` (musical-audit, `docs/audit/`) and `/synth-cycle` (synth-audit, `docs/synth-audit/`). The three tracks share no infrastructure — different board, different reviewer, different Definition of Done. Never let this skill pick a musical or synth story.

## Why this is not `/synth-cycle`

The synth track gates on the owner's ear — no machine can stand in for that, so `/synth-cycle` must halt at every story. Bundle work has an **automated oracle**: `npm run build:size` reports brotli KB per chunk against budgets in `.size-limit.json`, and the full Vitest suite proves behavior preservation. That makes this skill closer in shape to `/cycle`:

- A story finishes when the diff is committed; there is no human gate.
- This skill can chain `--until-blocked`.
- The exceptions are stories tagged **speculative** in the doc (e.g. S5 — lazy-load synthesis on first `togglePlay()`) — those need a design decision before code, and chaining halts on them.

**Budgets are baselines, not targets.** The numbers in `.size-limit.json` are arbitrary historical baselines — useful as a regression tripwire ("this chunk used to fit; what just changed?") but not a finish line. The operative goal is **smaller is better when behavior is unchanged**, not "must hit budget." Don't promote risky structural changes (e.g. S5) just to close a budget gap.

## Why this is mostly inline (no implementer agent)

Bundle stories are surgical by nature: "delete this function and unwind 11 call sites", "convert this import to `import()`", "remove this orphaned state field". The orchestrator can do all of it on the main thread, faster than spawning + briefing a subagent. The one agent in the loop is the reviewer (`bundle-hygiene-reviewer`), which polices the diff for the failure modes specific to this kind of work.

If a story genuinely needs broader implementation (S5-class lazy-loading with audio-graph implications), spawn a `general-purpose` agent inline — but expect that to be the exception.

## Forms

- `/bundle-cycle` — orient, pick the next unshipped story (lowest S-number with no `**Status:**` line), run it end-to-end, commit.
- `/bundle-cycle S<N>` — run a specific story (e.g. `/bundle-cycle S2`).
- `/bundle-cycle --until-blocked` — chain. Stops on: any P0 finding, a speculative-tagged story (presents the design question and halts), an unexpected test regression, or user interrupt.

## Workflow

1. **Orient.** Read `docs/bundle-audit/README.md` — specifically the "Story sequence" section and the latest `Post-S<N> baseline` table. Run `git status` / `git diff --stat`. Determine the state:
   - **Clean tree** → no story in flight; this is a fresh pickup.
   - **Uncommitted bundle changes** → either mid-flight (pre-review or pre-commit) or a previous story left orphaned. Investigate before starting fresh.

   **Shipped-but-unmarked check.** The pickup rule below ("lowest S-number with no `**Status:**` line") can mis-fire if a story was shipped in a prior session but the README never got its Status line. Before declaring a pickup, spend 5 seconds: `git log --oneline -S "<core symbol from the story>" -- public/` — if that turns up a prior commit, the story is already shipped. Backfill the missing Status line (and `Post-S<N>` baseline table if absent) as a separate `docs(bundle-audit)` commit before starting the new story's work. Keeps KB-delta attribution clean and avoids smuggling housekeeping into a refactor commit.

   **Discovery tools (when no drafted story applies — e.g. drafting a new one or sanity-checking the board):** `npm run knip` lists unused exports (configured as of commit `7aacbedd`; Tier A/B/C triage shape lives in the doc), and `dist/stats.html` shows per-module byte contribution by chunk. `public/engine/grooves/*.ts` is intentionally on knip's ignore list because `import * as <genre>` namespace dispatch defeats its static analysis — re-including it just produces noise, not signal.

2. **Resolve the invocation:**
   - explicit `S<N>` → that story.
   - `--until-blocked` → set chain flag; pick next story.
   - bare `/bundle-cycle` → pick the next unshipped story by lowest S-number with no `**Status:**` marker.

3. **Load the story.** Open `docs/bundle-audit/README.md`, read the chosen story's **Goal**, **Actions**, and **Acceptance** sections. The actions list is canonical — the diff must match it.

4. **Present the plan and stop for confirmation:**

   ```
   ## Bundle-cycle plan

   **Story:** S<N> — <title>
   **Goal:** <one-line paraphrase>
   **Target chunk:** <main app | logic worker | CSS | all>
   **Technique:** <delete dead code | code-split | tree-shake | etc.>

   **Pre-commit steps (this invocation):**
   1. Pre-flight grep — confirm no surviving caller outside `public/` for any deleted exports
   2. Implement on main thread (surgical edits per the Actions list)
   3. `npm run typecheck` + `npx vitest run --reporter=dot`
   4. `npm run build:size` → capture KB delta vs Post-S0 baseline
   5. `bundle-hygiene-reviewer` on the diff
   6. Patch P0/P1 findings inline
   7. Commit (Conventional Commit, KB delta in body)

   Start?
   ```

5. **On confirmation, run pre-flight grep.** Before any deletion, grep the entire repo (`public/`, `tests/`, `scripts/`, `docs/`, `.github/`) for every symbol the story will remove. Surviving callers in *runtime* code are P0 — stop. Surviving callers in tests that exercise the deleted feature are a P1 — decide whether to delete those tests (only if they prove the *deleted* code path) or update them to point at the replacement.

   **Project-specific tripwire for musical-content deletions.** A story that proposes deleting a state field, instrument lane, drum voice, percussion entry, or anything keyed by a musical name (`"Clave"`, `"Shaker"`, `"Bossa Nova"`, etc.) has three non-obvious *runtime* producers that aren't UI code. Always grep these three before declaring something orphaned:
   - `public/engine/grooves/*.ts` — genre engines that write to lane step arrays (Latin lanes are populated here, not by user clicks)
   - `public/engine/fills.ts` — every drum fill pattern arrays lane names; Toms, Conga, and the like are all driven here
   - `tests/standards/*-critique.test.ts` — critique tests exercise these paths and would flake silently if the production code disappeared

   If any of these three reference the symbol you're about to delete, it's almost certainly **not** dead — the "no UI trigger path" angle is misleading. Surface as a premise break (see step 11). The S2 ("orphaned percussion sweep") premise break on 2026-05-23 is the canonical example.

6. **Implement on main thread.** Make the surgical edits per the Actions list. Do not refactor adjacent code "while you're here" — that's scope creep, the reviewer will flag it, and it muddies KB-delta attribution.

7. **Verify behavior.**
   - `npm run typecheck` — must be green.
   - `npx vitest run --reporter=dot` — must be green. Statistical flakes on critique tests (e.g. boundary equality, see [[feedback_determinism_test_pattern]] in memory) can be re-run in isolation; if the isolated run passes, treat as flake and proceed. Persistent regressions are stop-the-line.
   - E2E (`npm run test:e2e`) is **optional** for stories whose risk profile is purely static dead-code removal. Run it for stories that touch any user-reachable behavior path (lazy-load splits, state-field deletions, anything that changes runtime semantics).

8. **Measure.** `npm run build:size`. Capture before/after brotli for all three chunks. The delta is reported in the commit body and updated in the README's baseline table.

   **Expected delta is sometimes near zero.** Statically-provable dead code (a function with no callers, an `if (false)` branch) is already DCE'd by Rollup at minify time — deleting it gives ~0 KB savings. The win in those stories is **source clarity** and **future-proofing**, not bytes. The real KB wins come from:
   - Code that the minifier can't statically prove dead (data-driven dispatch tables with orphaned keys, lazy switch arms).
   - `import()` splits that move bytes out of the boot path.
   - Removing dependencies or large lookup tables.

   If a story whose Actions list reads like "delete dead code" produces ~0 KB delta, that's expected and not a failure. Mark it as "source-clarity win" in the Status line.

9. **Review.** Spawn `bundle-hygiene-reviewer` on the uncommitted diff. The reviewer's brief should include: the story's Goal + Actions, what is explicitly out of scope, and the measured KB delta. Parse the actual findings — empty findings is a valid clean result, *missing* findings (agent crashed, output truncated) is a failure and the review must be re-run.

10. **Patch P0/P1 inline.** P0 = block (reachable code deleted, behavior change, load-bearing test deletion). P1 = mechanical fix (stale fixture field, doc drift, dead barrel re-export). P2 = defer to a followup note in the README unless trivially in-scope.

11. **Finalize:**
    - Add a `**Status:** Shipped <date>. <2–4 sentence summary of what landed, KB delta, reviewer verdict.>` line under the story in `docs/bundle-audit/README.md`.
    - Update the "Post-S<N> baseline" snapshot in the doc with the new brotli numbers.
    - If the story removed any `public/**` file, deregister it from `AI_MAP.md` (the pre-commit docs-lint hook blocks otherwise).
    - Commit — one commit per story, Conventional Commit (`chore(bundle-audit): S<N> — <summary>` or `refactor(<area>): S<N> — <summary>` depending on the file scope). KB delta in the body. Never `git add -A` blindly (review the staged set), never `--no-verify`, never auto-push, never amend.

12. **Chain or stop:**
    - `--until-blocked` and chain still alive → fall through to step 1 for the next story.
    - Otherwise → present the post-story summary (KB delta, files changed, what's next per the doc) and stop.

## Speculative-tagged stories

A story marked **speculative** in `docs/bundle-audit/README.md` (e.g. S5 — lazy-load synthesis on first `togglePlay()`) needs a design decision before implementation. When this skill encounters one:

```
## Speculative story — needs you

**S<N>: <title>** is tagged speculative — the technique has risks that the doc flagged but didn't resolve.

**The risk:** <one-line summary from the doc>
**Open question:** <what needs deciding>

Want me to: (a) sketch a design + present it for review, (b) skip this story and pick S<N+1>, or (c) drop this story from the audit?
```

Halt — do not implement until the design is agreed.

## Decision gates (no user prompt unless required)

| After step | Auto-continue if | Pause / halt if |
|---|---|---|
| pre-flight grep | no surviving callers outside `public/` | any surviving runtime caller of a deleted symbol |
| implement | edits match the Actions list | scope creep or unexpected adjacent changes needed |
| typecheck / vitest | all green; isolated rerun of a flaky test passes | persistent test failure or typecheck red |
| build:size | brotli for target chunk did not *grow* | target chunk grew (a "shrink" story that grows the bundle is broken) |
| reviewer | findings are P1/P2, all mechanically fixable | any P0, or P1 that needs a design call |
| patch | tests + typecheck still green after the fix | tests still failing, fix is ambiguous |
| commit | hook passes (cspell/Biome auto-fixes OK to retry inline; knip output is informational and does not block) | non-trivial hook failure |

**Premise break is always a halt** — not in the table because it can fire from any step (orient surfaces a stale Status, pre-flight grep finds the "dead" code is reachable, implement discovers the cited file/line is wrong). Whenever the story's stated premise breaks, stop, update the doc with a `**Status:** Not applicable, <date>. <reason + lesson>` line, surface the finding, and ask for direction. Never silently rewrite the story to match what you found. Applies equally inside `--until-blocked` chains.

## Edge cases

- **`bundle-hygiene-reviewer` not invocable** (e.g. the session that *created* it, or a fresh fork): fall back to inline review using the contract in `.claude/agents/bundle-hygiene-reviewer.md` as a checklist, and note the substitution in the commit body.
- **Knip output during pre-commit:** the pre-commit hook runs `npm run knip || true` (mirrors cspell's pattern) — findings flowing past during commit are informational, not a failure. Stand-alone `npm run knip` and `npm run validate` still exit truthfully; check those when you want the gate.
- **Knip / depcheck flags a removal we made:** that's expected — those tools' output is the *symptom*; the cleanup is the cure. Read the relevant config to confirm we're not deleting something a tool was hiding.
- **A story's Actions list turns out to be wrong** (e.g. the doc says "delete X" but X is reachable from a path the doc missed): stop. Update the doc, surface the premise break, ask for direction. Do not "fix" the doc silently while implementing — premise breaks deserve a conversation. (See [[feedback_audit_doc_premise_breaks]] in memory — same failure mode as the musical audit.)
- **KB delta is *negative* — bytes grew:** never commit a bundle-cycle story that grew the target chunk. Either the technique was wrong, scope-crept, or accidentally introduced a side effect. Stop and investigate.
- **A speculative story is the *only* remaining one:** present it (per "Speculative-tagged stories" above) — don't auto-implement.
- **The audit is complete** (all stories `**Status:** Shipped`): say so and offer to archive `docs/bundle-audit/README.md` → `docs/archive/BUNDLE_AUDIT.md`, with any reusable rules lifted to `docs/guides/bundle-hygiene.md`.

## Chain references

- Self-contained — the bundle track has no `/implement` `/review` `/patch` `/done` skills of its own. This skill performs all four steps inline.
- `/pmlite` and `/next` are musical-audit tools — they will not see bundle-audit progress. Read `docs/bundle-audit/README.md` directly to check the board.
- The reviewer agent (`bundle-hygiene-reviewer`) is project-local at `.claude/agents/bundle-hygiene-reviewer.md`. It is loaded once per session — an agent created mid-session won't be available until restart.
