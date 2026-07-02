---
name: done
description: Ship an Ensemble story — commit the reviewed work, push, open a PR that Closes #<n>, and (for a safe story) merge it once CI is green; a judgment-call story's PR (synth/by-ear/destructive) is left for Brandon's manual merge. Done = the issue closes on merge. Plan-first. Usage `/done #<n> [...]`. Use after /review (+ /patch) pass clean.
---

# /done #<n> — ship a story (Forgejo-backed, auto-merge model)

Goal: commit the reviewed work, push, open a PR that closes the issue, and land it — auto-merging a
safe story (CI-gated) or leaving a judgment-call PR for Brandon.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** This skill leans
on §4 Gates (incl. Track DoD), §5 Judgment calls (the safe-vs-brake split — synth/by-ear/destructive),
§6 Merge guard (the poll-then-merge bash, never `--auto`, sync-main), §8 Commit & PR
conventions, §9 Branch policy. The procedure below is just the ordering.

**Done = the issue is closed** (§1) — `Closes #<n>` does it on merge (§1/§6/§7). No
explicit status write, no markdown tracker to touch.

## Workflow

1. **Parse the issue ref(s)** — `#<n>` (several only if one diff genuinely ships them together; usually
   one PR = one issue).
2. **Confirm gates green** (§4) — never `/done` over a red build. Run the full suite + the Track DoD:
   the **critique test** for a musical story (read its Critique Report), the measured **KB delta** for
   a bundle story. A **Track `synth`** story additionally needs the **A/B audition** signed off
   (Needs-ear) — if it hasn't been heard, this is a judgment-call story (step 11).
3. **Confirm findings were actioned, not parked** (§5) — `/patch` fixed every real finding, or each
   was an explicit escalation / new-idea issue. Never a silent defer.
4. **Survey the diff** — `git status` + `git diff --stat`; only expected files; flag drift. A new
   `public/engine/*.ts` file → confirm its `AI_MAP.md` row exists (the docs-lint pre-commit hook
   blocks otherwise — §4).
5. **Branch check** (§9) — must be on a feature branch, not `main`. If on `main`, stop.
6. **Compose the narrative** — the "what shipped + which findings were actioned + why" summary that
   becomes the **PR body**.
7. **Commit** (§8) — Conventional Commit, explicit paths (never `-A`), `Co-Authored-By: Claude Opus 4.8`
   trailer, HEREDOC.
8. **Push** — `git push -u origin <branch>`.
9. **Open the PR** (§8) — `--base main`, narrative body, **`Closes #<n>`**, CC subject as title, the
   `🤖 Generated with [Claude Code]` footer.
10. **Post a one-line issue comment** linking the PR.
11. **Land it — the auto-merge decision (§5 + §6):**
    - **Safe story** (Track musical/bundle, CI green, none of §5's always-brake classes) → run the
      **poll-then-merge guard in the background** (§6), then sync local main + prune the branch. The
      issue auto-closes.
    - **Judgment-call story** (Track `synth` / by-ear / destructive data op / state-or-worker-contract
      design call, or anything Brandon should *see*) → **leave the PR open**, Status stays In review
      (or Needs-ear for synth awaiting audition), report "ready for your merge: <url>" + *why* it's
      gated. Do NOT auto-merge.
12. **Suggest next:** `scripts/deploy.sh test` (staging), `/next`, or `/cycle` continues.

## Edge cases

- **Gates red / tests skipped / critique test failing:** STOP — don't paper over it.
- **CI red on the PR:** do NOT merge; surface the failing job (`test` or `e2e`); fix on the branch,
  push, re-check.
- **Unrelated drift in the diff:** surface; stage selectively (§8 — never `-A`).
- **Whole epic (milestone) done:** note it; suggest a VISION/docs shipped note — don't auto-restructure
  (milestone progress reflects it automatically).
- **Issue didn't close after merge** (a `Closes #<n>` typo / non-default base): `node scripts/forgejo.mjs
  issue close <n>`. A **closed issue is "done"** regardless.
