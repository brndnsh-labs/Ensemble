# Build: the poster wall, part 3: Edit is a mode of the chart's screen (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser. The owner chose a look from a design study ("the poster wall"); parts 1 and 2 are merged and he has tried them on his phone ("it seems really solid during playback, nice job!"). The chart's screen is now: a row of places at the top left, Edit and More at the top right, the title, a sentence that states the setup, the chart, and a dock at the bottom with the band and Play. The editor is still a separate screen you are sent to. This brief makes editing a mode of the chart's screen: the same page, with a pencil.

## The owner's words

Brandon is a bassist and guitarist; the phone (an iPhone 17) sits beside his instrument, and he also uses a laptop.

- Of the app before the redesign: "seems difficult to navigate though - we should work on that ... welcoming vibes, fun place to practice, but still snappy and responsive"
- Of the editor, tried on his iPhone the same day it was built: "works great on iphone, awesome job". **The editor's workings are passed. This brief moves the editor; it does not change how editing works.**
- "tapping a bar to edit was really nice"

## What exists

- The chart's screen: `packages/app/src/play/` (`PlayView.tsx`, `Stage.tsx`, `Sheet.tsx`, `StatusStrip.tsx`, `ChartView.tsx`), reached at `#/chart/<id>`.
- The editor: `packages/app/src/edit/` (`EditView.tsx`, `BarEditor.tsx`, `SectionSheet.tsx`, `rewrite.ts`, `viewport.ts`), reached at `#/edit/<id>`. It has its own top row (the places, the title, Undo, Redo, Play as a link back to the chart), a switch (Chart, Text, Arrangement), and panes. Pressing a bar on its chart opens that bar for typing: on a phone in a dock that sits on top of the on-screen keyboard (`viewport.ts` tracks the keyboard), on a laptop in a field over the bar. A section's name opens its own actions. A built-in chart is not edited in place: "Edit a copy" makes a copy of the player's own and opens that.
- The study drew the mode as a sketch only: `out/look-study/a/chart-my-sunday-groove.html#edit` in your clone (not committed), and the picture `out/look-study/shots/a-21-edit.png`. Open the page and press things. It shows the intent: the top row, the title, the sentence and the chart do not move; Edit reads Done; the dock holds the editor's things; Play stays where it is.

Read all of both folders, `App.tsx`, `address.ts`, `Trail.tsx`, and `smoke/app.spec.ts` (journey 3 walks the editor) before deciding how to host one inside the other. `DECISIONS.md` has what was decided: "the interface pass, second half: an editor you tap", "the editor you tap: checked and merged", "the poster wall, part 1" and "part 2" (each ends with what the next brief should know; part 2's says the editor's unscoped `.dock` and `.more` in the stylesheet are why the new dock is `.band-dock` and the new link `.more-link`: reconcile them).

## What a user meets

- **Edit is one button at the top right of a chart's screen, and it becomes Done.** Pressing Edit does not go anywhere: the top row, the title and the chart stay exactly where they are (measure it: with no bar open and no keyboard up, a bar is at the same place on the screen in both modes, at 390 by 844 and at 1280 by 800). If the band is playing, it stops. Done puts the pencil down and the screen is the chart's screen again.
- **In the mode, the chart is the editor's chart**: a bar pressed opens for typing exactly as it does now (the phone's dock over the keyboard with its keys and bar actions; the laptop's field over the bar, Tab, Enter, Escape), a section's name opens its actions, a bar that cannot be read is marked in the red pencil with its reason, a chart with no bars offers a first line. All of that is the existing code, working as it works.
- **The dock in the mode holds the editor's things in place of the band**: Undo and Redo; the way to the chart's Text and to its Arrangement; what there is to fix, when there is something. With no bar open it says how to start ("Press a bar to change it", or better words). Lay it out as the study's sketch does, in the system's controls. **Play stays where it is, in the same block and the same ink**: pressing it puts the pencil down and starts the band on the chart as it now stands.
- **Text and Arrangement** are the editor's other two sides, as now: on a phone each takes the place of the chart between the top row and the dock (the text box with its key row and its diagnostics; the grid), with a plain way back to the chart; on a laptop the text sits beside the chart as it does now. Nothing about them changes but where they are reached from.
- **A built-in chart**: its button reads "Edit a copy" (and More has "Make a copy to edit"). Pressing it makes the copy and the screen is now the copy's, in the mode: the title, the row of places and the address are the copy's, and the screen says so once, plainly, in the dock ("This is your copy. The built-in chart is unchanged.").
- **A new chart** from home opens in the mode, on four empty bars, as it opens in the editor now. Import a chart likewise.
- **The address** says the mode, so a reload stays in it and the phone's own back gesture leaves it for the chart: decide between keeping `#/edit/<id>` and another shape, and keep old addresses working. Entering the mode is one step of history; Done does not pile up more.
- **The sentence and More** stay in the mode. What they change (the style, key, tempo and length the chart is played with; how chords are shown) are the player's settings for the chart, not its text, as now. More's rename, duplicate and delete act on the chart being edited.
- **Undo** lasts as long as the mode is open on a chart, 200 steps, as now.
- A kept take's screen has no Edit.

