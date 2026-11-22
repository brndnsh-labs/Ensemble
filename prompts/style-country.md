# Build: country, the ninth style (#2243)

You are adding a style to Ensemble, a generative backing band: text and a seed go into a pure engine and a
performance comes out. Blues, jazz, funk, rock, disco, neo-soul, reggae and acoustic exist and have been passed
by the owner's ear (a bassist and guitarist). Country is the ninth, built the way the last five were: from the
music notes, as data. The nearest worked examples are acoustic (a guitar on the chord seat with a hand that
picks and strums, `packages/styles/src/acoustic/`) and rock (the drummer's backbeat and its train),
with `docs/decisions/` holding what each of those builds decided and what the main session changed after.

## Where you are

A git worktree at `/home/brandon/code/ensemble/.work/2243`, branch `country`, dependencies installed. Work only
inside it. Commit in a few sensible commits, explicit paths only (never `git add -A`, never `--no-verify`, never
amend, never bare `git stash`). Do not push, open a pull request, or touch GitHub; do not deploy or touch any
server but the ones you start on ports 8770 and 8771 (stop them by port: `fuser -k 8770/tcp`). Do not read the
`legacy` branch or `~/code/ensemble-legacy`: the notes are what was carried over. The repository is public:
commit no private address and nothing about a network. Send nothing about this project, its owner or its files
to any outside service; a web search, if you make one, is about country music in general terms only.

## Read first

- `CLAUDE.md` (binding), `docs/BRIEF.md`, `docs/TESTING.md`, `docs/decisions/README.md`.
- `docs/MUSIC_NOTES.md`; in `docs/music-notes/c-styles.md`: "How to read the grids", "Styles: overview",
  **"Style: country" (ST-country-01 to 12)**, and "Style: acoustic" and "Style: rock" to see how notes became
  packs. In `a-rhythm-section.md`: **DR-58 to DR-60, BA-51 to BA-53, EN-45 to EN-49** and the cross-cutting
  rules. In `b-comping-soloist.md`: the guitar's hand (grips, open strings, the strum and the choke) and the
  lead guitar's bends. **These notes are your specification.** Where a note is marked solid, follow it; where
  it is unclear or silent, decide and log.
- All of `packages/styles/src/`, and what the packs are written against: `packages/engine/src/style/types.ts`,
  each seat's `style.ts` and `validate.ts` under `packages/engine/src/players/`, the planner's arc
  (`packages/engine/src/plan/`). Read the seats' engines as far as you need to know what the data means.
- `test/takes.ts` and one property file, to see what every style is held to.

## Decided already (the main session's calls; log them in the decisions as given)

- **The chord seat is the steel-string guitar** playing ST-country-07 (the top four strings in open position,
  the chick on 2 and 4 choked after an eighth), with ST-country-06's shape by level carried over to it: held
  with the bass when quiet, the chick at the middle, the "boom-chicka" when loud, and the added 6th on a plain
  I or IV, never on V. The notes chose the piano only because no steel-string pack existed; `steel-guitar`
  is cut now. First confirm from the pack's manifest and credits that `steel-guitar` is a steel-string
  acoustic guitar; if it is anything else, stop and say so. The piano's version is not built.
- **Bass**: `upright-bass`. **Drums**: `drum-kit`. **Soloist**: `clean-guitar`, the default (ST-country-08).
- **No new instrument**: no pedal steel, no fiddle, no second guitar. A new kind of sound is a question of
  its source and licence, which is the owner's. If the build shows one is badly missed, say so in the report.
- **4/4 only.** Country writes no other meter in this build; in three, six and twelve it plays what the
  engine fits from its 4/4 parts, held only to the rules of any bar. (A country waltz is its own piece of
  work and will be filed.)
- **Everyone stays in**: no `layOut` in the arc (as rock and acoustic). The arc is ST-country-11's: ballad,
  two-step, train.
- **Tempo**: default 110 (ST-country-01), a range you set from what the three feels can carry (a ballad's
  slow end to a train's fast end) and log.

## Stop once, early

After reading, and before writing the style, **stop and report** (under 500 words): each thing the notes ask
for, whether the data can say it today, and for each that it cannot, the smallest general concept that would
let it. The likely ones to check: a drummer's pattern chosen by the section among weighted alternatives
(two-step 70% / light train 30%; the lattice 60% / eighths 40%); a continuous ghosted sixteenth lattice on the
snare; the kick's feathered 2 and 4 and the open hat on 4 above a level; a bass that plays exactly root and
fifth with the fifth below where the register allows, and the root on 3 over a slash chord on its fifth
(BA-51); note lengths by level (BA-52); the walk on beats 3 and 4 into a change a third to a tritone away with
its chances (BA-53); the ending's walk-up in the bar before (EN-46 to 48); the guitar's stinger on the final
chord (EN-49); the guitar taking the boom itself when there is no bassist (ST-country-07); fills that are
pickups and keep the backbeat (ST-country-04, DR-60); the lead's curl into the major third and the whole-step
bend (ST-country-08). I will answer which concepts to add and which to leave out of this build.

## What to build (after my answer)

1. **`packages/styles/src/country/`** (id `country`, name "Country"): `index.ts`, `drums.ts`, `bass.ts`,
   `chords.ts`, `solo.ts`, `critic.ts`, and its line in `packages/styles/src/index.ts`.
2. **Sound**: the packs above, a mix in the style's `sound` in the manner of the others, General MIDI
   programs for the export. The notes' make-up gain belonged to the old mixer: a hint, not a number.
3. **Library**: six charts, `library/country-*.chart`, plain, in the manner of the others. **Generic
   progressions only: no chart may be a named song or a known tune's changes.** The forms a country rhythm
   section is asked for most, for example: a three-chord two-step; a 16-bar with the IV and a walk back; a
   ballad with a vi and a ii; one with the II7 before the V; a train tune on two chords; and one song with an
   intro, verses, a chorus, a solo section and an ending, with an arrangement block that fits it
   (`docs/CHART_FORMAT.md` section 11). Keys a guitar and a bass like: G, C, D, A, E.
4. **The critic and the scorecard**: `country/critic.ts` with targets from the notes' measured numbers
   (BA-51: root on 1 and fifth on 3 in at least 90% of bars, 0.5 to 0.75 notes a beat; BA-53: 20% to 60% of
   changes walked; DR-58 and DR-59's shares of sections; ST-country-08's shares; and what the other styles'
   critics show is needed), then `pnpm -s ensemble score --style country --update` once the numbers sit where
   the notes say. Report each target and where the style sits.
5. **Two goldens**, as `test/goldens/` holds the others (one with the soloist), with the line in the
   decisions the rules ask for.
6. **The app**: the style's poster and ink (`packages/app/src/posters.ts` and wherever the other eight have
   theirs), in the manner of the others. Look at it (`node scripts/look.ts`, light and dark, phone size)
   before calling it built. `pnpm smoke` must still pass.
7. **`test/takes.ts`**: whatever a new style needs there (`WRITTEN` and the like), and nothing else.

## The rules of this build

- **Styles are data.** A concept I have agreed to is added as a general one, with its validation, and used by
  country as data. Anything else that turns out missing: stop and report, do not build round it.
- **The other eight styles must not change.** Their goldens byte for byte, their scorecards with no movement
  at all. If an engine change moves one, it was not general.
- **No new property** unless country breaks a rule a musician would name that no existing property can see;
  then one, stated as a rule about music, and say so. **Never loosen, excuse a style from, or delete an
  existing property**, and never change a floor or tolerance: if a property seems wrong for country, stop on
  that property and tell me what the rule should be.
- **Budgets**: `scripts/budget.ts` works the engine suite's limit out from the styles that ship, so it grows
  by itself with the ninth. Do not edit `scripts/budget.ts` or the rule in `docs/TESTING.md`; update only the
  "now" figures the docs quote, to what the rule gives at nine styles. Measure the suite in CPU seconds as
  well as on the clock (`node /tmp/claude-1000/-home-brandon-code-ensemble/3001e2ba-6e91-487f-adea-58ceea1c543a/scratchpad/cpu.ts <label> <command...>`),
  country's process alone and the whole suite, and report both. If the suite is over its budget, run it
  again alone, rested, before believing it; if it is truly over, stop and report, do not trim tests.
- **You cannot hear.** Never say anything sounds good. Read takes (`pnpm -s ensemble read
  library/country-….chart --style country --seed 1 [--bars …] [--seats …]`), measure them against the notes'
  grids bar by bar at a low, a middle and a high level for each seat on two charts, and report measurements.
- **Levels**: `pnpm levels country`: the whole band within a decibel or so of the others (run two of the
  others beside it for the comparison), the soloist about a decibel under the band. Report the numbers.

## Gates

`pnpm check`, `pnpm test:full`, `pnpm score` and `pnpm smoke` pass, each run alone. `pnpm ears --check` passes.

## The page

Write `out/country/index.html` (not committed) in the manner of the pages the other builds wrote (ask the
repository: `git log --all --oneline -- prompts/` and the decisions name them; a page has each clip with what
was measured beside it). Clips rendered with `pnpm render:audio`: one chart held quiet (the ballad), one at the
middle (the two-step), one hot (the train), each with the band alone; one jam on its arc with the lead guitar;
one that ends, so the walk-up into the last root can be heard, with the bars named; and the song chart whole.
Beside each: the drum pattern by section, the bass's root-and-fifth share and walks, the guitar's strikes, bar
by bar where it helps. One "listen for" line a clip. No claim about how anything sounds, and no question
asking whether he wants more or fewer of anything.

## Decisions

A section in the decisions file `docs/decisions/README.md` names for a style: the calls above as given, each
thing you decided that the notes and this brief did not settle with one line of why, every engine concept
added and why it is general, the goldens added.

## Report

What you built and where; every engine change; each decision; the scorecard against the notes' targets; the
levels; the suite's CPU seconds and clock with nine styles and country's alone; what you verified and how;
what you could not verify. Kill every shell and server you left before reporting. Short and factual.
