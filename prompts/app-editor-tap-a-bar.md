# Build: the interface pass, second half: an editor you tap (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser. The first half of this pass is merged: a new home screen, Stop and Finish, live mutes, one set of controls, the chart set in a serif and larger. This half is the editor. Today it is a text box with the drawn chart above it and a row of keys for the format's characters. The owner wants to edit on the chart itself.

## The owner's words

- "tapping a bar to edit was really nice, we should implement something like that here" (of the previous version of this app)
- "some of the chart editing features weren't shabby either" (the same)
- "let's make this look nice! :)"
- Earlier, of the whole interface: "we'll want to make the interface much more intuitive at some point, and that goes for everything"

What the previous version did, as a user met it (described from its screens; its code is off limits and must not be read): you pressed a bar on the chart and typed that bar's chords; leaving the bar applied it; on a phone a dock above the keyboard had keys to step to the bar before and the bar after, a Done key, a bar-line key and a row of chord endings (m7, maj7, b9 and so on); typing `Dm7 | G7 | Cmaj7` into one bar spread the chords over that bar and the ones after it; a bar that could not be read stayed marked; a bar had its own actions (insert a bar after, delete the bar), and so did a section (rename, duplicate, add a section after, delete). Take that as the feel to reach, not a specification to match.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/editor`, on a branch `editor`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at or copy from `/home/brandon/code/ensemble`, do not push, fetch or deploy, make no network requests, add no dependency (if you believe one is needed, stop and say why). Commit on the branch in a few sensible commits, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/CHART_FORMAT.md` (the format is a specification: what you write into a chart's text must be valid by it); `docs/TESTING.md` (binding); in `DECISIONS.md` the sections "the editor" and the two about "the interface pass, first half". Then `packages/app/src/` (the editor is `edit/`; the chart is drawn by `play/ChartView.tsx` and `play/page.ts`; the controls and tokens are in `style.css`) and `smoke/app.spec.ts`. Match what is there. If the `frontend-design` skill is available to you, load it before the visual work.

## What must stay true

- **The text is the chart.** A chart is stored, imported, exported and played as its text. Every edit made by tapping is a rewrite of that text, and the text that results is what a person would have typed: valid by the format, laid out as `fmt` lays it out (the engine has the formatter), with the player's comments and anything the tap did not concern left exactly as it was.
- **The text editor stays**, as a second way in: a laptop with a keyboard is fast at it, and it is the only way to reach parts of the format the tap editor does not cover. Its key row and its diagnostics stay. A change made either way shows at once in the other.
- **The arrangement grid stays** as it works. On a phone its cells are small under a thumb: make them a fingertip (44 px) without losing the whole song from view where it now fits, and say what you did.
- The engine parses and tells you where each bar is in the text (`page.ts` already names a drawn bar by its section and its place in the source). If the parser does not give you a range you need, add that to what the parser returns, as data, and nothing else in `packages/engine`; say so in the report. `pnpm check` (which holds every style to every property and every golden take) must pass unchanged.

## What to build

### 1. Tap a bar, type its chords

- On the editor's chart, pressing a bar opens that bar for typing, showing what is written there now (as the format writes it: `Dm7 . G7`, `%`, a rest). Applying it rewrites the bar. The drawn chart is the same chart the play screen draws, at a size that reads; a long form scrolls.
- **On a phone**: the bar's text is typed in a dock that sits on top of the on-screen keyboard (`edit/viewport.ts` already tracks the keyboard), with: the bar before and the bar after (each applies the bar being left and moves, across lines and sections), Done, the format's characters a chord needs, and the chord endings worth a key. Choose the endings from what the built-in library actually uses most; a key types its text at the cursor. The bar being edited stays in view above the dock and is plainly the one being edited.
- **On a laptop**: the same, typed in place or in a field that belongs visibly to the bar; Tab and Shift-Tab (or the arrow keys at the ends of the text) move to the next and the last bar, Enter applies and moves on, Escape leaves the bar as it was.
- Typing bar lines spreads: `Dm7 | G7 | Cmaj7` typed into one bar writes that bar and the two after it, replacing what they held, and adds bars to the line's section when it runs off its end.
- A bar that cannot be read is not refused: it is written as typed, stays marked in the red pencil the stylesheet has for what is wrong, and says why in words where the bar is being typed (the parser's diagnostics have the words).
- Leaving the bar (pressing another bar, Done, the keyboard's own dismissal) applies it. Nothing is lost by a stray tap.

### 2. A bar's and a section's own actions

- For the bar being edited: insert a bar after it, insert one before, delete it, repeat the bar before (`%`). For a section, reached from its name on the chart: rename it, duplicate it, add a section after it, delete it (asking first when it has bars). Each is a rewrite of the text.
- Repeats, endings, a section's own key or meter, and anything else the format has: reachable in the text editor, and drawn on the chart as now. Do not build dialogs for them in this pass; do make sure a bar inside a repeat or an ending can be tapped and edited without disturbing the signs.

### 3. Undo

- Every change made by tapping can be undone and done again, a step at a time, from two buttons that are there while editing, for as long as the editor is open. The text box keeps the browser's own undo for what is typed in it; say how the two meet.

### 4. A new chart

- "New chart" on the home screen opens a chart someone can start tapping: a title to type, and a first line of empty bars in the format's own way of writing one. Check what the format says an empty bar is before choosing.

### 5. The look

- The editor's screens at phone size (390 by 844) and laptop size (1280 by 800), light and dark: the chart with nothing open, a bar open with the keyboard up (photograph the dock; say how you checked its place over a keyboard that headless Chrome does not show), a bar that cannot be read, a section's actions, the text editor, the arrangement grid. One clear order of importance on each. Use the controls and tokens the first half made; add none without need.

## Tests

`docs/TESTING.md` rations tests. Add none. The five smoke journeys must pass against the built app (`pnpm app:build && pnpm smoke`). Journey 3 types a chart into the text box and reads a diagnostic: it may need a step to reach the text editor, and it must still prove that typed text renders and that an error shows a diagnostic in place. Say exactly what you changed in each journey and why. `pnpm check` must pass (run it alone: it is timed).

Because nothing tests the rewrites, check them yourself and say how: take every chart in `library/`, and for a spread of bars in each, apply an edit through the same function the tap uses (retype the bar as it is; change it; insert and delete; duplicate a section) and confirm that the result parses with no new diagnostics, that `fmt` leaves it unchanged, and that retyping a bar as it is gives back the text you started with. A scratch script is fine; do not commit it as a test.

## Looking at your own work

`node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs the app in headless Chrome; `pnpm app --port <a free port over 8770>` serves it. Read the pictures after each change. Save a final set in `/home/brandon/code/ensemble2/.work/editor/out/editor-pass/` (not committed), named for the screen, size and theme.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the interface pass, second half: an editor you tap") with a line of why. Your final message is read by the engineer who will check and merge the branch. It should say: what editing a chart is now like, step by step, on a phone and on a laptop; every decision the brief left open; how you checked the rewrites and what the check found; what changed in each smoke journey; anything added to the engine's parser; the commits; the exact results of `pnpm check` and `pnpm smoke`; the pictures; what you could not verify (a real phone's keyboard, above all); anything you saw that is wrong and did not fix. Do not say that anything looks good: say what you checked.
