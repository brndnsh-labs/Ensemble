# Prompt: the piano around the soloist (stage 3)

A brief for a subagent. Follows `prompts/seat-chords.md` (the chord seat) and `prompts/seat-solo.md` (the soloist), both built and committed.

---

Teach the chord seat of a generative backing band to play around a soloist: keep off the soloist's note, give the line its register, lay out under the line, and answer its breaths. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript, stage 3 of 6). The piano and the soloist both exist and work; today the piano plays as if the soloist were not there, apart from one feature (`under-the-soloist`) that leans its choice of phrase plan.

Nobody on this project can hear the output except the owner, who will audition MIDI files and ask of your work: **does the comping leave room?** The stage is done when the comp's overlap with the soloist's rhythm is measurably lower than the same comp deaf to the soloist, on the same seeds.

This matters more here than it sounds: the vibraphone's home is C5 and the piano's top voice aims at C5.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), the chord and soloist sections of `DECISIONS.md`.
- `docs/music-notes/b-comping-soloist.md`: "With a soloist" (CH-59 to CH-72), CH-80 under "Known weaknesses", KF-B-27, KF-B-35, KF-B-37, Q-16. `docs/music-notes/c-styles.md`: ST-blues-33. `docs/music-notes/d-audit-history-sounds.md`: "Measuring quality" (ME-01 to ME-29), before you write a measure.
- The chord seat, all of `packages/engine/src/players/chords/` (about 1,900 lines; `play.ts` shows the three steps: rhythm, voicing, idiom), and `packages/styles/src/blues/chords.ts` and `critic.ts`.
- What the comper hears: `heard.solo` in `perform/notes.ts` (the soloist's written notes by bar index, on the straight grid; the soloist plays before the piano and cannot hear it), and `PlanBar.solo` (the plan's mark for a bar in which the soloist has the lead; null where it lays out).
- `critic/measures/comping.ts`, `critic/measures/chords.ts` and `critic/measures/solo.ts`, as models for measures.

## The design (decided; build this)

The old band did all of this with a coin per strike and a coin per breath (CH-69, CH-71), and its own notes call that a weakness (CH-80). Here both halves go through candidates and the critic, like everything else in the seat. Nothing new is drawn at random per strike.

### 1. Voicing: the soloist's note and the soloist's register

`voiceStrikes` is given the soloist's notes. For a strike, the **line** is the soloist's notes that sound while the strike rings. Add features to `VOICING_FEATURES`, weights in `critic.weights.voicing`:

- **On the soloist's note** (CH-59): for each comp voice on a pitch the soloist sounds over the strike, the share of the strike's sounding time that note fills. The notes' weight is 26 (tuned there: at 14 the comp still sat on the note, at 30 it leapt an octave to escape). A second feature for the octave, at 7.
- **In the soloist's register** (CH-63): voices at or above the lowest pitch of the line, or within a half step below it. To stop the hand flipping an octave up and down from strike to strike (CH-65: 15 to 25% of consecutive strikes when decided by the strike), judge this one **by the bar**: against the soloist's notes sounding in this bar or the bar before, so the hand settles under a phrase and comes back up only after a bar of silence. You tune the weight: enough to move the hand under the line where there is room, not so much that it leaves its slot (nothing under E3, the low-interval limits and the rub rules still cost what they cost) or leaps to get there.

Then one rule that is not a preference, applied after the choice (CH-60): a voice still on the soloist's exact pitch for half the strike's length or a full beat is left out, top voice first, but never a guide tone (3rd or suspension, 7th or 6th), never a written alteration (X-B-13), never the bottom voice, and never below two sounding voices. The hand is still led from the whole voicing it chose, not from what was left sounding.

The pump (a groove, close position) takes the features and the rule like any other strike. Its rhythm does not change (below).

The voicing memo in `voiceStrikes` is keyed by the voicing in hand; a choice that reads the line cannot use it as it stands. Keep the memo for strikes with no line.

### 2. Rhythm: laying out and answering, by the phrase

A phrase is still chosen whole from candidates (`phrase.ts`, `critique.ts`). Where the soloist has the lead in a phrase and the section's figure is not a groove, each plan drawn is played out more than one way, and every way is a candidate:

- **as written**: the plan, as now;
- **laid out**: the plan with the strikes that come down under a sounding soloist note left out, except a chord's first strike and a push, which always stay (CH-69), so every chord is still struck (CH-34);
- **laid out and answering**: the same, and in the soloist's breaths the hand speaks. A breath is a dotted quarter or more with no soloist note sounding, counted across a barline; a bar the soloist sits out straight after playing is a breath, a longer rest is not (CH-71). A strike the figure already has inside a breath is played a little harder (8 in the notes). An empty breath gets one stab: on the first "and" at least an eighth after the soloist lets go, at least a quarter note clear of every other comp strike (an "and" straight after a struck beat is a stutter), never in the eighth before a change of chord and never in a beat cleared for a push (KF-B-27, already enforced in `bar.ts`: keep it true), an eighth long at most, written level 92.

You may add one more way if the numbers ask for it (for instance answering only the breath that ends the phrase), but keep the set small and say why each is there.

