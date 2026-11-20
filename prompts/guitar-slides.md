# Build: the guitar's short slide, hammer-on and pull-off (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner plays along with it daily on his bass. The soloist (`packages/engine/src/players/solo/`) may be a guitar: rock's is the overdriven guitar, neo-soul's the clean, acoustic's the steel-string, and any style's when the player picks one. A guitar bends into some landings and shakes held notes. This brief gives it three more things a left hand does, as the owner heard them, and nothing else.

## The owner's words

Brandon is a bassist and guitarist. He listened to `out/slide-study/` (`scripts/slide-study.ts`: one guitar line drawn many ways; read the script whole, its numbers are what he heard) and on 2026-11-19 said:

- "short slide sounds pretty good, and the one fret slide is nice" (clips 3 and 7);
- "i'm not too sure what to choose on some of this stuff. do you have recommendations?";
- "pretty much as expected, the player's choice sounds the most natural since it mixes things up" (clip 13: the bends and shake the soloist already plays, one short slide, one hammer-on and one pull-off, both drawn as one string).

Of the first guitar study's smooth slides he had said "we need to snap to pitches/frets to make it sound realistic"; of the old band, it "overdid the bends ... we'll want to be thoughtful"; of the guitar's bends as built, "tasteful".

What was recommended to him, and is the build: **the short stepped slide and the one-fret slide; hammer-ons and pull-offs drawn as one string (clips 8 and 10a, the way clip 13 drew them); nothing else.** Not the long slide (clip 4: four or five frets retune one recording by a fourth, and he did not choose it), not the slide between two notes (clip 6), not the two-note hammer-on (clip 9), not the alto's grace note (clip 12: the alto was given three moves yesterday). In eight bars clip 13 had one slide, one hammer-on and one pull-off beside two bends and three shakes. Hold to that: each is an event, not a manner.

## Read first

`CLAUDE.md`; `docs/BRIEF.md`; `docs/TESTING.md` (binding); in `docs/music-notes/b-comping-soloist.md` SO-28, SO-52 to SO-57 and SU-B-17, and in `c-styles.md` each style's soloist habits (ST-rock-24, ST-neosoul-33, ST-acoustic-26 and -28, and the others'); `prompts/solo-pitch-moves.md` and `prompts/horn-moves.md` (the two builds before this one of the same kind) and in `DECISIONS.md` "the lead guitar bends and shakes", "the lead guitar, heard", "what the alto does with a note's pitch" and its "checked and merged", "a study of slides and grace notes: checked and merged", "the engine suite's budget, two seconds more"; `packages/engine/src/perform/pitch.ts`; `packages/engine/src/players/solo/` whole (`instruments.ts`, `style.ts`, `validate.ts`, and in `play.ts` how a bend is chosen and `hornMoves`); each style's `solo.ts`; `packages/engine/src/midi/export.ts`; `test/soloist.test.ts`, `test/takes.ts`.

## What to build

Two parts, **committed apart** (part 1 must stand without part 2: it may be merged alone).

### Part 1: the slide

- **A guitar slides into a landing from one or two frets away, stepping.** As clip 3 drew it: the note is struck on its beat at the start fret and stands on each fret in turn, jumping to the next (two glide points a millisecond apart are the nearest `PitchMove` draws to a step; do not change how a curve is made), on its pitch a thirty-second note after the strike at the study's tempo. A hand moves in time, not in beats: write it in seconds a fret (clip 3: 0.028 s; clip 7's single fret stood 0.057 s at 132 and 0.091 s at 82: decide one figure for the one-fret slide and say why).
- **Never more than two frets.** The start is a tone of the style's pool on that chord (SU-B-17: never a chromatic note chosen by distance), except the one slide of one fret SO-56 allows, the minor third up to the major third. Mostly from below; from above where SO-56 names it and the start is within two frets (2 to root). Where no start within two frets is in the pool, the note does not slide.
- **Which notes**: SO-56's: a note of an eighth or longer struck where the chord changes, that does not bend (SO-57: one device per note; a note that slides is not bent, and whether it may still be shaken when held long is yours to decide from clip 13, where the shake waits for the arrival). Never in the bar the band ends on. At most one slide in a phrase.
- **Which instruments**: the overdriven and the clean guitar. The steel-string and the nylon: decide from the notes and say (a slide is common on both; the styles' notes give acoustic no slide, so its chance may be none while the instrument can). The alto and the vibraphone do not.
- **How often is by style, as data** (`habits`, beside `bend`): the blues 0.25 and rock 0.2 (SO-56, ST-rock-24); neo-soul's notes write its move into the major third as a half-step slide, 0.40 (ST-neosoul-33), which was built as a bend when there was no slide: make it the one-fret slide he called "nice" (clip 7 was played over neo-soul's own chart), keep its bend into the root, and say what happens to `habits.bend.third` there. Every other style: read its notes, write its chance with a line saying what it was taken from, and where the notes say nothing a guitar picked by the player slides seldom or not at all. A slide is rarer than a bend in the same style, except in neo-soul as above.

### Part 2: the hammer-on and the pull-off

