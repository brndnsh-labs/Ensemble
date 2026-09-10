# V2: filed cycle batch

Brandon approved this batch on 2026-09-10: "yes, go ahead and file these".
The five stories are filed under [milestone 15](https://github.com/brndnsh-labs/Ensemble/milestone/15)
and [parent #1172](https://github.com/brndnsh-labs/Ensemble/issues/1172).

This is an issue index, **not a second status tracker**. Each issue owns its acceptance criteria,
file boundaries, model labels, review requirements, prerequisites and verification receipts.
Read current GitHub state before picking work; do not infer readiness from this index.

| Issue | Bounded deliverable |
| --- | --- |
| [#1178](https://github.com/brndnsh-labs/Ensemble/issues/1178) | Owner-scoped, bounded account-library listing |
| [#1182](https://github.com/brndnsh-labs/Ensemble/issues/1182) | Canonical Save-request validation boundary |
| [#1179](https://github.com/brndnsh-labs/Ensemble/issues/1179) | Semantic-chart persistence and retry contract tests |
| [#1180](https://github.com/brndnsh-labs/Ensemble/issues/1180) | Independent local/cloud/offline status facts |
| [#1181](https://github.com/brndnsh-labs/Ensemble/issues/1181) | One bounded account outbox pass; depends on #1178 |

## Starting a fresh session

Read [the cross-provider handoff](../../prototypes/v2/CLAUDE.md), then one ready issue.
Recommended first pickup is #1179, the test-only economy-tier slice, followed by #1178 or #1182.
The listing prerequisite for #1181 must be implemented and verified on the v2 branch before
promoting that story to ready. No merge to main is needed to satisfy a v2 dependency.

Integrate serially on `feat/ensemble-v2-foundation` / draft PR #1173. Do not merge, enable
auto-merge, mark the PR ready, close implemented children, sync main or deploy production.
Shared tests/configs require one integration owner even when feature modules are disjoint.

The source [approved draft at 5c888d53](https://github.com/brndnsh-labs/Ensemble/blob/5c888d53712b63d7de74ef8079b22a43696fec01/docs/design/ensemble-v2-next-batch.md)
is retained in Git history for provenance. Its unfiled wording and draft letters are historical;
use the live issues above, not the old draft, for implementation.
