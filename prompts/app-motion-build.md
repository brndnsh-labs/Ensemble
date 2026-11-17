# Build: the poster wall in motion, for real (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser. A study of motion for its look ("the poster wall") was built with ten switches and tried by the owner on his iPhone with every switch on. His verdict, 2026-11-16: **"looks great! the live tiles are a bit much, but everything else looks wonderful"**. This brief turns the study into the app: what he saw with everything on, less the live tiles, with the study's furniture taken out.

Earlier, for the bounds of it: "i really want to lean into the (now retro?) metro ui look ... some very light and fast animations"; "i still want to keep the look uniquely ours"; and of the app as a whole, "welcoming vibes, fun place to practice, but still snappy and responsive".

## Where things are

Your clone already has the study merged in (branch `motion2`: main with the study's branch on top). The study's code is `packages/app/src/motion/` (`switches.ts`, `moves.ts`, `live.ts`, `Switchboard.tsx`), small hooks in `address.ts`, `App.tsx`, `main.tsx`, `play/Sheet.tsx`, `play/Stage.tsx`, `HomeView.tsx`, `LibraryView.tsx`, and about 415 lines at the end of `style.css` behind `html.m-<id>` classes. Its builder's account is in `DECISIONS.md`, "the poster wall in motion: a study": read it first, then all of that code, then `prompts/app-motion-study.md` (the brief it was built to).

## What to build

**The app moves as the study did with every switch on at the speed "as specified", except switch 5.** He judged the combination, so keep the combination, including how the study settled the overlaps when everything was on: ink fields are printed (9) and the rest feathered (2); the dock's flood is printed (9), not wiped (so 8's wipe is not in what he saw: take it out); the continuum (3) and the page turn (4) both run as they did together; the pivot (6) and the oversized titles (7) are both on, on a phone as he saw them. If you find that with everything on some motion was in fact never visible or was overridden, say so and keep what was visible.

Then make it the app's own:

1. **Take out the study's furniture**: the switches, the switchboard, the corner slip, the `#/motion` address, the speed setting, the `VITE_MOTION` build flag, the stored choices (`ensemble.motion-study.1`: remove the key from a browser that has it), and the live tiles' code (`live.ts` and its hooks and styles). No `html.m-*` classes: the rules stand on their own, moved to where they belong in the one stylesheet with comments in plain words (why, not what), tokens for the durations and distances at the top with the other tokens.
2. **Keep what makes it safe**: only `transform` and `opacity` animate; a press answers in the same frame (the tilt is written in the press's own task); motion never delays navigation, Play, Stop, a mute or the editor's keyboard, and is interruptible; nothing new moves on the chart's screen while the band plays except the tilt under a finger; nothing moves under `prefers-reduced-motion` (the pivot and the titles, being layout, stay).
3. **Mend what the study's builder saw and left**:
   - Feathered pieces start invisible for up to 88 ms. Make an arriving screen readable from its first frame if that can be done without losing the stagger he liked (for instance a short move with little or no fade); if it cannot, keep it as he saw it and say so.
   - The continuum's first frame showed the new page about 45 px out of place in a slowed capture: find out why and fix it.
   - The continuum holds the screen about a frame (32 ms) before it changes. He saw that and passed it; keep it, but make sure a press on a play button, Play, Stop or a mute never waits on a view transition, and that where the browser has no view transitions the change is simply instant.
   - With the titles on, home's poster moved from 142 to 244 px down and a style's first chart row moved down 25 to 48 px. He passed what he saw; do not undo it, but take any slack you can find that changes nothing he saw (empty space), and report the measurements before and after at 390 by 844.
   - On a style's page the name now appears twice on a phone (the pivot's word and the poster name). Leave it: he saw it. Say in your report what removing one would take.
   - The old `:active` press rule (`translateY(1px)`) on things that now tilt: remove it where the tilt replaces it.
4. **The editing mode and sheets**: check each motion against the editing mode (the keyboard dock, a bar opening, the phone's keyboard coming up: nothing may animate the chart's frame or the docks there) and against every sheet. Where a motion fights the editor, the editor wins: switch that motion off there and say so.
5. `docs/BRIEF.md` section 11 and anything else in `docs/` that says the app does not move on load: bring the words in line with what is now true (motion is short, eased out, says where a thing came from, and never delays a press), without rewriting more than those sentences.

## What must stay true

- The five smoke journeys pass against the built app (`pnpm app:build && pnpm smoke`); change no step unless the screen changed under it, and say what. Add no test (`docs/TESTING.md` rations them). `pnpm check` passes (timed, 20 s; other builders are using the machine: if it runs over only by load, time the starting commit beside it and report both).
- The band is not late for it: `pnpm render:audio wall-motion chart=jazz-rhythm-changes-bb.chart live=1` before and after, and in the built app in headless Chrome, a walk through home, a style, a chart, Play, a mute, More, Stop, with long tasks and long frames reported against the same walk on main.
- Nothing in `packages/engine`, `packages/styles` or `packages/audio`. Other builders are at work there in other clones; stay out of `library/`, `scorecard/` and `test/` too.
- A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. Tap targets 44 px. No new dependency. No state library, no router.
- Leave no dead code or styles from the study behind.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/motion2`, on a branch `motion2`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch in a few sensible commits, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/TESTING.md`.

Look at your own work: `pnpm app --port <a free port over 8790>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. A still cannot show motion: capture frames through each motion as the study's builder did (its probe is described in its `DECISIONS.md` section; its own `out/` folder is not in your clone) and say what they show. Save them in `out/motion-build/` (not committed; add the folder to `.gitignore`).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Write what you decided in a new section at the end of `DECISIONS.md` ("the poster wall in motion"), beginning with his verdict and saying that the earlier rule "nothing moves on load" is relaxed by his word and what replaces it. Where something cannot be built as written, do not invent a different design: build the rest and say what you left. Your final message is read by the engineer who will check and merge the branch. It should say: each motion as it now is (what moves, how long, where it is switched off); what was taken out; each of the mended things and how; the measurements at 390 by 844 before and after; what the editing mode and the sheets needed; the smoke and check results; the late notes and the long tasks against main; the commits; what you could not verify (a real iPhone above all); anything you saw that is wrong and did not fix. Do not say that anything looks or feels good: say what it does and what you checked.
