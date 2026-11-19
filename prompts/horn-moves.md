# Build: what the alto does with a note's pitch (stage 6, during gate 6)

You are working on Ensemble, a backing band in a browser: a chord chart goes in, and a generated band (drums, bass, a chord instrument, a soloist) plays it in one of eight styles. The owner plays along with it daily on his bass. The soloist (`packages/engine/src/players/solo/`) plays the alto sax by default in most styles. The guitars bend and shake their notes; the alto plays every note at a fixed pitch. This brief gives the alto the three movements the owner chose by ear, and nothing else.

## The owner's words

Brandon is a bassist and guitarist. He listened to `out/horn-study/` (`scripts/horn-study.ts`: one alto line drawn thirteen ways) and on 2026-11-18 said: "i'm leaning toward option 9, the player's choice. sounds most varied and natural of the bunch, in my opinion."

Clip 9, exactly as drawn (read the script; its numbers are what he heard):

- **A shake on the last note of each phrase only**: 30 cents either side of the pitch, 5 times a second, starting 0.4 s into the note and growing over the next 0.6 s. Other held notes plain.
- **One quick scoop** into a landing note: the pitch arrives from below over 0.06 s.
- **One fall** off a phrase's last note: the note sounds its full length, then drops 6 semitones over one beat. In the clip the shake and the fall were on the same note. The note does not fade as it drops; that is what he heard and passed, so do not add a fade.

In eight bars that was two shakes, one scoop and one fall. Earlier, of the guitar's moves, he said the old band "overdid the bends ... we'll want to be thoughtful", and of the guitar's as built: "tasteful". What he chose is the sparing clip over the ones with a move on every held note. Hold to that: a move is an event, not a manner.

## Read first

`CLAUDE.md`; `docs/BRIEF.md`; `docs/TESTING.md` (binding); `docs/MUSIC_NOTES.md` and in `docs/music-notes/b-comping-soloist.md` SO-52 to SO-57, and in `c-styles.md` what each style's soloist is; `prompts/solo-pitch-moves.md` and in `DECISIONS.md` the sections that build and check the guitar's moves (search "pitch", "shake", "tasteful") and the last four sections on the soloist; `packages/engine/src/perform/pitch.ts`; `packages/engine/src/players/solo/` whole (`play.ts` and `style.ts` above all: an instrument's `bend` and `shake`, a style's `habits.bend` and `habits.shake`); each style's `solo.ts`; `scripts/horn-study.ts`; `test/soloist.test.ts`, `test/takes.ts`.

## What to build

- **The alto shakes a phrase's last note** when it is held long enough for the shake to be heard (it starts 0.4 s in: decide the least length from that, in seconds, not beats, and say why). Depth, rate, start and growth as in clip 9. No other note of the alto's is shaken. This is the instrument's way, as a guitar's shake is the guitar's: the model of an instrument says how it shakes and which notes; a style says whether its soloist does at all, if any style should not.
- **The alto scoops into a landing note, seldom.** Clip 9 scooped the note a phrase landed on at a chord change. Which notes may be scooped (an arrival on a strong beat after a rise or a leap is the usual place; never a short note, never the note after a scoop, never inside a run), how quick (0.06 s), and how often are yours to decide from the notes and the styles' own data; a scoop is rarer than a guitar's bend in the same style.
- **The alto falls off a phrase's last note, rarely.** Only off a last note with enough breath after it for the fall to finish before the next phrase (a pickup into it included), never into the band's last chord's ring or an ending, never off a low or quiet ending (decide what "an ending that is thrown away" is: high in the solo's range, at a working level or above, is the usual place). 6 semitones over a beat after the note's full length, as drawn; at fast tempos a beat is short, so decide whether the fall is timed in beats or seconds and say why.
- **How often is by style, as data.** Jazz, the blues and funk are where a horn scoops and falls; a ballad shakes more than it scoops. A style whose notes say no scoop (acoustic: ST-acoustic-28; check the others) has none. Write each style's chances in its `solo.ts` with a line saying what it was taken from. Styles are data: if the engine lacks the concept, add it once.
- **The guitars and the vibraphone are unchanged**, byte for byte, on every seed: a take with a guitar or vibes soloist is the same take before and after.
- **`soloDensity` does not move these.** They are how the instrument plays a note, not how many notes.
- The MIDI file carries the alto's moves as pitch bend as it does the guitar's. The sampler already follows a note's curve; if the alto's sampler needs anything for a fall that runs past the note's written length (the study did it with `extend`: read how), say exactly what you changed in `packages/audio` and why. Stay out of `packages/app/`.

