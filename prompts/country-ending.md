# Build: country's own ending, the walk-up into the last root and the guitar's stinger (#2278)

The issue is the specification: `gh api repos/brndnsh-labs/Ensemble/issues/2278 --jq .body`. Country itself
merged in #2289 (issue #2243); its brief is `prompts/style-country.md`, and its decisions are in `docs/decisions/styles.md`. Read again:
`CLAUDE.md`, `docs/TESTING.md`, and in `docs/music-notes/a-rhythm-section.md` **EN-45 to EN-49 in full: they
are the specification**, with ST-country-10 in `c-styles.md`. Then the endings as the engine has them: the
planner's ending bars, `packages/engine/src/players/bass/` (walk, play, ending), and
`packages/engine/src/players/chords/ending.ts` with the guitar idiom.

## Where you are

A git worktree at `/home/brandon/code/ensemble/.work/2278`, branch `country-ending`, from `origin/main` with
country in it, dependencies installed. Same limits as the style's build: work only here; explicit paths, never
`git add -A`, `--no-verify`, amend or bare `git stash`; no push, no pull request, nothing on GitHub beyond
reading the issue; not the `legacy` branch; nothing about the project to outside services; servers on ports
8770 and 8771 only, stopped by port. End each commit message with:

    Co-Authored-By: Claude Opus <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01WSqFoPyrBesZYYie7fD53M

## Stop once, early

After reading, **stop and report** (under 400 words) how you would say each of these as a general concept
with its validation, where it goes, and what in it is not small: (a) a walk into the final chord on every
take at any level (`WalkPolicy.ending`), its tones counted from the landing, with EN-47's variants and EN-48's
register, the final root placed where the walk fits; (b) the pull-off on the final chord
(`ChordStyle.ending.pullOff`) with the guitar's reach rule. Say which existing styles' endings each code path
touches and how you will show they do not move. I will answer before you build.

## What the notes ask (the calls already made)

- **The walk-up (EN-46):** in the bar before the ending, every time, at any energy including a ballad, in
  4/4, only where the ending bar is one chord struck on its downbeat. The bar's root on 1, then the fifth,
  sixth and seventh counted from the landing root on beats 2, 3 and 4, into the root on the downbeat. Over
  the V the fifth is already sounding and holds through beat 2 ("G, A-B, C"). The seventh is the current
  chord's own tone a whole step under the landing if it has one (C7 gives Bb), else the leading tone. The
  final root is struck at least as hard as the walk's last note. Velocities as written there.
- **Its variants (EN-47):** from the IV it walks down (F, then E and D, into C); where the bar's root already
  lies inside the run it keeps boom-chick and walks in on beat 4 only; a chord struck on beat 3 keeps its
  root there and adds at most one note on 4.
- **Its register (EN-48):** the lowest octave whose fifth is still on the instrument; a start more than an
  octave above the run walks down to the low root.
- **The rule from the style's build still holds on beat 4:** never a note a half step above a tone of the
  chord being played, a chord tone itself excepted. Where EN-46 and that rule disagree for some chord, say
  which bars and what each would play; do not pick silently.
- **The stinger (EN-49):** on the final tonic only, the guitar strikes the chord with its sixth on top (the
  flat sixth in minor) and pulls it off to the fifth an eighth later, 10% softer, which then rings. Only
  where both notes sit in the top two voices on one string within the hand's reach, and not where the sixth
  would rub a half step under another chord note. Some open shapes (C, D) have none: list which of the keys
  the six charts use get one.
- **Out of scope:** a Nashville tag.

## Rules of this build

- General concepts with validation; country uses them as data. **The other eight styles byte for byte**: all
  their goldens, and `pnpm score` with no movement on their cards.
- A property only if no existing one can see it; likely one, stated as music ("in a style whose bass walks
  into its ending, every ending that is one chord on its downbeat is walked into, and the last root is the
  loudest of the run"), asked by a condition read from the data, never a style's name. No existing property,
  floor or tolerance is changed. Plant a fault for whatever you add and show it fails.
- A critic measure on country's card if one says something the property does not.
- Country's two goldens will move in their last bars: say which notes. Re-accept country's scorecard only.
- You cannot hear. Read the endings (`pnpm -s ensemble read ... --bars <last four>`) on each of the six
  charts at 0.3, 0.55 and 0.85 and report the notes of each walk and each stinger, and each case with no
  stinger and why.

## The listening page (this build writes it, for the whole style)

`out/country/index.html`, not committed, in the manner of `out/jazz-waltz/` if it is still on disk in the
main checkout (`/home/brandon/code/ensemble/out/jazz-waltz/`, read-only for you) and otherwise as the
decisions describe the earlier pages: each clip with what was measured beside it and the part bar by bar
where it helps. Clips with `pnpm render:audio`:

1. The ballad held quiet, the band alone.
2. The two-step at the middle level, the band alone (name the sections that drew the two-step and the light train).
3. The train held hot, the band alone (name the lattice and the steady-eighths sections).
4. A jam on its arc with the lead guitar.
5. The same chart with no bassist, so the guitar's boom can be heard.
6. Two endings, one in a key with a stinger and one without, the last four bars named note by note.
7. The song chart whole.

"Listen for" lines, one a clip, that name what the reviews found and left, plainly and without asking for a
count: the walk down through the seventh under the guitar's upstroke when hot; the three-note C6 chick; six
strikes a bar from the guitar under a hot solo; the lead's first chorus against its last (notes a bar, both
given). No claim about how anything sounds; no question asking whether he wants more or fewer of anything.

## Gates

`pnpm check`, `pnpm test:full`, `pnpm score`, `pnpm smoke`, each alone on a quiet machine (`uptime` first; the
budget is CPU seconds and reads high under load: rerun alone before believing an overrun).

## Report

Under 500 words: the concepts and where they went; each chart's ending as read; the stinger's keys; the
property and its plant; goldens and scorecard movement; gates; where the page is and what each clip is.
Kill every shell and server before reporting.
