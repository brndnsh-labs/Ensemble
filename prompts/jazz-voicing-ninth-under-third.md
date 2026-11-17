# Fix: the jazz piano puts the ninth a half step under the third (stage 6, before gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in and a generated band plays it in one of eight styles. The library now has twelve jazz standards, added partly as tests for the band, and one of them found a fault in the jazz piano's voicings. This brief is to find the cause, hold it with a property, and fix it.

## What was found

`DECISIONS.md`, "the library: pruned, renamed, and given standards" and "the library's standards: checked and merged". On `library/standard-take-the-a-train.chart` (C6 for two bars, D7b5 for two, then Dm7 G7), after the two bars of D7b5 the piano voices **Dm7 as E F A C**: the ninth a half step under the third, at the bottom of the hand. That voicing was 157 of 256 Dm7 strikes over six seeds. The jazz scorecard's `chords.voicing-faults` went from 100% of takes in target to 71% when the standards came in, almost all of it this tune; the baseline was accepted with the fault in it so that it stays visible.

Brandon is a bassist and guitarist and has not heard this take. You cannot hear either. Do not judge by ear; go by the notes, the measure and the property.

## What to do

1. **Find the cause.** Read how the jazz piano chooses a voicing and leads from one to the next (`packages/engine/src/players/chords/`, `packages/styles/src/jazz/chords.ts`), what the critic's `chords.voicing-faults` counts (`packages/engine/src/critic/`), and what the notes say a voicing may and may not do (`docs/MUSIC_NOTES.md`, and in `docs/music-notes/` the parts on comping and voicings: half steps inside a hand, the ninth and the third, rootless voicings, where a minor ninth or a low second is a fault). Say exactly why this voicing is chosen here (what it is led from, what it scored against) and whether the same thing happens on other chords and tunes: measure it over the standards and the jazz charts, not only this one.
2. **A property first** (`docs/TESTING.md` is binding: properties are one of the four kinds of test allowed). There is already "under a solo the hand does not growl: its two lowest notes are a half step apart only on a dominant from E4 up", held only under a solo. Decide from the notes whether the rule is that one widened to every bar, or another (the ninth under the third, anywhere in the hand), state it as music, and show it failing on the current engine before you change anything. Prefer restating or widening an existing property to adding one: `pnpm check` is at 17.8 s of its 20 s budget, and no budget is raised. If your change adds time, take some back (say where).
3. **The fix**, as small as the cause allows: in the style's data if the style asked for this, in the engine if the engine chose badly. Styles are data; the engine is pure (`CLAUDE.md`).
4. **What must not change.** Every golden take byte for byte (`test/goldens/`): two of them are jazz and were passed by Brandon's ear. If the right fix changes a golden, stop: do not regenerate it; report exactly which notes of which golden would change and why, and give the narrowest version of the fix that leaves the goldens alone as your branch. The other seven styles' scorecards must not move unless the cause is shared, in which case say what moved and why.
5. **The scorecard**: accept jazz's new baseline (`pnpm -s ensemble score --style jazz --update`) and give `chords.voicing-faults` and anything else that moved, before and after, overall and for Take the "A" Train alone.
6. Run `pnpm check`, `pnpm test:full` and `pnpm score`, each alone (they are timed: 20 s, 60 s, 120 s).

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/voicing`, on a branch `voicing`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch (the property; the fix; the scorecard and decisions), each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

Read first: `CLAUDE.md`; `docs/TESTING.md`; `PLAN.md` "Resume here".

Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Write what you decided in a new section at the end of `DECISIONS.md` ("the ninth under the third") with a line of why for each choice. Do not invent a design where the notes run out: say what you left. Your final message is read by the engineer who will check and merge the branch. It should say: the cause, with the failing case; how widespread it was (counts by chord and tune); the property as stated and that it failed first; the fix and why it is the right size; that the goldens are unchanged (or exactly what would change, if you stopped); the scorecard numbers before and after; the timings against the budgets; the commits; anything you saw that is wrong and did not fix. Say nothing about how anything sounds.
