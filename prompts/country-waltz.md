# Build: country outside 4/4 (#2300)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of nine styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2300 --jq .body`. In short: country writes parts only for 4/4, so in 3/4 (and 6/8, 12/8, 6/4) it plays the generic fit, and two things in that are not country:

1. **The waltz is not the country waltz.** The bass plays one root a bar, never a fifth, and the bar before the end has no walk-up. The notes: ST-country-05 ("A waltz alternates root and fifth bar by bar"), BA-56, ST-country-10 ("the bass always walks up into the last root in the bar before"). `packages/styles/src/country/bass.ts` already names the gap: `otherMeters: "downbeat"`, "a build of its own".
2. **The guitar's chick takes the low strings, under the bass**, in every meter but 4/4 (down to E2, at the bass's root on Em), where 4/4 keeps to the top four strings. ST-country-07: the top four strings; the pick takes the low strings only with no bassist.

You work in this worktree (`.work/2300`, branch `feat/2300-country-waltz`, from `origin/main`). Never `cd` out of it. Do not read the `legacy` branch or `~/code/ensemble-legacy`.

**This branch has no `--meter` flag** (that is #2298, not merged). The issue's reproductions use it; here, read country on charts written in the meter: `pnpm -s ensemble read library/acoustic-waltz-c.chart --style country --passes 2 --seed 2`, `library/jazz-waltz-f.chart`, and for twelve `library/blues-slow-12-8-g.chart`. `grep -l "meter:" library/*.chart` lists the rest.

## Stop early, once, before building

Read first (below), then send back a short design and **stop** for an answer before writing code:

1. What country plays today in 3/4, 6/8, 12/8 and 6/4, seat by seat (drums, bass, chords, soloist if asked), with the bars read, and which of it the notes contradict. Beyond the two things above, anything else the notes ask of a country waltz (the drums: brushes or a cross-stick on 2 and 3? the guitar: boom-chick-chick with the bass taking the boom? the ending in three?) with the note each rests on, or "the notes are silent".
2. What each fix needs: which is style data today, and which needs a concept the engine does not have (a bass figure that alternates bar by bar while a chord holds; the country ending's walk-up in a bar of three; the chick's strings in the plain path). For each missing concept, the smallest general form of it, as the engine would offer it to every style.
3. The measures or properties that will hold it, and what they cost the budgets (below).
4. Whether a country waltz chart belongs in the library (a plain progression in the style, not a named tune: a named tune needs published sources, which is not this issue), so the scorecard scores country in three. Say what it costs `pnpm score`.
5. Scope you would cut. 6/8, 12/8 and 6/4 are not country's own meters: only the chick's strings is asked of them. Do not write country parts for those.

## What to build (after the answer)

- **The country waltz bass**: in a bar of 3/4 with one chord, the root on 1; while the chord holds, the next bar takes the fifth (below the root where the register allows, as ST-country-05 has it for 4/4), then the root again. Into a change, what the notes say a country bass does in three (read ST-country-05 and BA-56 and the bass part of the notes; where they are silent, say it is your judgement and keep it plain).
- **The walk-up into the last root** in the bar before the end, in three, as `WalkPolicy.ending` does in four (`packages/engine/src/players/bass/home.ts`; read `docs/decisions/styles.md` on country's ending, merged as #2290, including the calls made in its review).
- **The chick stays off the low strings while there is a bassist**, in every meter. With no bassist the pick takes the boom, as now.
- **Whatever else the early stop agrees.**
- Country in 4/4 does not move: its goldens and its scorecard stay as they are. Other styles do not move. If one does, something leaked.

## What holds it

- **Measures or properties first, in their own commit, failing or reading the fault**, then the data and code. Only the four kinds in `docs/TESTING.md`. Each property made to fail by a planted fault you then remove (say which).
- **Budgets, in CPU seconds, judged locally by `scripts/budget.ts`. You may not raise one or change its rule**: `pnpm check` 220 (about 200 now), `pnpm test:full` 660 (about 612), `pnpm score` 150 (about 98), `pnpm smoke` 60 s on the clock. Reuse takes the suite already makes.
- **Another builder is at work on this machine** (on #2298, in `.work/2298`). Run targeted tests while you build; I run the full gates alone afterwards. Do not touch `.work/2298`.
- **The engine stays pure; styles are data; boundaries hold** (`CLAUDE.md`). A concept is added to the engine once and expressed as data in country.
- **Goldens**: `pnpm goldens` only if a golden must move; say which and why in the decisions.
- **Scorecards**: `pnpm score` before and after. Accept (`pnpm -s ensemble score --update`) only movement this brief asks for, never a drop past tolerance: a drop past tolerance, or a property you would need to weaken, is Brandon's, so stop and report it. Paste country's "against what he has passed by ear" block.
- **Decisions** in `docs/decisions/styles.md` (country's calls) and `docs/decisions/engine.md` (any concept), as new `## ` sections appended at the end, dated 2026-11-22 with `#2300`.

## For his ear (not committed)

A page at `out/country-waltz/index.html`: country on a 3/4 chart before (from `origin/main`: render it first, before you change anything) and after, bass alone and the band, and one clip in 12/8 for the chick, each with what was measured beside it and what the notes ask for in plain words (he does not play much country). `pnpm render:audio`. No claim about how anything sounds.

## Rules of the house

- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`.
- If a permission is denied, do not work around it: say so.
- Leave no server or shell running; say what you started and that you stopped it.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `docs/MUSIC_NOTES.md`, then in `docs/music-notes/` the bass part (BA-51 to BA-56 and around), the chord instrument's part on the guitar (CH-24 to CH-29), and country in `c-styles.md` (ST-country-01 on); `docs/decisions/README.md`, then `docs/decisions/styles.md` on country (the style, its ending) and what `engine.md` says of meters and of `otherMeters`; `packages/styles/src/country/` whole; how another style writes its 3/4 (`packages/styles/src/jazz/`, `acoustic/`) and how the engine reads a style's parts for a meter (`packages/engine/src/perform/meter.ts`, `style/meters.ts`, the bass player's figures and `otherMeters`, the chord player's `plain` path); `packages/engine/src/critic/measures/` for bass and chords; `test/bass.test.ts` (the last-bass-note property and `HOME_CHARTS`), `test/takes.ts`.

## Report

What you built, file by file in a line each; each call and why; the planted faults and what each failed with; goldens and scorecards with the commands' output; the budgets as you last read them; what is unproved; what you were unsure of.
