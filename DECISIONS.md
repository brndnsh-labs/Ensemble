# Decisions

Date, decision, one line of why. Newest at the bottom. Departures from the docs are marked **(departure)**.

## 2026-11-14: kickoff

**Tooling**

- pnpm workspace, TypeScript 7.0 (the native compiler), Biome 2.6 for lint and format. Current stable versions, checked at install.
- Tests run on Node's built-in test runner with native type stripping; no test framework and no build step. One fewer dependency, and the suite starts in milliseconds.
- Engine purity is enforced three ways: the engine's tsconfig has no DOM or Node types; Biome rejects imports that leave the package; a lint plugin rejects `Math.random`, `Date.now`, `new Date`, and `performance.now` in engine source.
- `scripts/budget.ts` fails the test command when it exceeds the wall-clock limit in `docs/TESTING.md`. The budgets hold locally, not only in CI.
- CI is a GitHub Actions workflow file that stays dormant: the repo is local-only for now, at Brandon's choice.
- The suite lives in a top-level `test/` package, not inside the engine. It needs the style packs, which depend on the engine; a separate package avoids a dependency cycle and makes "public API only" literal.

**Music notes**

- `docs/MUSIC_NOTES.md` is an index; the knowledge itself is in four part files under `docs/music-notes/`. Together they run to about 1,500 rules, too much to read every session, so sessions read the index and then the part that matches the work. **(departure: the handoff expected one file)**
- The notes were extracted by four agents working read-only in the old repo, split by seat. No code from the old repo was read on the main thread or copied here.

**Chart**

- Round trip compares models with source ranges and each chord's as-typed text set aside. Those record where and how something was typed, not what the chart means.
- Numerals print with case carrying the third (`ii7`, `imaj7`, `viio7`, `iiø7`), so `IIm7` prints as `ii7`.
- The slot-count rule in the spec ("divides n, or n times a power of two") is the definition; its table is illustrative.

**Engine design**

- Style packs are typed TypeScript data with no functions in them, in their own package. The compiler checks shape; `validateStyle` checks meaning. Plain data keeps the option of JSON later.
- All timing feel is applied in one pass after the players write on a straight grid: swing, then a lean per seat against the drums, then humanize. The old band learned that private timing tricks do not survive, and a shift applied to everyone including the drums is only latency.
- A note's `tick` is its straight-grid position and `offset` holds all microtiming including swing, so a consumer can show or strip the feel.
- Lean is authored in milliseconds (a pocket is a time, not a fraction of a beat) and converted to ticks at the plan's tempo.
- Every random choice is drawn from a generator forked by musical position. The old band's hardest-won structural lesson.
- An open jam is planned with one look-ahead pass that is read and never played, which is what makes extension leave earlier passes untouched.
- The energy model is carried over as tested by ear: one number per bar from 0 to 1; three tiers (low under 0.42, mid under 0.70, high) choose what is played; the raw number scales how loud (velocity times 0.72 + 0.40 × energy).
- The jam arc's shape is fixed per style; the seed changes what is played inside it. An arc that varied by seed would make the scorecard compare different shapes.
- The ending resolves in place: when the last bar of the last pass is not home, the whole bar becomes the tonic in the style's color, struck on the downbeat, and rings through a tail whose length the style sets. A written `Outro` is played as written instead. **(reading of the brief: "a turnaround that resolves instead of cycling")**
- A plan has a count-in bar by default (sticks on each beat), so pickups and pushes into bar 1 have somewhere to live. `render --no-count-in` omits it.
- MIDI export: sections are markers and chord symbols are text events on the conductor track. Logic's handling of both is a gate 1 question.

## 2026-11-14: drum seat

- A drum groove is a stack of layers, each one decision (which kick, which cymbal, whether to ghost) with weighted options and a hold span. Answer bars and phrase-position comping are layers with a condition on the bar's place in the phrase, so they need no new machinery when funk and jazz arrive.
- Blues fills are whole written shapes, kick included, with separate lists for a phrase end, a section end, and a top. The old band flipped a coin per kick stroke under its longer fills (DR-88). **(departure from the old band)**
- At high energy the blues chooses hat or ride once per pass, equal weights. The old band reached the ride only on a written repeat of a section, so a looping 12-bar never did (DR-45, DR-109). **(departure from the old band)**
- Two fills of the same length in a row are never the same shape when three or more exist.
- The open-hat breath is not played while riding: it is a turn for a hand that is on the hat.
- Bars that are not 4/4 are built from the tier's own 4/4 bar, one beat per pulse by role, with no separate per-style cells. Less data to write per style; only 4/4 is idiomatic for now (DR-10, DR-93).
- The one-bar build into a bigger section never crosses a tier line. Otherwise the groove changes for a single bar before the fill, which the old band's own rule against mid-phrase groove changes argues against (CO-08, CO-10). **(departure from the old band)**
- "Is the next section bigger" is asked of the sections' own energies before the build (X-A-33).
- The final chord of an ending is the last chord written in the bar; a rest written after it is kept and nothing rings into it (EN-40).
- Choices held per bar are keyed by the bar's place in the form, not its position in the plan, so a take with a count-in and one without are the same music.
- The count-in plays even when the drum seat is left out: the count belongs to the band.
- The lint rule against `../../` imports is gone; it also rejected imports inside the engine. The compiler's `rootDir` check already stops an import from leaving the package (verified with a probe).

## 2026-11-14: bass seat

