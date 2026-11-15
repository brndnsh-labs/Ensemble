# Build: the app's editor (stage 6, part 2)

You are building one part of Ensemble, a backing band in a browser. The play screen and library exist and are deployed. You are adding the editor: the player types a chart as text and sees it rendered beside the text as they type. Their charts are kept in the browser.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/editor`, on a branch `editor`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with the two lines the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

Read first, in this order: `CLAUDE.md`, `docs/BRIEF.md` section 11 (the app), `docs/CHART_FORMAT.md`, `docs/TESTING.md`, and in `DECISIONS.md` the sections from "stage 6 begins" to the end. Then read all of `packages/app/src/` (it is about 1,500 lines). Match what is there: its structure, its comment style (plain words, written for a musician who reads code; say why, not what), its CSS (one stylesheet, the tokens at its top, one typeface plus the system monospace you will add for the text), and its restraint. No new dependency. No state library, no router, no editor component from npm.

## What to build

### 1. The player's own charts (`packages/app/src/library.ts`, a new `charts.ts` or similar)

- **Stored in `localStorage`** as text, under one key (`ensemble.charts.1`): a list of `{ id, text, modified }`. Charts are a few hundred bytes each; this is decided, do not use IndexedDB. Reads and writes are wrapped so that a browser that refuses storage still runs (the chart then lasts for the visit). When the first chart is saved, ask the browser to keep the site's storage (`navigator.storage?.persist?.()`), ignoring the answer.
- An own chart's id is `my-` plus a short random string. A built-in's id is its file name, as now. The title, key and so on come from parsing the text, as for built-ins.
- The library screen shows a "Your charts" shelf above the built-in shelves when there are any, and a "New chart" action that makes one from a small starting text (a title, a key, four bars) and opens it in the editor. Also "Import a chart": a file picker for a `.chart` or `.txt` file, which becomes a new own chart.
- Everything that takes a `LibraryChart` today (the play screen, the address `#/chart/<id>`) works for own charts too.

### 2. The editor screen (`#/edit/<id>`)

- **From the play screen**: an "Edit" link in the header for an own chart; for a built-in, "Edit a copy", which makes an own chart from its text and opens that. The editor has "Play" (goes to `#/chart/<id>`), the way back to the library, "Format" (replaces the text with `print(parse(text).chart)` from the engine; this is the only thing that ever rewrites the player's text), "Export" (downloads the text as `<title>.chart`), and "Delete" (asks first, with the browser's own `confirm`).
- **Text on one side, the chart on the other, updating as you type.** Wide screens: two columns. A phone held upright: the chart above (it may take about two fifths of the height), the text below. The chart is the existing `ChartView` with no playhead. It must never throw while the text is half-typed: the parser never throws and a chart with errors still renders.
- **The text is a plain `<textarea>`** in the system monospace (`ui-monospace, …`), because bars line up in columns. Spellcheck, autocorrect and autocapitalise off. Saved to storage as it changes (a short debounce is fine; nothing may be lost on leaving the screen).
- **Diagnostics in place.** `parse(text).diagnostics` gives each problem a severity, a message written for a musician, and a range in the text. Show them two ways:
  1. **Under the text itself**: an underline at the range, coloured by severity (error: `--pencil`; warning and info: quieter). Do this with a backdrop: an element behind the textarea with the same text, font, padding, wrapping and scroll position, in which the ranges are wrapped in marked spans; the textarea's own background is transparent. Keep the two in step on scroll and on resize. Long lines must not wrap differently in the two.
  2. **A list under the text**: line number and message for each, errors first. Choosing one puts the caret on its range in the text and brings it into view. The message for the line the caret is on is the one a phone has room for: on a narrow screen show that one (or the first) with a count of the rest, expandable.
- **A key row on touch devices** (`@media (pointer: coarse)`, shown while the text has focus): one button each for `|  .  %  #  b  /  :  [  ]`, in that order, which types that character at the caret (replacing a selection) without taking focus from the text or closing the keyboard (handle `pointerdown` and prevent its default). It sits directly above the on-screen keyboard: position it from `window.visualViewport` (its height and offset change when the keyboard opens), and keep the text's caret visible above it. Buttons at least 40 px tall.

### 3. Smoke journey 3 (`smoke/app.spec.ts`)

"A chart typed in the editor renders, and an error shows a diagnostic in place." One test: make a new chart, type a short valid chart, see its bars in the rendered chart; then type something the parser rejects and see the diagnostic's message and its underline at the place. No sleeps, no retries. `pnpm smoke` must stay well inside its 60 seconds. Add no other test of any kind: `docs/TESTING.md` is binding (UI gets no tests beyond the named journeys).

## How to check your work

- `pnpm check` and `pnpm smoke` must pass. The engine suite sits at 9.1 to 9.3 s of a 10 s budget on a quiet machine; you should not be adding to it. If it goes over while you are running browsers at the same time, that is contention: rerun it alone before believing it.
- Run the app with `pnpm app --host 127.0.0.1 --port 8770` (use ports 8770 and 8771 only) and look at it with `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]`, then Read the PNG. Look at the editor at 390x844, 844x390 and 1280x800, in light and dark, with a clean chart and with a chart full of errors (`test/charts/` has a corpus of difficult ones). For typing, focus and the key row, write Playwright scripts under `scripts/` (`chromium.launch({ channel: "chrome", args: ["--password-store=basic"] })`; `hasTouch: true` and a mobile viewport for the key row) and delete them before you finish.
- Stop servers by port (`fuser -k 8770/tcp`). Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.
- You cannot hear, and you cannot hold a phone. Say plainly in your report what you could not verify (the key row above a real iOS keyboard is the obvious one).

## Report

When done, report: what you built and where; each decision you made that this brief did not settle, with one line of why; what you verified and how; what you could not verify; anything in the existing app you found wrong while working (do not fix unrelated things; report them). Keep it short and factual.
