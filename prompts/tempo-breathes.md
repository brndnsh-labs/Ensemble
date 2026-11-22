# Build: the tempo breathes a percent or two with the energy (#2239)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily, mostly on his phone. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2239 --jq .body`. In short: a plan has one tempo (`Plan.tempo`, `Plan.quarters` in `packages/engine/src/plan/types.ts`); a real band pushes slightly as it builds and settles as it comes down. The plan's arc already carries the energy.

## What to build

- **The engine gains the concept once**: each bar has its own tempo, a slow function of the arc's energy around the set tempo. `Plan.tempo` stays the tempo as set (what the player chose and what the app shows). How much a style breathes is style data and may be nought.
- **Everything that turns beats into seconds reads the bar's tempo**: `packages/engine/src/perform/time.ts` (today `(tick / PPQ) * (60 / plan.quarters)`), anything in the critic or the CLI that works in seconds, and the app (`packages/app/src/play/jam.ts` and whatever it feeds: scheduling, the playhead, the players' lamps, the count-in). Find every reader of `quarters` and `tempo`; list them in the report with what each now does.
- **The MIDI export writes the tempo changes** (`packages/engine/src/midi/`), so an exported file matches what was heard. A style with the amount at nought writes the one tempo event it writes today.

## The guards (each is a requirement; where one cannot hold, stop and say so rather than loosen it)

- **Small**: within the style's stated band of the set tempo, at most 2% either way in any style.
- **Slow**: one tempo for a whole bar, never changing inside one; between one bar and the next it moves by no more than a stated step (decide it; about half a percent is the ceiling). It follows the arc, not a single loud bar.
- **Anchored**: the first bar is at the set tempo exactly, so the count-in and the band's entrance agree, and so is every bar when the arc is flat. Over a whole take the mean tempo stays close to the set tempo (state how close, and hold it by a property): a player who set 120 is practising at 120.
- **Local**: a bar's tempo depends only on what is already decided when that bar is planned. Extending an open-ended plan must not change the tempo, or anything else, of passes already generated. No smoothing that looks ahead past what the plan already holds.
- **Deterministic**: the same chart, style, options and seed give the same events and the same seconds.
- **Nought is nothing**: a style with the amount at nought is byte for byte what it was, in its goldens, its MIDI and its seconds.
- **No new control**: nothing is added to the app's screens and no option to the take. (Brandon does not want the interface cluttered; if he wants it off he will say so.)
- **What the app keeps is untouched**: do not change `packages/app/src/stored.ts`, the shape or keys of anything stored, or the service worker. A take is still its chart, style, options and seed. If the work seems to need a stored shape to change, stop and say so.

## Your calls, each logged with a line of why (musical forks do not wait on Brandon)