- A bass line is a tone sequence (R 3 4 5 6 b7 8, fitted to each chord, with variants chosen by conditions on the chord) laid over a rhythm figure. The blues box, a two-feel, an eighth-note pump and a riff are all that shape; a walking line will need one more way to produce tones, and a kick-following riff will read the drummer's notes the seat already receives.
- The bass decides every arrival's pitch first, in order, then writes the notes between, so a lead-in always resolves into the note actually played (BA-05). The previous note is carried forward as a bassist carries it; every random draw is still keyed by position.
- Lead-in kinds are weighted by how the root is about to move (down a fifth, up a fifth, by step, by third), as style data. The brief asks for this; the old band's bass knew a chord's function only through its scale (BA-82). **(new)**
- Blues lead-in rates above the quiet tier (0.3 inside a section at mid, 0.5 at high; more into a section top; always into the ending) are chosen here. The notes give only the quiet tier's 0.35. A gate 1 listening question.
- Lead-ins are drawn per pass, so each chorus has its own; the rhythm figure is what the section keeps.
- No lead-in is reached by a leap of more than an octave, and a leap of more than an octave onto an arrival is bridged by a lead-in. Generalises the old band's rule for the ending (EN-28, EN-29).
- The "fifth" kind of lead-in is always a perfect fifth of the target; a diminished chord's own flat fifth made a tritone approach.
- When the two-feel's held fifth is the next chord's root, it is traded for the third (or split by an approach), so the arrival is never heard a beat early (BA-34, extended).
- The blues register is carried over as the old band had it (roots E1 to A2, home between C2 and E2, 30% pull). In A and E this lets the box climb to G3. Kept for now because it is what was approved by ear; it is one line of data and a gate 1 listening question.
- The ending's hit is where the final chord first sounds in the bar, not where it is last written.
- Not built yet: kick lock (BA-13), the jazz floor rule (BA-26), button and hits endings for drums. They arrive with the styles that need them.

## 2026-11-14: chart format, after an independent review

A second agent reviewed the parser against the spec and found the corpus had gaps. The spec is amended where these go beyond it.

- A line in the header that is neither `name: value` nor chords is one error on that line and the header continues. Before, `tempo 120` (no colon) was read as a bar and the whole chart went silent.
- Bars before the first section label form an unlabeled section. The implicit label `A` is only for a chart with no labels at all. Before, a typed `[A]` after unlabeled bars was discarded as a duplicate.
- Spelling: a chromatic degree is spelled by letter unless that needs a double accidental or gives Cb, Fb, E# or B# outside the key's own scale, in which case it takes the plain enharmonic. Reading a name back into a degree is the inverse, so transposing through text and back returns the original. A section key moved by transposition takes the conventional spelling (Db, not C#).
- An empty stretch between spaced bar lines still makes no bar, but now warns. `||` stays silent.
- `%` after a repeat repeats the bar played last, not the bar written last.
- Only intro sections before the first body section are the intro; a later one is part of the body.
- A misplaced `xN` occupies no bar.
- `//` directly after a bar line is a comment (the spec said whitespace was required).
- The alternate spellings for sevenths and ninths apply to elevenths and thirteenths.
- With no `key:`, a first chord with a minor third makes the fallback key minor.
- A hold at the top of a looped form is struck when the bar played before it ends on another chord. The planner does this, since only it knows played order.

## 2026-11-14: goldens

- First golden takes written: a two-minute blues jam (the whole arc and the ending) and a song-mode take with an intro, mid-bar changes, and a written ending.

## 2026-11-14: a level the player sets

- `energy` is a plan option (CLI `--energy`): a fixed level in place of the arc, held on every pass, with the form breathing around it at half depth (CO-05, CO-06). Added at gate 1 so each tier of a style can be auditioned alone; the app will need it anyway.

## 2026-11-14: after the rhythm section review

- A written ending (Outro, Tag) is played as written even when its last chord is not home (EN-05). The planner had been resolving it to the tonic, against the decision above; a property now pins it. Goldens unchanged.
- A lead-in answers to the scale of the chord being left, with the half step onto the landing note as the one exception (X-A-26). The fifth of the chord coming is no longer played where it clashes.
- A last bar that is all rest is silence for every seat, with no final hit and no set-up fill before it. The chart wrote the silence; the band does not move the ending back a bar to make one.
- Loudness is squeezed above 120 (a quarter of the excess is kept) in place of a hard ceiling, so accents survive at full energy. A knee at 110 was tried first and halved the backbeat's swell across a jam's arc; at 120 the swell is unchanged.
- `PlanBar.stretch` is what a choice held "per pass" is held for: the time through a section, or 16 bars on a short vamp. The drummer's hat-or-ride choice no longer flips every 4-bar lap.
- On a one-section form a new pass alone is not a "top": the biggest fill is kept for a step up in tier. Otherwise the top fill was the only fill a blues turnaround ever got.
- Goldens and the scorecard baseline accepted after these five fixes (the fills at chorus ends changed, the squeeze changed the loudest strokes, a few lead-ins changed).

## 2026-11-14: gate 1 feedback, loudness

- Written levels are played at 61% to 95% across the energy range, 15% under the old band's 72% to 112% (X-B-16). The old curve was set against the old band's own sampler and slammed through Logic's instruments; Brandon chose the trim by ear from three settings. The squeeze above 120 added earlier the same day is gone: nothing written reaches the top of the range now, so there is nothing to squeeze. When the app's own sounds arrive (stage 4), their velocity curves are set against these levels, not the other way round.
- The blues high-tier hat is played at its working level, not accented on every beat: at the old band's level it equalled the backbeat.
- Three measures keep it there: `band.backbeat-level`, `band.notes-near-the-top`, `drums.cymbal-under-backbeat`.
- `scripts/gate-1.sh` renders without chords and solo, so gate 1 stays the rhythm section alone as seats are added.
