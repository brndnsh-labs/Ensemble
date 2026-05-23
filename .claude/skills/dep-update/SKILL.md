---
name: dep-update
description: Batch dependency update workflow. Runs npm update, validates, commits, closes all open Dependabot PRs, and prunes stale branches. Weekly hygiene — call when Dependabot PRs have accumulated or when running a scheduled update pass.
---

# /dep-update — batch dependency update and Dependabot cleanup

Goal: bring all packages to their latest semver-compatible versions in one local commit, then close the now-redundant Dependabot PRs and clean up stale branches. Faster and safer than merging PRs one-by-one (they'd conflict).

## Workflow

### 1. Survey

Run in parallel:
- `gh pr list --author "app/dependabot" --state open --json number,title,headRefName`
- `npm outdated`
- `npm audit`

Report: how many Dependabot PRs are open, which packages are outdated, and any security advisories. Note if any outdated package is a **major-version bump** — those need extra scrutiny (breaking changes) and may need a separate targeted install rather than `npm update`.

### 2. Present the plan

```
## dep-update plan

**Open Dependabot PRs:** <N> (will be closed after commit)
**Packages to update:** <list from npm outdated>
**Security advisories:** <none | list>
**Major-version bumps:** <none | list — flag for extra scrutiny>

**Steps:**
1. npm update
2. npm audit fix (if advisories remain after update, and only if no --force needed)
3. npm run typecheck
4. npm test
5. Fix any stale test expectations if tests fail
6. Commit (package-lock.json + any test fixes)
7. Close <N> Dependabot PRs
8. Prune stale remote branches

Proceed?
```

### 3. Update

```bash
npm update
```

This updates `package-lock.json` only — no `package.json` changes needed for patch/minor bumps within declared semver ranges.

For any **major-version bump** flagged in step 1, install separately and check the package's changelog before including it:
```bash
npm install <package>@latest
```

### 4. Audit fix (if needed)

If `npm audit` still reports vulnerabilities after the update:
```bash
npm audit fix
```

If `npm audit fix` proposes `--force`, **do not run it** — stop and surface the advisory for manual review. A `--force` fix can introduce breaking changes.

### 5. Typecheck

```bash
npm run typecheck
```

Must be green before proceeding.

### 6. Test

```bash
npm test
```

**If tests fail:** distinguish between stale expectations and real regressions.

- **Stale expectations** — a test assertion was left behind when a recent commit intentionally changed behavior (wrong chord quality, renamed instrument, etc.). Safe to update the expectation. Check the recent commit log (`git log --oneline -10`) to confirm the behavioral change was intentional.
- **Real regression** — the dependency update broke something. Stop, revert the update for the offending package (`npm install <pkg>@<previous-version>`), and surface the issue.

Never commit with a failing test suite.

### 7. Commit

Stage only the files that should change:
- `package-lock.json` (always)
- Any test files fixed for stale expectations

```bash
git add package-lock.json [test files if any]
git commit -m "chore(deps): batch dependency updates via npm update

<list of notable bumps>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Never `git add -A`. Never `--no-verify`.

### 8. Close Dependabot PRs

```bash
gh pr close <n1> <n2> ... \
  --comment "Closing — handled via batch local npm update on main (commit <hash>)."
```

Get the commit hash from `git rev-parse --short HEAD`.

### 9. Prune stale branches

```bash
git fetch --prune
git branch -r | grep dependabot
```

GitHub auto-deletes branches when PRs are closed if auto-delete is enabled. After `--prune`, any remaining dependabot branches from **already-closed** PRs can be deleted:

```bash
git push origin --delete <branch-name>
```

Do not delete branches that belong to still-open PRs (rare, but possible if a PR was left open intentionally).

### 10. Verify and report

```
## dep-update done

**Updated:** <N packages>
**Advisories resolved:** <N | none | 1 remaining (needs --force, flagged)>
**Dependabot PRs closed:** <list>
**Branches pruned:** <list | none — GitHub auto-cleaned>
**Test fixes:** <none | list of files + what changed>

npm outdated now returns: <nothing | any remaining intentional holds>
```

## Edge cases

- **No open Dependabot PRs:** still run `npm update` — the local lock may have drifted even if GitHub hasn't created PRs yet.
- **cspell major bump (9→10):** cspell PRs often lag behind `package.json` changes. Check if `package.json` already declares the new major before treating the PR as live work.
- **A package can't update within its semver range:** usually means `package.json` is pinned to an older range. Widen the range if safe, or leave it and note it in the report.
- **`npm test` times out:** run vitest directly (`npx vitest run`) to isolate which file is hanging before re-running the full suite.

## Safety rules

- Never `git add -A` or `git add .`.
- Never `--no-verify` on hooks.
- Never `npm audit fix --force` without explicit user direction.
- Never auto-push — user runs `git push` themselves.
- Don't close a Dependabot PR until after the commit is made and verified.
