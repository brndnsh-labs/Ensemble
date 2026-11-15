# Prompt: the jazz piano (stage 4)

A brief for a subagent. Follows `prompts/seat-chords.md` (the chord seat, stage 2) and `prompts/comp-with-soloist.md` (the piano around the soloist, stage 3).

---

Write the jazz pianist's part for a generative backing band as data: rootless voicings in the middle of the keyboard, a comping rhythm of short stabs and held chords that pushes into the changes, and a hand that converses with the soloist. Add to the chord seat's engine whatever general concept the data turns out to need. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, TypeScript, stage 4 of 6: "jazz and funk as data"). The chord seat exists and plays the blues as a piano that passed two listening gates: it voices by candidates and costs, chooses its rhythm by the phrase with a critic, and plays around a soloist.

Nobody on this project can hear the output except the owner, who will audition MIDI files and ask: **does each style sound like its genre, and unlike the others, on the same chart? Did the blues get worse?**

The rule that governs this stage: **styles are data.** Where a style cannot be written as data, the engine is missing a concept: add the concept, in general terms, then write the style. You will list every engine change and say why it is a general concept and not a special case for one style. That list goes into the stage report.

## Where things stand

- `packages/styles/src/jazz/` exists with its own feel, tempo, arc and ending; its drums and soloist are written. Its bass and chord seats are **placeholders**: the blues seat under another name. You replace `jazz/chords.ts`. Other agents are writing the bass seats and the funk guitar at the same time, each in its own copy of the repo; the bass you hear under you is the blues bass until they land.
- The CLI renders it: `pnpm -s ensemble render library/jazz-rhythm-changes-bb.chart --style jazz --passes 5 --solo --out x.mid`. The library has seven jazz charts: rhythm changes (two chords in most bars, 176 bpm), a major and a minor two-five-one, a 32-bar form, a modal tune (one chord for sixteen bars), a ballad at 66 with written colours, and a waltz.
- `pnpm check` holds the shipping style (blues) to every property. `ENSEMBLE_STYLES=jazz node --test test/` holds jazz to the same properties. A property that is one style's own is marked `only("blues")`.
- **The head is an offset in the arc** (`ArcStyle.head`, jazz: -0.15; `DECISIONS.md`, "stage 4 begins"): the first time through a jazz tune is played in the low tier and the next chorus steps up to the working tier. No player tests for "the head": the low tier is what the piano plays under it.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md`: both chord seat sections, "the piano around the soloist", "gate 3 feedback" (the piano got busy as the band got loud, and what fixed it), and "stage 4 begins".
- `docs/MUSIC_NOTES.md` (note "what jazz comping rhythm is supposed to be" under "Where the extractors disagreed": decide it on purpose), then `docs/music-notes/b-comping-soloist.md`: the cross-cutting rules, all of "Chords (comping)", "With a soloist" (CH-59 to CH-72), the comping entries under "Known failures and things tried" (KF-B-09, KF-B-27, KF-B-31, KF-B-36, KF-B-38 especially), and "Voicings" and "Comping rhythm" under "What separates a good phrase or voicing from a bad one".
- `docs/music-notes/c-styles.md`: "Style: jazz" in full (you own "Chords", piano only, ST-jazz-25 to ST-jazz-30, and "Anticipation", ST-jazz-41 to ST-jazz-46), and X-C-15 to X-C-23.
- `docs/music-notes/d-audit-history-sounds.md`: "Comping and voicing" under the audit, "The soloist and the comp" under the owner's ear, and "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The chord seat, all of `packages/engine/src/players/chords/` (about 2,600 lines), `packages/styles/src/blues/chords.ts`, the comping and voicing weights and targets in `packages/styles/src/blues/critic.ts`, `critic/measures/chords.ts`, `comping.ts` and `conversation.ts`, and the properties in `test/piano.test.ts` and `test/soloist.test.ts`.
- The parts you play with: `packages/styles/src/jazz/drums.ts` (the snare comps where the chart moves; ST-jazz-17 wants the snare to land where the piano strikes at least 45% of the time, and the piano hears the drums) and `packages/styles/src/jazz/solo.ts`.

## What to build

### 1. Voicings (ST-jazz-25)

Rootless, one hand in the middle of the keyboard: on a seventh chord the third, the seventh and two colours; a dominant takes the 9th and 13th, or their written alterations; major and minor take the 5th and 9th; a half-diminished chord is its own four notes; a triad gets its root. The lowest note averages between Bb3 and E4, and at least six strikes in ten carry a 9th or a 13th. The blues pack already has a rootless kind: write the jazz recipes, set the register, and tune the voicing weights for a hand that plays a ii-V-I with almost no motion (the third of one chord is the seventh of the next). `test/charts/every-colour.chart` has every kind of chord the format can write: read what the hand does with each.

### 2. Rhythm

The notes give the old band's figures (ST-jazz-26, CH-43: Charleston, reverse Charleston, the "and" of 2 alone, and so on), drawn fresh for every chord of every bar. Its own history calls that a weakness, and the index marks jazz comping rhythm as undecided. This band chooses a phrase whole: a section has a figure, phrases have forms, answers turn the figure, and the critic picks among plans (`phrase.ts`, `critique.ts`). A jazz pianist is the least loop-like comper there is, so the question to decide on purpose is how much of "a section keeps its figure" (X-B-14) a jazz comp keeps. Options that are already data: more figures and answers per tier, forms that turn more often, more candidates, weights that cost repetition more. Read what the phrase machinery does with the jazz figures before adding anything, and say what you chose and why. The property "a section keeps its figure: every phrase opens on the same rhythm each time the section comes round at the same level" holds for every style today; if jazz should not be held to it, say what jazz should be held to instead.

Things the blues never needed, to check against the engine:

- **Two chords in a bar.** Rhythm changes and every short ii-V have them, and the notes give a vocabulary for a chord that lasts two beats: on the chord, on its "and", or both (ST-jazz-26). Today a figure is a whole bar and a chord the figure passes by gets an arrival strike (CH-34). See what that plays on `jazz-rhythm-changes-bb.chart`; if a half-bar chord needs its own figures, that is a concept.
- **Stabs and held chords mixed** (ST-jazz-27): mostly stabs of a dotted sixteenth, a strike held to the end of its chord a quarter of the time (half at low energy). The articulation already says how long a symbol is; check it can say "to the end of the chord".
- **An empty bar** at low energy where the chord is simply held over from the bar before (ST-jazz-28), within CH-34: every chord the chart writes is still struck once.
- **The push** (ST-jazz-41 to ST-jazz-43, CH-39, CH-40): 25% to 45% of changes are anticipated, more as the band gets louder; a strike in the eighth before a mid-bar change always plays the new chord and ties over, and the chord is not struck again on its beat. `Anticipation` has both as data; set them and measure.
- **Swung eighths only** (ST-jazz-06): nothing on a sixteenth that is not an eighth.
- **Louder is harder, not busier, under a soloist.** The lesson of gate 3 (`listening.busiest`). At the high tier with nobody soloing the notes add a stab to 40% of bars (ST-jazz-27).

### 3. With a soloist (ST-jazz-29, ST-jazz-30, CH-59 to CH-72)

The machinery exists (`listening`: the four ways a phrase can be played around the line, the voicing features that keep off the soloist's note and under its register) and jazz is the style it was designed for. One part of it has never been exercised: **the answering stab**, a strike put into a breath the figure leaves empty. The blues figures fill 97% of the soloist's breaths, so the rules for an added stab were met once in 64 takes. Jazz figures leave holes. Read its output closely: is the stab on the first off-beat eighth after the soloist lets go, clear of the next entrance, never a stutter against the figure's own strikes, never in the eighth before a change? The targets: under 21% of bars under a solo have a single strike; the comp is 1.1 to 2 times busier in the breaths than under the line; 40% to 70% of breaths get an answer; the soloist's exact pitch is doubled at most 15% of the time.

### 4. Measures and targets

Targets under the `// ── chords ──` heading of `jazz/critic.ts`, labelled `intent` or `measured`, with `minCases`; and the `comping` and `voicing` weights there (replace the blues weights the placeholder spreads in for your seat; leave the other seats'). Most of what the notes ask is already measured for the blues; add what is not (strikes that carry a 9th or 13th; the lowest note's average; changes anticipated; the snare landing with the piano, if the drums' measure does not already cover it). Check that every existing chord, comping and conversation measure still says something true reading a jazz take, and say which do not apply.

