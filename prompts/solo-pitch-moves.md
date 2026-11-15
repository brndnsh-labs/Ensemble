# Build: the lead guitar bends and shakes (stage 6, part 5)

You are working on the soloist of Ensemble, a generative backing band: text and a seed go into a pure engine and a performance comes out. The soloist plays plain notes today. You are teaching it two things a lead guitarist does with a note's pitch, a quick bend up into a note and a vibrato on a held one, and nothing else.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/bends`, on a branch `bends`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

## What the owner has heard, and said

He is a guitarist and bassist. Two things in the record decide how careful this must be:

- The old band's bends "didn't sound great", and the first time he heard a soloist with no bends at all he preferred it: "we've probably been overdoing the bends... we'll want to be thoughtful as we reimplement other devices" (EAR-02, HI-09, SU-D-16). What survived there was ornament tied to what the phrase is doing: bends on landings and peaks, in a cluster, then space (KF-B-10).
- This week he listened to one guitar line drawn nine ways (`scripts/pitch-study.ts`, clips 1 to 9) and said: "the wide/60 cent vibrato really sounds good and realistic"; "quick bends sound great"; "slides don't sound very good as they are, so we should leave them out". He chose nothing else. So: **the quick bend (clip 5) and the wide guitar vibrato (clip 4) are in; slides, slow bends, a bend whose low note is heard first, and bend-and-release are out**, as are a horn's scoop and fall. Do not build them, and do not leave hooks for them.

The plain soloist has passed his ear on the alto and the vibraphone. **Those two instruments must not change by one note**: every golden and scorecard that does not involve the guitar holds exactly.

## What is already there (do not rebuild it)

- `packages/engine/src/perform/pitch.ts`: a note may carry a `move` (`PitchMove`: glide points and a vibrato, in ticks). `WrittenNote.move` goes through feel untouched to `NoteEvent.move`. `timedNotes` turns it into a curve the sampler follows, and `toMidi` writes the same curve as pitch bend. All of that works and was measured in rendered audio. Read `scripts/pitch-study.ts` for the exact moves he approved: the bend is struck flat and eased up to the note over a tenth of a second (`push(semitones, 0.1)`); the vibrato is `upward`, 60 cents deep, 5.5 times a second, starting 0.35 s into the note and growing over 0.3 s.
- The soloist: all of `packages/engine/src/players/solo/` (about 2,900 lines). A phrase's landings are placed before the line between them, and habits are drawn "by the place of the landing they decorate" (`line.ts`). `SOLO_INSTRUMENTS` (`instruments.ts`) is what a soloist can be; `driven-guitar` is the lead guitar, cut from the clean guitar through an amplifier.

## Read first

- `CLAUDE.md` (the standing rules bind you), `docs/TESTING.md`.
- `docs/MUSIC_NOTES.md`, then in `docs/music-notes/b-comping-soloist.md`: SO-01, SO-37, SO-52, SO-53, SO-57, KF-B-10, KF-B-16, KF-B-19, Q-41, and enough of the rest to know how a phrase is built. In `d-audit-history-sounds.md`: HI-09, HI-16, HI-29, EAR-02, SN-40, SU-D-01, SU-D-16.
- `DECISIONS.md`: "a lead guitar's tone", "the lead guitar's drive, the soloist's level, and the suite's budget", and the soloist's own sections (search "soloist").
- The soloist's engine, the four styles' `solo.ts`, their critics, `critic/measures/` for the soloist, and `test/soloist.test.ts`.

## What to build

