# Build: the poster wall, part 1: the look, home, one library, and the way back (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser. A design study drew the app two ways and the owner chose one: **A, the poster wall**. This brief builds the first part of it into the real app: the visual system, home, the library, and how you get from one place to another. A second brief, after yours, rebuilds the chart's screen (the setup as a sentence, the More sheet, the dock that floods with the style's ink, the players alive); a third makes Edit a mode of it. Leave those workings alone.

## The owner's words

Brandon is a bassist and guitarist; the phone (an iPhone 17) sits beside his instrument, and he also uses a laptop.

- Of the app before the study: "seems difficult to navigate though - we should work on that. the audio we've cooked up is genuinely impressive, and i want the app to look and feel visually impressive as well. welcoming vibes, fun place to practice, but still snappy and responsive"
- Where he got lost: "i opened a genre, then opened a chart, and when leaving the chart, i couldn't navigate back home"
- Of the study's direction A: "the poster wall looks really cool, i haven't seen anything like that in a while. reminds me of metro ui in the best way"
- And then, of how the charts are organised: "the band is very adaptable and can play any chart in any genre we support. does it make sense to organize things this way? what if we have a unified library and tag things based on their idiomatic genre, with the idea that everything is easily customizable anyway?"

## The study is the specification for the look

It is in your clone at `out/look-study/` (not committed; do not commit it): `index.html`, the pages of direction A in `a/`, pictures in `shots/` (`a-*.png`), and the script that made them in `src/`. Open the pages, read their stylesheet and the pictures, and match A: its palette (the app's paper, ink, faint, rule, highlighter and pencil, and one spot colour for each style: blues `#5aa9ff`, funk `#ff8b2b`, jazz `#1fc2b0`, rock `#ff5f7e`, disco `#e274f2`, neo-soul `#a99bff`, reggae `#45c95f`, acoustic `#d9a968`; the same in the dark theme, always a field with the ink `#1e1a4f` printed on it and never type on paper), its type (Archivo at width 62% and weight 900 in capitals for the wordmark, the style names and Play; headings at 68% and 850; list titles at 76% and 700), its square corners, its wall of style names each set to fill its measure, its pressed states with no transition. Direction B (`b/`) was not chosen; do not draw from it. Where the study and this brief disagree, this brief is later and wins; where the study only sketched something, the real app's behaviour stays.

The study's report said two things to carry over: the fitted style names need `overflow: clip`, because set this tight the letters' boxes overhang the line and cover what is above them from a press; and their widths were measured by hand, where the app should measure once after `document.fonts.ready`, as `play/ChartView.tsx` already does for the chart.

## Where the study is changed: one library

The study made each style a page that its charts live in. The owner's question is right: a chart is its chords, and the band plays any chart in any style (the suite holds every style to every chart). So:

- **There is one library.** Every chart, the built-in ones and his own together, is in it. A chart's style is a mark it carries (its ink and its name), saying what it was written for and what the band plays when nothing else is chosen. It is not a place the chart lives.
- **The library is one page with what it is showing said at its top**: everything, his own, or one style. A strip there moves between those without going home (All, Yours, and the eight inks, each named; the one being shown plain to see). It is in the address (`#/charts`, `#/charts/yours`, `#/charts/<style>`), so the phone's own back gesture and a reload land where they should. Showing one style, the page takes that style's ink and its name at poster size, as the study's style page does; showing everything, each chart carries its own style's ink as a mark, and the list is in an order someone can use (decide it and say: by title, or grouped; not by file name).
- **Search finds across all of it** (title, key, style, and his own charts), from home and from the library, and what it finds is the library showing what was found.
- **The wall stays on home**, and is now eight ways into the one library, not eight folders. A style's block says what it sounds like (its band, as the study has it) and how many charts were written for it.
- **Home**, in this order: the wordmark with Charts and Takes beside it; search; the last thing played, large, with its Play, in the ink of the style it was played in; the wall; his own charts (New chart and Import a chart with them, and each row's own actions as now: edit, rename, duplicate, export, delete); a way to the whole library that says how many charts are in it. A first visit with nothing played still starts someone off in a tap (the study's `home-first.html`). Takes is a view of home, as in the study; a take whose chart is gone must still be reachable.
- **His own charts are in the library too**, marked with their style when their text names one, and plainly his.

## The way back

The top left of every screen below home is a row of the places above it, each a button named for where it goes, and it never depends on how he arrived:

- the library, showing anything: `‹ Home`, pinned while the list scrolls
- a chart whose text names a style: `‹ Home / <STYLE>`, the second in that style's ink, going to the library showing that style
- a chart with no style, and any chart of his own that has none: `‹ Home / Charts`, going to the whole library
- a kept take: `‹ Home / Takes`
- the editor, the credits: the same rule (the editor is above its chart only in name; decide what its row is and say)

Home comes back to where it was scrolled, and so does the library. Walk this by hand and in headless Chrome until it cannot go wrong: home, a style on the wall, a chart, back, another style from the strip, a chart, Home; home, search, a chart, back; a chart opened from Recent, back. The stopgap on the main branch (`.opened` in `LibraryView.tsx`, the `Finding.style` filter) goes away with what it patched.

## The chart's screen, the take's, the editor: the look only

They are the next two briefs. In this one they get the row of places and the new system's controls, type and colours, so that the app is one app: nothing about how they work changes, and nothing is moved. A chart's screen may take its style's ink where the study does without changing a control's job (the chip in the way back; Play). Do not build the setup sentence, the sheets, the flooding dock or the players' movement.

## What must stay true

- Nothing in `packages/engine`, `packages/styles` or `packages/audio` changes. A style's ink is the app's to know: a table in `packages/app` by style id, with an ink for a style it has not been told about (so a ninth style needs no change here to work, only to be given a colour). If you find you want to change those packages, stop and say why.
- Everything the app does now it still does: play in a tap, keep and export, the editor, the arrangement grid, takes, offline, the saving-instruments line, credits, focus mode.
- A phone held upright (390 by 844) and a laptop (1280 by 800), light and dark. Tap targets 44 px. Focus visible from a keyboard. A press answers in the same frame; nothing moves on load or on hover; any movement is 150 ms at most and off under `prefers-reduced-motion`. The wall and the lists must scroll at a phone's full frame rate: no shadows or filters on things that scroll.
- Words are plain, sentence case outside the poster capitals, and say what a press does. "1 bar", not "1 bars" (`chartRow` in `LibraryView.tsx`).
- The stylesheet stays one file with its tokens at the top and its comments in plain words (why, not what), written for a musician who reads code. No state library, no router, no new dependency.

## Tests

`docs/TESTING.md` rations tests (binding). Add none. The five smoke journeys (`smoke/app.spec.ts`) must pass against the built app (`pnpm app:build && pnpm smoke`); where a name or a path you changed breaks a step, change that step to walk the same journey through the new interface and say exactly what you changed in each and why. Do not weaken what a journey proves. `pnpm check` must pass (run it alone: it is timed).

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/wall`, on a branch `wall`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests. Commit on the branch in a few sensible commits, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/BRIEF.md` sections 2, 11 and 13; `docs/TESTING.md`; `PLAN.md` "Resume here"; in `DECISIONS.md` the sections from "the interface pass, first half" on. Then `packages/app/src/` and `smoke/app.spec.ts`. Load the `frontend-design` skill before the visual work.

Look at your own work: `pnpm app --port <a free port over 8770>` serves the app; `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]` photographs it in headless Chrome. Photograph every screen you touch at both sizes and in both themes, read the pictures, and compare them with the study's. Save a final set in `/home/brandon/code/ensemble2/.work/wall/out/wall-1/` (not committed), named for the screen, size and theme.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the poster wall, part 1") with a line of why. Your final message is read by the engineer who will check and merge the branch. It should say: what home, the library and the way back now are, as a user meets them; every decision the brief left open; where you departed from the study and why; what changed in each smoke journey; the commits; the exact results of `pnpm check` and `pnpm smoke`; the pictures; what you could not verify (a real iPhone above all: safe areas, Safari's toolbars, container units, `overflow: clip`, how a press feels); anything you saw that is wrong and did not fix; and what the next brief (the chart's screen) should know. Do not say that anything looks good: say what you checked.
