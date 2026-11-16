# Build: the acoustic style, and a guitar that fingerpicks (stage 6, part 5, last of five)

You are adding a style to Ensemble, a generative backing band: text and a seed go into a pure engine and a performance comes out. Blues, jazz, funk, rock, disco, neo-soul and reggae exist; the first four were auditioned by the owner (a bassist and guitarist) and passed. Acoustic is the last of five more, and the one that asks most of the engine: its guitar fingerpicks when the band is quiet, which no seat can do yet. The others were built from `prompts/style-rock.md`, `style-disco.md`, `style-neosoul.md` and `style-reggae.md`; their sections in `DECISIONS.md` ("rock", "disco", "neo-soul", "reggae", and the "checked and merged" section after each, which says what the main session changed) are the nearest thing to a worked example.

## Where you are

A clone of the repo at `/home/brandon/code/ensemble2/.work/acoustic`, on a branch `acoustic`. Work only inside it. Do not touch `/home/brandon/code/ensemble2` outside this folder, do not push or fetch, do not deploy. Commit your work on the branch in a few sensible commits (end each message with a `Co-Authored-By` line naming your own model and the `Claude-Session` line the last commit in `git log` ends with). The main session will read your diff, verify it and merge it.

## Read first

- `CLAUDE.md` (the standing rules bind you), `docs/BRIEF.md` sections 5 to 8, `docs/TESTING.md`.
- `docs/MUSIC_NOTES.md`, then in `docs/music-notes/c-styles.md`: "How to read the grids", "Styles: overview", **"Style: acoustic" in full (ST-acoustic-01 to ST-acoustic-39: this is your specification)**, and "Style: funk" and "Style: reggae" to see how the same kind of notes became the packs that exist. In `a-rhythm-section.md` and `b-comping-soloist.md`, the cross-cutting rules and whatever the acoustic notes point at (everything about the guitar's hand in `b-comping-soloist.md`: grips, the pendulum, open strings, picking).
- The seven style packs, all of `packages/styles/src/`, and the types and validators they are written against (`packages/engine/src/style/types.ts`, each seat's `style.ts` and `validate.ts` under `packages/engine/src/players/`). Read the seats' engines as far as you need to know what the data means. Funk, disco and reggae have a guitar on the chord seat (`players/chords/guitar.ts` and the idiom it implements: grips found on the fretboard, the strumming pendulum, muted strokes): read that code whole, because you are extending it. The blues and jazz have the upright bass.
- In `DECISIONS.md`: "stage 4 begins", "a library for three styles", the sections for the funk guitar build (how the guitar idiom was designed), "rock", "disco", "neo-soul", "reggae", and the "checked and merged" section after each.
- `test/takes.ts` and one property file, to see what every style is held to.

## What to build

### 1. The engine concept: a guitar that picks

The notes ask for three things the chord seat cannot do (ST-acoustic-16 to 20, 23):

- **Fingerpicking**: the hand holds a chord shape and plays its strings one or two at a time in a pattern, "as places in the held shape (0 lowest, 3 highest)", one pattern a section (ST-acoustic-18); with no bassist, the thumb alternates basses under the fingers (ST-acoustic-19).
- **Open-position grips**: up to six strings, open strings on, fretted notes at or below the 4th fret where the chord has such a shape (ST-acoustic-16). Find out what the guitar idiom does with open strings today.
- **Picking or strumming chosen by level and held for the section** (ST-acoustic-17): low always picks, high always strums, mid picks in 35% of sections.

This is the design part of the build, and it is yours to make. What it has to be:

- **A general concept, expressed as style data.** A picked pattern is to the guitar what a figure is to the bass and a rhythm book is to the comp: the style writes the patterns, the engine plays them over whatever shape the hand holds. Nothing in the engine may know the word "acoustic". Funk, disco and reggae must be able to leave it out and play exactly as they do (their goldens and scorecards must not move).
- **The same hand.** A picked bar and a strummed bar hold the same grip over the same chord, so going from one to the other is a change of right hand, not of position. The properties that hold a guitarist to a grip, to the fretboard and to one voice-leading still apply; read them (`test/piano.test.ts`, the guitar properties) before designing.
- **Notes that ring.** A picked string rings until it is picked again or the chord changes; say how the engine decides a picked note's length.
- **Hearing the band.** With a bassist the pattern is the notes' broken chords; without one it is the Travis hand (the `--without bass` option is how the engine knows). The piano already knows whether a bassist is there: do it the way the engine already does.
- **Small enough to review.** Prefer the smallest concept that plays the notes' patterns. If you find yourself wanting a second new concept (hammer-ons in the soloist's line, ST-acoustic-26; a slur, ST-acoustic-28; brushes), leave it out and say so in your report.

Write the design down first, in the `DECISIONS.md` section, in a few paragraphs: what the concept is, what the style writes, what the engine decides, what was considered and not chosen. Then build it. One or two properties stated as rules about music are expected here (for example: a picked note is a string of the shape the hand is holding; the thumb plays the chord's bass on the beat where the band has no bassist); break each on purpose once to see it fail.

### 2. The style

1. **`packages/styles/src/acoustic/`** (style id `acoustic`, name "Acoustic"): `index.ts`, `drums.ts`, `bass.ts`, `chords.ts`, `solo.ts`, `critic.ts`, and one line in `packages/styles/src/index.ts`. Written from the acoustic notes. Where a note is marked solid, follow it; where it says unclear, decide and log. The chord seat is the nylon-string guitar (ST-acoustic-16 to 22); the piano book (ST-acoustic-23, 24, 31) is not part of this build.
2. **Sound**: packs `drum-kit` (it has a shaker and a cross-stick; it has no brushes, and the notes' brushes are the shaker and a soft snare tap, ST-acoustic-07), `upright-bass`, and `nylon-guitar` (new: 48 notes, one recording of each at one dynamic, so loud and soft differ only in level; it has never been in a band, so its level is unmeasured). The notes' lead is a second nylon guitar (ST-acoustic-37): add `nylon-guitar` to `SOLO_INSTRUMENTS` with a register from the notes, a hand that does not bend (ST-acoustic-28: no whole-step bends; the half-step slur is not in the model and is not played) and a shake only if the notes give one, make it this style's default, and check `pnpm levels` and the app's soloist control pick it up by themselves. A mix in the style's `sound` in the manner of the others, General MIDI programs for the export (nylon guitar is program 24, counting from 0; acoustic bass 32).
3. **Library**: five or six charts in `library/acoustic-*.chart`, in the manner of the others: the forms a singer-songwriter's band is asked for most (for example a four-chord song in G, a canon progression, a minor ballad, a folk waltz in 3/4, a two-chord verse with a lifted chorus, and one song with an intro, verses, a chorus, a bridge and an outro). Give the song chart an arrangement block that fits it (`docs/CHART_FORMAT.md` section 11): a first verse for guitar alone is what the block is for. Generic progressions only: no chart may be a named song.
4. **The critic and the scorecard**: `acoustic/critic.ts` with weights and targets from the notes' measured numbers (ST-acoustic-15 and what the other styles' critics show is needed, with a measure for how much of the guitar's playing is picked at each level), then `pnpm -s ensemble score --style acoustic --update` to accept `scorecard/acoustic.json` once the numbers are where the notes say they should be. Say in your report what each target is and where the style sits against it.
5. **A golden take or two** for acoustic, the way `test/goldens.ts` holds the others (one of them quiet enough to be picked), with the line in `DECISIONS.md` that the rules ask for.

## The rules of this build

- **Styles are data.** Section 1 above is the one concept this build is asked to add. Anything else the notes ask for that the engine lacks: a small general addition you may make, saying why it is general; anything larger, leave out and report. To find out early: the eighth-note lilt (ST-acoustic-02), root and fifth with a passing tone on beat 4 (ST-acoustic-12 to 14), the add9 decided once per section per chord by the chord's job in the key (ST-acoustic-21), a strum that rings up to two beats and is never choked (ST-acoustic-20), the strum roll of 3 ms a string (ST-acoustic-39), an upstroke that changes early (ST-acoustic-30, 32), the soft ending (ST-acoustic-35), and other meters with intent (ST-acoustic-04: a folk waltz is boom-tick-tick, and the library has one).
- **The other seven styles must not change.** Their goldens and scorecards must hold exactly. If an engine change of yours moves them, it was not general.
- **Properties**: the one or two for the picking hand that section 1 asks for, and no others unless acoustic breaks a rule a musician would name and no existing property can see it. **Do not loosen an existing property to let the new style through** without saying exactly what you loosened and why in your report: the last build excused more than it needed to, and one of its "bugs in another style" was a test that said more than the engine's rule. If a property seems wrong for this style, say what the rule should be. The suite's budget grows with the styles: 18 seconds with seven, 20 with eight (`scripts/budget.ts`, `docs/TESTING.md`), and it stands at about 14.2 with seven, each style in a process of its own, side by side, on 8 cores. Measure `pnpm check` with acoustic added and report the number. If it goes over 20, do not trim anything: report it.
- **You cannot hear.** Never say it sounds good. Print takes and read them (`pnpm -s ensemble render library/acoustic-….chart --style acoustic --seed 1 --out x.mid`, and whatever the other builds used to read a part as text), measure them against the notes, and report the measurements. The owner will listen on the app.
- **Levels.** `pnpm levels acoustic` renders each seat alone and reads its loudness (it needs Google Chrome and ffmpeg; it serves from the repo, which works under `.work/` now). Set the style's mix so the whole band reads near the other styles (funk, rock and disco read -17.0 LUFS with everyone playing, neo-soul -17.7, reggae -17.2, blues and jazz -18.5; aim for -18 to -18.5 here, the quietest band) and the soloist about a decibel under the band, and report the numbers. ST-acoustic-39's make-up gain belongs to the old engine's mixer; use it as a hint, not a number.
- The app picks the style up by itself (the Style control and the library's shelves read `STYLES`). `pnpm smoke` must still pass.

## How to check your work

- `pnpm check`, `pnpm test:full`, `pnpm score` and `pnpm smoke` must pass. If the suite goes over budget while you are running other things, that is contention: rerun it alone before believing it.
- Read at least a low, a mid and a high pass of each seat on two charts and compare them with the notes' grids, bar by bar, before you call a seat done.
- Never `pkill -f`. Never wrap node in `timeout`. In zsh, do not name a loop variable `path`. Stop any server you start by its port (`fuser -k <port>/tcp`), and use ports 8770 and 8771 only.

## Also

- Add a section to `DECISIONS.md`, "acoustic, and a guitar that picks (stage 6, part 5)": each thing you decided that the notes and this brief did not settle, one line of why each; every engine change and why it is general.

## Report

When done, report: what you built and where; every engine change; each decision, with one line of why; the scorecard against the notes' targets; the levels; the suite's time with eight styles; what you verified and how; what you could not verify; what this build shows the engine still cannot do for a guitar. Keep it short and factual.
