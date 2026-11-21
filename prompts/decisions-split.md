# Build: the decisions split by area, and PLAN.md's old state retired (#2259)

You are working on Ensemble, a backing band in a browser. This job changes no behaviour of the band: it is housekeeping of the repository's written record. The owner, Brandon, decided on 2026-11-21 that the state of the work lives on GitHub issues and pull requests, and knowledge stays in the repo as markdown. Two things are left over from before: `PLAN.md` still carries a long "Resume here" section of state, and `DECISIONS.md` is one append-only file (about 3,100 lines, 660 KB, 159 `## ` sections) that parallel sessions both append to and conflict on.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2259 --jq .body`. Two corrections to it: there are 49 ear cases, not 86 (36 cite `DECISIONS.md`, 13 cite `PLAN.md: Resume here`); and `scorecard/ear-cases.json` also has a `leftOut` list, which you must read and treat the same way.

Read first: `CLAUDE.md` (its standing rules bind you), `docs/TESTING.md` (binding: only its four kinds of test; this job adds none), `DECISIONS.md`'s section "state goes to GitHub, knowledge stays in the repo", `packages/cli/src/commands/ears.ts` and `packages/cli/src/passed.ts`, `.cycle/overlays/` and `.github/workflows/ci.yml`.

## What to build

1. **Split `DECISIONS.md` into `docs/decisions/<area>.md`.**
   - Areas, roughly: soloist, drums, bass, chords (the comping seat), styles and meters (a style's whole band, a new style, a meter), critic and scorecard (measures, ear cases, his verdicts by ear where they are not about one seat), audio and packs, app, hosting and release, pipeline and repository, engine and chart format. Adjust the list to what the file holds; aim for about ten files, none tiny, none most of the whole.
   - **Every `## ` section moves whole**: heading word for word, body byte for byte, `### ` sub-sections with it. Never split a section, never reword one. A section that spans two areas goes to the part it changed most.
   - Within a file, sections keep their original relative order (it is chronological).
   - Any text before the first `## ` (a preamble) goes into `docs/decisions/README.md` or the fitting file; say which.
   - **Do it with a script, not by hand**: a mapping of every heading to its area (a JSON file) and a script that splits by it. Keep both under `out/decisions-split/` in the worktree (not committed; `out/` paths are ignored one by one in `.gitignore`, so add `out/decisions-split/`). The split will be re-run after a rebase, because another open pull request appends to `DECISIONS.md`; the script must fail loudly on a heading that is not in the mapping, and on a duplicate heading it cannot place.
   - `docs/decisions/README.md`: short. Which file holds what, where a new decision goes, that sections are appended at the end of their area's file, and that an ear case cites `docs/decisions/<area>.md: <heading>`.
   - `DECISIONS.md` is deleted (`git mv` is not possible for a split; delete it in the same commit that adds the files).

2. **`PLAN.md` loses "Resume here"** (the whole section and its `### Stage …` sub-sections, to the next `## `).
   - 13 ear cases cite `PLAN.md: Resume here`: Brandon's words that they quote must still be findable. For each, find the passage in "Resume here" that holds the words and move those passages, verbatim, into a section of a decisions file (one section, headed plainly, e.g. "his verdicts once kept in PLAN.md's Resume here", in the critic file, saying where they came from); repoint those cases' `source`.
   - For the rest of "Resume here": most is history that the decisions and git already hold; drop it. Where something is still **live and not on an open issue** (a wish not filed, a thing still waiting on him), do not file anything yourself: list each in your report with the passage, so the engineer can file it. Check open issues first: `gh api "repos/brndnsh-labs/Ensemble/issues?state=open&per_page=100" --jq '.[] | "\(.number) \(.title)"'`.
   - "Resume here" holds a private network address on one line. It goes with the section. After your change, `git grep -nE '192\.168\.|\b10\.[0-9]+\.[0-9]+\.[0-9]+'` must find nothing in the tree (other than a lockfile false hit, if any; say what you saw).
   - Fix the rest of `PLAN.md` where it points at "Resume here" or at `DECISIONS.md`.

3. **Every reference moves in the same change.** `git grep -n 'DECISIONS'` and fix each: ear cases' `source` (file and the same heading), the `about` line of `ear-cases.json`, code comments, scripts, tests, `docs/`, `prompts/` (old briefs are history: leave their text alone, and say so in the README rather than rewriting them; decide and say), `CLAUDE.md`, `.claude/agents/ear-reviewer.md`, and `.cycle/overlays/` then run `cycle update` and `cycle check` (never hand-edit `.claude/skills/`). Where a comment says "`DECISIONS.md`, \"<heading>\"", name the new file. Where it says only "log it in `DECISIONS.md`", say `docs/decisions/` (its area's file).

4. **The references are checked where they are read.** In `pnpm ears` (`packages/cli/src/commands/ears.ts`): every case's `source` (and `leftOut`'s, if they have one) must name a file that exists and a `## ` or `### ` heading in it; a miss fails the command with the case's id and the source, non-zero exit. Read how a source names its heading today (a heading may be given in part, or several joined); match what is written, do not rewrite 49 sources to suit a stricter parser unless one is truly ambiguous, and say which. Add `pnpm ears` to CI's `build` job beside `pnpm score` (it must not need more git history than the job has: check `fetch-depth` in the workflow and what `ears` reads from git; if it needs full history and the job is shallow, make the source check a flag, e.g. `ensemble ears --check`, that reads no history, and run that in CI. Decide and say). No new test file.

## What holds it

- **`pnpm ears` prints byte for byte what it printed before** but for anything your check adds (it should add nothing on success). The output before is saved at `/tmp/claude-1000/-home-brandon-code-ensemble/3001e2ba-6e91-487f-adea-58ceea1c543a/scratchpad/ears-before.txt`: diff against it.
- **No heading lost, no text changed**: write the check into the split script (the multiset of `## ` headings across `docs/decisions/*.md` equals the old file's; each section's body is byte for byte the old one's) and paste its result.
- **Plant a fault**: a wrong heading in one ear case's `source`; `pnpm ears` must fail naming the case; remove it and see it pass. Say so.
- `git grep -n 'DECISIONS\.md'` finds only what you chose to leave (old briefs under `prompts/`, the README's note); list them.
- `pnpm check` (budget 28 s), `pnpm score` (no movement; 120 s), `cycle check` clean. Run timed things alone; if only a time budget is exceeded, rerun alone before believing it. You may not raise a budget.
- Nothing under `packages/engine`, `packages/styles`, `packages/audio` or `packages/app` changes but comments.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2259`, branch `decisions-split` from `origin/main`, installed. Work only inside it. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, do not file or edit issues, add no dependency.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend): the `ears` check first (it passes on the old file), then the split with every reference, then `PLAN.md`, and this brief (`prompts/decisions-split.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Under 400 words, read by the engineer who will check and merge: the files made and how many sections and lines each holds; the judgement calls on where spanning sections went (the five hardest, a line each); what happened to the preamble; the 13 `PLAN.md` cases and where their words now are; every live thing from "Resume here" not on an open issue, with its passage; what you left saying `DECISIONS.md` and why; how the `ears` check reads a source, what you planted, and what CI runs; the exact results and times of `pnpm check`, `pnpm score`, `pnpm ears` (diff against before), `cycle check`; how to re-run the split after a rebase; what you are unsure of.
