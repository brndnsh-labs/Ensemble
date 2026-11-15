# Build: the disco style (stage 6, part 5, second of five)

You are adding a style to Ensemble, a generative backing band: text and a seed go into a pure engine and a performance comes out. Blues, jazz, funk and rock exist, were each auditioned by the owner (a bassist and guitarist) and passed. Disco is the second of five more. Rock was built the same way you are about to build disco, from `prompts/style-rock.md`; its sections in `DECISIONS.md` ("rock", "rock, checked and merged") are the nearest thing to a worked example.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/disco`, on a branch `disco`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

## Read first

- `CLAUDE.md` (the standing rules bind you), `docs/BRIEF.md` sections 5 to 8, `docs/TESTING.md`.
- `docs/MUSIC_NOTES.md`, then in `docs/music-notes/c-styles.md`: "How to read the grids", "Styles: overview", **"Style: disco" in full (ST-disco-01 to ST-disco-35: this is your specification)**, and "Style: funk" and "Style: rock" to see how the same kind of notes became the packs that exist. In `a-rhythm-section.md` and `b-comping-soloist.md`, the cross-cutting rules and whatever the disco notes point at.
- The four style packs, all of `packages/styles/src/`, and the types and validators they are written against (`packages/engine/src/style/types.ts`, each seat's `style.ts` and `validate.ts` under `packages/engine/src/players/`). Read the seats' engines as far as you need to know what the data means. Funk is the nearest: sixteenths, an electric bass with its own figures, and a guitar on the chord seat with a muted stroke.
- In `DECISIONS.md`: "stage 4 begins", "a library for three styles", the sections for the funk seat builds (the guitar idiom above all), "rock", "rock, checked and merged; the suite is over its budget", and "the lead guitar bends and shakes".
- `test/takes.ts` and one property file, to see what every style is held to.

## What to build

1. **`packages/styles/src/disco/`**: `index.ts`, `drums.ts`, `bass.ts`, `chords.ts`, `solo.ts`, `critic.ts`, and one line in `packages/styles/src/index.ts`. Written from the disco notes. Where a note is marked solid, follow it; where it says unclear, decide and log.
2. **Sound**: packs `drum-kit` (it has a shaker voice), `electric-bass` and `clean-guitar` (all exist in `assets/packs/`), the clean guitar on the chord seat (ST-disco-33, ST-disco-34), a mix in the style's `sound` in the manner of the others, General MIDI programs for the export. The soloist's default is the alto sax (ST-disco-33). A horn's scoop and fall are not in the instrument model and are not played; the guitar's bend and shake habits are style data now (`SoloStyle.habits.bend`, `.shake`), so give disco the numbers ST-disco-25 has for a guitar. Do not invent an instrument: no organ, no Rhodes, no strings.
3. **Library**: five or six charts in `library/disco-*.chart`, in the manner of the others (look at their headers and how plain they are): the forms a disco rhythm section is asked for most (for example a minor vamp on two chords, a four-chord loop with sevenths and ninths, a falling-fifths loop in minor, a major-key I to IV groove, and one song with an intro, verses, a chorus, a break and an outro). Give the song chart an arrangement block that fits it (`docs/CHART_FORMAT.md` section 11): a breakdown where players lay out and come back is what the block is for. Generic progressions only: no chart may be a named song.
4. **The critic and the scorecard**: `disco/critic.ts` with weights and targets from the notes' measured numbers (ST-disco-04, ST-disco-10, ST-disco-12, ST-disco-16, ST-disco-27 and what the other styles' critics show is needed), then `pnpm -s ensemble score --style disco --update` to accept `scorecard/disco.json` once the numbers are where the notes say they should be. Say in your report what each target is and where the style sits against it.
5. **A golden take or two** for disco, the way `test/goldens.ts` holds the others, with the line in `DECISIONS.md` that the rules ask for.

## The rules of this build

- **Styles are data.** If disco cannot be written in the data as it stands, the engine is missing a concept. A small general concept you may add, saying in your report why it is general and not a special case for disco. If it is not small (a new way of playing for a seat, a change to the planner), **stop and report what is missing** instead of building it: that is a design call for the main session. Things the notes ask for that may or may not exist yet, to find out early: a kick that plays through every fill (ST-disco-04), a bass figure fixed in one octave for the whole song (ST-disco-12), a lead-in that replaces the last note before a change (ST-disco-14), the sixteenth pendulum with the chord sounding only where marked (ST-disco-17), a soloist figure that pumps one repeated pitch (ST-disco-25), and rules for other meters (ST-disco-03).
- **The other four styles must not change.** Their goldens and scorecards must hold exactly. If an engine change of yours moves them, it was not general.
- **No new properties** unless disco breaks a rule a musician would name and no existing property can see it; then one, stated as a rule about music, and say so (four on the floor through every bar and every fill is the likely one). The suite's budget grows with the styles: 12 seconds with four, 14 with five (`scripts/budget.ts`, `docs/TESTING.md`), and it stands at about 10.5 with four, each style in a process of its own, side by side, on 8 cores. Measure `pnpm check` with disco added and report the number. If it goes over 14, do not trim anything: report it.
- **You cannot hear.** Never say it sounds good. Print takes and read them (`pnpm -s ensemble render library/disco-….chart --style disco --seed 1 --out x.mid`, and whatever the other builds used to read a part as text), measure them against the notes, and report the measurements. The owner will listen on the app.
- **Levels.** `pnpm levels disco` renders each seat alone and reads its loudness (it needs Google Chrome and ffmpeg; it serves from the repo, which works under `.work/` now). Set the style's mix so the whole band reads near the other styles (about -17 to -18.5 LUFS with everyone playing) and the soloist about a decibel under the band, and report the numbers. ST-disco-35's make-up gain belongs to the old engine's mixer; use it as a hint, not a number.
- The app picks the style up by itself (the Style control and the library's shelves read `STYLES`). `pnpm smoke` must still pass.

## How to check your work

- `pnpm check`, `pnpm test:full`, `pnpm score` and `pnpm smoke` must pass. If the suite goes over budget while you are running other things, that is contention: rerun it alone before believing it.
- Read at least a low, a mid and a high pass of each seat on two charts and compare them with the notes' grids, bar by bar, before you call a seat done.
- Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`. Stop any server you start by its port (`fuser -k <port>/tcp`), and use ports 8770 and 8771 only.

## Also

- Add a section to `DECISIONS.md`, "disco (stage 6, part 5)": each thing you decided that the notes and this brief did not settle, one line of why each; every engine change and why it is general.

## Report

When done, report: what you built and where; every engine change; each decision, with one line of why; the scorecard against the notes' targets; the levels; the suite's time with five styles; what you verified and how; what you could not verify; what the next three styles (neo-soul, reggae, acoustic) will need that this build shows is missing. Keep it short and factual.
