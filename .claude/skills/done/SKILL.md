---
name: done
description: Mark one or more musical-audit stories complete and prepare a commit. Updates each story's epic file (adds a Done marker), increments the tally in docs/audit/EPICS.md, drafts a Conventional-Commit message, and stages + commits on confirmation. Plan-first — presents the proposed commit before doing anything destructive. Usage `/done <story-id-1> [<story-id-2> ...]`. Use after `/review` passes clean.
---

# /done <story-ids...> — close out a story or batch

Goal: persist story completion in the audit tree, update EPICS.md tally, and commit the implementation diff with a Conventional-Commit message.

## Workflow

1. **Parse the story-ids.** Same format as the other skills. Allow multiple if a `/fan-out` batch shipped clean.

2. **For each story, find its block in the epic file.** Append a `**Status:** Shipped <YYYY-MM-DD>` line to the story block (or update an existing Status line). Use today's date.

3. **Update `docs/audit/EPICS.md` tally.** For each affected epic, increment the `Done` column. Example: if Epic 1 was `6 stories / 0 done` and 2 stories are shipping, update to `6 stories / 2 done`.

4. **If a whole epic is now done** (Done == Stories), update its row's `Notes` column to `✅ Shipped <date>` and consider whether to move its summary to `docs/MUSICAL_AUDIT.md` Shipped table as a follow-up. Surface this as a suggestion to the user — don't auto-archive.

5. **Survey the diff.**
   - `git status` — confirm only expected files changed.
   - `git diff --stat` — confirm scope is consistent with the stories.

6. **Draft a Conventional-Commit message.**
   - Single story: scoped to the engine area (e.g., `fix(bass): chromatic approach gated to chord changes only`).
   - Multi-story batch: pick a higher-level scope (e.g., `refactor(coordination): wire upcomingSectionFirstChord into bass and chords`). Body lists each story.
   - End with the standard `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` line.

7. **Present the plan.** Format:

   ```
   ## Plan: commit <N> shipped stories

   **Stories closing:**
   - `<slug>/S1` — <title>
   - `<slug>/S3` — <title>

   **Epic file updates:**
   - `docs/audit/epic-<slug>.md`: +2 Status: Shipped lines
   - `docs/audit/EPICS.md`: Epic <N> done count <old> → <new>

   **Diff to commit:** <N files, +<n>/-<m> lines>

   **Proposed commit message:**
   ```
   <scope>: <subject>

   <body>

   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   ```

   Commit now? Or adjust the message?
   ```

8. **On confirmation:**
   - Edit the epic file(s) to add Status: Shipped lines.
   - Edit `docs/audit/EPICS.md` to update tally.
   - Stage relevant files: the implementation diff PLUS the audit-tree updates.
   - Use `git add` with specific paths (never `git add -A` — could pull in secrets).
   - Commit using a HEREDOC for proper formatting.
   - Run `git status` after to verify.

9. **Suggest next step.**

   ```
   ## Done. Next:
   - `/next` to pick up the next story
   - or `/fan-out <ids>` if you have another batch in mind
   ```

## Chain references

- Final step in the loop: `/next` → `/implement|/fan-out` → `/review` → `/done`.
- Suggests `/next` to restart the loop.

## Edge cases

- **Story marked complete but tests still failing:** STOP. Don't let `/done` paper over an incomplete story. If a test is intentionally skipped or a Status: Engine-finding was logged, name it explicitly in the commit body and confirm with the user before proceeding.
- **Diff includes uncommitted drift unrelated to the story:** surface it. Ask the user whether to stage selectively or to step back and clean up first.
- **Multiple stories shipping in one commit:** OK. Make the commit message reflect the bundle, not just one story.
- **An epic is fully done:** suggest archiving its row in EPICS.md and adding it to `docs/MUSICAL_AUDIT.md` Shipped, but don't do it automatically — that's a bigger restructuring decision.
- **Push to remote:** never auto-push. The user runs `git push` themselves.

## Safety rules

- Never `git add -A` or `git add .` — always explicit paths.
- Never `--no-verify` on hooks unless the user explicitly asks.
- Never amend an earlier commit unless the user explicitly asks.
- Never force-push.
