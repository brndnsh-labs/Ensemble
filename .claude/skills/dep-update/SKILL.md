---
name: dep-update
description: Batch dependency update workflow. Runs npm update, validates (audit + typecheck + tests), commits, and ships via branch + PR + auto-merge. Weekly hygiene — call for a scheduled dependency refresh. (Forgejo has no Dependabot; this skill stands in for it — there are no bot PRs to reconcile, but `main` is branch-protected so the commit still needs its own branch + PR.)
---

# /dep-update — batch dependency update

Goal: bring all packages to their latest semver-compatible versions in one commit, validated by
the gates, then shipped through the normal branch → PR → auto-merge pipeline (DOCTRINE §6). Forgejo
has no Dependabot, so there are no bot PRs or branches to close or prune — this skill originates the
one PR itself. `main` is branch-protected (no direct push), so a plain local commit on `main` will be
rejected at push time; always branch first.

## Workflow

### 1. Survey

Run in parallel:
- `npm outdated`
- `npm audit`

Report: which packages are outdated and any security advisories. Note if any outdated package is a
**major-version bump** — those need extra scrutiny (breaking changes) and may need a separate targeted
install rather than `npm update`.

### 2. Present the plan

```
## dep-update plan

**Packages to update:** <list from npm outdated>
**Security advisories:** <none | list>
**Major-version bumps:** <none | list — flag for extra scrutiny>

**Steps:**
1. Create branch `chore/dep-update-<date>`
2. npm update
3. npm audit fix (if advisories remain after update, and only if no --force needed)
4. npm run typecheck
5. npm test
6. Fix any stale test expectations if tests fail
7. Commit (package-lock.json + any test fixes)
8. Push branch, open PR, auto-merge on green CI (main is branch-protected — no direct push)

Proceed?
```

### 3. Branch

```bash
git checkout -b chore/dep-update-<YYYY-MM-DD>
```

Do this before touching anything — `main` is branch-protected (no direct push, required CI
contexts), so a commit made directly on `main` will be rejected at push time and has to be moved
onto a branch after the fact. Branch first and skip that detour.

### 4. Update

```bash
npm update
```

This updates `package-lock.json` only — no `package.json` changes needed for patch/minor bumps within declared semver ranges.

For any **major-version bump** flagged in step 1, install separately and check the package's changelog before including it:
```bash
npm install <package>@latest
```

### 5. Audit fix (if needed)

If `npm audit` still reports vulnerabilities after the update:
```bash
npm audit fix
```

If `npm audit fix` proposes `--force`, **do not run it** — stop and surface the advisory for manual review. A `--force` fix can introduce breaking changes.

### 6. Typecheck

```bash
npm run typecheck
```

Must be green before proceeding.

### 7. Test

```bash
npm test
```

**If tests fail:** distinguish between stale expectations and real regressions.

- **Stale expectations** — a test assertion was left behind when a recent commit intentionally changed behavior (wrong chord quality, renamed instrument, etc.). Safe to update the expectation. Check the recent commit log (`git log --oneline -10`) to confirm the behavioral change was intentional.
- **Real regression** — the dependency update broke something. Stop, revert the update for the offending package (`npm install <pkg>@<previous-version>`), and surface the issue.

Never commit with a failing test suite.

### 8. Commit

Stage only the files that should change:
- `package-lock.json` (always)
- `biome.json` (only if the `$schema` version needs bumping — see edge cases)
- Any test files fixed for stale expectations or reformatted for a tooling version bump

```bash
git add package-lock.json [biome.json] [test files if any]
git commit -m "chore(deps): batch dependency updates via npm update

<list of notable bumps>

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Never `git add -A`. Never `--no-verify`.

### 9. Ship: branch, PR, auto-merge

`main` is branch-protected — a direct `git push` from this branch's commit onto `main` is rejected
at the remote. Push the feature branch and open a PR per DOCTRINE §8/§9:

```bash
git push -u origin chore/dep-update-<YYYY-MM-DD>
node scripts/forgejo.mjs pr create --base main --head chore/dep-update-<YYYY-MM-DD> \
  --title "chore(deps): batch dependency updates via npm update" \
  --body "<summary + test plan, ending with the Claude Code footer>"
```

This is gate-verified, non-destructive hygiene work — no judgment call, no `Needs-ear`/`Needs-decision`
trigger (DOCTRINE §5) — so it auto-merges per §6:

```bash
node scripts/forgejo-merge.mjs <pr> &
```

Runs in the background: the poll-then-merge guard waits for CI to register + finish on the PR's head sha and
merges (squash + delete branch) only on green. After it merges, sync local main:

```bash
git checkout main && git fetch origin && git reset --hard origin/main
```

### 10. Verify and report

```
## dep-update done

**Updated:** <N packages>
**Advisories resolved:** <N | none | 1 remaining (needs --force, flagged)>
**Test fixes:** <none | list of files + what changed>
**PR:** <url> — <merged | awaiting CI | left open, needs manual look>

npm outdated now returns: <nothing | any remaining intentional holds>
```

## Edge cases

- **Lockfile drift with nothing outdated:** still run `npm update` — the local lock may have drifted from a hand-edit or a partial install even when `npm outdated` is clean.
- **cspell major bump (9→10):** check if `package.json` already declares the new major before treating it as live work.
- **A package can't update within its semver range:** usually means `package.json` is pinned to an older range. Widen the range if safe, or leave it and note it in the report.
- **`npm test` times out:** run vitest directly (`npx vitest run`) to isolate which file is hanging before re-running the full suite.
- **Biome itself gets updated:** a Biome patch/minor bump can change formatter output (e.g. `it.each(...)` call wrapping) and fail the `lint` step on files it didn't touch. Not a regression — run `npm run format` to reformat affected files, and if Biome complains the `biome.json` `$schema` version is stale, bump it to match the new Biome version. Re-run `npm test` after.

## Safety rules

- Never `git add -A` or `git add .`.
- Never `--no-verify` on hooks.
- Never `npm audit fix --force` without explicit user direction.
- Never commit or push directly to `main` — always branch (step 3), even though this workflow runs autonomously end-to-end otherwise.
