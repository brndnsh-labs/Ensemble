# Study: slides and grace notes, for the owner's ear (stage 6, during gate 6)

You are working on Ensemble, a generative backing band in a browser. Its soloist's guitars bend into notes and shake held ones, and its alto shakes, scoops and falls; nothing it plays slides, hammers on, pulls off or flicks a grace note. Before the soloist is allowed any of these, the owner hears each one drawn on these samples and says which sound like a player. This brief makes that page and nothing else. **No change to the engine, the styles, the audio, the app or the tests.**

## What has been done twice before, and what he said

`scripts/pitch-study.ts` (the lead guitar, nine ways) and `scripts/horn-study.ts` (the alto, thirteen) each played one short line several ways; he chose from the page by ear and only what he chose was built. Read both scripts whole: yours is their sibling. Their pages, `out/pitch-study/` and `out/horn-study/`, are copied into your clone.

Brandon is a bassist and guitarist. Of the guitar study's ninth clip, slides drawn as smooth glides: "slides don't sound very good as they are, so we should leave them out. there's still value in them, but we need to snap to pitches/frets to make it sound realistic". Of the moves he did choose: "quick bends sound great", and of the old band, it "overdid the bends ... we'll want to be thoughtful". Of the alto he chose "the player's choice ... most varied and natural of the bunch": the sparing clip. So: each way is heard alone and plainly labelled, a plain take comes first, the old smooth slide is there to compare against, and nothing is stacked until the last clip.

Read: `CLAUDE.md`; `packages/engine/src/perform/pitch.ts` (`PitchMove`: glide points eased from one to the next, and a vibrato; `pitchCurve`); `scripts/render-audio.ts`; `packages/engine/src/players/solo/instruments.ts` (the instruments and their ranges); in `docs/music-notes/b-comping-soloist.md` SO-28, SO-56, SO-57 and SU-B-17; in `docs/music-notes/c-styles.md` ST-rock-24, ST-neosoul-33 and ST-acoustic-26; in `DECISIONS.md` "the lead guitar bends and shakes" and "the lead guitar, heard".

## What to make

`scripts/slide-study.ts`, in the manner of the two before it, writing clips and `out/slide-study/index.html`.

**The guitar line**: about eight bars for the driven guitar over a rock or blues chart in the library with the band under it, written by hand as `pitch-study.ts` writes its line: two phrases; at least three notes of an eighth or longer struck where the chord changes (the places SO-56 slides into), reached from a scale tone two to five frets below and one from above; one major third reached from the minor third a fret below; two places where a short note steps up a scale step into a longer one (where a hammer-on goes) and one where it steps down (a pull-off). No bends and no vibrato in any clip but the last, so only the thing being asked about moves.

**The ways, one clip each**:

1. Plain: every note struck at its pitch.
2. The slide he refused, for comparison: a smooth glide into the landings (as `pitch-study.ts` clip 9 drew it).
3. A slide stepped by frets, short: into each landing from two frets below, the pitch standing on each fret in turn and jumping to the next (no glide between), the whole taking a thirty-second note (SO-56).
4. A slide stepped by frets, long: from four or five frets below, a sixteenth.
5. The same as 3 and 4 by the distance each landing has in the line (two to five frets), the start note the scale tone SO-56 names, one from above. This is the slide as the notes describe it.
6. As 5, but the first fret sounded for a moment before it moves (the start note is heard as a note, then slid from): a slide between two notes, as opposed to into one.
7. The one-fret slide: minor third up to the major third, alone (neo-soul's habit, ST-neosoul-33). Also this clip on the clean guitar over a neo-soul chart.
8. Hammer-ons as one string: the short note and the long one are one struck note whose pitch steps up at the long note's time, with no second attack.
9. Hammer-ons as two notes: both struck, the second softer (say how much) and the first cut short at it. The same notes as 8, so the two ways can be compared.
10. A pull-off, the better of 8 and 9 turned downward, drawn both ways if they differ in what can be drawn.
11. Hammer-ons on the steel-string guitar over an acoustic chart: the cell ST-acoustic-26 writes (`.xx-`, a grace sixteenth flicked into the next note), by ways 8 and 9.
12. A grace note on the alto: a short jazz line of four bars with two long notes, each flicked into from the scale step below by a sixteenth (SO-28), as two tongued notes and as one note whose pitch steps.
13. A player's choice on the driven guitar: the line with the bends and the shake the soloist already plays (read `solo-pitch-moves.md`'s numbers from `instruments.ts`), one stepped slide, one hammer-on, one pull-off; nothing else.

**How a step is drawn.** `PitchMove` eases between glide points; two points a few milliseconds apart are as near a step as it draws (the curve has a point every 5 ms, `CURVE_STEP`). Do not change `pitch.ts`. Say on the page and in your report how square each step came out: read the pitch of one stepped slide and one hammer-on from the rendered audio (autocorrelation in short windows, as the guitar's build did; `DECISIONS.md`, "the lead guitar bends and shakes", "Proof that it sounds") and print the pitches it stood on and for how long. A slide of five frets retunes one recording by a fourth: if you can tell from the pack (`assets/packs/`, each pack's map) whether the sampler would rather play the start from a nearer recording, say what it does, and draw what the sampler can do today.

**The page**: each clip with its name and one plain sentence saying what was done to which notes (bar and beat, so he can find them), in the order above, the same line plain at the top of each group. Made for a phone held upright and a laptop. No claim about how any of it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/slidestudy`, on a branch `slidestudy`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` or the `legacy` branch (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit the script (and a `.gitignore` line for `out/slide-study/` if `out/` is not already ignored whole) on the branch, the message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with. The repository is public: nothing private in a commit.

Rendering goes through headless Chrome (`render-audio.ts`). Render a few clips per command so no single command runs for many minutes. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is someone else's: leave it alone. In zsh do not name a loop variable `path`, and quote globs. Foreground `sleep` is blocked. Leave no shell or server running when you finish. `pnpm -s typecheck` and `pnpm -s lint` must pass; do not run the timed test suite.

## The report

Read by the engineer who will put the page in front of the owner: the lines (bars, notes, where each landing, hammer-on and pull-off is); for each clip exactly what was drawn, in frets, cents, seconds and which notes; what `PitchMove` could not draw and what you drew in its place; what you measured in the rendered audio and how; which recordings the sampler stretched and how far; the commit. Nothing about how it sounds, and no recommendation.
