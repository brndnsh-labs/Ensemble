# Brief: cut funk's two packs

The first five instrument packs are cut (`assets/packs/`), by `scripts/packs/cut.ts` from recipes in `scripts/packs/recipes/`. Funk needs two more: an electric bass with a dead note, and a clean electric guitar with a muted stroke. You are adding them, in the same way.

Read first: `CLAUDE.md`, `docs/AUDIO_NOTES.md`, `packages/audio/src/pack.ts`, `prompts/cut-packs.md` (the brief the first five were cut to: its rules, its "what happens to every take" and its layer tops all still hold), then `scripts/packs/` (all of it; `recipes/upright-bass.ts` and `recipes/grand-piano.ts` are the nearest patterns), and the entries about packs in `DECISIONS.md`.

## Rules

The same as `prompts/cut-packs.md`, with these differences:

- Your clone's `.sources/` is a symlink to the fetched libraries. The three you need are already there, fetched by hand: `black-and-blue-basses/` (a git checkout at commit 6e7d674cdb41be7a54dbccb15472401ad01099b9), `emilyguitar/` (a git clone at commit b4920dc662fd9cad6dcaccdeecffdd91c8725d8c), and `fsbs-clean-guitar/` (the extracted release archive, in the folder `EGuitarFSBS-clean SFZ+FLAC-20260807/`, beside the `clean.7z` it came from, whose SHA-256 is a929a3cbfc8289e325be56dab49f5fd560bbc3995c40b69f8f05caee380e8be3 and whose URL is https://github.com/freepats/electric-guitar-FSBS-clean/releases/download/2026-08-07/EGuitarFSBS-clean-SFZ+FLAC-20260807.7z). Do not fetch anything yourself and make no network requests.
- **Never write outside your clone.** `.sources` is a symlink, so a path like `.sources/x/../../y` leaves the clone. Use absolute paths under your clone for anything you write, and keep temporary files in `<clone>/.cut-tmp/`.
- You may edit `packages/audio/src/pack.ts` for the one change described below, and nothing else under `packages/`.

## What to do

1. **Sources.** Add the three to `scripts/packs/sources.ts`. The two git ones are like the others (give them `paths` matching what is checked out: for the basses `Programs`, `Samples/darkblack/reg`, `Samples/darkblack/ghost`, `Samples/darkblack/stac`). The guitar is a release archive, not a repository: extend `Source` and `fetch.ts` to fetch an archive by URL, check its SHA-256, and extract it with `7z` into `.sources/<id>/`. You cannot test the download; write it carefully and say in your report that it is untested.

2. **More than one credit.** The guitar pack draws on two libraries. Change `Pack.credit` to `Pack.credits`, a list with the main source first, in `pack.ts` and in the cut script, and let a recipe name more than one source. `LICENCE` holds each source's licence text in turn when they differ, or once when they are byte-identical. Recut the five existing packs so their `pack.json` has the new shape; their audio files must come out byte-identical to what is committed (check with `git status`), and say so.

3. **`electric-bass`**, from `black-and-blue-basses` (CC0): the "darkblack" bass, a Washburn AB-95 played with the fingers. An earlier listener preferred this bass to a Jazz bass.
   - Mono. Level measure `loudness`, reference -20 LUFS. Budget 30 MB decoded. Measure roots (`docs/AUDIO_NOTES.md`: this library names notes an octave high, and has about 25 ms of noise before each note; trust the mapping and the measurement over filenames).
   - Plain voice: the regular fingered notes (`reg`), four dynamics (p, mp, mf, f; tops 56, 68, 80, 127), covering MIDI 26 to 57 (the band plays 28 to 55). Two alternates in the middle two layers, one in the outer two. Length cap 3 s at the bottom falling to 2 s at the top; funk's notes are short (a third of a second), but a last note is held. `release` 0.08.
   - `dead` voice: from the `ghost` samples. Find out from the mapping, the user guide PDF (`pdftotext` is installed) and the audio what they are (length, whether they have a pitch). The band's dead notes are velocity 38 to 47, 80 ms long, pitched 29 to 40. If the ghosts are pitched and mapped by note, make `dead` a pitched voice over the same range with up to three alternates a zone, from the dynamics the source has (two layers, tops 44 and 127, if it has two). `release` 0.04.
   - Report what the `stac` samples are, but do not use them.

4. **`clean-guitar`**, from `fsbs-clean-guitar` (CC0) for the notes and `emilyguitar` (CC0) for the muted strokes.
   - Mono. Level measure `loudness`, reference -20 LUFS. Budget 30 MB decoded. Measure roots.
   - Plain voice: every recorded note of the FSBS mapping, both its dynamics (the mapping splits them at velocity 92; in the pack the tops are 70 and 127), two alternates each. The band's guitar plays MIDI 51 to 71 today in short strokes (an eighth of a second, sometimes two thirds); other styles will use more of the neck, so keep the whole recorded range. Length cap 4 s at the bottom falling to 2.5 s at the top. `release` 0.06.
   - `muted` voice: the `muted1` to `muted5` samples of `emilyguitar/noises/`, five alternates each. These are deadened strokes, not notes. Find out what distinguishes the five (the mapping `emily_basic.sfz` maps them to keys; measure length, level, and whether each has a dominant pitch or a spectral centre that rises from 1 to 5). The band writes a muted strum as several notes at once, one for each string, pitched 51 to 69, velocity 29 to 46, 80 ms long. Lay the five out as five zones of one layer so that lower notes of the strum play the lower-sounding strokes: give each zone a `root` that spreads the five evenly across 51 to 69 in order of their measured spectral centre, and say in the recipe that these roots place the strokes and are not tunings. Because a zone's root also retunes the recording, check how far the nearest-zone rule would shift a stroke (at most two semitones with five zones over that range) and report it. `release` 0.03.
   - `credits`: FSBS first, then Emilyguitar, with `changes` saying which voice came from which.

5. Run the round-trip check, the budgets, `pnpm typecheck`, `pnpm lint`, `pnpm check`. Commit in small commits, packs included.

## Your report

As in `prompts/cut-packs.md`: the table of packs, the round-trip numbers, measured roots, what the ghost and staccato samples are, what distinguishes the five muted strokes and where you placed them, that the five existing packs' audio is unchanged, every departure from this brief and why, and anything the next person should know. Do not describe how anything sounds.