## What holds it

- **A property first**, from his words and clip 9, each shown failing on the starting commit:
  - where the soloist is the alto, some phrase endings are shaken, and no note that is not a phrase's last is;
  - scoops and falls are present over a style's takes where its chances say so, and are few: a ceiling on moves per phrase and per chorus (at most one scoop in a phrase; falls on no more than a small share of phrase endings: pick the ceilings from the chances and say them);
  - a fall never sounds into the next phrase's first note, pickup included, nor past the take's last chord;
  - a guitar or vibes soloist's events are the same as on the starting commit (goldens cover the default soloists; say how you checked the rest).
- **The band is untouched**: the other three seats' events are the same on the same seed. Golden takes with no soloist stay byte for byte; those with an alto will move: rewrite them (`pnpm goldens`) and say which and why.
- **Scorecards**: rewrite each to a scratch file before and after; these moves should move no metric that counts notes. Report anything that moved; accept (`score --update`) nothing this brief does not ask for.
- **Time.** `pnpm check` 26 s, `pnpm test:full` 78 s, `pnpm score` 120 s, `pnpm smoke` 60 s. On a quiet machine the push suite is at 25.1 to 25.2 s: there is about one second of room. New properties read takes the suite already makes and render nothing; read "where the push suite's time goes" in `DECISIONS.md` first. Time each style alone before and after (`ENSEMBLE_STYLES=<id> node --test --test-isolation=none test/*.test.ts`) and the whole; run timed things alone. If the suite cannot hold it, say so with numbers rather than raising a budget.
- Every style on every chart with a soloist, six seeds (`ENSEMBLE_SEEDS=6 node scripts/test.ts`), passes. Report any failure exactly (property, style, chart, seed, message).

## For his ear

You cannot hear, and neither can the engineer who checks this. Clip 9 was eight bars; how often these come in a whole solo is the part he has not heard. Make the page he will judge from, `out/horn-moves/` (not committed; add it to `.gitignore`), in the manner of `out/solo-pickups/` (copied into your clone, with the script that made it in its `src/`):

- for each style whose default soloist is the alto, one chart of its own with the soloist, the same seed before and after, long enough for a whole solo; one jazz ballad; one chart in six or twelve;
- for jazz and the blues, the same take at half and at double the scoop and fall chances you chose, so he can say "more" or "fewer" from clips rather than numbers;
- under each clip: how many phrase endings are shaken, how many scoops and falls, and where the first of each is (bar and beat), so he can find them.

Say in your report what the numbers show; say nothing about how it sounds.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/hornmoves`, on a branch `hornmoves`, dependencies installed. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not look at `/home/brandon/code/ensemble` (the old version: off limits), do not push, fetch or deploy, make no network requests, add no dependency. Commit on the branch as you go, each message ending with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with.

`pnpm render:audio` and the study scripts render through headless Chrome. Never `pkill -f`. Never `pgrep -f` in a wait loop. Never wrap node in `timeout`. Stop a server by its port (`fuser -k <port>/tcp`); port 8765 is in use by someone else: leave it alone. In zsh do not name a loop variable `path`. Foreground `sleep` is blocked. Leave no shell or server running when you finish.

## Decisions and the report

Where this brief leaves something open, decide, and write each decision in a new section at the end of `DECISIONS.md` ("what the alto does with a note's pitch") with a line of why. Your final message is read by the engineer who will check and merge the branch and put the page in front of the owner. It should say: what the instrument model and the styles' data gained; for each style, the chances written and what each was taken from; which notes are shaken, scooped and fallen off, and the limits on each; how many of each per chorus, by style, measured; the properties added and what each failed on before; how you know the guitars, the vibes and the band are unchanged; goldens and scorecards, what moved; the timings; the exact results of `pnpm check`, the six-seed run, `pnpm score`; the commits; what you could not verify; anything you saw that is wrong and did not fix. Do not say that anything sounds good: say what you measured.
