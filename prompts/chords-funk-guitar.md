# Prompt: an electric guitar for the chord seat, and the funk guitar part (stage 4)

A brief for a subagent. Follows `prompts/seat-chords.md` (the chord seat, stage 2, built for a piano).

---

Teach the chord seat of a generative backing band to be a guitar, and write the funk rhythm guitar part as data: three strings high on the neck, a strumming hand that never stops, clipped stabs and muted scratches. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, TypeScript, stage 4 of 6: "jazz and funk as data"). The chord seat exists and plays the blues as a piano; it was designed with a second instrument in mind (`Idiom`, `players/chords/idiom.ts`: an idiom says what a voicing candidate is and how a strike becomes notes), and the guitar is that second instrument.

Nobody on this project can hear the output except the owner, who will audition MIDI files and ask: **does each style sound like its genre, and unlike the others, on the same chart? Did the blues get worse?** A funk band whose chord seat is a piano playing blues chops in a funk feel is the failure this brief exists to prevent.

The rule that governs this stage: **styles are data.** Where a style cannot be written as data, the engine is missing a concept: add the concept, in general terms, then write the style. You will list every engine change and say why it is a general concept and not a special case for one style. That list goes into the stage report.

## Where things stand

- `packages/styles/src/funk/` exists with its own feel, tempo, arc and ending; its drums and soloist are written. Its bass and chord seats are **placeholders**: the blues seat under another name. You replace `funk/chords.ts`. Other agents are writing the funk and jazz bass and the jazz piano at the same time, each in its own copy of the repo; the bass you hear under you is the blues bass until they land.
- The CLI renders it: `pnpm -s ensemble render library/funk-vamp-a.chart --style funk --out x.mid`. The library has six funk charts, three of them vamps of one, two and four bars.
- `pnpm check` holds the shipping style (blues) to every property. `ENSEMBLE_STYLES=funk node --test test/` holds funk to the same properties. A property that is one style's own is marked `only("blues")`.
- **A short vamp is played in choruses of several laps** (`DECISIONS.md`, "stage 4 begins"): a one-bar vamp is a 16-bar section with four-bar phrases.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md`: both chord seat sections, "the piano around the soloist", and "stage 4 begins".
- `docs/MUSIC_NOTES.md`, then `docs/music-notes/b-comping-soloist.md`: the cross-cutting rules, all of "Chords (comping)" with "Guitar" (CH-20 to CH-32) and "Rhythm: how a bar of comping is built" (CH-33 to CH-54) read closely, and the comping entries under "Known failures and things tried".
- `docs/music-notes/c-styles.md`: "Style: funk" in full (you own "Rhythm guitar", ST-funk-26 to ST-funk-28, and the guitar's line in "Anticipation"), and X-C-15 to X-C-24. Skim the guitar parts of the other styles (blues, rock, reggae, disco, acoustic) only to see what the idiom must not rule out.
- `docs/music-notes/d-audit-history-sounds.md`: "Comping and voicing" under the audit, and "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The chord seat, all of `packages/engine/src/players/chords/` (about 2,600 lines; `play.ts` shows the three steps: rhythm, voicing, idiom), `packages/styles/src/blues/chords.ts`, the comping and voicing weights and targets in `packages/styles/src/blues/critic.ts`, `critic/measures/chords.ts` and `comping.ts`, and the properties in `test/piano.test.ts`.

## What to build

### 1. The guitar idiom

**A chord is found on the fretboard** (CH-20, CH-21): standard tuning, one note to a string, adjacent strings (a style may allow one muted string inside the grip), every fretted note within a four-fret hand, nothing over the 15th fret, pitch rising string to string. A grip covers the tones the recipe asks for; identity outranks everything, as on the piano (the third, the seventh and any written alteration sound, X-B-13). What a style tunes is data: how many strings, the window on the neck, where the top note is aimed and how firmly the hand stays in position, whether open strings are allowed (never where the hand mutes by releasing, CH-23), whether the root must be on the bottom. Grips are then chosen by the voicing engine's own costs and features, like any candidate.

**A guitarist holds a grip** until the chord changes and moves only then (CH-31); a pianist re-voices every strike. That is a difference of idiom, not of style.

**The strumming hand is a pendulum** on the grid it strums, sixteenths for funk: down on the beat side of each pair, up on the other. Direction comes from position and is never chosen (CH-27). An upstroke sounds only the top strings of the grip. A strum rolls across the strings, low string first going down, high string first coming up, a few milliseconds a string (CH-29): the note model has a microtiming offset that feel fills in afterwards, so see how an idiom can ask for a roll without any player owning a private timing trick, and if the cleanest way needs a field on the written note, add it and say so.

**A muted scratch** is the same pendulum with the fretting hand released: half a sixteenth, pitchless, quiet, deadening the grip the hand holds at that moment (CH-28). It has to reach the MIDI file as something a guitar patch plays as a "chick" and a sampler later as its own articulation: look at how the drums name a ghost stroke (`voice`), and decide what pitches a scratch carries. After an anticipation the hand already holds the next chord, so a scratch never goes back to the old shape.

The rhythm book writes figures in symbols with an articulation each (`x`, `X`, `o`), `-` for held and `.` for silence. A strummed line needs a scratch and "the hand passes without touching" as well. Extend the notation in general terms: a symbol's attack can be muted; do not special-case funk.

### 2. The funk guitar part, as data (ST-funk-26 to ST-funk-28, CH-47)

The "E9" grip (third, seventh, ninth on the top three strings), D3 to G5, the top aimed at F#4 and held there, no open strings. One chicken-scratch line per section, the same every time the section returns. By tier: low plays the stabs only; mid adds scratches on the eighths; high scratches every sixteenth the line leaves open. It is a groove: nothing takes a stroke out of it, it does not converse with a soloist (`listening: null`, CH-68), and a stab in the last eighth before a change leans in some of the time at mid and high (ST-funk-38). Eight to sixteen strokes a bar; 30% to 80% of them scratches; at least 60% of stabs off the beat; nearly all of them short.

The notes give three lines. The old band chose one per section and looped it for the whole section, which is right for a groove (X-C-42) and is also sixteen identical bars on a one-bar vamp. The piano's rhythm book has forms and answers so that a phrase has a shape; decide what, if anything, a funk guitarist varies at a phrase end (the drummer has an answer bar and a fill, the bassist may turn the riff round) and say what you chose. Do not make it busy: the part is a machine with a hand on it.

Every chord the chart writes is still struck (CH-34): on a guitar the arrival strike is a downstroke, and a scratch sitting on that arrival gives way to it.

### 3. Measures and targets

In `critic/measures/chords.ts` or `comping.ts`, each with a `says` sentence a guitarist would agree with, with targets under the `// ── chords ──` heading of `funk/critic.ts`, labelled `intent` or `measured`, with `minCases`; and the `comping` and `voicing` weights in `funk/critic.ts` (replace the blues weights the placeholder spreads in for your seat; leave the other seats'). From ST-funk-28 and CH-52: strokes a bar, the share that are scratches, stabs off the beat, stabs that are short. Add: how far the hand moves on the neck between consecutive chords, and how often a section's line is the line it had last time. Check that every existing chord and comping measure still says something true reading a guitar part (several count "strikes" and will count scratches unless told what a scratch is), and say which do not apply.

