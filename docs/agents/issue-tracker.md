# Issue tracker: GitHub

Read by the general-purpose engineering skills (the `mattpocock-skills` plugin and its
user-level copies for other agents): `to-tickets`, `to-spec`, `code-review`, `triage`,
`wayfinder`. The Ensemble work pipeline (`/next`, `/cycle`, `/intake`, …) does not read this
file. Its rules are in `.claude/skills/DOCTRINE.md` and win wherever the two disagree.

Issues live in GitHub issues on `brndnsh-labs/Ensemble`. Use the `gh` CLI.

## Conventions

- **Prefer REST reads.** GraphQL quota is shared by every agent on the account, so use
  `gh api repos/brndnsh-labs/Ensemble/issues/<n>` and `.../issues/<n>/comments` rather than
  `gh issue view --json`.
- **Create an issue**: `gh issue create --title "..." --body "..."`, with a heredoc for
  multi-line bodies.
- **Read an issue**: `gh api repos/brndnsh-labs/Ensemble/issues/<n>` plus
  `gh api repos/brndnsh-labs/Ensemble/issues/<n>/comments`.
- **List issues**: one `gh issue list --state open --json number,title,labels --limit 200` call
  over the whole set, not one read per issue.
- **Comment**: `gh issue comment <n> --body "..."`.
- **Close**: `gh issue close <n> --comment "..."`.

## Status labels: exactly one at a time

Routing is a single `status:*` label per open issue (the full table is DOCTRINE §1). Set one
the way the pipeline does (DOCTRINE §7): clear the whole set, then add the target in a second,
ordered call.

```
gh issue edit <n> --remove-label "status:ready,status:in-progress,status:in-review,status:needs-decision,status:needs-ear,status:blocked" && gh issue edit <n> --add-label "<target>"
```

These skills only ever set `status:ready` or `status:needs-decision`, or leave an issue
unlabeled. `status:in-progress` and `status:in-review` belong to the pipeline and are never
set here. The triage-role mapping is in `triage-labels.md`.

## Issue body shape

`/implement` and `/cycle` build from a **Why / Touches / Acceptance** body (step 4 of
`.claude/skills/FILING.md`).
When a skill publishes a ticket or spec that should become pickable work, give it that shape:

```
**Why:** <the problem, and what is wrong today>
**Touches:** <files or surfaces>
**Acceptance:** <the observable condition that means it is done>
```

Extra sections from a skill's own template (user stories, "Blocked by", "Parent") go below
those three lines. A long spec can stay in the skill's format when it is a parent issue that
tickets are cut from, not work to build directly.

## Pull requests as a triage surface

**PRs as a request surface: no.** Solo repo; every PR comes from the pipeline.

## When a skill says "publish to the issue tracker"

Create a GitHub issue in the shape above, then set its status per `triage-labels.md`.

## When a skill says "fetch the relevant ticket"

Read it with the two REST calls under Conventions.

## Wayfinding operations

Used by `/wayfinder`. The `wayfinder:*` labels do not exist yet. Create them on first use with
`gh label create`.

- **Map**: one issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue, labelled
  `wayfinder:<type>` (`research`, `prototype`, `grilling`, `task`). A claimed ticket is assigned
  to the driving dev.
- **Blocking**: GitHub's native issue dependencies. Add an edge with
  `gh api --method POST repos/brndnsh-labs/Ensemble/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`,
  where the id is the blocker's database id from
  `gh api repos/brndnsh-labs/Ensemble/issues/<n> --jq .id`.
- **Frontier query**: the map's open children with no open blocker and no assignee, first in
  map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`, as the session's first write.
- **Resolve**: comment the answer, close the ticket, then add a one-line gist and link to the
  map's Decisions-so-far.

Wayfinder tickets are decisions, not builds, so they carry no `status:*` label.