Report, over 200 seeds on the jazz charts, three ways on the same seeds: the piano as built; deaf to the soloist (`listening: null` and the soloist weights at zero; `scripts/deaf-piano.ts` shows how); and with the first candidate taken.

### 5. Validation

Extend `validate.ts` for anything you add to the type.

## The blues must not change

The three blues golden takes must pass unchanged and `pnpm score` must report no movement.

## Rules of the house

As in `prompts/seat-chords.md`, "Rules of the house": random draws by position only, never in sequence; straight grid at written levels (feel swings and leans it afterwards: jazz swings eighths at 60% and the piano sits 8 ms behind the drums); every note starts inside its own bar; nothing written into `plan.lookahead`; an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a pianist's words; cite rule IDs where a rule explains a choice.

- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, the suite inside its 10 s budget; say what it takes before and after). `ENSEMBLE_STYLES=jazz node --test test/` must pass too. The piano's properties are in `test/piano.test.ts` and `test/soloist.test.ts`. If one fails because of your work, fix your work; if you believe a property is wrong for jazz as stated, leave it failing and say exactly why and what it should say. Do not run `pnpm goldens` or `score --update`.
- Tempo: the library runs from 66 to 176. A figure that is airy at 138 is frantic at 200 and empty at 66. The notes have nothing on this (X-C-48); read both ends and say what you found.
- Meters other than 4/4 fall back to a plain pattern on the pulses (CH-54): `library/jazz-waltz-f.chart` must be sensible.

