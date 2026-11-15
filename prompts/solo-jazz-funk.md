# Prompt: the soloist for jazz and funk (stage 4)

A brief for a subagent. Follows `prompts/seat-solo.md` (the soloist, built at stage 3 for the blues).

---

Give a generative backing band's soloist two more languages, jazz and funk, as data; and move out of the soloist's engine code whatever it still assumes about the blues. The project is at the repo root you were started in (Ensemble: a ground-up rewrite, TypeScript, stage 4 of 6: "jazz and funk as data"). The blues soloist exists, works, and passed its listening gate: the owner heard "definitely intentional melodies that work well".

Nobody on this project can hear the output except the owner, who will audition MIDI files and ask: **does each style sound like its genre, and unlike the others, on the same chart? Did the blues get worse?** The previous version of this project failed on its soloist: every phrase was an unscored draw, nothing tied one phrase to the next, and the worst takes were bad. What fixed it here is phrases with jobs, memory of ideas, and a critic choosing among candidates. A jazz or funk soloist must keep all of that. A solo that is idiomatic bar by bar and aimless over a chorus is the failure to avoid.

The rule that governs this stage: **styles are data.** Adding a style must not require engine changes. Where it does, the engine is missing a concept: add the concept, in general terms, then express the style as data. You will list every engine change and say why it was a missing concept and not a special case for one style. That list goes into the stage report.

## Where things stand

- `packages/styles/src/funk/` and `packages/styles/src/jazz/` exist. Each has its own feel, tempo, arc and ending in `index.ts`, and four seat files that are **placeholders**: the blues seat under another name. You replace `funk/solo.ts` and `jazz/solo.ts`. The other seats are still the blues drums, bass and piano; ignore how they sound, but the piano does listen to you.
- The CLI renders them: `pnpm -s ensemble render library/jazz-rhythm-changes-bb.chart --style jazz --passes 5 --solo --out x.mid`. The library has seven jazz charts and six funk charts.
- The suite holds the shipping style (blues) to every property. `ENSEMBLE_STYLES=funk,jazz node --test test/` holds the new styles to the same properties. A property that is one style's own is marked `only("blues")`.
- **A short vamp is now played in choruses of several laps** (`DECISIONS.md`, "stage 4 begins"): a one-bar funk vamp is planned as a 16-bar section with four-bar phrases, so a solo chorus on it is sixteen bars, as on any tune. This is new and the soloist has never played one: on `library/funk-one-chord-e.chart` there is no chord change anywhere to land on. Read what it does there.
- Another agent is building the drums for the same two styles at the same time, in its own copy of the repo. You will not see its work.

## Read first

- `CLAUDE.md`, `PLAN.md` ("Resume here"), and in `DECISIONS.md`: "the soloist (stage 3)", "after the soloist's review" (all of it, including what was found and not fixed), and "stage 4 begins".
- `docs/MUSIC_NOTES.md`, then `docs/music-notes/b-comping-soloist.md`: "Soloist" in full, the soloist entries under "Known failures and things tried", and "What separates a good phrase or voicing from a bad one" (the soloist parts). `docs/music-notes/c-styles.md`: "Style: jazz" and "Style: funk" in full (you own the Soloist parts), and X-C-25, X-C-43.
- `docs/music-notes/d-audit-history-sounds.md`: "Soloist" under the audit, "The soloist and the comp" under the owner's ear, and "Measuring quality" (ME-01 to ME-29) before you write a measure.
- The soloist, all of `packages/engine/src/players/solo/` (about 2,200 lines), `packages/styles/src/blues/solo.ts`, the solo weights and targets in `packages/styles/src/blues/critic.ts`, and `critic/measures/solo.ts`.

## What to build

**1. Blues assumptions out of the engine.** The independent review of the soloist listed what a jazz or funk style could not change by data: the kinds of candidate offered for each phrase role and their contours (`phrases.ts`), the peak phrase's shape and place, the thresholds for "related" and "same" (`critique.ts`), the landing's cost per rank and its window. Find the rest yourself: read the engine asking of every constant and every branch, "would a bebop alto or a funk horn section want this the same?" Where the answer is no, it becomes style data with the blues' value in the blues pack. Where the answer is yes, leave it and be ready to say why. Decided already, do not move: a solo is one arc of at most three choruses with a chorus of rest (the notes list that as the same in every style, X-C-39).

**2. A jazz soloist as data** (ST-jazz-34 to ST-jazz-40; the default instrument is the alto). The line follows the changes: the chord's own scale, the bebop passing tone that keeps chord tones on the beats of an eighth-note run, landings on thirds and sevenths. Eighth-note lines, pickups into most phrases, chromatic approaches and enclosures. The notes ask for a run's last eighth to be tied over the barline on half the barlines it could be (ST-jazz-38); the blues never does that, so check whether the engine can.

**3. A funk soloist as data** (ST-funk-29 to ST-funk-35; alto, "phrased like a horn section"). Clipped sixteenth-note figures with rests inside the bar; a riff repeated bar after bar more often than not; a figure stabbed on one repeated pitch before the line moves; the key's minor pentatonic where it suits; changes landed on fifths and roots; no pickups and no ties over the barline. At least four notes in five are short. The blues has no way to say "short" except a long-note ending, and no repeated-pitch stab: expect both to be missing concepts.

**4. What a chorus is made of, in each style.** The blues chorus is statement, restatement, answer (`forms`), because that is what twelve bars are. A 32-bar AABA chorus and a 16-bar funk vamp are built differently, and the notes give the old band's head forms (a period: statement, answer, contrast, statement back) but little about solo choruses. Decide on purpose, write it as data, and say what you chose. This is the part most likely to decide whether a jazz chorus sounds like a solo or like eight unrelated phrases.

