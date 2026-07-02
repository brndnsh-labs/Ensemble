---
name: patch
description: Address /review findings on the uncommitted Ensemble diff. Reads the most-recent review output from context, triages (fix-now is the DEFAULT for any finding about this diff — P0/P1/bounded-P2; escalate to Brandon if it needs a decision or is big; backlog only for genuinely new ideas), presents a fix plan, then patches inline — no agent spawn. Re-runs the gates after. Use after /review, before /done. Plan-first.
---

# /patch — address reviewer findings

Goal: close the review→done seam — sort `/review`'s findings and apply inline fixes.

**Shared rules in `.claude/skills/DOCTRINE.md` — read it if not already in context.** The triage below
applies §5 (findings get actioned not parked; `finding` issues trend to empty) and §2 (the `finding`
vs `backlog` label split); the re-run gates are §4.

## Workflow

1. **Load findings** from the most-recent `/review` output in context (severity, `file:line`, verbatim
   quote, suggested direction). If not in context (new session), ask Brandon to re-run `/review`.
2. **Triage:**

   | Triage | Criteria | Action |
   |---|---|---|
   | **Fix now (DEFAULT)** | Any finding about the diff under review — P0, P1, **or a bounded P2** (mechanical, or small/localized). The default, not the exception. | patch inline this turn |
   | **Escalate to Brandon** | A real finding that (a) needs a design call, or (b) is large / cross-cutting / would balloon the diff | stop; surface it; on his nod open a **`finding` issue** (`node scripts/forgejo.mjs issue create --title T --body B --label finding --label area:<x>`) and/or recommend `/implement #<n>` with a fix-focused prompt — **never silently shelve a real finding** |
   | **Backlog** | A genuinely *new* idea/feature surfaced during review — not a flaw in this code | open a **`backlog` issue** (`node scripts/forgejo.mjs issue create --title T --body B --label backlog --label area:<x>`) — pipeline, not debt |

   **Bias to fix now.** Deferring a real finding to a list is the thing we're eliminating — open
   `finding` issues should trend to *empty*. A fix genuinely too big to do in-cycle is an
   **escalation** (a `finding` issue with Brandon's nod), not a silent defer. Only genuinely new ideas
   become **`backlog` issues**.
3. **Present the patch plan** (Fix-now / Escalate / Backlog, each with `file:line` + a fix sketch + the
   validation gates). For a musical change, name the **critique test** that re-validates it. Apply?
4. **On confirmation, patch inline** with Edit/Write — no spawn (the orchestrator already holds the
   diff + findings; a subagent would re-derive it). Add a `**Why:**` comment at any non-obvious fix
   site (CLAUDE.md "Musical intent"). **Re-Read a region before a second Edit** — the format-on-edit
   hook can reflow lines and stale an `old_string`.
5. **Re-run gates** (§4): `npm run typecheck`, `npm run lint`, the **critique test** tied to the
   touched engine (musical) / the relevant test, and re-spawn a specific reviewer if the patch touched
   their lane (e.g. `state-discipline-reviewer` if it changed coordination shape). If a Fix-now patch
   fails a gate, stop and surface — don't pile on.
6. **Report:** a table of patches applied (finding → fix), any **escalated** findings (with the
   proposed issue) or **backlogged** ideas (with where they landed), and gate status. The default
   expectation is real findings were *fixed*, not parked — call out anything that wasn't and why. Then
   suggest `/done` (if green) or `/review` again (if the patches were substantive).

## Safety

- Never patch a file the most-recent `/review` didn't flag — that's scope creep.
- Never silently downgrade a P0 to avoid escalation; if you think it's overblown, say so and let
  Brandon decide.
- Don't run reviewers here — that's `/review`'s job.

## Edge cases

- **No findings:** report; suggest `/done` directly.
- **All findings are P0 design calls:** patch none; surface the questions; recommend `/implement #<n>`.
- **Findings conflict** (one says tighten, one says loosen a threshold): present both; ask — don't
  auto-pick.
- **Cited line has moved** (diff edited since `/review`): re-Read, relocate by content match, note the
  drift.
- **Finding contradicts a project memory note:** memory wins by default — drop the finding and say so.
