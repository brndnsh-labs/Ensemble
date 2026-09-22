# Triage labels

The engineering skills speak in five canonical triage roles. Ensemble has no labels by those
names. Each role maps onto the pipeline's `status:*` routing (DOCTRINE §1) so there is one
vocabulary, not two.

| Role in mattpocock/skills | In Ensemble | Meaning here |
| --- | --- | --- |
| `needs-triage` | *no `status:*` label* | The untriaged pile. |
| `needs-info` | `status:needs-decision` | Blocked on Brandon; say what is needed in a comment. |
| `ready-for-agent` | `status:ready` | Pickable, so an unattended `/burndown` may build it. See the gate below. |
| `ready-for-human` | `status:needs-decision` | A judgment call. Use `status:needs-ear` instead when the call is a listening pass. |
| `wontfix` | close the issue | Also add the existing `wontfix` label when the request was rejected rather than already built. |

Category roles map directly: `bug` is `bug`, and `enhancement` is `enhancement`.

## The gate on `ready-for-agent`

`status:ready` is real scheduling, so it follows the certainty call in step 5 of
`.claude/skills/FILING.md`, not a skill's default:

- **Deterministic and gate-provable** means `status:ready`.
- **Any judgment call** means `status:needs-decision`, with the fix pre-drafted.
- **Unsure** means no status label.
- **An always-brake surface** (DOCTRINE §5: synth or by-ear work, destructive data ops, the
  state/worker contract) is never `status:ready` from these skills.

So when `/to-tickets` or `/to-spec` says "apply `ready-for-agent`", apply `status:ready` only to
the tickets that pass this gate, and route the rest per the table.

Set status with the exactly-one command in `issue-tracker.md`.
