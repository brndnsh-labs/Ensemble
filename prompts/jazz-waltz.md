# Build: the jazz piano comps a waltz (#2241)

You are working on Ensemble, a generative backing band in a browser. In 3/4 its jazz piano plays one held chord a bar: the comp's rhythm book (`packages/styles/src/jazz/chords.ts`) is written for 4/4, 6/4, 12/8 and 6/8, and 3/4 falls to `plain`. This brief writes the 3/4 book, as data, from a study of published sources.

## The owner's words

Brandon is a bassist and guitarist who plays along with the app daily. At the jazz review (2026-11-15): "we should think about what some of the greats do as they're comping waltzes".

## The rule this build lives by

**Nothing goes in the book on recall alone.** The study is `prompts/jazz-waltz-study.md` (committed with this brief; read it whole, with the engineer's note at its top on what was re-checked and what was misread). Each figure you write names the study's figure it comes from (F1 to F12) in a comment. The study's last two sections say what the sources do not say and what was only recalled: none of that goes in the book. Where the data needs a number no source gives (a velocity, a weight), take it from jazz's own 4/4 and 6/8 books, which he has heard and passed, and say so in the decisions: that is the style's own touch carried over, not a claim about waltzes.

## Read first

`CLAUDE.md`; `docs/TESTING.md` (binding); `prompts/meter-compound-style.md` (the pattern for writing a style in a meter: your build is its sibling, for one seat); `docs/decisions/README.md`, then in `docs/decisions/meters.md` the design ("the band in six and twelve") and jazz's own sections for 6/4, 6/8 and 12/8 with their "checked and merged" parts, and in `styles.md` and `chords.md` whatever names jazz's comp; `docs/music-notes/c-styles.md` ST-jazz-25 to ST-jazz-48 and `b-comping-soloist.md` on the comp under a soloist; `packages/styles/src/jazz/chords.ts` whole; the engine's reading of a rhythm book (find `RhythmBook`, `figures`, `answers`, `hold`, `forms`, `candidates`, `anticipation`, `listening`); `test/takes.ts` (`WRITTEN`, `heldTakes`); `library/jazz-waltz-f.chart` and the standards in 3/4 if any.

Do not read, merge or copy from the `legacy` branch or `~/code/ensemble-legacy`.

## What to build

**1. A measure first, in its own commit** (acceptance of the issue): the share of bars in 3/4 under a soloist with a single strike (ST-jazz-30: under 21% in 4/4), on jazz's scorecard, and with it the strikes a bar and the share of bars struck on beat 1, with and without a soloist. Report what they read today (near all single-strike, all on 1). If the scorecard charts include no 3/4 jazz chart, add `jazz-waltz-f` to them and accept the baseline in the same commit, before any data changes, so the change shows as movement.

**2. Properties before the data**: jazz's own comp properties that are held only in the written meters, restated so they hold in 3/4; `3/4` added to jazz's `WRITTEN`; and the few that say a waltz is being comped and not the pad. Run them against today's band and report which fail. From the study, as properties or measures (your call which, by `docs/TESTING.md`):
- Under a soloist the hand leaves beat 1 out more often than it plays it (study 1.1, 4.4: the bass has the downbeat), and strikes about two times a bar (1 to 4).
- The quiet level is held chords, on 1 or on the "and" of 1 (F4, F5, F7).
- No strike falls off the eighths.

**3. The 3/4 book, as data**, at the three levels, with figures and answers as the other meters have them:
- **Quiet**: one chord laid in and held (F4), the "and" of 1 held to the barline (F5), beat 2 held (F7).
- **Working**: the two off-beats and their mixes (F6, F9), 1 and 3 short (F8), the dotted-quarter cell (F2), beat 2 held (F7). Under a soloist this is where the hand stays (`listening.busiest: "mid"`), sparse under the line and answering in the breaths as jazz already does in its other meters (study 4.3).
- **Hot**: the dotted-quarter cell and its variants (F2, F3), with the working figures; a denser bar (F12) only where a phrase ends, if the book has a way to say "at the end of the phrase" (study 4.2); if it has none, leave F12 out and say so.
- **Anticipation**: the study found no rate for the "and" of 3 and its one tied instance was a misreading. Keep jazz's existing `anticipation` data as it is for the meter (the style's own habit) unless it cannot hold in three; add no waltz-specific rate.
- The engineer's musical calls, made so you need not ask: weights within a level are yours, from the study's rough proportions (the off-beats and the dotted-quarter cell lead; whole-bar holds are the quiet level's and the section arrival's); velocities and lengths from jazz's 6/8 book.

