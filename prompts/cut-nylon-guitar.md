# Brief: cut the nylon-string guitar pack

Ten instrument packs are cut (`assets/packs/`), by `scripts/packs/cut.ts` from recipes in `scripts/packs/recipes/`. The last style, acoustic, is played on a nylon-string guitar, picked and strummed. You are adding one pack, `nylon-guitar`, in the same way as the others.

Read first: `CLAUDE.md`, `docs/AUDIO_NOTES.md`, `packages/audio/src/pack.ts`, `prompts/cut-packs.md` (the brief the first five were cut to: its rules, its "what happens to every take" and its report all still hold), then `scripts/packs/` (all of it; `recipes/clean-guitar.ts` and `recipes/electric-piano.ts` are the nearest patterns), and the entries about packs in `DECISIONS.md`.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/nylon`, on a branch `nylon`. Work only inside it. Commit on the branch in small commits, the pack included (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with).

- The clone's `.sources/` is a symlink to the fetched libraries (excluded from git; do not commit it). The one you need is there: `spanish-classical-guitar/SpanishClassicalGuitar-SFZ+FLAC-20190618/`, the extracted release archive, already declared in `scripts/packs/sources.ts`. Do not fetch anything and make no network requests.
- **Never write outside your clone.** `.sources` is a symlink, so a path like `.sources/x/../../y` leaves the clone. Use absolute paths under your clone for anything you write, and keep temporary files in `<clone>/.cut-tmp/`.
- Touch nothing under `packages/`. If the pack format cannot say something this instrument needs, stop and report it.

## The source

FreePats' Spanish classical guitar (CC0): 48 mono recordings, one of each note, one dynamic, mapped chromatically by `SpanishClassicalGuitar-20190618.sfz`. Read its `readme.txt` and the mapping.

- A guitar's lowest string is E2 (MIDI 40), and this mapping starts at a file called `G1`. Find out by measurement what each file's pitch really is and which MIDI note the mapping gives it, and say whether the names, the mapping and the measurement agree. Trust the measurement.
- Report each note's length, and how far it has decayed where the recording ends (the level of its last 100 ms against its loudest 50 ms), lowest, middle and highest.
- Report the noise floor before each note's onset if there is one to speak of (the readme says the recording conditions were poor and filters were applied).

## The pack

- `nylon-guitar`. Mono. Level measure `loudness`, reference -20 LUFS, as the clean guitar's. Measure roots.
- One voice, one layer (top 127), every recorded note as its own zone, one take each. The band will pick single notes and strum chords of four to six of them, from E2 (40) up to about B5 (83): keep every note the source has.
- Length: keep each recording whole up to 5 s; a strummed chord rings up to two beats and a picked note is let ring. Budget 45 MB decoded. If it does not fit, shorten the top first and say so.
- `release`: the mapping says 1.5 s, which is a note left to ring after the key is let go. In the pack a note's end is the hand damping or leaving the string; choose a value in the manner of the clean guitar's and say what you chose and why.
- `credits`: from `sources.ts`, with `changes` saying what the cut did, in the manner of the other packs. `LICENCE` is the source's `cc0.txt`, as the cut script copies it.

## Check

Run the round-trip check, the budgets, `pnpm typecheck`, `pnpm lint`, `pnpm check`. The ten existing packs must be untouched: `git status` shows only the new pack and your recipe (and its registration).

Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.

## Your report

As in `prompts/cut-packs.md`: the pack's table (notes, files, encoded and decoded size), the round-trip numbers, measured roots against the mapping's and the file names, lengths and decay, noise, every departure from this brief and why, and anything the next person should know. Do not describe how anything sounds.
