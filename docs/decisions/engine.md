# Decisions: the engine and the chart format

The engine's shape and rules, the chart format, the plan, takes and the arrangement, goldens, and the built-in library of charts.

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

## 2026-11-14: goldens, the suite, and the random streams

- The golden take with a solo changed for the three reasons above (the soloist's fixes, the band's arc, the piano around the soloist). The two goldens without a soloist did not change, and a digest of 224 takes without a soloist was identical before and after all of it.
- Forking a random stream now costs its own labels, not the whole path from the seed: the hash is carried part-way and the generator is set up only when a number is drawn. Output is identical (the digest and the goldens); rendering is about 9% faster.
- The suite was at the edge of its 10 seconds on one core. The properties were split by seat into three files, which node runs side by side, and each file renders only the takes it reads.

## 2026-11-14: stage 4 begins (the groundwork)

Brandon passed gate 3 and answered the open questions one by one (`PLAN.md`); he said go ahead with stage 4.

- **A short vamp is played in choruses of several laps.** On a jam whose form is one section of fewer than eight bars, a pass is now a chorus: one section of 2, 4, 8 or 16 laps, the fewest (doubling) that make twelve bars. A lap of one or two bars is phrased in fours; a longer lap is phrased as written. Everything that hangs on a pass or a section (the arc, the fills, a solo's choruses, held choices, the piano's and the bass's phrases) then works with no special case, and the three special cases the planner had for vamps are gone (`FillMark.half`, `PlanBar.stretch`, the 8- and 16-bar fill lines). It is the planner fix the soloist's review asked for. `passes` on a vamp now counts choruses, not laps. Property first: "a short vamp is played in choruses of several laps". No library chart was a vamp, so no golden moved.
- **The head is an offset in the arc** (`ArcStyle.head`): added to the first time through the form of a jam that goes round more than once. Zero for the blues (no change). The jazz notes ask for a rhythm section that "reads the form": the head in two on the hat, the blowing in four on the ride (ST-jazz-09, ST-jazz-50). Here that is not a condition any player tests. The head is played a tier lower, and the change of part at a tier line is what a listener hears as the band opening up, which is what the tiers are for (X-A-07). A bridge whose own level is higher reaches the working tier and walks, as the notes want. Not built: the head out played light again (the last pass is the jam's lift into its ending), and a level the player sets still holds on every pass.
- **Three solo choruses and one of rest stays in the engine.** The soloist's review listed it as a blues assumption; the notes list it as the same in every style (X-C-39), so it is not style data.
- **Funk's chord seat is an electric guitar**, as the milestone asks; the notes' default was a clavinet (ST-funk-44). The clavinet book is cheap data for later.
- **Styles being written are not in `STYLES`.** `UNFINISHED` holds funk and jazz, which begin as the blues seats under their own feel, arc and ending; the CLI can render and score them, and `ENSEMBLE_STYLES=funk,jazz node --test test/` holds them to every property before they join. A property that is one style's own is marked `only("blues")`.
- **A button ending strikes the final chord twice** (held, then the short hit on the last "and"). The engine already played it in every seat; two properties said "struck once" and now say what a button is.
- "A chart with mistakes in it still plays" renders one pass, not two: the corpus is mostly charts of a bar or two, which are vamps, and a pass of a vamp is now sixteen bars.

## 2026-11-14: a library for three styles

- Thirteen charts: seven jazz (rhythm changes, a major and a minor two-five-one, a 32-bar form of falling fifths, a modal AABA, a ballad at 66, a waltz) and six funk (vamps of one, two and four bars, a verse-chorus-bridge, a minor 16-bar form, one with an intro and a written ending). The progressions are common property; none is a named tune.
- **Each style is held to its own charts in full and to every other chart in one take.** A chart belongs to the style it is named for (`blues-`, `jazz-`, `funk-`). Every kind of take on every seed runs on a style's own charts; every other chart gets one take (a kind and a seed by turns) and one soloist take, because any band can be handed any tune. Properties that render for themselves use the style's own charts. This is what keeps three styles inside ten seconds.
- **The new charts found a soloist bug in the blues at once**: a remembered idea refitted into the last phrase could supply the take's last note and bypass the rule that it is the root, third or fifth (a flat 7th under the alto on the modal chart). Where the tune ends, the rule now wins over the idea. No golden moved and the scorecard did not move.
- "The bass keeps its line" compared phrase openings; a phrase that opens partway through a stay on a chord is the second bar of the two-bar shape, not its top (BA-97), and is no longer compared.

## a take, as it is kept (stage 6, part 3)

Done on the main thread before the takes screen was built, because it decides what "exactly as heard" means.

- **A jam told to finish partway is two takes joined, and the engine does the joining.** Finish is heard at the top of a phrase; up to there the band played the jam as it was going to be, and from there the jam told to finish. Replaying the told jam from its start is not the same music: on rhythm changes, told in the third phrase of the last pass, about 360 notes before the join differ. So a take can say when the band was told (`TakeOptions.toldAt`, a tick, beside `endAfter`), and `render` makes both takes and joins them 30 ms before that bar line. The play screen now asks for this joined take when Finish is pressed, which is the same thing it used to assemble itself, and the take it keeps is the one it played.
- **The saved take is the CLI's**: `TakeRecipe` (chart text, style, options, seed) moved from the CLI into the engine, so `ensemble replay` reads what the app keeps.
- **An open jam stopped dead is, as a take, the passes it got to**, with no ending, because none was played. Played again it is an open jam again, and goes on until stopped.
- **The play screen runs on the take** (`play/jam.ts`: a `Call` is a chart, a style and how to play it; with a seed it is one take, without one each press of play is a new take). The worker also writes a take as a MIDI file (`midiOf`), with the same call the CLI makes.
- **No new property.** The join is a filter over two takes the existing properties already hold to account, and smoke journey 5 will compare the app's file with the CLI's. An ending now costs two renders: 0.6 s for a fifteen-minute jam on this machine, which the page allows for when it picks the phrase to turn at.
- **A limit, not solved**: a kept take is exact for the build that made it. When a style or a player changes, an old seed plays something else.

## the arrangement block, read and played (stage 6, part 4)

The engine half of the arrangement grid, done on the main thread: `docs/CHART_FORMAT.md` section 11 is the design.

- **The text is turned on its side from the provisional sketch**: one line for each section the song plays (label, energy, drums, bass, chords, solo), not sections across the page. Sideways it grows with the song, in an editor whose lines do not wrap, and a label such as `Verse 2` cannot sit in a row of labels split on spaces. Values are read from the right, so a label may have spaces. The grid in the app still shows sections as columns.
- **Levels 1 to 4 are 0.3, 0.5, 0.62 and 0.8** (`LEVEL_ENERGY`): the band's low playing, its ordinary playing at two strengths, its high playing. They sit where the styles' own section levels do (a break, a verse, a bridge, a chorus). The numbers are the engine's, beside the tier lines they are read against, not a style's.
- **A block that does not match the song is not used at all**, with a warning on the first line that does not fit. Using the lines that happen to match would play a different arrangement from the one written without saying so. `arrangedLines` lines a block up with the song again (the second `Chorus` line goes to the second time a chorus is played; a section the block does not know is plain), and `withArrangement` writes it back: that is what the grid will call.
- **A block with a mistake in it prints as typed.** The mistaken value plays as `-`, but formatting must not turn what the player typed into what the parser guessed.
- **Song mode only.** A jam's shape is the band's to plan; a line for each section played has no meaning when the form goes round an unknown number of times.
- **The soloist**: the block says where it has the lead, and the play screen's switch says whether there is a soloist at all. Each section it leads is a chorus of its solo, as sections labelled `Solo` already were. A seat the player switched off stays off whatever the block says.
- **A player's own level is held**: the one-bar build into a bigger section lifts the section's energy, not a level written for one player.
- **The corpus** has seven rows for section 11 in place of the provisional one, and the `---` note now says what an arrangement block starts with.
- **One property**: "a song is played as it is arranged" (`test/band.test.ts`), with the levels called against the section names (an intro at 4, a chorus at 1) so the style's own levels cannot pass it by coincidence. Seen to fail with the lay-out ignored and with the levels ignored. It renders one short song per seed and the suite is still 9.1 to 9.2 s of 10. Goldens and scorecards have not moved.

## the library: pruned, renamed, and given standards (stage 6)

An Opus build from `prompts/library-standards.md`, in its own clone. **The earlier "The progressions are common property; none is a named tune" is overturned by Brandon's word** (2026-11-16: "i'd also like to add back some common standards that also serve as useful tests for the band"). What still holds is `docs/BRIEF.md`: the charts hold chord changes and form only, no melodies, no lyrics.

**The rule.** A built-in chart earns its place by its changes or its form; key, tempo, style and names-or-numerals are settings in the app.

- **Cut** (six): `blues-numerals-bb`, `blues-quick-change-e`, `blues-slow-g`, `jazz-falling-fifths-gm`, `jazz-modal-dm`, `jazz-ballad-eb`. The library goes from 51 charts to 45, then 57 with the standards.
- **The numerals chart's coverage is kept as a corpus row** (`test/corpus.ts`, transposition): it was the only whole chart in numerals that went through all twelve keys and home. The engine's properties lose a numeral chart to play; numerals are read into the same chords before anything plans, so no property was about them.
- **No key in any title; file names unchanged.** One title says more than its key did: "Shuffle in D with Intro and Tag" is "Quick-Change Shuffle with Intro and Tag", since with the quick-change charts gone it is the library's quick-change twelve. "Riff in D" is "Rock Riff" (the brief's).
- **Left for Brandon, not cut** (each differs from a neighbour only by key and a chord's colour, which is the style's voicing): the four one-bar i-to-IV vamps (`disco-minor-vamp-am` Am7 D9, `funk-two-chord-dm` Dm7 G9, `neosoul-two-chord-ebm` Ebm9 Ab9, `reggae-two-chord-am` Am D); the two I-IV vamps of two bars a chord (`disco-major-groove-d`, `reggae-one-four-g`); the two one-chord vamps (`funk-one-chord-e` E9, `reggae-one-chord-dub-cm` Cm: a dominant against a minor). `disco-falling-fifths-em` is the first eight bars of Autumn Leaves in E minor.
- **The gate scripts** name what stands in for a cut chart: the slow blues in G is `blues-12-bar-a` at `--key G --tempo 66`, the quick-change in E is `blues-intro-outro-d` at `--key E --tempo 108` (it brings its intro and tag), the falling fifths, modal and ballad jazz takes are Autumn Leaves, So What and Body and Soul. Gate 5's audio page takes no key or tempo, so its two blues stand-ins are `blues-minor-am` and `blues-intro-outro-d`. A gate run again does not make the files Brandon heard; those gates are past.

**The standards** (`library/standard-*.chart`, `style: jazz`): twelve, not the brief's fourteen. **All Blues and Footprints were left out on Brandon's word** (playing in six is to be designed as its own piece of work, and the two tunes written then). Each is in the key it is most often called in, at a tempo inside the jazz style's 60 to 240, with the plainer common changes; Body and Soul, Summertime, Have You Met Miss Jones and There Will Never Be Another You were corrected bar by bar on the engineer's reading before anything was measured.

- **Named `standard-`, not `jazz-`**, so that they are not the jazz style's own charts in `test/takes.ts` (every kind, every seed: fourteen long charts more than the push could hold).
- **What the meter work should know** (found before the two six-tunes were dropped): only 4/4 is written for. In any other meter the drums build the bar from the 4/4 groove's beats by pulse role (DR-10: 6/4 comes out down, back, strong, back, strong, last), the bass plays plainly, a note a pulse (BA-16), and the comping falls back to the pad (CH-54); 6/8 and 12/8 are dotted pulses, two or four to the bar, played like a slow shuffle. Most of the band's properties are held only on 4/4 charts. The library's 3/4 charts are this fallback too.

**How the standards are tested** (`test/takes.ts`):

- **On a push the jazz band plays each standard twice**: once as the band and a three-chorus solo (the soloist kind), on one of the two seeds by turns, and once in one of the other four kinds by turns. Twice, not once: with three jazz charts cut, one take each left the piano's "a section keeps its figure" under its floor (246 phrase openings of 333). The other styles are handed the standards with the rest of the library, a dozen charts each, as before.
- **On the full run the jazz band plays each standard in every kind on three of the six seeds** (odd or even by turns; every seed put the jazz process at 33 s of the 60 alone), and **every style is handed every chart written for another style**, once each, instead of a dozen. That is the brief's every-style-on-every-chart run made standing; it was needed anyway, because the blues lost three of its eight charts and the full run's floors (the bass's and the piano's phrase openings, the takes the listening piano is compared on) then fell short with a dozen: 230 of 250, 954 of 1000, 21 of 24. Twenty-four borrowed was still short; every chart passes them. No floor was lowered.
- **Five standards are held out of one check**: the twelve-key round trip in `test/chart.test.ts` (`NOT_THROUGH_EVERY_KEY`, marked there). See "left for the engineer".

**Timings** (run alone, though another builder's headless Chrome shared the machine; the baseline, the commit before this branch, measured beside it): `pnpm check` 16.0 and 16.2 s of 20 (the commit before this branch: 15.3 at the start, 16.2 beside it at the end; with contention both ran 17 to 20 s, side by side within a second of each other, and the branch used less CPU: 108 s of user time against 111). `pnpm test:full` 45.2 s of 60 (47.4 in an earlier run; the commit before, 44.2 beside it). `pnpm score` 55.7 s of 120. `pnpm smoke` 11.3 s of 60 against the built app.

**Scorecards** (`pnpm score`, 200 seeds over each style's own charts): funk, rock, disco, neo-soul, reggae and acoustic do not move (their charts did not change). **Blues** (200 takes over 5 charts, was 8) and **jazz** (200 takes over 16 charts, was 7) moved because their charts did, and their baselines are accepted anew (`score --style blues --update`, `--style jazz --update`). The headlines, before and after (mean; share of takes in target):

- Blues: `bass.sixths-on-dominants` 19% to 18%, in target 75% to 62%; `bass.walks-inside-lines` in target 94% to 85%; `chords.strikes-per-bar-loud` 5.46 to 4.92, in target 99% to 95%; `chords.on-the-soloists-note` in target 88% to 78%; `solo.thirds-and-sevenths-on-changes` 74% to 76%, in target 98% to 91%; `solo.breath` 1.05 to 0.83; `solo.leaps-resolved` (reported only) 90% to 83%. Everything else within a few points.
- Jazz: **`chords.voicing-faults` 0% to 2%, in target 100% to 71%**: almost all of it Take the "A" Train (worst takes 13%, 10%, 10%), where Dm7 after two bars of D7b5 is voiced E F A C, the ninth a half step under the third at the bottom of the hand (157 of 256 Dm7 strikes over six seeds of four passes); `drums.phrase-end-shot` in target 41% to 58%; `bass.run-length` in target 99% to 93% (the worst three takes are Body and Soul, two chords a bar at 66); `chords.breaths-over-the-line` 1.11 to 1.04, in target 90% to 78% (the worst are Night and Day, Autumn Leaves, Take the "A" Train); `chords.overlap-over-chance` in target 92% to 87%; `solo.notes-per-second-first` 1.38 to 1.54 and `-last` 2.77 to 3.04 (Giant Steps and Cherokee at 240); `solo.leaps-resolved` (reported only) 83% to 71%; `solo.builds` in target 87% to 98%.

**Left for the engineer**

- **Jazz, the walk into a change, Body and Soul's bridge** (`test/bass.test.ts`, "once the band has opened up the bass walks", held out of the approach check only, marked there). Bar 2 of the bridge ends Gm7 C7 a beat each and bar 3 is F#m7: the root of C7 on beat 4 and the root of F#m7 on the next beat are a tritone apart (C2 to F#2 or F#1, 36 to 42 or 30), so "a chord gets its root where it lands" and "into a change by a half step, a whole step, a fourth or a fifth" cannot both hold. Every kind and seed meets it, twice to four times a take (bars 19, 51, 83, 115 of a jam). The rule needs a word on a one-beat chord: an engineer's call.
- **Found on the every-style run and not in the committed material**, so not held out: reggae on Night and Day, seeds 3 and 5 in every kind (43 cases): "a lead-in resolves by step in actual pitch". Over Cmaj7 the riff's fifth G2 sits on the "and" of 4 and the next bar is Abmaj7, whose root reggae's register puts at Ab1 (roots no higher than E2, ST-reggae-15): G is a half step from Ab by name and 11 semitones from where the bass lands. Not a lead-in but the riff's own tone; fixing it is a rule about where a figure's tone goes before a change, in the shared bass engine. And neo-soul on Cherokee at 240, seed 4, the band and a three-chorus solo: 3.0 bars of silence inside a solo. The app would never play it there: a chart handed to a style it is not written for plays at that style's usual tempo (`tempoFor`; neo-soul's is 70 to 100), while `test/takes.ts` plays a borrowed chart at its written tempo. Whether the test material should play borrowed charts as the app does is a decision about the material.
- **A chord spelt by its less usual name does not come home through every key.** F#m7 in A-flat (All the Things You Are's bridge), the same F#m7 in D-flat (Body and Soul's bridge), C#m7 F#7 in B-flat (Cherokee's bridge), F#dim7 passing up from F (Have You Met Miss Jones), Bb7 in B (Giant Steps). In some key the name is also what the usual degree spells (#VI and bVII are both B in D-flat; #I and bII are both D there), and `degreeOf` reads it as the usual one, so the text read back comes home as Gbm7, Dbm7 Gb7, Gbdim7, A#7 and D#maj7. The parsed chart is right and plays right; only the text through a far key loses the spelling. Changing which degree a name is read as changes how numerals show (A in D-flat as bVI, by the format's own rule) and is a decision about the format, not a fix: the five are held out of that check and nothing else.

## the library's standards: checked and merged (stage 6)

An Opus build from `prompts/library-standards.md`. On the main thread: all twelve standards read bar by bar; the test changes read; `pnpm check` 16.0 s of 20, `pnpm test:full` 44.9 s of 60; no golden and nothing under `packages/` in the diff.

- **Four standards were corrected before the builder finished**, from the changes as they are commonly played: Body and Soul (bars 5 and 6 of the A sections are `Ebm7 . Cm7b5 F7 | Bbm7 Eb7`; the bridge is four bars in D, then two-fives to C, and falls C7, B7, Bb7 home), Summertime (the tonic arrives in bar 15; bar 12 is D7), Have You Met Miss Jones (one chord a bar in bars 5 to 8, each A ending its own way), There Will Never Be Another You (the Am7b5 D7 in the last eight). The other eight stand as written.
- **The walking bass's property is restated, not held off one chart**: where the note before is itself a root on a change (chords a beat apart), the root wins and the step into the next change is not asked for. The builder had held Body and Soul out by name; the rule is general, and the full run passes with the chart in.
- **Left, each a decision or a piece of work of its own**:
  - *Five standards do not come home through every key as text* (`NOT_THROUGH_EVERY_KEY` in `test/chart.test.ts`): a chromatic chord written by its less usual name is read back by the usual degree in a far key. The chart plays right; only text sent through a far key and back is respelt. A format decision (which degree a name is read as).
  - *Jazz voices Dm7 as E F A C after D7b5* (Take the "A" Train: the ninth a half step under the third at the bottom of the hand; `chords.voicing-faults` in target 100% to 71%, accepted in the baseline so the fault is on the scorecard). A property first, then the voicing.
  - *Reggae's bass on Night and Day* (a riff's fifth a half step by name and eleven semitones by pitch from the next root) and *neo-soul's soloist on Cherokee at 240* (three bars of silence): found only by the strongest probe (every kind, six seeds). The second is a tempo the app never plays a borrowed chart at (`tempoFor`); whether the tests should borrow a chart at the borrowing style's tempo, as the app does, is open.
  - *Pairs that differ only by key and colour* (the four one-bar i to IV vamps; the two I to IV vamps; `disco-falling-fifths-em` against Autumn Leaves): Brandon's to cut or keep.
- All Blues and Footprints are not in the library: they wait for the band in six.

## four vamps cut; a borrowed chart is tested at the borrower's tempo; tempo will count the pulse (stage 6)

Brandon, 2026-11-16: "near duplicate vamps can probably be cleaned up / falling fifths still sounds like a fun exercise; we can keep that".

- **Cut**: `disco-minor-vamp-am`, `neosoul-two-chord-ebm`, `reggae-two-chord-am` (the same one-bar minor one to dominant four as `funk-two-chord-dm`, which stays: it is funk's vamp before it is anyone's) and `disco-major-groove-d` (the same one and four, two bars each, as `reggae-one-four-g`, which stays). `disco-falling-fifths-em` stays on his word. The two one-chord vamps stay: one is a dominant, one is minor. 53 charts.
- **The tests play a chart written for another style at the borrowing style's usual tempo** (`test/takes.ts`), as the app does (`tempoFor`). Cutting the vamps moved which charts each style is handed, and neo-soul met Cherokee at 240, where its soloist leaves three bars of silence: a tempo the app never plays it at.
- **Each style is handed twenty borrowed charts on a push, not twelve**: with four of its own charts disco had ten three-chorus solos where the property asks for more than ten, and blues's phrase openings fell short by the same shift. The library's size should not be set by a test's floor. `pnpm check` 16.4 s of 20; `pnpm test:full` 43.3 s of 60; `pnpm score` 57.2 s of 120, disco, neo-soul and reggae re-accepted (each lost a chart), the rest unmoved.
- **Tempo counts the felt pulse.** He asked "what's the 'right' way that pro musicians would think of it? should we aim for the pulse?". It is: a slow blues in 12/8 is called at 60, the dotted quarter, by a chart, a metronome mark and a bandleader's count alike; only sequencers count quarter notes regardless. No library chart is in a compound meter yet, so it costs nothing to change now. The builder of the band in six and twelve has been told to build it (the format's specification, the engine, the styles' limits, the app's tempo control, exported MIDI converted to quarter notes). This overturns the previous version's AU-91.

