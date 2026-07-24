# gh → Forgejo cheat-sheet (skill migration contract)

Ensemble's tracker moved from GitHub (Project #2 + `gh`) to **Forgejo issues + labels**
(`brandon/Ensemble` on `https://git.brndn.zip`, LAN/WG-only). This file is the exact
mapping for porting a work-loop skill off `gh`. Read the (already-migrated) `DOCTRINE.md`
§1/§3/§6/§7/§8 first — this is the command-level companion to it.

## The three scripts (all REST, all `node scripts/…`)

| Old (`gh` / gh-project.mjs) | New |
| --- | --- |
| `node scripts/gh-project.mjs status <n> "<S>"` | `node scripts/forgejo-project.mjs status <n> "<S>"` (same interface) |
| `node scripts/gh-project.mjs set-field <n> "<F>" "<V>"` | `node scripts/forgejo-project.mjs set-field <n> "<F>" "<V>"` (same) |
| `node scripts/gh-project.mjs batch <file.json>` | `node scripts/forgejo-project.mjs batch <file.json>` (same JSON `{issue,field,value}`) |
| `gh project item-list 2 --owner brndnsh --format json` | `node scripts/forgejo.mjs list --open` (JSON array; routing read off `labels[]`) |
| `gh project item-add …` / `ensure` | **gone** — no board; the issue existing IS enough |
| `gh issue list --state open …` | `node scripts/forgejo.mjs list --open [--label L] [--milestone M]` (or `--state open\|closed\|all`; bare `list` defaults to **open**) |
| `gh issue view <n> --json …` | `node scripts/forgejo.mjs issue view <n>` (JSON: number,title,state,url,labels,milestone,body) |
| `gh issue create --title T --body B --label L` | `node scripts/forgejo.mjs issue create --title T --body B --label L [--milestone M]` |
| `gh issue edit <n> --add-label L` / `--title` / `--body` | `node scripts/forgejo.mjs issue edit <n> [--add-label L] [--remove-label L] [--title T] [--body B] [--milestone M]` |
| `gh issue comment <n> --body B` | `node scripts/forgejo.mjs issue comment <n> "<text>"` (positional; or `--body B` / `@file` / `@-`) |
| `gh issue close <n>` | `node scripts/forgejo.mjs issue close <n>` |
| `gh pr create --base main --title T --body B` | `git push -u origin <branch>` then `node scripts/forgejo.mjs pr create --head <branch> --base main --title T --body B` |
| `gh pr list` | `node scripts/forgejo.mjs pr list [--state open\|closed\|all]` |
| `gh pr close <n>` | `node scripts/forgejo.mjs pr close <n>` |
| the `gh pr checks --watch && gh pr merge` snippet | `node scripts/forgejo-merge.mjs <pr> &` (background; poll-then-merge guard, DOCTRINE §6) |
| `gh run list` | `ci-logs --list` (global command from `~/code/dotfiles`) |
| `gh run view <n> --log` / `--log-failed` | `ci-logs <run> [job]` / `ci-logs --failed` — **not** the REST API: this Forgejo serves no job logs (DOCTRINE §6 "Reading a red gate") |

`--body` accepts `@file` or `@-` (stdin) for long markdown bodies (mirrors `gh -F`).

## Field → label-namespace mapping (what `set-field`/`batch` write)

`Status`→`status/*`, `Track`→`track/*`, `Model`→`model/*`, `Size`→`size/*`,
`Agent`→`agent/*`, `Review lens`→`lens/*`. Values lowercase with spaces→hyphens
(`"In progress"`→`status/in-progress`, `S`→`size/s`). `forgejo-project.mjs` enforces
one-label-per-namespace and preserves the workflow labels (`bug`, `area:*`, `finding`, …).

## Reading routing off an issue (there are no Project "fields")

`forgejo.mjs list`/`issue view` return `labels[]` (an array of names). To get a routing
value, find the label with the namespace prefix and strip it:
```
labels.find(l => l.startsWith('status/'))?.slice('status/'.length)   // → "ready" | undefined
```
No board, no 30-item pagination default, no GraphQL quota. A **closed issue is done**
(DOCTRINE §1) — pass `--open` when picking work.

## Semantics that CHANGED (not just command swaps)

- **"Shipped" is retired.** Closing the issue = done. Never set `status/shipped` (doesn't
  exist). `forgejo-project.mjs status <n> "Shipped"` is tolerated (it just clears `status/*`),
  but prefer `forgejo.mjs issue close <n>`. Drop any "auto-flip to Shipped" / "board workflow"
  wording — it's gone.
- **Board is eyes-only.** No skill "adds to the board" or "reads the board." Read *issues*.
- **Unreachable → STOP.** All three scripts exit **3** and print `unreachable` on a connection
  failure. A skill must stop and say so — never fall back to the frozen markdown or a cached list.
- **`brndnsh`/`github.com` URLs → `git.brndn.zip/brandon/Ensemble`.**

## Filing note (validated on the first real cycle)

**Review-carved issues arrive with ZERO routing labels — by design.** An "out of scope" observation
from one story that becomes its own `finding`/`backlog` issue is filed with no `track/`, `model/`,
`size/`, or `agent/` label. Routing is decided by the **picking** skill at `/cycle` time (from what
the diff actually touches), NOT at filing time. Don't document the pipeline as "every issue arrives
pre-routed" — a bare `finding`/`backlog` with no namespace labels is correct, not an oversight.

## What must NOT change

The skill's *procedure, judgment, and prose* (ranking logic, safe-set rules, when-to-pause,
DoD, reviewer routing). This is a **mechanical command port**, not a rewrite. Don't touch
DOCTRINE §-references, musical content, or the skill's structure — only the `gh`/`gh-project`
command lines and the handful of GitHub-specific phrasings above. If a skill already reads
correctly with just the command swapped, that's the whole job.
