# Brief: cut the steel-string guitar pack

Ten instrument packs are cut (`assets/packs/`), by `scripts/packs/cut.ts` from recipes in `scripts/packs/recipes/`. The acoustic style's guitar is to be a steel-string, chosen by the owner's ear from three (`scripts/steel-study.ts`): an archtop recorded through a microphone. You are adding one pack, `steel-guitar`, in the same way as the others. The nylon guitar stays as it is.

Read first: `CLAUDE.md`, `docs/AUDIO_NOTES.md`, `packages/audio/src/pack.ts`, `prompts/cut-packs.md` (the brief the first five were cut to: its rules, its "what happens to every take" and its report all still hold), then `scripts/packs/` (all of it; `recipes/clean-guitar.ts`, `recipes/nylon-guitar.ts` and `recipes/electric-piano.ts` are the nearest patterns), and the entries about packs in `DECISIONS.md`.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/steel`, on a branch `steel`. Work only inside it. Commit on the branch in small commits, the pack included (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with).

- The clone's `.sources/` is a symlink to the fetched libraries (excluded from git; do not commit it). The one you need is there: `shinyguitar/`, a git checkout at commit 57243cca85277dbcc120ce17c6178032f93c80f3, already declared in `scripts/packs/sources.ts`. Do not fetch anything and make no network requests.
- **Never write outside your clone.** `.sources` is a symlink, so a path like `.sources/x/../../y` leaves the clone. Use absolute paths under your clone for anything you write, and keep temporary files in `<clone>/.cut-tmp/`.
- Touch nothing under `packages/`. If the pack format cannot say something this instrument needs, stop and report it.

## The source

Karoryfer Samples' Shinyguitar (CC0): an archtop guitar, recorded through a magnetic pickup and through a microphone. Read its `readme.txt` and the mappings in `Programs/` (`main.sfz` and the `acoustic_*.sfz` files).

- Use the **microphone** recordings only: `Samples/acoustic/`. Sixteen or seventeen notes about a minor third apart, each at four dynamics (`vl1` soft to `vl4` hard; the mapping splits them at velocities 32, 64 and 96) with four alternates (`rr1` to `rr4`).
- The folder also has release noises (`*_release_*`), muted strings (`mute_*`) and body taps (`perc_*`). Say in your report what each is (length, level, whether it has a pitch) and do not use them.
- Karoryfer's bass library names its notes an octave high (`docs/AUDIO_NOTES.md`). Find out by measurement whether this one's names and key centres are right, and trust the measurement.

## The pack

- `steel-guitar`, name "Steel-string guitar". Mono. Level measure `loudness`, reference -20 LUFS, as the other guitars'. Measure roots.
- One voice: every recorded note, all four dynamics as four layers with the mapping's tops (32, 64, 96, 127), two alternates a zone (the first two of the four, unless one of them measures badly: say which you took). The band picks single notes softly and strums five or six of them hard, from E2 (40) to about B5 (83), and a soloist plays the same pack up to E6 (88).
- Length: a strummed chord rings up to two beats, a picked note until the chord changes, and the last chord of a tune is left to ring. Keep each recording up to 4 s at the bottom falling to 2.5 s at the top, inside a budget of 80 MB decoded. If that does not fit, shorten the top first and say so.
- `release`: the mapping gives one (`ampeg_release`); in the pack a note's end is a hand damping or leaving the string. Choose in the manner of the other guitars (clean 0.06, nylon 0.1) and say what you chose and why.
- `credits`: from `sources.ts`, with `changes` saying what the cut did, in the manner of the other packs. `LICENCE` is the source's `LICENSE`, as the cut script copies it.

## Check

Run the round-trip check, the budgets, `pnpm typecheck`, `pnpm lint`, `pnpm check`. The ten existing packs must be untouched: `git status` shows only the new pack and your recipe (and its registration).

Never `pkill -f`, and never `pgrep -f` in a wait loop. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`. Leave no shell or server running when you finish.

## Your report

As in `prompts/cut-packs.md`: the pack's table (notes, layers, alternates, files, encoded and decoded size), the round-trip numbers, measured roots against the mapping's and the file names, how loud each layer is against the next before levelling, lengths and how far each note has decayed where it is cut, what the unused recordings are, every departure from this brief and why, and anything the next person should know. Do not describe how anything sounds.