## the tempo breathes, as an option (2026-11-21, #2239)

Built to `prompts/tempo-breathes.md` and its amendment. Brandon, 2026-11-21, on whether it is on by default: "i could see this both ways. i'd like this to be an option for exactly the reason you specified - it'll probably feel cool to play along with, but there's also value in keeping the tempo truly locked for practice".

- **An option, `breathe`, off unless asked for.** `PlanOptions.breathe` (a take's options carry it, as `soloFromTop`): absent, every bar is at the tempo set and every take is byte for byte what it was (no golden, no scorecard and no MIDI file moved). The CLI's `--breathe`, `render:audio`'s `breathe=1`, a saved take and `replay` carry it. The app's choice is in More, "Tempo: Steady / Breathes", **Steady until he has heard it**; the settings keep one boolean, `breathe`, read as `stored.breathe === true`, so settings kept before it load steady. This is what HI-02 and EAR-01 ask (time rock-steady by default, anything expressive in time opt-in); CO-11 holds for every take that does not ask.
- **The concept, once in the engine**: each `PlanBar` has its own `quarters` (quarter notes a minute); `Plan.tempo` and `Plan.quarters` stay the tempo as set, which the app shows. `plan/tempo.ts` walks them; `perform/time.ts` keeps the tempo map (`secondsAt`, `tickAt`, `secondsFor`, `quartersAt`), and everything that turns ticks into seconds reads it: `timedNotes` and `asStruck` (a slur's jump), the MIDI export, `seconds(plan)`, the join of a jam told to finish, the CLI's length and `read` (a bar's own tempo where it is off the tempo set), the app's playhead and turn for home (`tickAt` in `placeAt` and `turnForHome`), its lamps and its jam length (`secondsAt`, `seconds`). The audio package is given seconds and knows nothing more.
- **What stays at the tempo set, on purpose**: the players (the lean, humanize and strum in milliseconds, the soloist's breath, lungs, double time and every choice by tempo are made at the tempo set, so asking to breathe moves no note, only its seconds), the critic (it reads the soloist's own seconds and scores steady takes), `countPasses` (minutes to passes, a loose limit), and `read --timing`'s milliseconds a tick (said to be the tempo set's). The error in each is under the amount, a percent.
- **The curve**: the arc's offset as the jam set out (`arcOffset` × the arc's depth, without the told-to-finish lift), per bar; the band's sense of where it is settles a quarter of the way to it each bar; a bar asks for the style's amount × the rise over that (a rise of 0.1 in energy asks for all of it, clamped either way), and the tempo walks toward what is asked by no more than the step. Read from the arc, not the bar's energy: a section's level and the one-bar build are not the arc, and the arc steps only at phrase tops, so no single loud bar moves it. From the rise, not the level: an arc is above its first pass for most of a jam, and a tempo that followed the level sat above the tempo set for most of the take; one that follows the rise pushes as the band builds and comes back as it holds.
- **The step: 0.25% of the tempo set a bar** (`TEMPO_STEP`; the brief's ceiling was half a percent). The whole of a percent takes four bars; a style's whole swing either way a phrase or two.
- **The band: the style's amount, never over 2%** (`BREATHE_MOST`, held by `validateStyle`). **The mean: a take lasts within 0.6% of the steady take** (at 120, a mean as played between 119.3 and 120.7), held at the most any style may breathe; the worst seen on the library is 0.37% shorter at 1% and 0.55% at 2%. A breathing take ends a little shorter: the arc rises more than it falls.
- **Anchored**: the first bar and the count-in at the tempo set exactly; a song and a level the player holds have no arc and keep the tempo set in every bar (so the app's choice is off for a song, and says so).
- **Local**: a bar's tempo is from the arc of the bars up to it. A jam told to finish keeps the arc as it set out for its tempo (the told lift changes how loud, not how fast), because the band may be told at any phrase top of the pass it turns on and that pass's time is already being played; an open jam made longer leaves every bar's tempo, the look-ahead's included, as it was.
- **The amounts.** Jazz and the blues 1%, rock and acoustic 0.75%: the notes are silent on tempo moving with energy except to forbid it by default (CO-11, HI-02), so these are judgement, kept small because his first worry was a moving reference (EAR-01); jazz's head is a tier under the blowing (ST-jazz-50) and its open-up is the arc's biggest rise; acoustic is "honest time, human and never sloppy" (ST-acoustic-03), so under jazz's. **Nought**: disco ("energy changes how hard the band digs in, never the pulse", its section's first line), funk (one riff locked to the kick, ST-funk-15; its push is the pocket against a drummer who keeps time, ST-funk-03), reggae (the hat stays on the grid as the reference, AU-74; its arc is at half depth), neo-soul (a two-bar loop like a sampled break, ST-neosoul-08: a machine's pulse; the brief thought it likely, the notes say loop).
- **A ballad breathes the same share as an up tune**: a change of tempo is heard as a share of it, so the same share is the same push at any speed; the limits below take care of the ends.
- **Near a style's limits** the amount is the smaller of the style's and the room both ways to the style's range in the chart's meter (`breatheAmount`): at a limit or past one, a set tempo stays steady; the band neither pushes past its top nor sags under its floor, and stays symmetric so the mean holds.
- **The MIDI file** writes a tempo event wherever a bar changes it; a bar off the tempo set is held to a whole microsecond a quarter note (`barQuarters`), so the file's tempo map is exactly the plan's. A bar at the tempo set is that number exactly, so a steady take writes its one tempo event as before.
- **A pitch curve across a change of tempo inside one note** is timed at its first bar's tempo (a difference of a quarter of a percent at most, over the part of the note past the bar line).
- **No scorecard measure.** The scorecards score the steady band and carry no option; a breathing measure would add runs for nothing they check. The properties hold the tempo instead.
- **Properties** (`test/band.test.ts`, "the tempo, breathing", and the open-jam and told-to-finish properties with the option on for half the charts), each failed first by a fault planted and removed: no step limit, no cap on the amount, the first bar not anchored, a band that never settles (the mean), the told lift read for the tempo, the arc read a pass ahead, a tempo that differs between two plans of the same take, a tempo event on every bar in a style at nought, the tempo map a tick late, a bar not held to a microsecond, steady takes breathing, a held level breathing.