The critic chooses among all of them. `under-the-soloist` is already a feature. Add what the choice needs, in units that compare with the features there: at least the share of breaths left with nothing in them, and an answer that steps on the soloist coming back in (a strike in the eighth before the soloist's next note). `off-the-energy` already costs a phrase that has gone too thin; check that it keeps the time (CH-70: the old band needed a floor of strikes a bar, or the piano was heard as thin). The intended result is a comp that mostly lays out under a busy line, plays through a sparse one, and answers most breaths but not all (Q-16: 40 to 70% of breaths). Reach that by the weights, not by a coin.

What does not change: the section's figure, the answers drawn for the pass, the plans drawn for the phrase, the push decided per barline. With the soloist off or laying out, every note of every take must be exactly what it is today (CH-68). The main session has a digest of 224 takes to check this.

Not in this build (CH-80's other wishes): echoing the soloist's rhythm, answering a question differently from an answer, building with the solo's arc. Leave them out and do not sketch them.

### 3. Style data

Whether a comp converses is the style's business (CH-68: a funk chop and an organ never do). Add one field to `ChordStyle`, null for a seat that does not listen, holding what a style would tune: how long a breath is, the answering stab (level and length), how much harder an answered strike is. A figure marked `groove` never converses whatever the field says (ST-blues-33: the pump never does this). With the field null and the three soloist weights at zero, the comp is deaf to the soloist: that is the baseline the stage is measured against, so make sure it is reachable by data alone. Extend `validate.ts` for the new field.

### 4. Measures

In `critic/measures/` (a new file if `comping.ts` would pass 450 lines), each with a `says` sentence a pianist would agree with, each counting only where the soloist has the lead, each with its number of cases:

- the share of the time the soloist sounds over the comp during which some comp voice is on the soloist's exact pitch (CH-62: at most 15%; octaves not counted);
- the share of comp notes sounding under the line that are at or above the soloist's lowest sounding pitch;
- **the overlap**: the share of comp strikes that come down while a soloist note sounds; and beside it, how many of the soloist's notes have a comp strike on the same tick;
- strikes per sixteenth under the line, and in the breaths, and their ratio (Q-16: 1.1 to 2.0 for a comp that converses, 0.7 to 1.0 for a groove; report pump phrases apart or leave them out, and say which);
- the share of breaths that hold a comp strike (Q-16: 0.4 to 0.7);
- how much louder strikes in breaths are than strikes under the line (Q-16: 1 to 12);
- how often the top of the hand moves more than a fourth between consecutive strikes under a solo (CH-65's failure; it must not rise against today).

Targets in the blues critic data, labelled `intent` or `measured`, with `minCases`.

The existing phrase-shape measures (`chords.bar-same-as-last`, `chords.phrase-*`, `chords.phrases-*`) read what was played and will move once strikes are left out and added under a solo. Count them only over phrases where the soloist does not have the lead, and say so in each `says`.

## Rules of the house

As in `prompts/seat-chords.md`, "Rules of the house": random draws by position only (you should need no new draws at all); the straight grid at written levels; every note starts inside its own bar; an open jam extended by a pass leaves every earlier note unchanged; pure engine, strict TypeScript, comments that say why in musical terms; a small legible codebase.

- **Do not write or edit tests.** `pnpm check` must pass with your work in (typecheck, lint, and 431 tests, which today take about 6.7 s of a 10 s budget; say what it takes afterwards and keep it under 8.5 s). The properties already in `test/properties.test.ts` hold the piano to: register, chord identity, harmony, every chord struck, one hand (five notes at most, none doubled, one chord at a time), the eighth before a change, the last chord, the eighth grid. They run over takes with a soloist. If one fails because of your work, fix your work; if you believe the property is wrong under a soloist, leave it failing and say exactly why. ("A section keeps its figure" already leaves out bars where the soloist has the lead.)
- The golden take with a solo and the scorecard baseline will change. Do not run `pnpm goldens` or `score --update`; the main session accepts those. The two goldens without a soloist must not change.

## Boundaries

- Yours: `packages/engine/src/players/chords/**`, `packages/engine/src/critic/measures/comping.ts` and `chords.ts` and one new measures file with its line in `measures/index.ts`, `packages/styles/src/blues/chords.ts`, the chord, comping and voicing entries of `packages/styles/src/blues/critic.ts`, and exports in `packages/engine/src/index.ts`.
- Not yours: the soloist (`players/solo/**`), the planner, feel, drums, bass, the test folder, `docs/`, `scripts/`. If you need the soloist to export something (its `phrasesOf` is not exported), work it out from `heard.solo` instead; if you truly cannot, stop short and say what and why.
- Do not commit. Do not touch anything outside the repo except throwaway scripts in a temporary folder.

## Verifying without ears

Throwaway scripts outside the repo. Render `library/blues-12-bar-a.chart` and three other library charts with `{ mode: "jam", passes: 4, solo: true }` and a timed jam with a solo, across seeds, with both solo instruments (`soloInstrument: "alto-sax"` sits a fourth lower than the vibraphone) and print each bar under a solo: the soloist's line as a grid with pitches, the piano's strikes under it with the voicing as note names, which candidate way was chosen and what each feature cost. Read it as a pianist would: does the hand get out of the way, does it come back in the holes, does it ever stutter or step on an entrance?

Then count over 200 seeds, three ways on the same seeds: the comp as you built it; the comp deaf to the soloist (the field null, the soloist weights at zero); and the comp with the first candidate taken. Use `pnpm -s ensemble score --seeds 200` for the distributions and the worst takes, and go and read the worst takes.

## Report back

Short and factual: the files; the shape of the new style field; the candidate ways and why each is there; the features and weights you settled on, and what each moved when set to zero; the three-way numbers above for every new measure, and for the top-voice measures and strikes a bar (which must not get worse); every judgment call where the notes were unclear or you left them (one line each, with the rule ID); what `pnpm check` takes now; the musical properties you believe always hold, stated as a musician would (these become property tests); anything you wanted outside your boundary; and what you would ask the owner to listen for.