## Boundaries

- Yours: `packages/engine/src/players/chords/**`, `packages/engine/src/critic/measures/chords.ts`, `comping.ts` and `conversation.ts`, `packages/styles/src/jazz/chords.ts`, the chord, comping and voicing entries of `jazz/critic.ts`, and exports in `packages/engine/src/index.ts`. Another agent is working in `players/chords/**` at the same time, adding a guitar idiom (`idiom.ts`, a new idiom file, muted attacks in the figure notation, how a strike becomes notes): keep your changes to the rhythm and the piano, and do not reorganise files you do not have to. In the shared files make small edits; never rewrite one.
- Not yours: the planner, feel, the other seats, `packages/styles/src/blues/**`, `packages/styles/src/funk/**`, the test folder, `docs/`, `scripts/`, `out/`, `library/`. If you need a change there, stop short of it and say exactly what and why.
- You are working in your own clone of the repo. When you are done and `pnpm check` passes, commit your work there on a branch named `chords-jazz-piano` (one commit is fine). Do not push anywhere. Throwaway scripts and charts go outside the repo, in a temporary folder.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

A throwaway script: render the jazz library charts and two blues charts in the jazz style, as a five-pass jam with and without a solo, a timed jam, and at set levels (`energy: 0.3`, `0.55`, `0.85`), across seeds, and print the piano bar by bar under the chords: the strikes on a grid with their lengths, each voicing as note names with what each note is (3, 7, 9, 13), the snare's strokes beside them, and under a solo the soloist's line above with which way the phrase was played. Read it as a pianist would. Does a ii-V-I move by a step or not at all? Where is the root (it should be the bassist's)? Does the comp push into some changes and land on others? On rhythm changes at 176, is a bar of two chords two clean strikes or a scramble? On the modal tune, is sixteen bars of one chord a loop? On the ballad, does the hand hold? Under a solo, does it get out of the way and come back in the holes, and does the answering stab ever stutter or step on an entrance?

Then the three-way numbers, `pnpm -s ensemble score --style jazz --seeds 200` for the distributions and the worst takes, and read the worst takes.

## Report back

Short and factual: the files; **every engine change, each with one line on why it is a general concept**; the jazz part as written (voicing recipes, figures, forms, anticipation, listening) and where you left the notes (one line each, with the rule ID); what you decided about "a section keeps its figure" for jazz and why; the three-way numbers for every measure; what the answering stab does now that it is exercised, with the bugs you found in it; which existing measures do not apply; the musical properties you believe always hold for a jazz piano, stated as a pianist would (these become property tests); any property you left failing and why; what `pnpm check` takes, before and after; anything you wanted outside your boundary; and what you would ask the owner to listen for.
