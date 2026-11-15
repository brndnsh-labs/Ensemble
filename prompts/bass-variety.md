# Prompt: a bass that varies its line (after gate 3)

A brief for a subagent. Follows `prompts/seat-bass.md` (the bass seat, built at stage 1).

---

Give the bass of a generative backing band more than one way to play a blues, and let it choose between them by the phrase. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript). The bass seat exists and works; it is the oldest seat in the band and the only one that never chooses anything.

The owner is a bassist. After hearing takes with the whole band he said: **"bass could be a bit more creative."** That is the whole brief, and "a bit" matters: he also said the band sounds good. He is not asking for a busier or a cleverer bass. He is hearing the same two bars all night.

What he hears is in the data: at the working and hot levels the bass has exactly one line for each kind of chord, a two-bar box (root, 3rd, 5th, 6th up; flat 7th, 6th, 5th, 3rd down), in quarter notes, with a lope chosen once per section and a lead-in on the last beat before some changes. Nothing varies from chorus to chorus except the lead-ins.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md` the sections on the bass and "gate 3 feedback".
- `docs/music-notes/a-rhythm-section.md`: "Cross-cutting rules" for the bass (X-A-01 to X-A-31), all of "Bass" as far as it concerns lines, registers and lead-ins (BA-01 to BA-12, BA-28 to BA-34, BA-87 to BA-99), and the bass entries under "Known failures and things tried". `docs/music-notes/c-styles.md`: ST-blues-20 to ST-blues-28. `docs/music-notes/d-audit-history-sounds.md`: "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The bass seat, all of `packages/engine/src/players/bass/` (about 1,400 lines) and `packages/styles/src/blues/bass.ts`.
- How the piano chooses a phrase, as the model for this work: `packages/engine/src/players/chords/phrase.ts` and `critique.ts` (plans drawn for a phrase, each played out, the critic picks the lowest weighted cost; the section keeps one figure; what was played at this place last time is remembered), with its data in `packages/styles/src/blues/chords.ts` (`forms`, `candidates`) and its weights in `packages/styles/src/blues/critic.ts`.
- `critic/types.ts`, `critic/choose.ts`, `critic/measures/bass.ts`.

## The design (decided in outline; the vocabulary is yours)

**1. More than one line for a chord, as data.** Where the style has one tone sequence for a kind of chord, it may have several, with weights. For the blues, on a dominant chord, at least:

- the box as it is (up to the flat 7th and back): `R 3 5 6 | b7 6 5 3`;
- the box to the octave: `R 3 5 6 | 8 6 5 3`;
- two or three more that a blues bassist would call standard, of your choosing from the idiom, for instance the walk through the fourth (`R 3 4 #4 | 5 #4 4 3`), the octave figure (`R 8 b7 5`), root-fifth-sixth (`R 5 6 5 | b7 5 6 5`), or the blue third climbing to the third (`R b3 3 5`). Give minor chords and the other fitted cases (BA-30, ST-blues-23) their own where the idiom has them. Mark in comments which shapes come from the notes and which are new here.

