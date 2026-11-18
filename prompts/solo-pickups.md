# Build: the soloist's pickups, in every style, into the top, and longer than a beat (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner plays along with it daily on his bass. The soloist (`packages/engine/src/players/solo/`) has just been made busier, given a setting for how busy (`soloDensity`) and an option to lead from the first pass (`soloFromTop`). This brief is about how its phrases start.

## The owner's words

Brandon is a bassist and guitarist. 2026-11-17: "are there any obvious musical devices and techniques the soloist is still missing? anything that would help its phrasing beyond what we're already doing? thinking about pick-up notes in particular". Of the band as it is: "the band sounds really musical".

## What is there now

`withPickup` in `players/solo/phrases.ts`, `habits.pickup` in `players/solo/style.ts`, the notes SO-36 and SO-37 in `docs/music-notes/b-comping-soloist.md`, and KF-B-22 there, which says pickups were measured and never confirmed by the owner's ear. As built:

1. **Only jazz and the blues use it** (chance 0.85 and 0.65). The other six styles have `chance: 0` and no figures. Acoustic has a pickup written for 6/8 (`pickups` in its `solo.ts`) that cannot play, because the chance it is drawn against is the style's 4/4 chance, which is nothing.
2. **It never leads into a chorus from outside it** (SO-37), so the solo's first phrase and the first phrase of every chorus start flat on the bar. With `soloFromTop` the soloist's first note of the take is one of these.
3. **It is one beat at most**: the "and" of four, or two eighths. A phrase is never led in by three notes, a run of a half bar, or more.
4. It leads only into a phrase whose line starts on a downbeat after a breath.

## Read first

`CLAUDE.md`; `docs/BRIEF.md`; `docs/TESTING.md` (binding); `docs/MUSIC_NOTES.md` and `docs/music-notes/b-comping-soloist.md` (SO-36 to SO-39 above all, SO-10, Q-47, KF-B-22), and in `c-styles.md` what each style's soloist is; in `DECISIONS.md` every section on the soloist, ending with "a busier soloist, and a setting for it" and its "checked and merged" section; `packages/engine/src/players/solo/` whole; each style's `solo.ts`; `test/soloist.test.ts`, `test/takes.ts`.

## What to build

- **Every style leads its phrases in, in its own way.** For each of the six that do not: what a soloist of that style on that instrument plays before the bar (a rock guitar's three eighths up the pentatonic into the one; a funk horn's sixteenths; whatever the notes and the style's own rhythms say), how often, and in which of its levels. Styles are data: figures and chances in the style's `solo.ts`, in 4/4 and in each meter it has written. Decide each from the notes and the style's own cells and say what you took it from. A style where the answer is honestly "seldom" gets a small chance, not none, unless you can say why none.
- **A pickup of more than a beat.** The figure is now one beat's cell. Let a style write a pickup as long as it needs, up to a bar (two beats, three eighths, a half bar's run), in every meter. The engine gains what it needs for that once; a pickup is still walked into the phrase's first note as SO-36 says (from one side, its last note a step or a third away, or the line's own approach), a note of it on a beat or held is a chord tone of the chord it is played over (the bar before's, which may not be the phrase's), and it still lives only in the breath the phrase before left (SO-37): the longer the figure, the more air it needs, and where the air is not there a shorter figure is taken before none.
- **Into the top.** A pickup may lead into the first phrase of a chorus, and into the solo's first phrase, wherever the bar before is one the band is playing: the last bar of the band's own chorus, the last bar of the chorus before, the turnaround. Restate SO-37 for it and write the restatement in `DECISIONS.md`. It still does not start in a count-in, in a bar of rest for the whole band, in an ending, or over a soloist's own previous chorus's last notes without the breath. With `soloFromTop` on the first pass there is no bar before but the count-in: the soloist starts on the bar there, unless the phrase's own line starts late; do not put notes in the count-in.
- **A phrase that starts off the downbeat** is already its own lead-in or its own late start: leave those. Say in your report what share of phrases start before their bar, on it, and after it, by style, before and after.
- Pickups count toward `soloDensity` only as far as the last build's design says anything does: read it, and make the pickup's chance and length move with the setting if that design moves habits, or leave them fixed if it moves only the levels. Say which. 0.5 or left out is the style's own, byte for byte with itself.

## What holds it

- **A property first.** From his words and KF-B-22's measure: the share of phrases after a breath that start before their barline, by style, with a floor; that a solo's first phrase and a chorus's first phrase are led in at least some of the time where the bar before allows; that a pickup's notes on a beat fit the chord they are played over; that no pickup takes the breath (the existing breath property already covers "a pickup into it included": keep it true at every length). Show each failing on the starting commit.
- **The band is untouched**: the other three seats' events are the same on the same seed (the chord instrument plays under a soloist by where the soloist leads; a pickup in the bar before a lead does not make that bar a lead bar: check what the comp does there and say). Golden takes with no soloist stay byte for byte. Golden takes with a soloist will move; rewrite them (`pnpm goldens`) and say which and why.
- **Scorecards**: rewrite each to a scratch file before and after, report every metric that moved and which way, accept (`score --update`) only movement this brief asks for.
- **Time.** `pnpm check` 24 s, `pnpm test:full` 72 s, `pnpm score` 120 s, `pnpm smoke` 60 s; the current figures are in the last "checked and merged" section. New properties read takes the suite already makes. Time each style alone before and after (`ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`) and the whole; run timed things alone.
- Every style on every chart with a soloist, six seeds (`ENSEMBLE_SEEDS=6 node scripts/test.ts`), passes, and again with `soloDensity` at 0 and at 1 and with `soloFromTop`, by the means the last build left for that. Report any failure exactly (property, style, chart, seed, message).
- Stay out of `packages/app/`, `packages/audio/` and the other three seats' players.

## For his ear

You cannot hear, and neither can the engineer who checks this. Make the page he will judge from, `out/solo-pickups/` (not committed; add it to `.gitignore`), in the manner of `out/solo-density/` (copied into your clone, with the script that made it in its `src/`): for each of the eight styles, one chart of its own with the soloist, the same seed before and after, long enough for a whole solo; for jazz a 32-bar standard with `soloFromTop`, before and after; one chart in six or twelve. Under each clip: how many of its phrases are led in, by how many notes, and where the first one is (bar and beat), so he can find it. Say in your report what the numbers show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/pickups`, on a branch `pickups`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch as you go, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

`pnpm render:audio` and the study script render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`). In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the soloist's pickups") with a line of why. Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: for each style, the figures and chances written, in each meter, and what each was taken from; what the engine gained; SO-37 as restated; the share of phrases led in, by style, before and after, and by length; what the comp does in a bar with a pickup into a lead; the properties added and what each failed on before; goldens and scorecards, what moved; the timings; the exact results of `pnpm check`, the six-seed runs, `pnpm score`; the commits; what you could not verify; anything you saw that is wrong and did not fix. Do not say that anything sounds good: say what you measured.
