# Build: a note held over the barline inside a phrase, so a moved idea can move in every style (#2256)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner, Brandon, is a bassist and guitarist who plays along with it daily. Nobody on this side can hear.

Read the issue: `gh api repos/brndnsh-labs/Ensemble/issues/2256 --jq .body`. In short: #2237 let the soloist say an idea again a pulse early or late (`habits.displace`, `displaced` in `packages/engine/src/players/solo/phrases.ts`). Brandon heard it and passed it ("everything sounds pretty natural and melodic"). But it hardly plays outside jazz, funk and the blues, because a note cannot be held across a barline inside a phrase, so a moved idea whose held note would cross one is dropped: of 245 moved ideas made over the suite's solo takes, 118 were dropped for that and 31 played.

## What to build

- **The engine gains the concept once**: a note of a phrase may be held across a barline, as data on the phrase, where the style allows it. Which styles allow it is style data.
- **Then `displaced` keeps such a note whole** instead of dropping the moved idea.
- **Your calls, from the notes, each logged with a line of why** (musical forks do not wait on Brandon):
  - Which styles allow a held note over the barline. Funk, rock and disco tie nothing over the barline by intent (`solo.barlines-tied` targets `max: 0`); they keep that unless the notes say a moved idea is an exception. Say which.
  - Whether only a moved idea may hold over the barline, or any phrase. Prefer the narrower (a moved idea only) unless the notes ask for more: it keeps every take with no moved idea byte for byte what it was.
  - What `solo.barlines-tied` should count now, and whether a held note of a moved idea is a tie in its sense.
- **How often is not Brandon's question either**: the `displace` chances stay as written unless the numbers show a style now moving ideas far more often than jazz does (1.6% of phrases); then lower that style's chance, and log it.
- **Out of scope**: an idea moved early across the barline into the bar before (a pickup's ground, SO-36 to SO-39). Say in a line what it would take, and leave it.

## Lessons from the last two builds of this kind (read their sections in `docs/decisions/soloist.md`, and "what the reviews found")

- **A moved idea is a candidate the critic judges**, not something swapped in after. If a critic feature would wrongly punish or favour a held note over the barline, fix the feature for that case only, and prove that where none is played every take is byte for byte `main`'s.
- **Every property clause must be able to fail**: plant a fault for each (a held note over a barline in a style that forbids it; a held note cut short; a held note that sounds over a chord it clashes with in the next bar), see it fail, remove it. Say which you planted.
- **The note held into the next bar meets a new chord.** A held note must be a tone the next bar's chord allows by the soloist's existing rules (SO-02, SO-24, SO-29); where it is not, the idea is not moved there. This is the most likely fault: check it by reading.
- **Read what you built** with `pnpm -s ensemble read <chart> --solo --seats solo,chords --bars a-b` before you report: every held note on the page, and enough others to be sure.

## Read first

`CLAUDE.md` (the standing rules bind you); `docs/TESTING.md` (binding: only its four kinds of test); `docs/MUSIC_NOTES.md` and `docs/music-notes/b-comping-soloist.md` (the `SO-` notes: SO-02, SO-17, SO-24, SO-29, SO-36 to SO-39 at least) and each style's soloist section in `c-styles.md`; `docs/decisions/README.md`, then in `docs/decisions/soloist.md` the sections on the moved idea (#2237) and double time (#2238); `packages/engine/src/players/solo/` whole; each style's `solo.ts`; `test/soloist.test.ts`, `test/takes.ts`; `packages/engine/src/critic/measures/solo.ts`; `prompts/solo-displaced.md` and `prompts/solo-double-time.md` for how the last builds were asked for.

## What holds it

- **A measure first, in its own commit, read on the starting commit**: the share of moved ideas made that are played, per style (reported, on the scorecard). Then the property clauses for the held note.
- **`solo.displaced` rises in the styles that allow it**: say the numbers, before and after, per style. If it does not move in a style, say so plainly; do not tune to it.
- **With every `displace` chance at nought, the takes are byte for byte what they were** (`pnpm goldens` writes main's files). If you opened the concept to every phrase, say which goldens moved and why.
- **Goldens**: `pnpm goldens` where a held note is drawn, and say in `docs/decisions/soloist.md` which.
- **Scorecards**: `pnpm score` before and after. Report every measure that moved; accept (`pnpm -s ensemble score --update`) only movement this brief asks for, never a drop past tolerance. Then run `pnpm score` again and paste each moved style's "against what he has passed by ear" block.
- **Budgets you may not raise**: `pnpm check` 28 s (about 25 now), `pnpm score` 120 s (about 64), `pnpm test:full` 84 s (about 72). Run timed things alone; if only a time budget is exceeded, rerun alone before believing it. If your properties push a budget over, make them cheaper; do not raise it.
- Stay out of `packages/app/`, `packages/audio/` and the other seats' players.
- **Styles are data**: the engine gains the concept once; which styles is data.
- **Decisions** go in `docs/decisions/soloist.md` as a new `## ` section appended at the end (see `docs/decisions/README.md`). There is no `DECISIONS.md` any more.

## For his ear

Make `out/solo-held/` in your worktree (not committed; add `out/solo-held/` to `.gitignore`), in the manner of `/home/brandon/code/ensemble/out/solo-displaced/` and `/home/brandon/code/ensemble/out/solo-double-time/` (read their `src/` and `index.html` for how they were made). One chart of its own with the soloist for each style that now moves ideas and hardly did (reggae, acoustic, neo-soul and whichever else), plus jazz as the known case: the same seed on `main` and on this build, on seeds where a moved idea with a held note is played (find them; say how). Under each clip: each moved idea, the bars of the idea and of its answer, which note is held over which barline, the chord under it on each side, and its time in the clip. Quote each from `ensemble read`. Say what the numbers show; nothing about how it sounds. Use `.mp3` clips.

## Where you are

The worktree is made: `/home/brandon/code/ensemble/.work/2256`, branch `solo-held-over-barline` from `origin/main`, installed. Work only inside it. Do not touch the main tree except to read `out/solo-displaced/` and `out/solo-double-time/`. Do not read the `legacy` branch or `~/code/ensemble-legacy`. The repository is public: nothing private in anything committed. Do not push, do not open a pull request, do not file or edit issues, add no dependency, make no network requests but the one `gh api` read above.

Commit as you go, staging by path (never `git add -A`, never `--no-verify`, never amend, never reset a commit away): the measure first, then the engine and styles, then goldens and scorecards with the decisions, and this brief (`prompts/solo-held-over-barline.md`) with the first commit. Each message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Check `git log -1 --format=%ae` prints `50114222+brndnsh@users.noreply.github.com`; if not, stop and say so.

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is the owner's listening server: leave it alone. Foreground `sleep` is blocked. Leave no shell or server running when you finish. Another builder is working in `.work/2239` at the same time: timed runs may read slow; rerun before believing an overrun.

## The report

Under 500 words, read by the engineer who will check and merge: what the engine gained and how a style writes it; each musical decision in a line; the measure and what it read before and after, per style; `solo.displaced` before and after, per style; the properties and the faults you planted; goldens and scorecards in numbers; the by-ear blocks; exact results and times of `pnpm check`, `pnpm test:full`, `pnpm score`; three held notes quoted from `ensemble read` with the idea before each, from three styles, and the chord on each side of the barline; where the page is and whether its clips rendered; what you are unsure of.
