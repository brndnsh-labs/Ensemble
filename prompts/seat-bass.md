# Prompt: build the bass seat (stage 1)

A brief for a subagent. Sibling of `prompts/seat-drums.md`.

---

Build the bass seat of a generative backing band, and the blues bass data it plays. The project is at the repo root (Ensemble: a ground-up rewrite, TypeScript, stage 1 of 6). Chord charts and a style pack go in; a drummer, bassist and others each write notes; MIDI comes out. Nobody on this project can hear the output except the owner, who is a bassist. He will audition MIDI files in Logic Pro and ask one question of your work: "is the bass choosing good notes and approaching chord changes well?" The previous version's bass was one of its strongest parts, and your job is to preserve that quality in a cleaner design.

## Read first

Project rules and design (short): `CLAUDE.md`, `PLAN.md`, `DECISIONS.md`, `docs/MUSIC_NOTES.md`, and sections 4 to 7 of `docs/BRIEF.md`.

The musical knowledge, extracted from the previous version by people who read its code. It is domain knowledge, not a design to copy. Rule IDs like `BA-05` are stable; cite them in code comments where a rule explains a choice.

- `docs/music-notes/a-rhythm-section.md`: the conventions and "Cross-cutting rules" at the top (register, energy, time, "Harmony as the rhythm section hears it", repetition); all of "Bass" (shared craft, "Blues: the boogie box", known weaknesses; read "Jazz: the walk" and skim the other styles to see what the data format will have to express later); under "Endings and transitions": "When there is an ending at all", "Which chord", "The five gestures", "The bass's last note", "A last bar that gets home itself", "Transitions between sections", "Turnarounds while looping"; the bass entries under "Known failures and things tried"; and the `BA` and `X-A` entries under "Surprises".
- `docs/music-notes/c-styles.md`: "How to read the grids", "Style: blues" (tempo and feel, bass, anticipation, endings), and the bass items in "What differs between styles and what does not" (X-C-10 to X-C-14).
- `docs/music-notes/b-comping-soloist.md`: only X-B-10 to X-B-12 (chord scales by function), which `theory/scale.ts` implements.

The code you build on, all in `packages/engine/src/`:

- `style/types.ts`: `StylePack`, `Tier`, `tierOf`, `PerTier`, `Hold`, `EndingGesture`.
- `plan/types.ts`: `Plan`, `PlanBar` (energy, seats, `ending`, `kind`, phrase and section position), `planBar`. `plan/plan.ts` shows how the ending bar's harmony is resolved before you see it: the plan's spans are what is played, so a lead-in in the bar before the ending already aims at the final chord (EN-04).
- `perform/notes.ts`: `WrittenNote`, `Player`, `PlayerContext` (including `heard.drums`: the drummer's written notes by bar), `heldRng`.
- `perform/harmony.ts`: `arrivals(plan)` gives every chord arrival in order, look-ahead included, with `changed` and `restated`; `nextChange`, `contextOf`.
- `theory/chord.ts` (`chordTones`, `toneInterval`, `chordFamily`), `theory/scale.ts` (`chordScale`, `scaleHas`), `theory/pitch.ts`.
- `perform/grid.ts`: the pattern notation helpers. `perform/feel.ts` and `perform/perform.ts`: what happens to your notes after you write them.
- `rng.ts`: the seeded generator and `fork`.

## Deliver

1. `packages/engine/src/players/bass/style.ts`: the `BassStyle` type, replacing the placeholder. Plain data with no functions (expressible as JSON). The design already settled, which you should refine rather than replace:
   - A line is a **tone sequence** laid over a **rhythm figure**. The sequence names chord degrees (root, third, fifth, sixth, flat seventh, octave, and so on) that the engine fits to the actual chord: "third" is the chord's own third or its suspension, "fifth" is the chord's own fifth (X-A-24), and a sequence can have variants selected by conditions on the chord (its family, whether its scale has a major sixth, whether it has a flat seventh, whether it is a slash chord), so the blues box's fittings (BA-30) are data. A sequence may cycle over several bars on one chord (the box goes up, then down), counted from how long the chart has stayed on the chord (BA-97).
   - The rhythm figure says where notes fall and which are new tones versus re-strikes of the current tone (the shuffle lope, BA-31), with weighted alternatives held for a span (`Hold`), and articulation (length as a share of the gap, velocities for an arrival, a strong beat, a weak beat, a re-strike, an approach).
   - A **register policy** per style (BA-02): blues places each root nearest the previous note, pulled 30% toward an anchor chosen once per section between C2 and E2, with roots at or under A2 (BA-33).
   - A **lead-in policy** (BA-03, BA-04, BA-11): how often, where in the bar, and the weights of the four kinds. The previous band's bass knew a chord's function only through its scale (BA-82); the brief asks for more ("a V going to a I invites different approach notes than a static vamp"). Let the weights be conditioned on how the root is about to move (down a fifth, up a fourth is the same thing; by step; by third; no change), as data, and choose blues values you can justify.
   - Room for what later styles need (a walking line that chooses each beat by weighted steps toward an approach note; a riff that follows the kick the drummer actually played; a fixed per-song register) without building it now. The hard rule of this project: adding a style changes data only, and when it cannot, the engine is missing a general concept.
2. `packages/engine/src/players/bass/play.ts`: `playBass: Player`, replacing the placeholder. Split into more files in that folder if it helps legibility. It must handle:
   - count-in and tail bars: nothing. Under N.C.: nothing (X-A-21).
   - every arrival stated with the chord's bass note (BA-01, X-A-22, X-A-23);
   - the instrument: nothing below E1 (28); roots between 28 and 52; ornaments up to 57 (X-A-01 to X-A-03); no note shorter than 60 ticks (BA-14); a held note of a half note or more is a chord tone (BA-15); the bass is one voice and a pitch never overlaps itself;
   - lead-ins that resolve **by step in actual pitch** into the exact note the next arrival plays, across section changes and passes too (BA-05 to BA-07), with the rules for the bottom of the instrument (BA-08, BA-09), never sounding the arrival a beat early (BA-34), and no lead-in where there is nothing to approach (BA-11). Suggested approach: decide every arrival's pitch first, in order, then write the notes between arrivals knowing exactly where each one lands, so the promise holds by construction;
   - the ending bar (`bar.ending`): one note, the lowest root on the instrument (EN-27), approached per EN-28 and EN-29, played in the style's gesture (`hold` rings for `ending.ring` ticks; `stop` is an eighth; `soft` is a hold at four fifths weight; `button` and `hits` per EN-17 and EN-18), and the case where the final chord lands partway through the bar (EN-37, EN-30);
   - meters other than 4/4 without nonsense: a plain version (BA-16). Only 4/4 needs to be idiomatic.
3. `packages/styles/src/blues/bass.ts`: `bluesBass: BassStyle`, replacing the placeholder, transcribed from the notes (ST-blues-20 to ST-blues-28, BA-28 to BA-34) with comments in a musician's words.
4. `validateBassStyle(bass: BassStyle): string[]` exported from the bass folder: human-readable problems; an empty array means the data is sound.

## Rules of the house

- **Random draws by position, not sequence.** Every random choice is drawn from `heldRng(...)` or `rng.fork(...)` keyed by a purpose and a place in the music (a section, a pass, a bar, an arrival). Never draw two decisions from one stream in sequence. What may be carried forward in order is musical state that a bassist really carries: the previous note, for placing the next one near it. Nothing in a pass may depend on later passes beyond `plan.lookahead`; an open jam extended by one pass must leave every earlier note unchanged, and that is tested.
- **Straight grid, written levels.** Write every note on the straight sixteenth grid at its written velocity. Never swing, lean, humanize, or scale by energy yourself: `feel.ts` does all of that afterwards. Use the bar's energy only to choose what to play (the tier). Note that the grid is swung afterwards: in the blues the written "and" becomes the triplet's third note, which is what makes the lope a shuffle.
- **Every note starts inside its own bar** (`note.bar` is the plan bar index, `note.tick` is absolute) and no note is written into `plan.lookahead`, though you read it to see what the last bar leads into.
- **A figure is chosen whole**, never note by note (X-A-31).
- The engine is pure: no DOM, no Node, no clock, no `Math.random`, no dependencies, no imports from outside `packages/engine/src`. Strict TypeScript 7 with `erasableSyntaxOnly` (no enums or parameter properties), `verbatimModuleSyntax` (`import type`), relative imports with `.ts` extensions, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Prefer a small, legible codebase over a clever one. The owner reads the code. Comments say why, in musical terms.
- **Do not write tests.** Tests are rationed on this project and the main session owns the suite. Verify with a throwaway script (below) and report which musical properties you believe always hold.

## Boundaries

- Edit only: `packages/engine/src/players/bass/**` and `packages/styles/src/blues/bass.ts`. Do not edit `packages/engine/src/index.ts`, the plan, perform, style, or theory files, `docs/`, or anything else. If `theory/scale.ts` or `perform/harmony.ts` is wrong or missing something you need, stop short of changing it and say exactly what and why in your report.
- Do not commit.

## Verifying without ears

Write a throwaway script outside the repo. If the chart parser exists (`parse` and `expand` exported from the engine), use charts from `library/`; otherwise build `FlatBar`s by hand (a 12-bar blues in 4/4 with a quick change and a two-chord turnaround bar, one section labeled "A"; also a minor blues). Call `planBars` from `packages/engine/src/plan/plan.ts` in jam mode with about 6 passes, then `playBass` with the blues pack from `packages/styles/src/blues/index.ts`. Print each bar as note names with octave, beat position, length and velocity, alongside the bar's chords, energy and tier, and read it as a bassist would. Check by counting, across several seeds and keys (include E and F, where roots sit at the bottom of the instrument): every arrival is the chord's bass note; every lead-in lands within a whole step of the note actually played next; no note is out of range; the box turns the right way; the last note is the lowest root and is approached without a leap of more than an octave; two passes at the same tier share their figure. Run it in 3/4 too. Node 26 runs `.ts` files directly.

## Report back

Short and factual: the files; the shape of `BassStyle` in a few lines and how a walking line and a kick-following riff would later be expressed in it; every judgment call you made where the notes were unclear or you departed from them (one line each, with the rule ID); the counts from your checks; the musical properties you believe always hold for the bass, stated as a musician would, with numbers where they apply (these become the project's property tests); anything you wanted to change outside your boundary; and what you would ask the owner to listen for.