## What must not break

- **The phone's keyboard dock.** It was built against a keyboard that headless Chrome does not show, and it works on his iPhone. Do not change `viewport.ts` or how `BarEditor` places itself unless hosting it leaves no other way, and then say exactly what changed and why. Read how its builder checked it (`DECISIONS.md`) and check it the same way after your change: the dock's place with a pretended keyboard, the bar being edited in view above it, the keys keeping the field's focus.
- **Every tap is still a rewrite of the chart's text** (`rewrite.ts`), and the text is what is saved. Do not touch `rewrite.ts`.
- **The play screen as part 2 left it**: the sentence, the sheets, the flood, the players' lights, the mutes, Stop and Finish, Keep, the space bar (which must not start the band while a bar is being typed), autoplay from home.
- Nothing in `packages/engine`, `packages/styles` or `packages/audio` changes.
- A phone held upright and a laptop, light and dark. Tap targets 44 px. Focus visible from a keyboard, and it goes somewhere sensible on entering and leaving the mode. A press answers in the same frame; nothing moves on load or on hover; movement is 150 ms at most and off under `prefers-reduced-motion`.
- The stylesheet stays one file, tokens at the top, comments in plain words (why, not what), written for a musician who reads code. No state library, no router, no new dependency. Take out what the separate editor screen needed and the mode does not: leave no dead styles or components behind.

## Tests

`docs/TESTING.md` rations tests (binding). Add none. The five smoke journeys must pass against the built app (`pnpm app:build && pnpm smoke`). Journey 3 walks New chart, a bar typed, the Text side, a diagnostic: change a step only where the screen changed under it, and say exactly what and why; do not weaken what it proves. `pnpm check` must pass (run it alone: it is timed).

Another builder is at work in another clone at the same time, on the built-in library (`library/`, `test/`, `scorecard/`, and the titles of charts wherever they are named). Stay out of those. In `smoke/app.spec.ts` do not change a chart's title or file name, even where you change the step round it.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/wall3`, on a branch `wall3`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch in a few sensible commits, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/TESTING.md`.

Look at your own work: `pnpm app --port <a free port over 8770>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. Photograph each state at both sizes and in both themes and read the pictures: the chart's screen and the same in the mode (and say what you measured of a bar's place in each); a bar open on a phone with a pretended keyboard, and on a laptop; a section's actions; a bar that cannot be read; Text; Arrangement; a copy just made of a built-in chart; a new chart. Save a final set in `/home/brandon/code/ensemble2/.work/wall3/out/wall-3/` (not committed).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the poster wall, part 3") with a line of why. If something here cannot be built as written without changing how editing works, do not invent a design: build the rest, and say plainly what you left and why. Your final message is read by the engineer who will check and merge the branch. It should say: what editing is now like, step by step, on a phone and on a laptop, from a chart of his own, from a built-in chart and from New chart; how the editor is hosted (what moved, what was deleted); every decision the brief left open; whether `viewport.ts` or `BarEditor`'s placing changed and how you checked the keyboard dock; a bar's measured place in both modes; what changed in each smoke journey; the commits; the exact results of `pnpm check` and `pnpm smoke`; the pictures; what you could not verify (a real iPhone's keyboard above all); anything you saw that is wrong and did not fix. Do not say that anything looks good: say what you checked.