1. **What the instrument's hand can do is the instrument's** (`SoloInstrument`): how it bends (the time a bend takes) and how it shakes a note (depth, rate, when it starts, how it grows, upward or either side). Only `driven-guitar` has either. Times are in seconds, because a hand does not move faster when the tempo does; the player turns them into ticks.
2. **How often is the style's** (`SoloStyle`): the chance of a bend into a major third and into a root or fifth (SO-53: blues 0.65 and 0.45, rock 0.45 and 0.55; jazz and funk are not in the list and do not bend), and how long a note must be held before it is shaken (SO-52: rock and blues a dotted quarter, jazz a half note, funk a dotted half). Read the notes' numbers as a ceiling to be measured against his ear's history, not as a target: see "How much" below.
3. **Where**: SO-53 as written. A bend goes only into a note the phrase lands on, or its peak, never a passing note, only a note of an eighth or longer: into a major third from a half step below; into a root or a perfect fifth of a quarter note or longer from a whole step below. The note it starts from must be one the hand would be on: a tone of the scale in play there (a whole step under the root is the flat seventh, so not over a chord with a major seventh). One device per note is moot with two devices that go together: a note bent into may be shaken once it has arrived, if it is held long enough. No bend in the bar the band ends on. A vibrato goes on a held note of the style's length or more, whether or not it was bent into.
4. **How much**: he said thoughtful. In a cluster around the peak of a solo and at the ends of phrases, then space (KF-B-10); counted in bars, never "once a chorus" (HI-29: on a twelve-bar blues that was heard as "no bends"). Say in your report how many bent notes and shaken notes a chorus of each of blues and rock has at each level of the solo's arc, on a 12-bar blues and on a rock chart, over 200 takes, and where they fall. If the notes' chances give more than a guitarist would play, bring them down and say what you chose and why. The riff and repetition habits apply: a phrase said again is said with the same bends.
5. **Rock's default soloist becomes the guitar** (`packages/styles/src/rock/solo.ts`), now that there is one: with the register the notes give an overdriven guitar (SO-01: G3 to E6, home B4). That changes rock's solo golden and its scorecard, with the line `DECISIONS.md` asks for. Blues keeps its default; a player who picks the guitar there gets the blues' bends. Jazz and funk with the guitar get its vibrato and no bends.
6. **The critic and one property**. A measure or two on the scorecard for how much the guitar bends and shakes, so the amount is a number that can be tuned later from his ear. And one property in `test/soloist.test.ts`, stated as a rule about music, on the lines of: "a guitar bends only into a note a phrase lands on, of an eighth or longer: a half step up into a major third or a whole step up into a root or a fifth, in a tenth of a second; it shakes only a note held as long as the style asks; a horn and a vibraphone do neither". Break the rule in the engine to see the property fail, then put it back. The suite's budget is 12 seconds with four styles and it stands at about 9.8: stay inside it and report the number, run alone.

## The rules of this build

- **Styles are data, and so are instruments.** No test in the engine for "is this a guitar" or "is this rock".
- **The engine is pure**: no clock, no `Math.random`; a choice is drawn from the seat's forked generator by place, so the same take is the same take.
- **Prove it sounds** (SU-D-01): a feature that is silently absent sounds like one that makes no difference. Render one rock take with the guitar soloing (`pnpm render:audio <name> chart=rock-three-chord-e.chart style=rock solo=driven-guitar passes=4 only=solo`, a WAV in `out/audio/`) and show from the audio, as `DECISIONS.md` describes for the study, that a bent note starts flat and arrives. Say how many pitch bend messages the same take's MIDI file has.
- **You cannot hear.** Never say it sounds good. Print takes and read them; report counts and places. The owner will listen.
- Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`. Stop any server you start, by port.

## How to check your work

`pnpm check`, `pnpm test:full`, `pnpm score` and `pnpm smoke` must pass, with blues, jazz and funk's goldens and scorecards unmoved (their soloists are the alto and the vibraphone). If the suite goes over budget while you are running other things, that is contention: rerun it alone before believing it.

## Also

Add a section to `DECISIONS.md`, "the lead guitar bends and shakes (stage 6, part 5)": each thing you decided that the notes and this brief did not settle, one line of why each.

## Report

When done, report: what you built and where; each decision, with one line of why; the counts asked for under "How much"; the proof that it sounds; the suite's time; what you verified and how; what you could not verify; anything you found wrong while working (do not fix unrelated things; report them). Keep it short and factual.
