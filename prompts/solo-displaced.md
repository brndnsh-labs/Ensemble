# Build: an idea said again a beat early or late (#2237)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear. This brief is about one thing the soloist (`packages/engine/src/players/solo/`) still lacks, third on the list proposed to him (`PLAN.md`, "What the soloist still lacks"): a player who has found an idea also says it again displaced, a beat early or a beat late, so that it falls across the bar differently.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2237 --jq .body`.

## What is there now

A soloist's phrase is made in one of the "ways" a style's book offers (`Way` in `players/solo/style.ts`; `phrases.ts` makes each). The ways that say an idea again (`again`, `tail`, the grown one, the riff) keep what is remembered **by position in the line**: `remembered` and `rememberedBends` in `phrases.ts` look a pitch and a bend up by the bar and the onset it was at (`idea.bars[i].pitches[spot.onset]`), and `line.ts` fits them to the chord now under them (SO-33). So an idea always comes back at the same place in the bar. Nothing can say it a beat sooner or later.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test); `docs/MUSIC_NOTES.md` and `docs/music-notes/b-comping-soloist.md` (the soloist's notes `SO-`, the `Q-` rules; look for what they say of repetition, sequence, displacement, rhythmic variation of a motif, and of where a phrase may start and must end: SO-10, SO-33, SO-36 to SO-39, Q-36, Q-43 at least), and each style's soloist section in `c-styles.md`; in `DECISIONS.md` every section on the soloist, ending with "the soloist's pickups: checked and merged" and the pitch moves and slides after it; `packages/engine/src/players/solo/` whole; each style's `solo.ts`; `test/soloist.test.ts`, `test/takes.ts`; `packages/engine/src/critic/measures/solo.ts`; `prompts/solo-pickups.md` for how the last build of this kind was asked for.

## What to build

- **A concept in the engine, once**: an idea being said again may be placed a beat early or a beat late. "A beat" is the bar's own pulse (`perform/meter.ts`: the quarter in 4/4, the dotted quarter in 6/8 and 12/8), so six and twelve work without a special case. The displaced idea is recognisably the same idea: the same rhythm and the same contour, shifted; its pitches are fitted to the chords now under them by the rule every remembered note already follows (SO-33), and it keeps its bends as a repeated idea does.
- **Styles are data**: whether a style does it, how often, whether early or late is the commoner, and in which of its levels or parts of the form, are written in the style's `solo.ts`, not in the engine. If expressing this needs an engine change per style, the concept is wrong: fix the concept.
- **The musical choices are yours**, from the notes and each style's own character: which styles (a style where the honest answer is "seldom" gets a small chance, not none, unless you can say why none), how often, early against late, what happens to a note pushed past the bar or pulled before it, and what happens at a section's end, a chorus's top, the solo's last phrase and the tune's ending. Log each in `DECISIONS.md` with a line of why. Brandon has agreed that musical forks do not wait on him.
- **What must stay true**: a displaced idea never pushes a note past the phrase's end or the tune's end, never starts in a count-in or over the breath the phrase before must leave (SO-10, SO-37: the existing breath property stays true), never takes a pickup's place wrongly (decide how the two meet and say), and lands by the soloist's existing landing rules. Every existing soloist property holds unchanged.
- With the chance at nought in a style, that style's takes are byte for byte what they were.

## What holds it

- **A property or a measure first, in its own commit, failing or reading nought on the starting commit** (the standing rule): displaced repeats occur where the style's data says they may; each is the idea it repeats (same rhythm and contour, shifted by one pulse); none puts a note past its phrase's or the tune's end. A critic measure for how often an idea comes back displaced (per style, on the scorecard) is wanted too, so the change can be read: say what it reads before and after.
- **The band is untouched** where it should be: the other seats' events on the same seed change only as the comp already answers the soloist. Goldens with no soloist stay byte for byte. Goldens with a soloist will move: `pnpm goldens`, and say in `DECISIONS.md` which and which notes.
- **Scorecards**: `pnpm score` before and after. Report every measure that moved and which way; accept (`pnpm -s ensemble score --update`) only movement this brief asks for, never a drop past tolerance. After accepting, run `pnpm score` again and paste the last block of each style's report ("against what he has passed by ear") into your report: it sorts the change against what Brandon has passed.
- **Budgets, which you may not raise**: `pnpm check` 28 s (it is at about 24.7; a new property must read takes the suite already makes), `pnpm score` 120 s (at about 62). Run timed things alone: nothing else of yours running, and expect another session on this machine to make a run slow now and then; if a run exceeds only the time budget, run it again alone before you believe it. `pnpm test:full` (84 s) before you report.
- Stay out of `packages/app/`, `packages/audio/` and the other three seats' players.

## For his ear

Make the page he will judge from, `out/solo-displaced/` (not committed; `out/` is ignored), in the manner of `out/solo-pickups/` in the main tree (`/home/brandon/code/ensemble/out/solo-pickups/`: copy it into your worktree to read, with the script that made it in its `src/`). For four or five styles where the change shows most, one chart of the style's own with the soloist, the same seed before and after. Under each clip: how many ideas come back displaced, and where each is (bar, beat, early or late, the bar of the idea it repeats), so he can find them. `pnpm -s ensemble read <chart> --solo --seats solo --bars a-b` prints the bars as text: quote the displaced bars beside their originals. Say what the numbers show; say nothing about how it sounds. Rendering audio goes through headless Chrome (`pnpm render:audio`); if it will not run in your worktree, write the page with the transcriptions and the measurements and say that the clips are missing.

## Where you are

Make a worktree and work only inside it:

```sh
cd /home/brandon/code/ensemble && git fetch -q origin
git worktree add -b 2237-solo-displaced .work/2237 origin/main
cd .work/2237 && pnpm install --offline
```

Do not touch the main tree (`/home/brandon/code/ensemble` outside `.work/2237`) except to read `out/solo-pickups/`. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, add no dependency, make no network requests.

Commit as you go, staging files by path (never `git add -A`, never `--no-verify`, never amend): the property or measure first (`test(soloist): ...` or `feat(critic): ...`), then the engine and the styles (`feat(soloist): ...`), then goldens and scorecards with `DECISIONS.md`. Each message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if it does not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`, and quote any glob given to `grep --include`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Your final message is read by the engineer who will check and merge the branch. Under 500 words: what the engine gained and how a style writes it; for each style, what was written and what it was taken from; each musical decision in a line; the property and the measure, and what each read before; goldens and scorecards, what moved, in numbers; the "against what he has passed by ear" block for each style that moved; the exact results and times of `pnpm check`, `pnpm test:full` and `pnpm score`; three displaced ideas quoted from `ensemble read` beside their originals, from three styles; where the page is and whether its clips rendered; what you are unsure of.
