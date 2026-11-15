# Build: song mode and the arrangement grid (stage 6, part 4)

You are building one part of Ensemble, a backing band in a browser. The library, the play screen, the editor and takes exist and are deployed. The engine can now read an arrangement (who plays in each section of a song, and how hard) and play a chart once through as a song. You are adding the two things in the app that use it: playing a chart as a song, and a grid that edits its arrangement.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/grid`, on a branch `grid`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with the two lines the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

Read first, in this order: `CLAUDE.md`, `docs/BRIEF.md` sections 4.1 and 11, `docs/CHART_FORMAT.md` section 11 (the arrangement block: read it closely), `docs/TESTING.md`, and in `DECISIONS.md` the sections from "stage 6 begins" to the end. Then read all of `packages/app/src/`, and in the engine `packages/engine/src/chart/arrangement.ts`, `chart/arrange.ts` and the `ArrangementLine` types in `chart/model.ts`. Match what is there: its structure, its comment style (plain words, written for a musician who reads code; say why, not what), its CSS (one stylesheet, the tokens at its top), and its restraint. No new dependency.

## What is already there (do not rebuild it)

- `parse(text).chart.arrangement`: null when the chart has no block; otherwise `lines` (one for each section, or null when the block is not an arrangement), `fits` (the lines match the song, so the block is used) and `typed` (not null when a line has a mistake in it).
- `arrangedLines(chart)`: one line for each section the song plays, in order. It is the chart's own arrangement when it fits, a plain one when the chart has none, and the chart's lined up with the song again when the song has changed under it.
- `withArrangement(text, lines)`: the chart's text with its block set to those lines. `withoutArrangement(text)`: the text with no block.
- `PlanOptions.mode: "song"`: the chart once through in the order written, with its arrangement when it has one that fits. `Plan.mode` says which a plan is. In a song, `bar.section.occurrence` counts the sections as they are played, from 0, and matches the arrangement's lines.

## What to build

### 1. A chart played as a song (the play screen)

- The Length control gains a first choice, **"The song, once through"**. It is a choice for that chart (`ChartChoices`), not for all of them: choosing any other length for the chart undoes it. A chart whose arrangement fits is a song until the player says otherwise; any other chart is a jam until they say otherwise.
- `takeOptions` (`play/jam.ts`) then asks for `mode: "song"`, with no length. Keep, the takes shelf and a take's screen need no change of kind, but check them: a kept song plays again as that song.
- **There is no Finish in a song**: it has its own end. The transport reads Stop while a song plays.
- **The status strip** (`play/StatusStrip.tsx`) speaks of passes. In a song it names the section being played instead (its label, and which of how many, such as "Chorus, 3 of 7"), keeps the time left, and its drawing of the plan's energy shows the sections of the song in order with the place in it. Before play it says the song's length. Look at how the strip is drawn now and keep one way of drawing, not two.
- The soloist's line in the strip follows the plan as it does now.

### 2. The grid (the editor)

- The editor gains a switch above the text: **Chords** and **Arrangement**. Chords is the text as now. Arrangement puts the grid where the text was; the rendered chart stays beside it (above it on a phone).
- **The grid**: one column for each section the song plays, in order, its label at the head (from `arrangedLines`). Five rows: Energy, Drums, Bass, Chords, Soloist. The row names stay put at the left while the columns scroll sideways on a narrow screen.
- **A cell shows its value at a glance**, not as a digit alone: a level is a block filled to that height (1 to 4), "out" is plainly empty, and a player that follows the section shows the section's level in a quieter way than one given a level of its own. An Energy cell left to the style says so ("style").
- **Setting a value**: choosing a cell selects it, and a row of choices under the grid sets it: for a player, Follow, 1, 2, 3, 4, Out; for Energy, Style, 1, 2, 3, 4. On a keyboard the arrow keys move the selection and `-`, `1` to `4` and `.` set it. Targets are at least 40 px. Do not make a tap cycle through values: six taps to reach "out" is not usable.
- **Every change is written into the chart's text** with `withArrangement` and saved the way typing is saved. Nothing is written until the first change: a chart with no block shows its plain arrangement and stays without a block until a cell is set.
- **When the block does not match the song** (`arrangement.fits` is false and it has lines): the grid shows it lined up again (`arrangedLines`), says in a line of plain words that the song has changed since the arrangement was written, and the first change writes the lined-up arrangement. **When the block has a mistake in its text** (`typed` is not null): say so, point to Chords where the mistake is marked, and offer to write it out clean from what could be read.
- **Remove arrangement** takes the block out of the text (`withoutArrangement`), asking first with the browser's `confirm`.
- Format, Export, Delete and Play in the editor work as now from either side of the switch.

## Not in this part

- No new test. The five browser journeys are fixed (`docs/TESTING.md`) and must still pass; the engine suite is not yours to add to.
- No engine change. If the grid needs something the engine does not give, stop and say what in your report.
- No change to how a jam is planned or played.

## How to check your work

- `pnpm check` and `pnpm smoke` must pass. The engine suite sits at about 9.1 s of a 10 s budget on a quiet machine. If it goes over while you are running browsers at the same time, that is contention: rerun it alone before believing it.
- Run the app with `pnpm app --host 127.0.0.1 --port 8770` (use ports 8770 and 8771 only) and look at it with `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]`, then Read the PNG. Look at the grid at 390x844, 844x390 and 1280x800, in light and dark, with a song of seven or more sections (the example in `docs/CHART_FORMAT.md` section 11 needs a chart with those sections: `test/corpus.ts` has one, `arrangedSong`). Look at the play screen playing a song. Look sparingly: each picture costs a great deal to read, so check several things per picture.
- Check by running it, not by reading it, with a scratch Playwright script under `scripts/` (`chromium.launch({ channel: "chrome", args: ["--password-store=basic"] })`; delete it before you finish): set cells by pointer and by keyboard and read the chart's text back; a chart with no block gains one on the first change and not before; a block that does not fit is lined up on the first change; Remove takes it out; a song with the drummer out of its intro plays with `plan.bars` showing the drums out there (the plan is reachable from the worker's reply, or check with `pnpm -s ensemble render <chart> --song --out x.mid --save x.json` on the same text).
- Stop servers by port (`fuser -k 8770/tcp`). Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.
- You cannot hear, and you cannot hold a phone. Say plainly in your report what you could not verify.

## Also

- Add a section to `DECISIONS.md`, "song mode and the arrangement grid (stage 6, part 4)": each thing you decided that this brief did not settle, one line of why each.

## Report

When done, report: what you built and where; each decision you made that this brief did not settle, with one line of why; what you verified and how; what you could not verify; anything in the existing app or engine you found wrong while working (do not fix unrelated things; report them). Keep it short and factual.
