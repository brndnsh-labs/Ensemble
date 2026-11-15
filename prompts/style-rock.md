# Build: the rock style (stage 6, part 5, first of five)

You are adding a style to Ensemble, a generative backing band: text and a seed go into a pure engine and a performance comes out. Blues, jazz and funk exist, were each auditioned by the owner (a bassist and guitarist) and passed. Rock is the first of five more. It is the nearest to what exists ("near blues, straight eighths"), so it is also the test of the project's rule that **styles are data**.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/rock`, on a branch `rock`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

## Read first

- `CLAUDE.md` (the standing rules bind you), `docs/BRIEF.md` sections 5 to 8, `docs/TESTING.md`.
- `docs/MUSIC_NOTES.md`, then in `docs/music-notes/c-styles.md`: "How to read the grids", "Styles: overview", **"Style: rock" in full (ST-rock-01 to ST-rock-33: this is your specification)**, and "Style: blues" and "Style: funk" to see how the same kind of notes became the packs that exist. In `a-rhythm-section.md` and `b-comping-soloist.md`, the cross-cutting rules and whatever the rock notes point at.
- The three style packs, all of `packages/styles/src/` (about 4,000 lines), and the types and validators they are written against (`packages/engine/src/style/types.ts`, each seat's `style.ts` and `validate.ts` under `packages/engine/src/players/`). Read the seats' engines as far as you need to know what the data means.
- In `DECISIONS.md`: "stage 4 begins", "a library for three styles", and the sections for each jazz and funk seat build, for how the last two styles were added and what was learned.
- `test/takes.ts` and one property file, to see what every style is held to.

## What to build

1. **`packages/styles/src/rock/`**: `index.ts`, `drums.ts`, `bass.ts`, `chords.ts`, `solo.ts`, `critic.ts`, and one line in `packages/styles/src/index.ts`. Written from the rock notes. Where a note is marked solid, follow it; where it says unclear, decide and log. The piano is the chord seat's instrument (ST-rock-32); the guitar book is not part of this build.
2. **Sound**: packs `drum-kit`, `electric-bass` and `grand-piano` (all exist in `assets/packs/`), a mix in the style's `sound` in the manner of the others, General MIDI programs for the export. The soloist's default instrument must be one in `SOLO_INSTRUMENTS` (there is no lead guitar pack yet): choose, and say why. Habits the notes give the lead guitar (bends, vibrato) apply only as far as the instrument model has them; do not invent an instrument.
3. **Library**: five or six charts in `library/rock-*.chart`, in the manner of the others (look at their headers and how plain they are): the forms a rock rhythm section is asked for most (for example a three-chord rocker, I V vi IV, a minor-key i VI VII, a riff on one or two chords, a 50s I vi IV V, and one song with an intro, verses, a chorus, a bridge and an outro). Give the song chart an arrangement block that fits it (`docs/CHART_FORMAT.md` section 11), so the library has one arranged song. Generic progressions only: no chart may be a named song.
4. **The critic and the scorecard**: `rock/critic.ts` with weights and targets from the notes' measured numbers (ST-rock-11, ST-rock-26 and what the other styles' critics show is needed), then `pnpm -s ensemble score --style rock --update` to accept `scorecard/rock.json` once the numbers are where the notes say they should be. Say in your report what each target is and where the style sits against it.
5. **A golden take or two** for rock, the way `test/goldens.ts` holds the others, with the line in `DECISIONS.md` that the rules ask for.

## The rules of this build

- **Styles are data.** If rock cannot be written in the data as it stands, the engine is missing a concept. A small general concept you may add, saying in your report why it is general and not a special case for rock. If it is not small (a new way of playing for a seat, a change to the planner), **stop and report what is missing** instead of building it: that is a design call for the main session.
- **The other three styles must not change.** Their goldens and scorecards must hold exactly. If an engine change of yours moves them, it was not general.
- **No new properties** unless rock breaks a rule a musician would name and no existing property can see it; then one, stated as a rule about music, and say so. The suite's budget is 10 seconds and it stands at about 9.1 with three styles, each style running in a process of its own, side by side, on 8 cores. Measure `pnpm check` with rock added and report the number. If it goes over, do not trim anything: report it.
- **You cannot hear.** Never say it sounds good. Print takes and read them (`pnpm -s ensemble render library/rock-….chart --style rock --seed 1 --out x.mid`, and whatever the other builds used to read a part as text), measure them against the notes, and report the measurements. The owner will listen on the app.
- The app picks the style up by itself (the Style control and the library's shelves read `STYLES`). `pnpm smoke` must still pass.

## How to check your work

- `pnpm check`, `pnpm test:full`, `pnpm score` and `pnpm smoke` must pass. If the suite goes over budget while you are running other things, that is contention: rerun it alone before believing it.
- Read at least a low, a mid and a high pass of each seat on two charts and compare them with the notes' grids, bar by bar, before you call a seat done.
- Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.

## Also

- Add a section to `DECISIONS.md`, "rock (stage 6, part 5)": each thing you decided that the notes and this brief did not settle, one line of why each; every engine change and why it is general.

## Report

When done, report: what you built and where; every engine change; each decision, with one line of why; the scorecard against the notes' targets; the suite's time with four styles; what you verified and how; what you could not verify; what the next four styles (disco, neo-soul, reggae, acoustic) will need that this build shows is missing. Keep it short and factual.