**4. The hemiola (F1), as a second step in its own commits, after 1 to 3 are green.** Three short chords over two bars, a chord every two beats, run for a phrase and stopped at the section's end; in the study it is played behind the melody and never under the soloist. A figure in the book is one bar. First find out whether the book can already say a figure of two bars that repeats for a phrase (`forms`, `hold`, `candidates`). Then:
- If it can, or the engine needs one small concept to say it (a figure whose grid is two bars; say which), add it with a property: with no soloist, at the working level, the hemiola runs whole phrases at a time (4 to 8 bars), starts at a section's or a phrase's first bar, never crosses a section boundary, never runs under a soloist, and is in a minority of the phrases (the engineer's call on how often: about one phrase in five with no soloist; a measure reports it). Nothing in 4/4 or any other written meter may change by the engine change: goldens byte for byte.
- If it needs more than that, do not build it: stop this step, say exactly what is missing, and finish the rest.

**5. Out of scope, on purpose.** The drums and the bass in 3/4 stay as they are: the study's ride figure is close to what the drums play, the hi-hat on 2 and 3 is a variant a source names, and the bass in one when quiet and walking above is the order a source teaches. Say so in the decisions with the study's numbers (D1, D3, 7.3). The soloist's rhythms in 3/4 are not this issue. No new chart unless step 1 needs none of the existing ones.

## What holds it

- **Styles are data**: step 4 aside, no engine change. If the book cannot be written without one, stop and say what is missing.
- **Nothing that exists changes**: every golden take that is not jazz in 3/4 byte for byte; every scorecard on its existing charts but jazz's 3/4 charts (rewrite each to a scratch file and compare). If there is a jazz 3/4 golden, `pnpm goldens` and say why in the decisions.
- **Tests are rationed** (`docs/TESTING.md`): properties and measures only; no unit tests.
- **Budgets, none raised by you**: `pnpm check` 28 s, `pnpm test:full` 84 s, `pnpm score` 120 s, `pnpm smoke` 60 s. `main` alone runs `pnpm check` in 26.7 to 27.7 s, so a fourth written meter for jazz will very likely go past 28. `docs/TESTING.md`'s rule would allow 2 s more for it; **do not apply the rule and do not change any budget**: whether it applies is with the owner. Keep the push run lean (a new meter's takes on a push as few as the other written meters have; the wide ones on the full run), then report: jazz's own test time before and after (`ENSEMBLE_STYLES=jazz node --test --test-isolation=none test/*.test.ts`), and `pnpm check` on `origin/main` and on your branch in the same sitting, three runs each, alone. An overrun of `pnpm check` that is the new meter's own cost is reported, not fixed by dropping a clause, and does not stop you from finishing the rest. The other three budgets must hold.
- **Decide and log**: a new `## ` section at the end of `docs/decisions/meters.md` ("the jazz piano comps a waltz (2026-11-21, #2241)"): what was taken from which figure of the study, what was carried from jazz's other books, what was left out and why. And the study's findings into `docs/music-notes/c-styles.md` as new ST-jazz entries in that file's form (tag and certainty as the study marks them: solid, or `(unclear)` for thin), each naming its source by author, title and year. No URL is needed in the notes; the study file keeps them.

## For his ear

You cannot hear, and neither can the engineer. Make `out/jazz-waltz/index.html` (not committed; `out/` is ignored whole), in the manner of the last pages under `out/` in the main tree (`/home/brandon/code/ensemble/out/tempo-breathes/` is a recent one to copy the form of; read only): `jazz-waltz-f` before (origin/main) and after, the same seed, at the quiet and the working level, each with the whole band and with the soloist; if step 4 landed, one clip where the hemiola runs, with the bars named. Under each clip: the piano's grid for each bar (six eighths), and the measures from step 1. Made for a phone held upright and a laptop. No claim about how it sounds, and no question to him about more or fewer.

## Where you are

The worktree `/home/brandon/code/ensemble/.work/2241`, branch `jazz-waltz`, from `origin/main`. Work only inside it. The brief and the study are staged for your first commit. If `node_modules` is missing, `pnpm install --frozen-lockfile --offline` (no network). Commits: new ones only (never amend, never reset one away, never `git stash`, never `--no-verify`), explicit paths (never `git add -A`), no push, no fetch. The repository is public: nothing private in a commit, no address of any machine. Each message ends with a `Co-Authored-By` line naming your own model.

Rendering goes through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is someone else's. In zsh do not name a loop variable `path`, and quote globs. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## The report

Under 450 words, read by the engineer who will review and merge: the measures before and after (single-strike share, strikes a bar, share on beat 1; with and without a soloist; each level); each figure in the book with the study figure it comes from; what was carried from jazz's other books; the properties added or restated and which failed against today's band; step 4: what the book could already say, what was added to the engine if anything, how often the hemiola runs, or exactly what stopped you; goldens and scorecards in numbers; jazz's test time and the gates' times; the commits; what you are unsure of; anything you saw that is wrong and did not fix.