### 4. Validation

Extend `validate.ts` for the idiom and everything you add to the type.

## The blues must not change

The three blues golden takes must pass unchanged and `pnpm score` must report no movement. The keys idiom plays exactly what it plays today.

## Rules of the house

As in `prompts/seat-chords.md`, "Rules of the house": random draws by position only, never in sequence; straight grid at written levels (feel swings and leans it afterwards: funk swings sixteenths by a trace and the guitar sits 3 ms ahead of the drums); every note starts inside its own bar; nothing written into `plan.lookahead`; an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a guitarist's words; cite rule IDs where a rule explains a choice.

- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, the suite inside its 10 s budget; say what it takes before and after). `ENSEMBLE_STYLES=funk node --test test/` must pass too. The chord seat's properties are in `test/piano.test.ts`, and they were written for a piano: nothing under the style's floor; every strike is the chord under it; every chord struck; one hand (five notes at most, none doubled, one chord at a time); the eighth before a change belongs to the chord coming; the last chord is the final chord, struck where it lands; a section keeps its figure. Some will be wrong for a guitar as stated (a scratch is not a chord; a roll starts its notes on different ticks; "one hand" is six strings). Where one fails because the property says "piano" and means "chord seat", leave it failing and say exactly what it should say for both instruments; where it fails because of a bug, fix the bug. Do not run `pnpm goldens` or `score --update`.
- Meters other than 4/4 fall back to a plain pattern on the pulses (CH-54).

## Boundaries

- Yours: `packages/engine/src/players/chords/**`, `packages/engine/src/critic/measures/chords.ts` and `comping.ts`, `packages/styles/src/funk/chords.ts`, the chord, comping and voicing entries of `funk/critic.ts`, and exports in `packages/engine/src/index.ts`. If the roll or the scratch needs a line in the note model, feel, or the MIDI export, make that one change and say so. Another agent is working in `players/chords/**` on the jazz piano at the same time (rhythm figures for bars with two chords, the piano's rhythm book): keep your changes to the idiom, the notation's attacks, and what the guitar needs, and do not reorganise files you do not have to. In the shared files make small edits; never rewrite one.
- Not yours: the planner, the other seats, `packages/styles/src/blues/**`, `packages/styles/src/jazz/**`, the test folder, `docs/`, `scripts/`, `out/`, `library/`. If you need a change there, stop short of it and say exactly what and why.
- You are working in your own clone of the repo. When you are done and `pnpm check` passes, commit your work there on a branch named `chords-funk-guitar` (one commit is fine). Do not push anywhere. Throwaway scripts and charts go outside the repo, in a temporary folder.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

A throwaway script: render the funk library charts and two blues charts in the funk style, as a five-pass jam, a timed jam, and at set levels (`energy: 0.3`, `0.55`, `0.85`), across seeds, and print the guitar bar by bar under the chords: the line as a grid of downs, ups, stabs and scratches, each grip as string and fret (`x x 6 7 7 7`) with its note names, and where the hand moved. Read it as a guitarist would. Can every grip be played? Does the hand stay in one place on the neck through a vamp and move sensibly at the bridge? Is the line the same line in every bar of the section? Are the scratches on the grip the hand is holding? Does a pushed chord tie over and is its downbeat left alone? Write every chord in `test/charts/every-colour.chart` as a grip and read the list: a m7b5, a 13, a 7#9, a sus, a slash chord. Then `pnpm -s ensemble score --style funk --seeds 200` for the distributions and the worst takes, and read the worst takes.

## Report back

Short and factual: the files; **every engine change, each with one line on why it is a general concept**; what the guitar idiom takes as data, and how a rock guitar (four strings, ringing eighth-note strums) and a reggae skank (three strings high up, chops on the offbeats) would be written in it; the funk part as written and where you left the notes (one line each, with the rule ID); the grips for a dozen representative chords; the numbers for every measure over 200 seeds; which existing measures and properties do not apply to a guitar, and what each property should say; the musical properties you believe always hold for a guitar in the chord seat, stated as a guitarist would (these become property tests); what `pnpm check` takes, before and after; anything you wanted outside your boundary; and what you would ask the owner to listen for.