**5. The critic in each style.** `critic.weights.solo` in `funk/critic.ts` and `jazz/critic.ts` (replace the blues weights the placeholder spreads in; keep the other seats' as they are), and targets under the `// ── solo ──` heading from ST-jazz-40 and ST-funk-35, labelled `intent` or `measured`, with `minCases`. A feature or a measure that encodes a blues idea (the blue third, the three-phrase chorus) must not be silently wrong in the other styles: either it reads the style's data or it has no weight and no target there. Say which existing features and measures you changed, and which do not apply.

**6. Selection must still earn its keep in each style.** Report, over 200 seeds on each style's own charts: the critic's cost of the solo it chose, of the first candidate every time, and of a random candidate; and for the measures a listener could point to (bars that rhyme, high points earned, leaps resolved, guide tones on the changes, empty bars), the same three ways. If choosing does not beat the first candidate in a style, the weights are wrong: fix them before you report.

Not in this build: the soloist playing the head (it lays out while the band states the tune), trading, bends, scoops, falls and vibrato (the event model has no pitch bend), and the things logged as "found and not fixed" in the soloist's review unless one blocks you (stop-time; a "beat" in compound meters; a phrase copied into a shorter slot).

## The blues must not change

Moving a constant into the blues pack with the value it had changes nothing, and here that identity is the point: **the three blues golden takes must pass unchanged and `pnpm score` must report no movement.** If something you need would change what the blues plays, stop short of it and say what and why.

## Rules of the house

As in `prompts/seat-solo.md`, "Rules of the house": random draws by position only (`rng.fork` keyed by purpose and place), never in sequence; what may be carried forward is what a soloist remembers; straight grid at written levels (feel swings it afterwards: funk swings sixteenths by a trace, jazz swings eighths at 60%, so a jazz cell must not put a note on a sixteenth that is not an eighth, ST-jazz-06); every note starts inside its own bar except a pickup into the soloist's own first bar; nothing written into `plan.lookahead`; an open jam made a pass longer leaves every earlier note unchanged. Pure engine, strict TypeScript 7 (`erasableSyntaxOnly`, `verbatimModuleSyntax`, `.ts` import extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). A small, legible codebase; comments say why, in a player's words; cite rule IDs where a rule explains a choice.

- **Do not write or edit tests.** `pnpm check` must pass (typecheck, lint, 442 tests in about 8.8 s of a 10 s budget; the new styles are not in that run, so it should not get slower). `ENSEMBLE_STYLES=funk,jazz node --test test/` must pass too. The soloist's properties are in `test/soloist.test.ts`: it plays only where it has the lead, on its instrument, one voice; it lands the changes; no wrong note on a beat or held; a breath after every phrase, and a horn breathes; one top note, in the last chorus; a three-chorus solo builds; the last note of the take is the final chord's root, third or fifth. They were written with one style in the room. If one fails because of your work, fix your work; if you believe a property is wrong for jazz or funk as stated, leave it failing and say exactly why and what the property should say instead. Do not run `pnpm goldens` or `score --update`.
- The horn has lungs (`SoloInstrument.breath`), and both new styles default to it. Jazz at 176 to 200 and a ballad at 66 are both in the library: read both.

## Boundaries

- Yours: `packages/engine/src/players/solo/**`, `packages/engine/src/critic/measures/solo.ts`, `packages/styles/src/funk/solo.ts`, `packages/styles/src/jazz/solo.ts`, `packages/styles/src/blues/solo.ts` and the solo entries of `blues/critic.ts` (only to receive values moved out of the engine), the solo entries of `funk/critic.ts` and `jazz/critic.ts`, and exports in `packages/engine/src/index.ts`. In the shared files (the critic files, `index.ts`) make small edits under your own heading; never rewrite the file.
- Not yours: the planner, feel, the other seats, the test folder, `docs/`, `scripts/`, `out/`, `library/`. If you need a change there, stop short of it and say exactly what and why.
- You are working in your own clone of the repo. When you are done and `pnpm check` passes, commit your work there on a branch named `solo-jazz-funk` (one commit is fine). Do not push anywhere. Throwaway scripts and charts go outside the repo, in a temporary folder.
- The older project at `/home/brandon/code/ensemble` is off limits: do not read it, do not copy from it.

## Verifying without ears

A throwaway script: render each style's library charts with `{ mode: "jam", passes: 5, solo: true }`, a timed jam with a solo, and the chart as a song with a solo, across seeds, and print each solo chorus phrase by phrase: the chords, the line as note names on a grid, each phrase's job and which candidate kind was chosen, what the candidates cost. Read it as a player would. Jazz: does the line spell the changes, do eighth-note runs put chord tones on the beats, does an idea from the first A come back in the second, does the bridge do something else, does it breathe at 190 and say enough at 66? Funk: is it a riff a horn section could play, short and in the pocket, said again, with holes in it; on the one-chord vamp does sixteen bars have a shape? In both: where is the top note, and is the last chorus the fullest?

Then the three-way numbers of point 6, `pnpm -s ensemble score --style jazz --seeds 200` and `--style funk` for the distributions and the worst takes, and read the three worst solos in each style.

## Report back

Short and factual: the files; **every engine change, each with one line on why it is a general concept**, and every constant you considered and left in the engine, with why; what you moved into the blues pack; the shape of each style's book and how its chorus is built, with where you departed from the notes (one line each, with the rule ID); the three-way numbers for both styles; which features and measures do not apply to which style; the musical properties you believe always hold for a jazz solo and for a funk solo, stated as a player would (these become property tests); any property you left failing and why; what `pnpm check` takes now; anything you wanted outside your boundary; and what you would ask the owner to listen for.
