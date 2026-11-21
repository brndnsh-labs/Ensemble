# Build: intensity through who plays, not only how hard (#2240)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2240 --jq .body`. In short: the band gets louder and busier as the arc rises, but in an open jam everyone plays nearly all the time. Bands also build by who is in: a chorus with the piano out under the soloist, a breakdown to drums and bass, everyone back for the top. Song mode can already lay a seat out by a chart's arrangement block (`docs/CHART_FORMAT.md` section 11); a jam never does it by itself.

## What to build

- **The planner gains the concept once**: in a jam, a seat may be laid out for a whole section or pass at a low point of the arc, by style data. Which seats, where on the arc, how long and how often are data (`packages/engine/src/plan/`, each style's data). A style may never do it.
- **A chart's own arrangement block always wins**, and song mode is exactly what it was.
- **Draws are keyed by position**, as the rest of the plan is, so an edit to a chart stays local and extending an open-ended plan changes nothing already generated.

## The guards (each is a requirement; where one cannot hold, stop and say so rather than loosen it)

- **It reads as arranged, not as a dropout**: a seat goes out at the top of a section or pass and comes back at the top of one, never mid-phrase. The bar before it goes out and the bar it returns in are played as the style plays an ending and an entrance (check what the seat's player does at a lay-out today, in song mode, and say).
- **Never the opening pass, never the last pass, never the arc's peak.** A band that thins is at a low point of the arc or under a soloist; it is all in for the top.
- **Never fewer than the style's minimum**: decide per style which seats may never lay out (the drums and the bass hold most styles together; say what the notes say). At most one seat out at a time unless a style's notes ask for a breakdown to two (funk's drums and bass alone is one such; decide from the notes).
- **The soloist is not laid out by this.** Where the soloist plays, the lay-out is of the band under it (jazz: the piano strolls, bass and drums only, for a chorus; see what the notes say of strolling). Where there is no soloist, decide per style whether anything lays out at all.
- **Rare**: at most one lay-out in any four passes, and none in a jam shorter than four passes. Brandon has left how often to our judgement; err toward seldom. A style's chance may be well under one.
- **The player's own switches are separate**: a seat he has switched off in the app is simply absent (`--without`); the planner's lay-outs concern only the seats that are in. A band of two seats or fewer lays nothing out.
- **No new control in the app and no option on the take.** If, having built it, you think it needs to be an option (as the tempo's breathing became one, at his word, because he also practises to the band), say so at the top of your report with the reason; do not build the option.
- **The laid-out seat is silent**: no note of that seat sounds in those bars, and none rings over from before beyond what its player does at a lay-out today.

## Your calls, each logged with a line of why (musical forks do not wait on Brandon)

For each of the eight styles: whether it lays anyone out; which seat or seats; under the soloist or without; where on the arc; for a section or a pass; the chance. Read each style's notes in `docs/music-notes/c-styles.md` and the parts on the arc and the band, and cite what you rest on; where the notes are silent, say it is your judgement. Likely: jazz (the piano strolls a chorus under the soloist), funk (a breakdown), reggae (a dub drop-out is the style's own idiom: see whether the notes say so), the blues and rock (perhaps the chord seat out for a chorus under the soloist, perhaps nothing), disco (a breakdown is idiomatic; see the notes), neo-soul and acoustic (perhaps nothing).

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test); `docs/CHART_FORMAT.md` section 11; `docs/MUSIC_NOTES.md` and its parts on the band, the arc and each style; `docs/decisions/README.md`, then `docs/decisions/engine.md` (the plan, the arc, the arrangement, and the last section, on the tempo that breathes, for how the arc is read pass by pass) and `docs/decisions/styles.md`; `packages/engine/src/plan/` whole; how each player treats a bar its seat is laid out of; `packages/engine/src/critic/measures/band.ts`; `test/band.test.ts`, `test/takes.ts`; `packages/app/src/play/` only to check the app shows a laid-out seat sensibly (the players' lamps, the band blocks): change nothing there unless something breaks, and say what you saw.

## What holds it

- **A measure first, in its own commit, reading nought on the starting commit**: the share of a jam's bars with a seat laid out, per style and per seat (reported, on the scorecard).
- **Then properties, each made to fail by a planted fault that you remove** (say which): never fewer than the style's minimum seats; a seat goes out and returns only at a section's or pass's top; a laid-out seat's bars are silent; never in the opening pass, the last pass or the peak; at most one in four passes; a chart with an arrangement block, and every song-mode take, plays exactly as before; extending an open-ended plan changes no pass already generated; a jam told to finish brings everyone back for the ending.
- **Goldens**: `pnpm goldens`; say in the decisions which moved and why. A style that never lays out: unmoved. If a golden moves in a style that never lays out, something leaked: find it.
- **Scorecards**: `pnpm score` before and after. A band with a seat out for a chorus will move measures that are means over bars (the comp's strokes a bar, overlap with the soloist, and so on): report every measure that moved, and for each say whether it moved because bars are now empty or because the notes played changed. Where a measure of a seat should read only the bars the seat plays, fix the measure for laid-out bars only, and prove that with no lay-out it reads what it read. Accept (`pnpm -s ensemble score --update`) only movement this brief asks for, never a drop past tolerance. Then run `pnpm score` again and paste each moved style's "against what he has passed by ear" block.
- **Budgets you may not raise**: `pnpm check` 28 s (about 26 now, so there is little room: make new properties cheap, reuse takes the suite already makes), `pnpm score` 120 s (about 67), `pnpm test:full` 84 s (about 73), `pnpm smoke` 60 s. Run timed things alone; if only a time budget is exceeded, rerun alone before believing it.
- **The engine stays pure**; styles are data.
- **Decisions** go in `docs/decisions/engine.md` (the planner's concept) and `docs/decisions/styles.md` (each style's call), as new `## ` sections appended at the end (see `docs/decisions/README.md`).
- Everything under `out/` is ignored already but a few kept folders: a new page needs no line in `.gitignore`.

## For his ear

Make `out/who-plays/` in your worktree (not committed), in the manner of `/home/brandon/code/ensemble/out/tempo-breathes/` and `/home/brandon/code/ensemble/out/solo-held/` (read their `src/` and `index.html` for how they were made). For each style that lays a seat out, one chart of its own, a jam of eight passes on a seed where a lay-out is drawn (find one; say how), with the soloist where the lay-out is under it: `main` and this build on the same seed. Beside each clip, a strip drawn by pass and section showing which seats are in (an inline SVG), the arc's level under it, and the time in the clip where the seat goes out and where it returns. Quote from `ensemble read` the bar before it goes out, the first bar it is out, and the bar it returns. One style that never lays out, beside `main`, with the statement that its events are identical if they are. Say what the numbers show; nothing about how it sounds. Use `.mp3` clips.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2240`, branch `who-plays` from `origin/main`, installed. Work only inside it. Do not touch the main tree except to read the two pages named above. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, do not file or edit issues, add no dependency, make no network requests but the one `gh api` read above.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend, never reset a commit away, never `git stash`): the measure first, then the properties, then the planner, then each style's data with goldens, scorecards and the decisions, and this brief (`prompts/who-plays.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); ports 8765 and 8766 are the owner's: leave them alone. Foreground `sleep` is blocked. Leave no shell, server or browser running when you finish.

## The report

Under 500 words, read by the engineer who will check and merge: whether you think it must be an option, first; what the planner gained and how a style writes it; each style's call in a line with what it rests on; the measure per style and seat; the properties and the faults you planted; what each seat's player does going out and coming back; goldens and scorecards in numbers, with each moved measure sorted into "bars now empty" or "notes changed"; the by-ear blocks; exact results and times of `pnpm check`, `pnpm test:full`, `pnpm score`, `pnpm smoke`; for one take per style, the seats in for each pass as a list; where the page is and whether its clips rendered; what you are unsure of.
