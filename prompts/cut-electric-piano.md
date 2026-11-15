# Brief: cut the electric piano pack

Eight instrument packs are cut (`assets/packs/`), by `scripts/packs/cut.ts` from recipes in `scripts/packs/recipes/`. The next styles (neo-soul, reggae, disco's keyboard book) need an electric piano. You are adding one pack, `electric-piano`, in the same way as the others.

Read first: `CLAUDE.md`, `docs/AUDIO_NOTES.md`, `packages/audio/src/pack.ts`, `prompts/cut-packs.md` (the brief the first five were cut to: its rules, its "what happens to every take" and its report all still hold), then `scripts/packs/` (all of it; `recipes/grand-piano.ts` is the nearest pattern, `recipes/clean-guitar.ts` the most recent), and the entries about packs in `DECISIONS.md`.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/rhodes`, on a branch `rhodes`. Work only inside it. Commit on the branch in small commits, the pack included (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with).

- The clone's `.sources/` is a symlink to the fetched libraries. The one you need is there: `jrhodes3c/`, a git checkout at commit ba6000f633d0a1d405049d877851ff7cc43f108b, already declared in `scripts/packs/sources.ts`. Do not fetch anything and make no network requests.
- **Never write outside your clone.** `.sources` is a symlink, so a path like `.sources/x/../../y` leaves the clone. Use absolute paths under your clone for anything you write, and keep temporary files in `<clone>/.cut-tmp/`.
- Touch nothing under `packages/`. If the pack format cannot say something this instrument needs, stop and report it.

## The source

`jRhodes3c` by Jeff Learman: a 1977 Rhodes Mark I Stage 73, in `.sources/jrhodes3c/jRhodes3c-looped-flac-sfz/`. Read its `README.md` and the mapping `_jRhodes-mono-looped.sfz`.

- Use the **mono** recordings only (`*-mono.flac`). The stereo ones are the same takes with a pitch-shifted doubling.
- The mapping has up to five velocity layers a note (tops 47, 72, 95, 111, 127 in the mapping) and not every note has all five. Keep every recorded note and every layer it has, with the mapping's tops as the layers' tops, unless the pack format or the cut script's rules give a reason not to; say what you did.
- The recordings are looped in the mapping (`loop_mode=loop_continuous`) and the packs do not loop. Find out where each loop starts (the mapping, or the FLAC's own loop points, or by measurement) and report it. A note in the pack is the recording played once from its start, faded at its end as the cut script fades every take. If a recording's loop region is audibly part of a longer natural decay, keep it; if the file ends inside a sustained level (so playing it once ends in a cliff the fade must hide), report how long each note lasts and how loud it still is where it ends.

## The pack

- `electric-piano`. Mono. Level measure and reference as the grand piano's, unless the recipe pattern gives a reason to differ. Measure roots (do not trust the file names).
- Length: the band holds a chord for up to two bars of a slow tune, about seven seconds. Keep as much of each recording as it has, up to 7 s at the bottom falling to 5 s at the top, inside a budget of 40 MB decoded. If that does not fit, shorten the top first and say so.
- `release`: from the mapping's `ampeg_release` (0.3), unless that is wrong for how the sampler uses it; say which.
- No extra voices. One alternate a zone (the source has one take of each).
- `credits`: the source's title, author, link and licence as `sources.ts` has them, with `changes` saying what the cut did, in the manner of the other packs. **The licence is CC BY-NC-SA 4.0: not permissive.** The pack's `LICENCE` file is the source's `LICENSE`, as the cut script copies it. Do not reword it.

## Check

Run the round-trip check, the budgets, `pnpm typecheck`, `pnpm lint`, `pnpm check`. The eight existing packs must be untouched: `git status` shows only the new pack and your recipe (and the recipe index, if there is one).

Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`.

## Your report

As in `prompts/cut-packs.md`: the pack's table (notes, layers, files, encoded and decoded size), the round-trip numbers, measured roots against the mapping's, where the loops start and how each note ends, every departure from this brief and why, and anything the next person should know. Do not describe how anything sounds.
