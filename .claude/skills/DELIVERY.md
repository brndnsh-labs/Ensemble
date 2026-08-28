<!-- cycle:rendered template=references/DELIVERY.md.tmpl hash=9632608acf87 — managed by the-cycle; edit the template, not this file -->
# Delivery mechanics (shared)

This file is the procedural expansion of DOCTRINE §6 and §8. **DOCTRINE remains the authority:**
if this file ever conflicts with its safety invariants, stop and follow DOCTRINE. Read this
reference only when a workflow is actually committing, opening a PR, or landing one.

## Merge procedure

The pipeline pushes + opens PRs. A safe story uses the configured merge guard only after local
gates pass; a judgment-call story stays open for Brandon's manual merge (§5).

**Server-side auto-merge is enabled here**, and the forge enforces the required checks — so queue
the merge and let it do the waiting:

```bash
gh pr merge "<pr>" --auto --squash
```

It cannot merge early: `--auto` waits until the repo's merge requirements are satisfied, and with
required status checks configured those requirements *are* the checks. Prefer this to a
client-side poll — enforcement survives a killed session, a crashed harness, or a denied
background command, and it costs no polling quota.

If it errors `Auto merge is not allowed for this repository`, the forge setting was turned off:
the declaration in `.cycle/config.jsonc` is now a lie. Re-enable it, or drop
`backend_overrides.auto_merge` and fall back to the poll guard. `cycle check --verify-forge`
catches that drift before it bites.

**Reading a red gate.** Logs come from `gh run view "<run>" --log`.
`gh run view "<run>" --log-failed` narrows one run to its failed steps, but it does **not** search
backwards: list the runs first (`gh run list`) and pass the id of the one that actually failed. A
red CI is diagnosable, so **"retry and see" is not an acceptable first move** — read the log, then
decide transient-vs-real. DOCTRINE §5 still makes an unexplained red a hard stop.

After a safe merge, sync local main (`git checkout main && git fetch origin && git reset --hard
origin/main`) and prune the branch.

The harness's own auto-mode classifier can independently deny the merge command. No workflow text
can route around that environment-level permission gate: report the open, CI-pending PR and ask
Brandon for a one-turn approval to re-run the merge (or to merge it). Never retry with
`--no-verify` or another workaround.

## Commit and PR procedure

- Use a **Conventional Commit** (`feat(scope)` / `fix` / `docs` / `chore` / `test`) scoped to the
  area; the body names the story. Include `Co-Authored-By` only when the active runtime explicitly
  supplies a truthful identity. Otherwise omit it; never infer one from repo config, harness or
  model names, or history.
- Stage explicit paths with `git add <paths>` — never `-A` / `.`. Never `--no-verify`; never amend;
  never force-push.
- Open the PR against `main`; title it with the Conventional-Commit subject. Its body narrates what
  shipped and which findings were actioned, includes **`Closes #<n>`**, and ends with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```
- `Closes/Fixes/Resolves #N` fires **anywhere** in a PR body except inside a code span or code
  block. Never backtick a wanted close token, and never leave one bare next to an issue that should
  stay open. For an umbrella, write `part of #N` instead of denying a close token in prose.
- Post a one-line issue comment linking the PR; the narrative belongs in the PR body.
