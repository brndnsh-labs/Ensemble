---
name: dep-update
description: Batch dependency update workflow. Runs npm update, validates (audit + typecheck + tests), and commits the lockfile in one local pass. Weekly hygiene — call for a scheduled dependency refresh. (Forgejo has no Dependabot; this is a purely local update pass — there are no dependency PRs to reconcile.)
---

# /dep-update — batch dependency update

Goal: bring all packages to their latest semver-compatible versions in one local commit, validated by
the gates. Local-only — Forgejo has no Dependabot, so there are no dependency PRs or bot branches to
close or prune; this skill just refreshes the lockfile and proves the suite still passes.

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
1. npm update
2. npm audit fix (if advisories remain after update, and only if no --force needed)
3. npm run typecheck
4. npm test
5. Fix any stale test expectations if tests fail
6. Commit (package-lock.json + any test fixes)

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

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Never `git add -A`. Never `--no-verify`.

### 8. Verify and report

```
## dep-update done

**Updated:** <N packages>
**Advisories resolved:** <N | none | 1 remaining (needs --force, flagged)>
**Test fixes:** <none | list of files + what changed>

npm outdated now returns: <nothing | any remaining intentional holds>
```

## Edge cases

- **Lockfile drift with nothing outdated:** still run `npm update` — the local lock may have drifted from a hand-edit or a partial install even when `npm outdated` is clean.
- **cspell major bump (9→10):** check if `package.json` already declares the new major before treating it as live work.
- **A package can't update within its semver range:** usually means `package.json` is pinned to an older range. Widen the range if safe, or leave it and note it in the report.
- **`npm test` times out:** run vitest directly (`npx vitest run`) to isolate which file is hanging before re-running the full suite.

## Safety rules

- Never `git add -A` or `git add .`.
- Never `--no-verify` on hooks.
- Never `npm audit fix --force` without explicit user direction.
- Never auto-push — user runs `git push` themselves.
