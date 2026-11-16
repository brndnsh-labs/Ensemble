# Build: the interface pass, first half (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser. Every part of the app exists and is deployed: a library, a play screen, an editor with an arrangement grid, kept takes, eight styles. The owner calls the interface "largely a draft state". This is the pass that makes it something he finds his way around without thinking, and that looks like it was meant. A second brief, after yours, rebuilds the editor around tapping a bar; leave the editor's workings alone.

## The owner's words

Brandon is a bassist and guitarist. The phone sits beside his instrument; he also uses a laptop. What he has said, verbatim:

- "i consider this to largely be a draft state"
- After exporting a take on his phone: "export works, but the way to get there was pretty confusing. we'll want to make the interface much more intuitive at some point, and that goes for everything"
- "i wonder if it would also make sense to make it easier to stop the band. what about a separate button to immediately stop playback instead of asking the band to finish?"
- "we'll need to think about things like library management as well - what should the home screen really be?"
- To a proposed home screen of recent things first, then his own charts with their actions on each row, then the built-in library behind a search box and a style filter: "home order sounds good"
- "one thing from the old [version] i'd want to bring over: serif fonts on the chart itself to differentiate from the interface"
- "let's make this look nice! :)"

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/ui`, on a branch `ui`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at or copy from `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency (if you believe one is needed, stop and say why). Commit on the branch, one or a few commits for each part below, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11 (the three uses in order, and what the app's screens must do: they are requirements, not suggestions); `docs/TESTING.md` (binding); `PLAN.md` "Resume here"; in `DECISIONS.md` the sections about the app from "stage 6 begins" on. Then all of `packages/app/src/` (about 5,200 lines with the stylesheet) and `smoke/app.spec.ts`. Match what is there: its structure, its comments (plain words, written for a musician who reads code; why, not what), one stylesheet with its tokens at the top. No state library, no router.

If the `frontend-design` skill is available to you, load it before the visual work and follow its process.

## The identity that exists (keep it; make it better)

The stylesheet's opening comment says what the app is meant to look like: ink on paper, "the blue-violet of a duplicated band chart", cool paper and not cream, a yellow highlighter for the bar being played, a red pencil for what is wrong. Archivo for the interface, condensed and heavy for names. That is a point of view and it is the owner's app's own: do not replace it with another look. What it lacks is finish: spacing that is decided, a clear order of importance on each screen, controls that say what they are, and states (empty, loading, playing, failed) that were each thought about. Spend the boldness in one place on each screen, which on the play screen is the chart.

**The chart's typeface is being chosen by the owner from candidates while you work.** Make it one variable: `--chart-face` in the tokens, used by the chord symbols, the section marks and the chart's title wherever a chart is drawn, and left at the interface's face. Do not choose or add a serif yourself. Do make sure nothing in the chart's layout depends on Archivo's width axis being there (the chord symbols use `font-stretch`): the serif will not have one, and the form must still fit one screen.

## What to build

### 1. Stopping

Today one button is Play, then Finish, then Stop, and stopping at once takes two presses. Make it two things while the band plays:

- **Stop**: stops at once, in one press. It is where Play was, and the space bar does what that button does.
- **Finish**: asks the band for an ending, as now (`jam.finish()`; never in a song, which ends by itself). It is beside Stop and plainly the second choice. Once pressed it says the band is on its way home and cannot be pressed again; Stop still stops.
- Keep stays as it is, in whatever place the new footer gives it.
- On a phone held upright the whole form must still fit on one screen while playing (BRIEF 11), and nothing may move under a thumb between idle and playing in a way that makes a second tap land on the wrong thing.

### 2. Mutes while playing

The Band buttons choose who is in the band before Play: a seat left out is not played, and the others play differently for it (with no bassist the acoustic guitar's thumb takes the bass). Keep that, and make the same buttons live:

- While the band plays, pressing a seat that is in the take silences it at once, and pressing it again brings it back at once, in time: the part never stopped being played, only heard. That is the seat's channel in the mixer taken down and up (`Mixer.adjust` already glides levels; give the rig what it needs, in `packages/app/src/play/rig.ts` and, only if you must, a small addition in `packages/audio`).
- A seat that was out when Play was pressed has no notes to bring in. Pressing it while playing turns it on for the next Play and says so in the button itself (a word, or a state that reads as "next time"), not in an alert.
- The buttons' state is one state, as now (`settings.band`): what is silenced when the band stops is out of the band at the next Play.
- The Band controls must therefore be reachable while playing. Today the whole setup hides then. Decide what stays, and keep the one-screen rule.
- A mute is how the player listened, not what was played: a kept take and an exported file are unchanged by it.
- The instrument pickers (the chord seat's, where a style offers a choice; the soloist's) sit unlabelled under the Band row with "Chords:" and "Soloist:" inside their options. Give each a place and a label that belongs to its seat. They stay set-before-Play.

### 3. The home screen

Today: a title, two buttons, then every built-in chart in one list by style (51 of them), with the player's own charts and takes after. "Pick up an instrument and go" is the first use; it must take a tap or two (BRIEF 2 and 11). In this order:

1. **Recent**: the last few things played (charts and kept takes), newest first, each one tap from playing. Nothing played yet: the section is not there, and the screen still starts someone off well.
2. **Your charts**: each row plays in one tap and opens in another, as rows do now, and carries its own actions: rename, duplicate, export the chart's text, delete (asking first). Today export and delete are inside the editor; they may stay there too. New chart and Import a chart belong with this section.
3. **The built-in library**: a search box (title, and key or style if cheap) and a style filter, in place of the long scroll. With nothing typed and no style chosen it must still be browsable.
- **Takes** are performances of a chart. Show a chart's kept takes on that chart's play screen (when it is not playing), and keep them findable from home through Recent; whether home also keeps a Takes shelf is yours to decide and say. A take whose chart is gone must still be reachable.
- Remembering what was played recently is new state: keep it with the rest (`settings.ts` or beside `takes.ts`), small, and tolerant of a browser that refuses storage.
- No folders, setlists, stars, accounts or sync (BRIEF 13).

### 4. Export where it is wanted

Getting a MIDI file meant: play, Keep, back to the library, find the take, open it, Export MIDI. On the play screen, once a take exists (`jam.take`: playing or stopped), offer **Export MIDI** for that take directly, without keeping it first. The take screen keeps its own exports. Smoke journey 5 walks the old path; it may walk the new one if that is now the natural one (see Tests).

### 5. The look, everywhere

Go through every screen and state at phone size (390 by 844) and laptop size (1280 by 800), light and dark: home (empty of own charts, and full), play (idle, loading, playing, finishing, a failed load), focus mode, a take's screen, the editor's two tabs (its looks only: spacing, type, buttons, the tab control; not how editing works), credits. Fix what is cramped, misaligned, unlabelled, inconsistent or ambiguous. Tap targets on a phone are at least 44 px. Focus is visible from a keyboard. Motion only where it answers a press. Words in the interface are plain, sentence case, and say what a press does.

## Tests

`docs/TESTING.md` rations tests. Add none. The five smoke journeys (`smoke/app.spec.ts`) must pass against the built app (`pnpm app:build && pnpm smoke`); where a label or a path you changed breaks a step, change that step to walk the same journey through the new interface, and say in your report exactly what you changed in each journey and why. Do not weaken what a journey proves (journey 5 must still compare the downloaded MIDI with the CLI's bytes).

`pnpm check` must pass (run it alone: it is timed). Nothing in `packages/engine` or `packages/styles` should change; if you find you want to, stop and say why.

## Looking at your own work

`node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs the app in headless Chrome; `pnpm app --port <a free port over 8770>` serves it for that. Look at every screen you touch, at both sizes and in both themes, and look again after each change: read the pictures, do not assume. Headless Chrome cannot play you sound and you could not hear it: say what you could not verify (that a mute is silent and comes back in time, above all) and how you checked what you could (a level read from the mixer, a state in the page).

Save a final set of pictures in `/home/brandon/code/ensemble2/.work/ui/out/ui-pass/` (do not commit them), named for the screen, size and theme.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the interface pass, first half") with a line of why. Your final message is read by the engineer who will check and merge the branch, not by the owner. It should say: what each of the five parts now does, as a user meets it; every decision you made that the brief left open; what changed in each smoke journey; the commits; the exact results of `pnpm check` and `pnpm smoke`; the list of pictures; what you could not verify; anything you saw that is wrong and did not fix. Do not say that anything looks or sounds good: say what you checked.