A shape must stay fitted to the chord the way the box is (no major 6th where the chord's scale has none; nothing the harmony rules out held or on a strong beat). If the tone vocabulary lacks something (a `4`, a `#4`, a flat 3rd on a dominant as a passing tone), add it to the engine's vocabulary; do not special-case the blues.

**2. A walk into a change, as data.** Today the bass can lead into a change with one note on the last beat. Add the bar-long version, the thing a bassist does at the end of a line: four quarter notes that step to the next root and arrive a half or whole step from it in actual pitch (A7 to D7: `A B C C# | D`; E7 to A7 down the scale: `E D C# B | A`). Say in the style's data which walks exist for which root motion (the lead-in data already sorts changes into a fall of a fifth, a rise of a fifth, a step up, a step down, and so on). A walk replaces the last bar before a change; it still states the chord on beat 1; its last note obeys every rule a lead-in obeys (it resolves by step in the octave actually played, BA-05; it belongs to the scale of the chord it is played over unless it is a half step from where it lands, X-A-26). The turnaround at the end of a chorus is where a walk matters most.

**3. Chosen by the phrase, by the critic.** For each phrase the bass draws a few plans (which shape on each stay on a chord; whether the phrase ends with a walk, a one-beat lead-in, or neither), plays each out, and the critic picks one. Keep these true:

- **The section keeps its line** (X-B-14): one home shape per level, the same every time the section comes round, and a phrase opens on it. Variation is in the answers and the endings, as it is for the piano. Today's box should remain the most common home, so that most takes still start from the sound the owner already approved.
- **Features**, in units that compare, weights in `critic.weights.bass`: at least how the phrase joins the next (a leap into the next root against a step); the phrase being the phrase before again; being what was played at this place last chorus; a chorus that is one shape throughout (a loop) against one where the home shape never returns; time spent above D3 (the owner asked for a bass guitar's register; see `bass.register` and `bass.high-notes`); and walks belonging at the ends of lines and the tops of choruses more than inside them, more as the band gets louder. Add what you find the choice needs; drop what moves nothing, and say so.
- **Random draws by position, never in sequence** (`heldRng`, `rng.fork` keyed by purpose and place). What may be carried forward is what a bassist carries: the last note played, the phrase before, what was played here last time. BA-97 still holds for the box itself: which half a bar plays comes from how long the chart has been on the chord.
- A style with a single shape and no walks (which is what every future style starts as) must play exactly as the bass plays today.

**4. The quiet level is out of scope**, except for one thing below. The two-feel stays a two-feel.

**5. One thing to repair on the way.** The bass's register was lowered the day this was written (roots no higher than E2). Since then `bass.half-step-approaches` is inside its band (15% to 40% of changes, ST-blues-28) in 65% of takes, where it was 80%: the minor blues fell from 22% to 9%, and the quiet level lost a little everywhere. Find out why (the candidates a lead-in may use near the bottom of the instrument are the first place to look) and bring the share of takes in the band back to 80% or better without raising the register.

## Measures

In `critic/measures/bass.ts`, each with a `says` sentence a bassist would agree with, with targets in the blues critic data labelled `intent` or `measured`, with `minCases`:

- how many different bars the bass plays in a chorus at the working level, counted as shapes (the bar's notes as intervals above its first note, with their places in the bar), and the same for two-bar units;
- how often a chorus is the chorus before it again, bar for bar, as shapes;
- how often a line ends with a walk, a one-beat lead-in, or neither, at the top of a chorus and inside it;
- the share of changes arrived at by a step or half step in actual pitch (the existing half-step measure stays).

Report each of these for the bass as it is today before you change anything: those are the numbers behind "the same two bars all night".

## Rules of the house

- Straight grid, written levels; every note starts inside its own bar; nothing written into `plan.lookahead`; an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a musician's words; cite rule IDs where a rule explains a choice.
- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, 438 tests in about 6 s of a 10 s budget; keep it under 7.5 s and say what it takes). The bass's properties are in `test/bass.test.ts`: on the instrument and one note at a time; the bass note stated where a chord changes; a lead-in resolves by step in actual pitch; no leap of more than an octave; a note held a half note or more is a chord tone; the last note of a jam is the lowest root; a lead-in belongs to its chord's scale unless a half step from where it lands. If one fails because of your work, fix your work; if you believe a property is wrong for a walk, leave it failing and say exactly why.
- The golden takes and the scorecard baseline will change, because the bass plays in every take. Do not run `pnpm goldens` or `score --update`; the main session accepts those. The golden test is the one failure you may leave.
- The soloist and the piano hear the bass (`heard.bass`): the soloist avoids doubling it, the piano keeps clear of it. Their measures will move a little; report any that leave their target.

## Boundaries

- Yours: `packages/engine/src/players/bass/**`, `packages/engine/src/critic/measures/bass.ts`, `packages/styles/src/blues/bass.ts`, the bass entries of `packages/styles/src/blues/critic.ts`, and exports in `packages/engine/src/index.ts`.
- Not yours: the planner, feel, drums, the piano, the soloist, the test folder, `docs/`, `scripts/`, `out/`. If you need a change there, stop short of it and say what and why.
- Do not commit. Throwaway scripts go in a temporary folder outside the repo.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

Render `library/blues-12-bar-a.chart` and three other library charts across seeds, at the working level (`energy: 0.55`), the hot level (`0.85`), and as a five-pass jam, and print the bass bar by bar under the chords: note names, which shape and ending the phrase chose, what each candidate cost. Read it as a bassist would. Does a chorus sound like a line with a turnaround, or like shapes drawn from a hat? Does every walk land? Is the home shape still recognisable? Then count over 200 seeds, three ways on the same seeds: the bass as you built it; the bass as it is today (a style with one shape and no walks); and the first plan drawn with no critic. Use `pnpm -s ensemble score --seeds 200` for the distributions and the worst takes, and read the worst takes.

## Report back

Short and factual: the files; the shape of the new style data, and how a funk line (a one-bar riff that must not vary) and a jazz walking line would be written in it; the shapes and walks you gave the blues, with which are from the notes and which are new; how a phrase is planned and chosen, the features and weights, and what each moved when set to zero; the three-way numbers for every new measure and for the existing bass measures; what you found about the half-step approaches and what fixed it; every judgment call (one line each, with the rule ID where there is one); what `pnpm check` takes now; the musical properties you believe always hold, stated as a bassist would (these become property tests); anything you wanted outside your boundary; and what you would ask the owner to listen for.
