# Build: small things in the app, found while it is being played (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser. The owner is playing along with it daily on his iPhone 17 and a laptop ("the week has already started ... it seriously sounds incredible"). The app's look ("the poster wall") and its screens are built and passed. This brief is a list of small faults, each known and logged. Fix each as small as it can be fixed; change nothing else about how the app looks or works.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2 and 11; `docs/TESTING.md` (binding); in `DECISIONS.md` "the poster wall, part 1", "part 2", "part 3" and their "checked and merged" sections (each lists what was known and left); `packages/app/src/` whole (`play/`, `edit/`, `HomeView.tsx`, `Browse.tsx`, `LibraryView.tsx`, `rows.tsx`, `charts.ts`, `takes.ts`, `style.css`), and `index.html`.

## The list

1. **Two buttons say Done.** On a phone, with a bar (or a section) open in the editing mode, the top right says Done (leave the mode) and the dock on the keyboard says Done (close the bar). Only one thing on the screen may say Done. Decide which changes and to what plain word, keeping in mind that he has used the dock as it is and passed it; say what you chose and why. `smoke/app.spec.ts` journey 3 may press one of them by name.
2. **A copy of a built-in has the built-in's title.** "Edit a copy" and More's "Make a copy to edit" make "<title> copy", as Duplicate does (and a second copy does not collide: see what Duplicate does and do the same).
3. **A new chart's meter can only be set by typing `meter:` in the Text side.** The band now plays 3/4, 6/8, 12/8 and 6/4 with written parts. In the editing mode, More gains "Meter", showing the chart's meter and offering 4/4, 3/4, 6/8, 12/8 and 6/4 (anything else is typed in the Text side, and is shown as it is); choosing one rewrites the chart's `meter:` line as a step of the editor that Undo takes back. A chart whose bars no longer fit the meter says so in the way the editor already says a chart has something to fix; do not rewrite anyone's bars. Put the header rewrite beside the other rewrites (`edit/rewrite.ts`), in their manner.
4. **On a phone a style's page starts its list about 435 px down.** Tighten the head of `#/charts/<style>` at phone width so that at 390 by 844 the first chart's row starts above 300 px, without changing the poster name's look or the laptop's layout.
5. **Exported MIDI names the style's own instrument when another was chosen.** A take played on the nylon guitar, or with another soloist, exports with the default's program number and track name. Find where the program is chosen (`packages/engine/src/midi/export.ts` and what the app and the CLI pass it) and make the file say the instrument played. **Every golden take must stay byte for byte** (`test/goldens/`; they use the defaults), and smoke journey 5 compares the app's export with the CLI's bytes: both must still pass unchanged.
6. **A kept take's Rename shows its chart's name**, not the take's. Fix it.
7. **A kept take or a recent entry whose built-in chart has been cut from the library** (ten were, this week) still offers "Open its chart" or opens to nothing. Where the chart is gone, do not offer the link, and a recent entry that cannot open is not listed. The take itself keeps its own text and still plays.
8. **Long chart titles are cut to one line** in lists and on the chart's screen. Let a title run to two lines before it is cut, with nothing else on the row moving for a title that fits on one.
9. **The browser's toolbar colour** (`theme-color`) is the light paper in both themes. Give it the dark paper in the dark theme. (Not the style's ink while playing: that is not asked.)
10. **The search box hops** from home into the library's top bar on the first letter typed. If the box can stay where the finger is while typing, with focus and the caret kept, at a small cost, do it; if it needs the two screens reorganised, leave it and say what it would take.

## What must not break

- Everything the app does now. The five smoke journeys pass against the built app (`pnpm app:build && pnpm smoke`); change a step only where the screen changed under it (item 1), say exactly what, and do not weaken what a journey proves. Add no test: `docs/TESTING.md` rations them.
- `pnpm check` passes (run it alone: it is timed, 20 s, and other builders are using the machine; if it runs over only because of load, time the starting commit beside it and report both).
- Nothing in `packages/styles`, nothing in `packages/audio`, and in `packages/engine` only what item 5 needs. Other builders are at work in other clones on the engine's players and the styles: stay out of `packages/engine/src/players/`, `packages/styles/`, `library/`, `scorecard/` and `test/`.
- A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. Tap targets 44 px. Nothing moves on load or hover; a press answers in the same frame. The stylesheet stays one file, comments in plain words (why, not what). No new dependency.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/tidy1`, on a branch `tidy1`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch, one commit an item where that is natural, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Look at your own work: `pnpm app --port <a free port over 8790>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. Photograph each item before and after at the sizes it concerns and read the pictures. Save a final set in `out/tidy-1/` in your clone (not committed; add the folder to `.gitignore`).

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Write what you decided in a new section at the end of `DECISIONS.md` ("small things in the app, 1") with a line of why for each. Where an item cannot be done small, do not redesign: leave it and say what it would take. Your final message is read by the engineer who will check and merge the branch. It should say, item by item: what was wrong, what you changed, how you checked it (what you measured or photographed); what changed in any smoke journey; that the goldens are unchanged; the exact results of `pnpm check` and `pnpm smoke`; the commits; what you could not verify (a real iPhone above all); anything you saw that is wrong and did not fix. Do not say that anything looks good: say what you checked.
