# Build: takes and export (stage 6, part 3)

You are building one part of Ensemble, a backing band in a browser. The library, the play screen and the editor exist and are deployed. You are adding takes: the player keeps a performance they liked, plays it again exactly, and exports it as a MIDI file.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/takes`, on a branch `takes`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with the two lines the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

Read first, in this order: `CLAUDE.md`, `docs/BRIEF.md` sections 4.3 and 11, `docs/TESTING.md`, and in `DECISIONS.md` the sections from "stage 6 begins" to the end (the last one, "a take, as it is kept", is the ground you build on). Then read all of `packages/app/src/` (about 3,900 lines with the stylesheet) and `packages/cli/src/commands/replay.ts`. Match what is there: its structure, its comment style (plain words, written for a musician who reads code; say why, not what), its CSS (one stylesheet, the tokens at its top), and its restraint. No new dependency. No state library, no router.

## What is already there (do not rebuild it)

- `TakeRecipe` in the engine (`packages/engine/src/take.ts`): chart name, chart text, style id, options, seed. It is everything that decides a take, and it is the file `ensemble replay` reads.
- `useJam(rig, call)` (`play/useJam.ts`) returns `take: TakeRecipe | undefined`: the take being played, or the last one played, as it was heard. It changes while a jam plays (an open jam is made longer; Finish turns it into a take that ends) and once more when it stops.
- A `Call` (`play/jam.ts`) whose options carry a seed plays that take again. `recipe.options` can be handed to it whole.
- `midiOf(recipe)` (`play/band.ts`) gives the take as the bytes of a MIDI file, made in the worker. They are the same bytes the CLI writes.

## What to build

### 1. Kept takes (`packages/app/src/takes.ts`)

- Stored in `localStorage` under `ensemble.takes.1`: a list of `{ id, kept, name, recipe }` (`kept` is when, in milliseconds; `name` starts as the chart's name and the player can change it). Follow `charts.ts` for everything it already solved: ids (`take-` and a random number in base 36), a browser that refuses storage, asking the browser to keep the site's storage, the `storage` event, `useSyncExternalStore`. If the two files would share more than a few lines, move what is shared into one place rather than copying it.
- Anything read from storage that is not a take (wrong version, a missing field) is left out of the list, not thrown on.

### 2. Keeping a take (the play screen)

- Whenever `jam.take` exists (playing, or after it stopped), the play screen offers **Keep**, beside the transport button in the footer and visibly secondary to it. Once pressed it reads **Kept** for that take. A new press of Play is a new take, not kept.
- A kept take follows the jam it came from: while that jam is still the one in `jam.take`, every change to `jam.take` is written to the kept take (that is how a take kept in its first chorus ends up with the ending the player later asked for).
- Removing a take is done on its own screen, not here.
- On a phone held upright the footer is tight. The whole form must still fit on one screen while playing (BRIEF 11), and the transport button must stay the obvious thing to press.

### 3. The library's shelf

- A "Takes" shelf under "Your charts" when there are any, newest first. Each row: the name, and one quiet line saying what it is, for example "Jazz in B♭, 176 bpm, 3:05, kept 14 Nov" (style, the key and tempo it was played in, its length, the day). Work these out from the recipe (`plan` from the engine is quick; `seconds(plan)` is the length). An open jam's length is that of the passes it got to. Choosing a row opens `#/take/<id>`.

### 4. The take's screen (`#/take/<id>`)

- **It is the play screen with nothing to set.** The chart is the take's own text (kept inside the recipe, so editing or deleting the chart later does not change the take), in the key it was played in, with the same page, playhead, status strip, reading and focus controls. Play plays that take again, by its seed. Share the code with `PlayView` by pulling out what the two have in common; do not copy the play screen. A take whose style no longer exists, or that will not play, says so in words and still offers Delete.
- In place of the setup controls, when it is not playing: the name as a text box (saved as it changes), and three actions. **Export MIDI** downloads `<name>.mid` (the bytes from `midiOf`, type `audio/midi`). **Export take** downloads `<name>.take.json`: the recipe, written as the CLI writes it (pretty JSON, keys sorted at every level, a trailing newline; see `writeRecipe` in `packages/cli/src/take-output.ts`). **Delete** asks first with the browser's `confirm`, then goes back to the library. Reuse the editor's way of downloading a file.
- Finish and Stop behave as on the play screen. Nothing that happens on this screen changes the kept take: it is a recording, not a setup. There is no Keep here.
- The way back goes to the library.

### 5. Smoke journey 5 (`smoke/app.spec.ts`)

"Export downloads a MIDI file that matches the CLI's output for the same take." One test: open a built-in chart, press Play, press Keep once it is offered, Stop; open the take from the library's shelf; press Export take and Export MIDI, catching both downloads; run the CLI on the take file (`node packages/cli/src/main.ts replay <take.json> --out <cli.mid>` from the repo root, with `execFileSync`); the two MIDI files are byte for byte the same. No sleeps, no retries. `pnpm smoke` must stay well inside its 60 seconds (it takes 7 now). Add no other test of any kind: `docs/TESTING.md` is binding.

## How to check your work

- `pnpm check` and `pnpm smoke` must pass. The engine suite sits at about 9.0 s of a 10 s budget on a quiet machine; you should not be adding to it. If it goes over while you are running browsers at the same time, that is contention: rerun it alone before believing it.
- Run the app with `pnpm app --host 127.0.0.1 --port 8770` (use ports 8770 and 8771 only) and look at it with `node scripts/look.ts <out.png> <width>x<height> <address> [dark] [click:Text | wait:ms | select:Label=value | eval:js ...]`, then Read the PNG. Look at the footer with Keep while playing, the shelf, and the take's screen at 390x844, 844x390 and 1280x800, in light and dark. Look sparingly: each picture costs a great deal to read, so check several things per picture.
- Check by running it, not by reading it: a take kept from an open jam ("Until I stop it") and then told to Finish; a take kept from a jam stopped dead; a take with the soloist on, a seat off and another key. For each, the take's screen plays, and `ensemble replay` on its exported file writes the same bytes as Export MIDI.
- Scratch scripts for Playwright go under `scripts/` (`chromium.launch({ channel: "chrome", args: ["--password-store=basic"] })`); delete them before you finish.
- Stop servers by port (`fuser -k 8770/tcp`). Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.
- You cannot hear, and you cannot hold a phone. Say plainly in your report what you could not verify.

## Also

- Add a section to `DECISIONS.md`, "takes and export (stage 6, part 3)": each thing you decided that this brief did not settle, one line of why each.
- Update the commands or boundaries in `CLAUDE.md` only if something you added changes them.

## Report

When done, report: what you built and where; each decision you made that this brief did not settle, with one line of why; what you verified and how; what you could not verify; anything in the existing app you found wrong while working (do not fix unrelated things; report them). Keep it short and factual.