- The curve from energy to tempo, and what "energy" is read from (the arc's, per section or pass).
- The amount for each style. A style played to a grid or a machine's pulse breathes nothing: disco surely, and decide funk and reggae from the notes. Jazz, the blues, rock, acoustic and neo-soul are the likely ones. Read each style's notes in `docs/music-notes/c-styles.md` and the feel notes; cite what you rest on, and where the notes are silent say that it is your judgement.
- Whether a ballad breathes more or less than an up tune.
- How the amount meets a tempo the player set near a style's limits.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test; the five smoke journeys are fixed); `docs/BRIEF.md`; `docs/MUSIC_NOTES.md` and the parts under `docs/music-notes/` on feel and each style; `docs/decisions/README.md`, then `docs/decisions/engine.md` (the plan, the arc, takes) and the app's sections on playing and export in `docs/decisions/app.md`; `packages/engine/src/plan/` whole; `packages/engine/src/perform/time.ts` and its callers; `packages/engine/src/midi/`; `packages/app/src/play/` (how a take becomes scheduled sound); `test/band.test.ts`, `test/takes.ts`, the golden tests.

## What holds it

- **Properties first, in their own commit**, each made to fail by a planted fault that you then remove (say which): the tempo stays within the style's band; never moves more than the step between bars; the first bar is the set tempo; the mean is within the stated closeness; extending an open-ended plan changes nothing already generated; the same inputs give the same seconds; a style at nought is unchanged; the exported MIDI's tempo map is the plan's (to the file's own resolution: say what that is).
- **A reported measure** on the scorecard: how far the tempo ranges in a take, per style (nought where the style does not breathe).
- **Goldens**: `pnpm goldens` for the styles that breathe; say in the decisions which moved and that the notes did not (if a golden holds ticks and not seconds, it may not move at all: say what you found). Styles at nought: unmoved.
- **Scorecards**: `pnpm score` before and after. Measures read in seconds will move a little in the styles that breathe: report each, accept (`pnpm -s ensemble score --update`) only what follows from this, never a drop past tolerance. Then run `pnpm score` again and paste each moved style's "against what he has passed by ear" block.
- **Smoke**: `pnpm smoke` (60-second budget; journey 5, the exported MIDI matching the CLI's, is the one this can break). Do not add a journey.
- **The scheduler is no later than it was**: `pnpm render:audio` with `live=1` counts late notes; run one breathing take on this build and the same on `main`, and give both counts.
- **Budgets you may not raise**: `pnpm check` 28 s (about 25 now), `pnpm score` 120 s (about 64), `pnpm test:full` 84 s (about 72), `pnpm smoke` 60 s. Run timed things alone; if only a time budget is exceeded, rerun alone before believing it. Make a property cheaper before you let it push a budget.
- **The engine stays pure and the boundaries hold** (`CLAUDE.md`). `audio` learns nothing about tempo beyond the seconds it is given.
- **Decisions** go in `docs/decisions/engine.md` as a new `## ` section appended at the end (see `docs/decisions/README.md`). There is no `DECISIONS.md` any more.

## For his ear

Make `out/tempo-breathes/` in your worktree (not committed; add `out/tempo-breathes/` to `.gitignore`), in the manner of `/home/brandon/code/ensemble/out/solo-double-time/` (read its `src/` and `index.html` for how it was made). For each style that breathes, one chart of its own, long enough for the arc to rise and settle (a jam of several passes, with the soloist where that is how the arc is driven): the same seed flat (the amount at nought, by overriding the style's data in the study script) and breathing; and for two of the styles, a third clip at double the amount, so he can tell what it is he is listening for. Beside each breathing clip, the tempo curve drawn by bar (an inline SVG) with the arc's energy under it, and the numbers: the set tempo, the slowest and quickest bar, the biggest step between two bars, the mean, and how many seconds the take's length differs from the flat one. One style at nought (disco) beside its `main` clip, with the statement that the two files are the same bytes if they are. Say what the numbers show; nothing about how it sounds. Use `.mp3` clips.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2239`, branch `tempo-breathes` from `origin/main`, installed. Work only inside it. Do not touch the main tree except to read `out/solo-double-time/`. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, do not file or edit issues, add no dependency, make no network requests but the one `gh api` read above.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend, never reset a commit away): the properties and the measure first, then the engine, then the app, then the styles' amounts with goldens, scorecards and the decisions, and this brief (`prompts/tempo-breathes.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is the owner's listening server: leave it alone. Foreground `sleep` is blocked. Leave no shell, server or browser running when you finish. Another builder is working in `.work/2256` at the same time: timed runs may read slow; rerun before believing an overrun.

## The report

Under 500 words, read by the engineer who will check and merge: what the engine gained and how a style writes it; the curve, the step and the band in numbers; each style's amount with what it rests on; every reader of the tempo you found and what each now does; the properties and the faults you planted; the measure per style; goldens and scorecards in numbers; the by-ear blocks; the late-note counts on `main` and here; exact results and times of `pnpm check`, `pnpm test:full`, `pnpm score`, `pnpm smoke`; for one take, the tempo of every bar as a list; where the page is and whether its clips rendered; what you are unsure of, above all anything about how the app keeps time on a phone.


## Changed by Brandon, 2026-11-21: it is an option, and steady is the default

After this brief was written Brandon said: "i could see this both ways. i'd like this to be an option for exactly the reason you specified - it'll probably feel cool to play along with, but there's also value in keeping the tempo truly locked for practice".

This replaces the guard "No new control" and changes what "nought is nothing" rests on. Everything else in the brief stands.

- **A take option, off unless asked for**: one boolean on the take's options (name it in the manner of `soloFromTop`; `breathe` is the working name), absent meaning a steady tempo. With it absent, every take in every style is byte for byte what `main` plays: no golden moves, no scorecard moves, the MIDI file has its one tempo event. With it on, the bar's tempo follows the arc by the style's amount as the brief describes (a style whose amount is nought stays steady even with it on).
- **Follow `soloFromTop` end to end**, as the pattern already in the repo: the engine's take options, the CLI flag (`--breathe`, in `packages/cli/src/take-output.ts` and the usage lines in `CLAUDE.md`), `pnpm render:audio` (`breathe=1`), a saved take's JSON and `replay`, the app's `settings.ts` (read as `stored.<name> === true`, so everything already stored reads as steady), `jam.ts`, and a kept take.
- **The app's control**: a choice of two, written as the Solo block's "from the top" choice is written (two pressed-or-not buttons, `aria-pressed`), worded plainly: "Tempo" with "Steady" and "Breathes" (decide the exact words; no jargon). Put it where it adds least to the screen: the More sheet, beside the other things set once, not on the setup sentence. The app's default is **Steady**. Song mode has it too unless the arc is flat there; say what you found. Look at it with `node scripts/look.ts`, light and dark, at phone size, and say in the report where the pictures are.
- **What the app stores**: one boolean added to the settings, read as above. That is allowed now, and only that: no key renamed, no shape changed, nothing migrated, `stored.ts` itself untouched unless a field list there must name the new one (say so if it must), the service worker untouched. Show in the report the exact lines that read and write it, and state that settings stored before this change load as steady.
- **Properties**: run each tempo property on takes with the option on (add breathing takes to the suite's takes as cheaply as the budgets need), and one that says a take without the option has the set tempo in every bar. The planted faults stand.
- **The scorecard measure** is dropped unless the scorecard's takes can carry the option at no cost to the budget: the scorecards score the steady band, and they should not move at all. Say what you did.
- **Smoke**: the five journeys are fixed and none is added; journey 5 runs as it does (steady) and must pass. Check by hand, once, that an export with Breathes on matches `pnpm -s ensemble render … --breathe` for the same take, and say so.
- **The page**: "flat" is now simply the take without the option, so no data is overridden for it; the double-amount clip still overrides the style's data in the study script.
- **Decisions**: record his words above, verbatim, in your section of `docs/decisions/engine.md`, with the option's name, that absent means steady, and that the app's default is Steady until he has heard it.

If you have already built past any of this, change it to match rather than keep both. If you have already committed the brief, append this section to `prompts/tempo-breathes.md` in a new commit.