- **Two notes of the line become one struck string.** As clips 8 and 10a drew it: where a short note steps to the next note by one or two frets, upward (a hammer-on) or downward (a pull-off), the first is struck and the second is not: one attack, at the first note's time and loudness, the pitch jumping to the second note's at the second note's time, sounding to the second note's end.
- **How that is written is the design question of this part.** The study wrote one note at the second note's pitch with a curve that starts off it; the sampler then picks the recording by the second note's pitch. Decide how the engine says it (one event whose pitch steps; or two events, the second marked as not struck, which would need the sampler and the MIDI file to learn what that means): choose the one that leaves the engine's events meaning what they say to everything that reads them (the critic, the properties that count the soloist's notes, the lamps in the app that light on a note, the MIDI file), change as little outside `packages/engine` as you can, and write down what you chose against what. The critic chooses the line before these moves are drawn, as it does before the horn's (`hornMoves`): keep that.
- **Which pairs**: inside a phrase, the first note an eighth or shorter and no longer than the second; a scale step of one or two frets; neither note bent, slid or struck where the chord changes (a landing is picked: it keeps its attack); not across a breath or a rest; not the phrase's first note. At most one hammer-on and one pull-off in a phrase, and not on adjacent pairs (no trill: SO-28).
- **Which instruments**: all four guitars. Acoustic's notes already write the hammer-on as a cell of the rhythm (ST-acoustic-26, `.xx-`): find how the style's data plays that cell today and say whether it should become this (the study's clips 11a and 11b drew it both ways and he chose neither by name).
- **How often is by style, as data.** The notes give no figure outside acoustic. Take clip 13's measure, about one of each in eight bars at a working level, as the most any style does, and less in styles whose lead is sparse; write each chance with a line of why.

### Both parts

- **The alto and the vibraphone are unchanged, byte for byte**, on every seed, and so are the other three seats: a take whose soloist is not a guitar is the same take before and after.
- **`soloDensity` does not move these.**
- The MIDI file carries a slide as stepped pitch bend, as it carries a bend. For a hammer-on, say what the file holds and that a player's instrument reading it sounds one attack.
- `packages/audio` and `packages/app` should not need to change. If one must, say exactly what and why before doing more than the least.

## What holds it

- **A property first**, from his words and the clips, each shown failing on the starting commit:
  - where the soloist is a guitar that slides and the style's chance is not none, some landings are slid into over a style's takes, and every slide is of one or two frets, from a tone of the pool (or the minor third into the major), stands on whole frets, is on a note that is not bent, and is not in the band's last bar;
  - slides are few: at most one in a phrase, and over a style's takes no more of them than bends where the style bends (neo-soul's third excepted: say its measure);
  - a hammer-on or pull-off joins only two notes one or two frets apart inside a phrase, never a landing, never two pairs running; at most one of each in a phrase;
  - an instrument that does none of these plays none.
- **Golden takes** with a guitar soloist will move: rewrite them (`pnpm goldens`) and say which and why; every other golden stays byte for byte. Say how you checked the alto's and the vibraphone's takes beyond the goldens (the horn build compared every library chart in every style on six seeds: do the same).
- **Scorecards**: write each to a scratch file before and after. A slide moves no note; a hammer-on may move what counts attacks: report every metric that moved and why, and accept (`score --update`) nothing this brief does not ask for.
- **Time.** `pnpm check` 28 s (it runs at 24.6 on a quiet machine), `pnpm test:full` 84 s, `pnpm score` 120 s, `pnpm smoke` 60 s. New properties read the takes the suite already makes (it already renders the guitar in the styles where it is not the default: read how) and render nothing new unless you show there is no other way. Time each style alone before and after (`ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`) and the whole; run timed things alone.
- Every style on every chart with a guitar soloist, six seeds (`ENSEMBLE_SEEDS=6 node scripts/test.ts`), passes. Report any failure exactly (property, style, chart, seed, message).

## For his ear

You cannot hear, and neither can the engineer who checks this. The study was eight bars; how often these come in a whole solo is what he has not heard. Make the page he will judge from, `out/guitar-slides/` (not committed), in the manner of `out/horn-moves/` (copied into your clone, with the script that made it in its `src/`):

- rock, neo-soul and acoustic on a chart of their own with their own guitar, and the blues with the overdriven guitar picked, the same seed before and after, long enough for a whole solo;
- for rock and the blues, the same take at half and at double the chances you chose, so he can say "more" or "fewer" from clips;
- neo-soul's before and after named for what changed: the move into the third was a bend and is a slide;
- under each clip: how many bends, shakes, slides, hammer-ons and pull-offs, and where the first of each new one is (bar and beat), so he can find them.

Say in your report what the numbers show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/guitarslides`, on a branch `guitarslides`, dependencies installed, `user.email` set to the repository's own (check `git config user.email` ends in `users.noreply.github.com` before your first commit: the repository is public). Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` or the `legacy` branch (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch as you go, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

`pnpm render:audio` and the study scripts render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is in use by someone else: leave it alone. In zsh do not name a loop variable `path`, and quote globs. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("the guitar's short slide, hammer-on and pull-off") with a line of why. Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: what the instrument model and the styles' data gained; for each style, the chances written and what each was taken from; which notes slide, hammer and pull, and the limits on each; how a hammer-on is written in the events and what you weighed it against; how many of each per chorus, by style, measured, beside bends and shakes; the properties added and what each failed on before; how you know the alto, the vibraphone and the band are unchanged; goldens and scorecards, what moved; the timings; the exact results of `pnpm check`, the six-seed run and `pnpm score`; the commits, part 1's and part 2's apart; what you could not verify; anything you saw that is wrong and did not fix. Do not say that anything sounds good: say what you measured.
