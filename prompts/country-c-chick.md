# Build: country's open C chick has no root (#2302)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band plays it in one of nine styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue and its comment: `gh api repos/brndnsh-labs/Ensemble/issues/2302 --jq .body` and `gh api repos/brndnsh-labs/Ensemble/issues/2302/comments --jq '.[].body'`. In short: country's guitar chick on a C chord is `E3:3 A3:6* G4:5` (C6) or `E3:3 A#3:b7 G4:5` (C7): three notes, no root, the B string silent. The data's own comment (`packages/styles/src/country/chords.ts`, near lines 20 to 22) says "C6 is x32210 … on the top four strings", whose top four strings are E3 A3 C4 E4; CH-24 writes C7 as x32310. And since #2300 (merged), a rule picks a grip by what a top-string strum sounds, which left A13 as F#3 A3 C#4 G4 where the open shape x02022 is E3 G3 C#4 F#4.

You work in this worktree (`.work/2302`, branch `fix/2302-country-c-chick`, from `origin/main`). Never `cd` out of it. Do not read the `legacy` branch or `~/code/ensemble-legacy`. Another worktree, `.work/2298`, is someone else's: do not touch it.

## Stop early, once, before building

Find the cause, then send back a short report and **stop** for an answer before changing code:

1. For every open shape country can be asked for (each root, as a plain major on the I and IV with its 6th, a plain major elsewhere, a 7th, a minor, a minor 7th, a 13th, a sus, a slash chord: the qualities the library's country charts use, and the thirteenths), what the chick sounds today on the top four strings with a bassist, beside what the open-position shape a player would use sounds on its top four strings (CH-24 to CH-29 in `docs/music-notes/`, and the data's comments). A table: chord, notes sounded, notes of the shape, same or not.
2. Why they differ where they do: is the shape the data describes not the one the hand takes (how grips are generated and chosen: `packages/engine/src/players/chords/guitar.ts`, `voicing.ts`, `idiom.ts`), are the strings struck not the top four of that grip, or is the voicing built from the chord's tones under constraints (open strings, a fret span, a register target) that prefer G4 on the first string over C4 and E4?
3. The smallest fix you would make, as data where it can be data, and what in country's 4/4 it moves: how many strikes on the six 4/4 country library charts change, and on which chords.
4. The property that would hold it, and its cost.

## What to build (after the answer)

Whatever the early stop agrees. The intent: with a bassist, country's chick sounds the top four strings of the open shape a player would hold, four notes where the shape has four, the root among them where the shape has it there.

## What holds it

- **A property first, in its own commit, failing**, then the fix. Only the four kinds in `docs/TESTING.md`. A planted fault you then remove.
- **This changes a band Brandon has passed by ear** (country in 4/4). So: `pnpm goldens` if country's goldens move, saying why in the decisions; `pnpm score` before and after; list every measure that moved and why. **Do not run `score --update`.** If country's "against what he has passed by ear" block reads outside what was passed, or a measure drops past tolerance, that is his to accept: report the block and stop there. If it reads inside with nothing past tolerance, report that and I will decide the update.
- No other style may move: hash other styles' takes before and after (every library chart in its own style, two seeds) and show none differs.
- **Budgets, in CPU seconds, which you may not raise**: `pnpm check` 220 (about 205 now: there is little room, so make the property cheap and reuse takes), `pnpm test:full` 660 (about 631), `pnpm score` 150, `pnpm smoke` 60 s on the clock. Run targeted tests while you build; I run the full gates alone.
- The engine stays pure; styles are data; boundaries hold (`CLAUDE.md`).
- **Decisions** in `docs/decisions/styles.md` (and `engine.md` if a concept changes), as a new `## ` section appended at the end, dated 2026-11-22 with `#2302`.

## For his ear (not committed)

A page at `out/country-chick/index.html`: a bar of C, a bar of C7 and a bar of A13 before and after (render the before clips first, from the branch point), the guitar alone and with the band, in 4/4, with the notes of each strike beside each clip, and one whole chorus of a country library chart before and after. `pnpm render:audio`. No claim about how anything sounds.

## Rules of the house

- Commit as you go, on this branch only, explicit paths (`git add <path>`, never `-A`), never `--no-verify`, never amend, never force. Commit messages end with `Co-Authored-By: Claude Opus <noreply@anthropic.com>`. Check `git config user.email` reads the no-reply address before the first commit. Do not push; do not open the PR.
- The repository is public: no secrets, no private addresses, nothing about the network.
- Never hand-edit `.claude/skills/`. No bare `git stash`. Scratch files under `out/` only.
- If a permission is denied, do not work around it: say so.
- Leave no server or shell running; say what you started and that you stopped it.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `docs/music-notes/` on the guitar (CH-24 to CH-32) and country (ST-country-06, 07); `docs/decisions/styles.md` on country (the style, its ending, country in three and the grip rule from #2300) and `docs/decisions/engine.md` on the guitar's grips and the top-strings rule; `packages/styles/src/country/chords.ts` whole; `packages/engine/src/players/chords/guitar.ts`, `voicing.ts`, `idiom.ts`; the properties on the guitar ("the hand does not growl", "a guitar's chords can be held", the chick on the top four strings) wherever they live under `test/`.
