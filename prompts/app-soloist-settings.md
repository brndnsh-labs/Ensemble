# Build: two settings for the soloist in the app (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser. The owner plays along with it daily on his iPhone 17 and a laptop. The app's look ("the poster wall"), its screens and its motion are built and passed. This brief adds two settings for the soloist and nothing else.

## The owner's words

2026-11-17:

- "soloist density could use some improvement ... maybe a slider to configure soloist density easily up front?"
- "an option to let the soloist enter immediately and start playing things. this will be most helpful on jazz standards where the soloist has to wait the entire 32 bar form to come in while the rest of the band is already fully in motion"

## Read first

`CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/TESTING.md` (binding); in `DECISIONS.md` "the poster wall, part 1", "part 2", "part 3", "the poster wall in motion" and their "checked and merged" sections; `packages/app/src/` whole, above all `play/PlayView.tsx` (the setup sentence, the tempo sheet with its slider, More), `play/jam.ts` (`JamSetup`, `takeOptions`), `settings.ts`, `takes.ts`, `motion.ts`, `style.css`.

## The contract with the engine

`PlanOptions` (`packages/engine/src/plan/types.ts`) declares two options. Another builder is making the engine read them now; on your commit they do nothing, so you cannot check the music, only that the app passes them.

- `soloDensity?: number`: how busy the soloist is, 0 the sparsest, 1 the busiest, 0.5 the style's own. Left out is the same as 0.5.
- `soloFromTop?: boolean`: in a jam the soloist has the lead from the first time round. Default false: the band plays the form once first. It changes nothing when the chart is played once through as a song.

## What to build

1. **How busy the soloist is.** A slider from sparse to busy, the style's own in the middle, with a plain way back to the middle (as the tempo sheet has a way back to the usual tempo). No number is shown: words at the ends. It moves all the way along (steps of 0.05 or finer). Left at the middle the app passes no `soloDensity` at all, so every take made before this exists is still the same take.
2. **When the soloist comes in.** Two choices in plain words: after the band has played it once (as now), or from the top. Not offered, or shown as not applying, where the chart is played once through as a song.
3. **"Easily up front."** Both are reached from the chart's screen before Play in one tap from where the soloist is already turned on or off there, not from More. How (a sheet in the manner of the tempo sheet is the obvious one) is yours: use what the app already has, keep the setup sentence true (decide whether it says anything when a setting is off its default, as it does for a meter that is not 4/4), and say what you chose. With the soloist sitting out, the settings are still reachable but say plainly that the soloist is not playing.
4. **Remembered.** These are the player's taste, not the chart's: one setting for every chart, kept with the settings that are (`settings.ts`; see how `band` and `minutes` are kept and how an older saved settings file is read without them). A kept take keeps the options it was played with and replays as it was (`takes.ts`): check that a take kept with these set plays again with them, and one kept before them plays as before.
5. **While playing.** A take is planned from its options when Play is pressed. Follow what the app already does for a setting that cannot change under a take that is running (the style's instruments are settled before Play): do the same here and say what.

## What must not break

- Everything the app does now. The five smoke journeys pass against the built app (`pnpm app:build && pnpm smoke`); change a step only where the screen changed under it, say exactly what, and do not weaken what a journey proves. Add no test: `docs/TESTING.md` rations them.
- `pnpm check` passes (run it alone: it is timed, 20 s, and is at 19.6 on a quiet machine; another builder is using the machine, so if it runs over only because of load, time the starting commit beside it and report both).
- Only `packages/app/`. Nothing in `packages/engine`, `packages/styles`, `packages/audio`, `test/`, `library/`, `scorecard/`, `tools/` or `scripts/`: another builder is there.
- The look and the motion as they are: the stylesheet's tokens, the sheet's arrival, tilt on press; nothing new moves; nothing moves under `prefers-reduced-motion`. A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. Tap targets 44 px; a slider's thumb can be held by a thumb. The stylesheet stays one file, comments in plain words (why, not what). No new dependency.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/solosettings`, on a branch `solosettings`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Look at your own work: `pnpm app --port <a free port over 8790>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. Photograph the new controls at both sizes, light and dark, at the middle and off it, with the soloist in and out, and read the pictures. Save a final set in `out/solo-settings/` in your clone (not committed; add the folder to `.gitignore`).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Write what you decided in a new section at the end of `DECISIONS.md` ("the soloist's settings in the app") with a line of why for each. Your final message is read by the engineer who will check and merge the branch. It should say: where the two settings are and how they are reached; the words used; what the app passes to the engine at the middle, off it, and with from-the-top chosen (show the options object); how they are remembered and what an older settings file and an older kept take do; what happens while a take is playing; what changed in any smoke journey; the exact results of `pnpm check` and `pnpm smoke`; the commits; what you could not verify (a real iPhone above all); anything you saw that is wrong and did not fix. Do not say that anything looks good: say what you checked.
