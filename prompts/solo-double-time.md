# Build: double-time bursts in a solo's build (#2238)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear. This brief is about the last thing on the list of what the soloist (`packages/engine/src/players/solo/`) lacks: a burst of notes at twice the style's running subdivision for part of a phrase, late in a solo, as part of its build.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2238 --jq .body`.

Brandon's worry, in his words: "that sounds like it could be distracting or surprising if we don't do it right". He agreed to the design below. Every point of it is a requirement, not a suggestion; where you find one cannot hold, stop and say so rather than loosen it.

## What he agreed to

- **What it is**: for half a bar to two bars, the soloist runs at twice its style's running subdivision (jazz's swung eighths to sixteenths, rock's eighths to sixteenths, the blues' triplet eighths to six a beat; in six and twelve, twice the pulse's own division). Decide from the notes what "twice the running subdivision" is per style and meter, and log it.
- **Earned**: a burst only follows a phrase that was already at the style's busiest level (or is the busy continuation of one). Never straight out of a sparse phrase or a breath.
- **Late**: only late in a solo: its last chorus, or the climb to its top note (the climb has its own ways; decide how a burst meets it). Never the solo's first phrase.
- **Short and rare**: half a bar to two bars; at most one a chorus; at the default setting at most one in a whole solo, and often none. None at the bottom of `soloDensity`; more toward its top.
- **It goes somewhere**: a run with a direction (up to the solo's high point, or a cascade down), through the style's note pool, chord tones on the beats as now (SO-02, SO-24, SO-29), and it **lands**: ends on a chord tone on a beat, held, by the soloist's existing landing rules.
- **On the grid**: starts and ends on the beat grid; no burst note off the doubled grid.
- **Playable**: a ceiling in notes a second for each soloist instrument (in the instrument's data, with a comment saying where the number comes from; no number recalled without a source or a reason you can write). At a tempo where the burst would exceed it, it is not offered. Never squeezed, never thinned to fit.
- **Clear of the band**: the comp already answers the soloist; check by reading that it does not crowd a burst, and say what you found.
- **By style**: jazz yes (most at home); blues and rock yes, as a flurry before the climax; disco rare; funk none (it already runs in sixteenths; doubling it is shred, not funk); reggae, acoustic and neo-soul none. Jazz ballads (slow charts): a short double-time run is allowed, only toward the top of the setting; decide what makes a chart a ballad here and log it.
- **No burst drawn, no change**: with no burst in a take, it is byte for byte what `main` plays. Goldens at the default move only where a burst is drawn; say which.

## Lessons from the last build of this kind (#2237; read its `DECISIONS.md` section and "what the reviews found")

The first build of #2237 failed both reviews. Do not repeat its faults:
- **A burst is a candidate the critic judges**, not something swapped in after the critic chose (`SoloCandidate`, `SOLO_FEATURES` in `critique.ts`, `play.ts`). If the critic's features would wrongly punish or favour a burst, fix the feature for bursts only, and prove that with no burst every take is byte for byte `main`'s (check `pnpm goldens` writes main's files with every burst chance at nought).
- **Every property clause must be able to fail**: plant a fault for each (a burst out of place, over the ceiling, not landing, after a sparse phrase) and see it fail, then remove the fault. Say in the report which you planted.
- **Read what you built** with `pnpm -s ensemble read <chart> --solo --seats solo,chords --bars a-b` before you report: every burst on the page, and enough others to be sure.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test); `docs/MUSIC_NOTES.md` and `docs/music-notes/b-comping-soloist.md` (the soloist's `SO-` notes and the `Q-` rules: SO-02, SO-10, SO-13 to SO-19, SO-24, SO-28, SO-29 at least) and each style's soloist section in `c-styles.md`; in `DECISIONS.md` every section on the soloist from "a busier soloist" on, especially "Double time is not owed for the slider's sake" and the #2237 sections; `packages/engine/src/players/solo/` whole; each style's `solo.ts`; `test/soloist.test.ts`, `test/takes.ts`; `packages/engine/src/critic/measures/solo.ts` (`solo.builds`); `prompts/solo-displaced.md` for how the last build was asked for.

## What holds it

- **A property or a measure first, in its own commit, failing or reading nought on the starting commit**: bursts appear only where the style's data allows, never over the instrument's ceiling, only after a busy phrase and late in a solo, and land. A reported measure for how often a burst is played (share of solo phrases, per style) on the scorecard.
- **`solo.builds`** should recover in rock and the blues (and jazz) toward what it read before the busier soloist (`f2cea737`): say the numbers, before and after. If it does not move, say so plainly; do not tune to it.
- **The band is untouched** but where the comp already answers the soloist. Goldens with no soloist stay byte for byte. `pnpm goldens` where a burst is drawn, and say in `DECISIONS.md` which.
- **Scorecards**: `pnpm score` before and after. Report every measure that moved; accept (`pnpm -s ensemble score --update`) only movement this brief asks for, never a drop past tolerance. Then run `pnpm score` again and paste each moved style's "against what he has passed by ear" block.
- **Budgets you may not raise**: `pnpm check` 28 s (about 24.5 now), `pnpm score` 120 s (about 63), `pnpm test:full` 84 s (about 67). Run timed things alone; if only a time budget is exceeded, rerun alone before believing it.
- Stay out of `packages/app/`, `packages/audio/` and the other seats' players.
- **Styles are data**: the engine gains the concept once; which styles, how long, how often, the ceiling, are data. Log each musical call in `DECISIONS.md` with a line of why; musical forks do not wait on Brandon.

## For his ear

Make `out/solo-double-time/` in your worktree (not committed), in the manner of `/home/brandon/code/ensemble/out/solo-displaced/` (copy its `src/` to read how it was made). Jazz (one swing chart and one ballad), the blues, rock and disco, one chart of each style's own with the soloist; each at three settings: `soloDensity` 0 (no bursts), the default, and 1; the same seed throughout, and `main` beside the default. Under each clip: how many bursts, and for each its bars, the bar and beat it starts, its notes a second, where it lands, and its time in the clip. Quote each burst from `ensemble read`. Say what the numbers show; nothing about how it sounds. Use `.mp3` clips.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2238`, branch `solo-double-time` from `origin/main`, installed. Work only inside it. Do not touch the main tree except to read `out/solo-displaced/`. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, add no dependency, make no network requests.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend): the property or measure first, then the engine and styles, then goldens and scorecards with `DECISIONS.md`, and this brief (`prompts/solo-double-time.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is the owner's listening server: leave it alone. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Under 500 words, read by the engineer who will check and merge: what the engine gained and how a style writes it; each musical decision in a line; the ceilings and their sources; the property and the measure, what each read before, and the faults you planted; goldens and scorecards in numbers, `solo.builds` before and after; the by-ear blocks; exact results and times of `pnpm check`, `pnpm test:full`, `pnpm score`; three bursts quoted from `ensemble read` with the phrase before each, from three styles; where the page is and whether its clips rendered; what you are unsure of.
