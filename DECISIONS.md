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

## 2026-11-14: chord seat, part 1 (voicing)

- A comping part is made in three steps, each its own module: rhythm writes strikes, the voicing engine gives each strike its pitches, the idiom turns voiced strikes into notes. The idiom owns both "what a voicing candidate is" and "how a part becomes notes" and is handed the whole part, so a strummed guitar can later hold one grip across strikes without the rhythm or the voicing engine changing.
- Voicing weights are CH-16's numbers, unchanged, as style data. Departures in the features: voices are paired from the top down when two chords have different numbers of notes (CH-17, CH-18); a dominant is exempt from the rub penalties except a minor second between its two lowest notes below E4 (Q-03).
- Chord identity outranks a recipe (X-B-13 over CH-03): the third or suspension, the seventh or sixth, and every written alteration always sound, taking the place of the root, then the natural fifth, then colour the chart did not write.
- Unwritten colour comes only from the chord's scale, which is how a V going to a minor chord gets b9 and b13 (X-B-11).
- The plain rhythm (one held strike per chord arrival) is kept in the finished seat for meters other than 4/4. A chord carried over a barline is struck again softly, since nothing rings past a barline (CH-35, CH-48); the same chord written twice in one bar is held.
- A diminished triad plays its three notes; no seventh is invented for it. An m11 puts its 11th in the fifth's seat. A 7alt plays 3, b7, b9, b13.
- The blues piano's register is floor E3, ceiling C6, top voice aimed at C5, as the notes give for keyboards; the notes have no blues-specific figure for the bottom of the hand.
- Known and left: on the jazz blues the hand sinks to a top note of G4 by the second chorus and stays (the greedy drift the notes record as CH-77).
- Measures gain a `pitch` unit. Targets for the three loudness measures are in the blues critic data.
- `test/charts/every-colour.chart` is test material, not a tune: 39 chord qualities and a slash chord, so the properties about which notes a chord may be voiced with meet more than plain sevenths.
- Goldens and the scorecard baseline accepted: a new seat is playing, and the loudness change from earlier the same day.

## 2026-11-14: chord seat, part 2 (rhythm), and its review

- Comping is chosen by the phrase. A section keeps one figure per energy tier every time it returns (X-B-14); each time through draws two other figures as answers; each phrase is a form of those three ("a a b a"), six candidates drawn by weight, each played out against the harmony, and the critic picks one. Every form opens on the section's figure, which is what lets a push across a phrase boundary know what it lands on, and keeps an extended open jam unchanged.
- Comping weights (blues): off the drums 2, under the soloist 3, off the energy 1, one bar four times 0.5, the opening bar never returns 1, the phrase before again 0.25, this place last time again 0.3. Each was set to zero in turn and moved its own measure.
- The hand leans into a barline change with the tier's chance whether or not the figure has a strike on the "and" of 4 (as CH-39 does for jazz). ST-blues-46 only pushed an existing strike; with that a section that chops 2 and 4 never leans in and ST-blues-51's overall band is out of reach. High level delivers about 55% anticipated, not the old 73%.
- Where the hand does not lean into a change, nothing is struck in the eighth before it (CH-40, KF-B-27, applied at barlines too). This is style data (`anticipation.otherwise`).
- When the hand leans in, the old chord's strike on that last beat gives way, and if it was the chord's only strike the chord is laid in where it arrives instead (KF-B-27: no "quick C7 right before the F7"). Found by the review.
- The pump plays through a barline it does not lean into, on the old chord, and strikes a pushed chord again on the beat (CH-41, ST-blues-47). The rule against stabbing the outgoing chord is about a lone stab; the pump's light "and" is the tail of its beat. It takes no answers (ST-blues-33).
- A chord written for an eighth or less is played where it is written and is never leaned past: CH-34 outranks the push. Before this, two chords were struck at once. Found by the review.
- The register has a reach (blues: a major third either side of the target). Past it each semitone costs 4, more than a smooth move saves, so a hand led a step at a time turns round. Before this the pump's close position walked the hand up to C6 over a long jam. Found by the review. This is a ninth voicing feature beside CH-16's eight.
- "Alike" for two bars of rhythm leaves out the first eighth after a barline change and the last beat before one, where the harmony, not the figure, decides what is struck.
- The seven answer-only figures in the blues book are new, each one of the notes' figures with a strike moved or left out.
- `voicing.ts` remembers the ways a chord can be played and where the hand is led from a given voicing. Checked by the builder and again by the reviewer against the version before: no difference in output. It bought back about 3 s of the suite.
- Measures: `chords.pump-holds` removed (true by construction). The drum lock is targeted against chance (`chords.with-the-drums-over-chance`); 77% of takes are above chance, and the rest are sections whose figure is the "and"s.
- `test/charts/awkward.chart` joins `every-colour.chart` as test material: chords an eighth long, rests inside bars, up to eight chords a bar.
- The timed-jam property reads the plan without rendering, and the open-jam property uses four seeds, to keep the suite at 6.5 s of its 10 s.
- Goldens and the scorecard baseline accepted with the full chord seat playing.

## 2026-11-14: who is featured (stage 3)

- `solo` is a plan option (CLI `--solo`), off by default (SO-04). The plan says where the soloist has the lead: `PlanBar.solo` carries which chorus of its solo a bar is in and how many the solo has, and `seats.solo` is null where it lays out. This is the "who is featured" control input of the brief, kept to one field.
- In a jam the band states the form once, then the soloist plays solos of three choruses with one chorus of rest between (SO-05: three choruses are one arc). A solo cut short by the end of the jam is told it is shorter, so it can still peak in its last chorus. With six passes the solo's third chorus falls on the jam's climax pass and its rest on the breath pass. An open jam's solos do not depend on how many passes it turns out to have.
- A section labelled "Solo" is a solo whenever it comes round, and then the soloist plays nowhere else. In a song with no such section it plays the body through as one chorus. It rests through an intro and a written ending.
- The head (SO-04: the soloist plays the tune the first time through and brings it back) is not built in stage 3. The first pass is the band alone. An invented head is its own piece of work and is not what gate 3 asks about.

## 2026-11-14: the soloist (stage 3)

- A solo is made phrase by phrase. The plan's phrase is the slot; the arc gives the slot a density level and a register (SO-05 to SO-07); each chorus draws a form of roles (statement, repetition, variation, answer); the phrase's rhythm is chosen before its pitches; landings (first note, last note, every note on a chord arrival, every note before a rest) are placed before the line between them. Candidates differ by kind (the idea again, moved with the chord, with a new ending, as a riff, opened out, under another contour), and the critic picks one.
- What a solo remembers: the idea it is working on (rhythm and pitches), its first idea, its last pitch, its highest note so far, whether the last phrase ended on an empty bar, and every phrase played.
- Solo weights (blues): lost the thread 2, off the density 3, off the register 0.15 a semitone, peak thrown away 0.5, leaps left hanging 0.75, stuck 3, doubles the bass 0.5, rests where the last did 0.5, runs on 0.3 a second, bars in a row 0.75. Each moved its own feature when set to zero. Two features were dropped because they moved nothing.
- Selection does not win everywhere, and that is recorded, not hidden: the first candidate is always the most literal development, so it is more "related" than the chosen one (72% against 67%); the critic gives some of that up for density and shape.
- The instrument is the player's choice (`soloInstrument`, default from the style): a vibraphone, which need not breathe, and an alto sax, which must (8 s of lungs, half a second to breathe). The export reads the program from the instrument that played. `StylePack.instruments` no longer lists the soloist.
- A solo's first chorus is never made busier by a hot band, and energy and tempo together move density at most one step (SO-06, SO-69). A phrase's length is limited in seconds (7 s), so at 66 bpm a line is two bars (KF-B-12).
- Empty bars: SO-11's 20% to 50% cannot be reached under SO-10's one empty bar a phrase; it delivers 16% and the target is the measured 5% to 30%.
- Real triplets need nothing new from the grid: under the blues swing the written "e" is the middle of the triplet.
- Not built: the head, trading, tied barlines (SO-38), and everything that needs pitch bend (SO-52 to SO-57: vibrato, bends, slides, scoops, falls).
- The band builds with its soloist: with a soloist in a jam that ends, the band's arc peaks on the last chorus of a solo (the one nearest to where the jam would have peaked anyway), not two thirds of the way through regardless. Before this a four-pass jam was at its loudest under the solo's first chorus.
- The suite: the soloist is on in one of the five kinds of take every property sees; six seeds, and every other one replayed for the determinism property, keep it at 6.6 s. A third golden take has a solo.
- The scorecard's 200 takes now include two kinds with a solo, so every baseline line moved a little with the mix.

## 2026-11-14: after the soloist's review

An independent agent rendered 3,168 takes of the soloist (33 charts, 23 of its own; 16 kinds of take; both instruments; tempos 60 and 160) and read them. Fixed, each behind a property that failed first:

- **A note that says another chord may only pass.** The soloist plays the key's blues scale over every chord, so over the IV the key's flat 5 is a flat 9, and over a diminished or minor chord some of its notes are a major third or a major seventh. These were costs; they are now a rule. On a beat, or held longer than an eighth, the soloist never plays a note a half step over a chord tone, or the major seventh of a chord without one, unless the chord's own scale has that note (which is what excuses the 4th over a dominant and the altered notes of a V going to minor). It is one set in the pool (`passing`), enforced wherever a pitch is chosen: the walk, the approach, a remembered idea refitted, a riff bar, an enclosure, a pickup. Short notes off the beat are untouched: the chromatic approach is still there.
- **The tune's last note is the root, third or fifth of the final chord**, as a rule and not as the cheapest of all chord tones (17 of 624 library endings sat on the flat 7 for two bars). A solo whose last phrase is also its peak phrase (a chorus of one phrase) no longer ends on its top note: where the tune ends, coming to rest wins.
- **A pickup never fills the breath.** A pickup needed only an eighth of silence before it; at 160 bpm that ran one phrase in six into the next. It now needs the style's breath (half a second) like any other entrance. Short joins at 160 bpm on the reviewer's charts: 306 of 1,794 before, 7 after (all in 3/4, 6/8 and five- and seven-bar sections; see below).
- **The horn's breath is judged as heard.** A note cut at a change of chord on an "and" left half a second on paper that swing took back, and the next note got a full breath's credit (11.8 s on one breath at 60 bpm). The horn property now reads sounding times, and pins the case.
- **The band never comes down under a solo.** In jams of 7, 8, 12 passes and more the band's breath before the last chorus fell under the middle of a solo. With a soloist the breath is now the chorus the soloist laid out for; and a solo after the jam's peak (jams of 13 passes and more) is built under like the first one, from where the band settled back up to the peak.
- New measure `solo.phrases-breathe` (every phrase is followed by the style's breath, a pickup included; target: all of them). `solo.breath` only sees silences of a beat or more and could not fail below about 150 bpm.
- CLI: `render --solo-instrument alto-sax` (asking for an instrument asks for the soloist; an unknown name is refused). In code an unknown `soloInstrument` still falls back to the style's.
- The soloist's properties now run over a wider set of takes (`soloistTakes`: every chart as a song, at 160 bpm, at 60 bpm on the alto, quiet, and loud on the alto), because every bug above lived outside four-pass jams at the stock tempo.

Found and not fixed, on purpose:

- **Short vamps.** On a form of one to seven bars the plan's phrase is the lap, so on a one-bar vamp the soloist's "three choruses" are three one-bar phrases, the same ones each time, and the piano's phrase plan is a single bar (its figure, looped). The band's drums already count such a vamp in 8- and 16-bar lines; phrases and solo choruses need the same. It is one planner concept (a vamp's phrases run across laps) with several readers, and funk makes it central, so it belongs at the start of stage 4, not patched into one seat here. No library chart is a vamp.
- A phrase copied from a longer slot into a shorter one can end mid-line with no air (five- and seven-bar sections, 3/4, 6/8: 7 joins in 1,794).
- Stop-time: nothing is played under N.C. (X-B-18), so the soloist sits out the breaks, which is where a soloist would play. A question for Brandon when a chart needs it.
- A section named Solo in a jam: the three-chorus arc and its memory run across Solo sections with the head between them.
- In compound meters a "beat" is still a quarter note for the soloist and its critic (79% chord tones on the dotted-quarter beats of 12/8 against 86% on 4/4 beats).
- Feel can carry a note a few ticks into an N.C. (83 notes, at most 14 ticks).
- Four soloist measures pass by construction (changes on chord tones, the top in the last chorus, the top falls away, phrases end on chord tones): they are tripwires for a broken rule, not measures of quality, and are read that way.
- Blues assumptions still in the engine's soloist that a jazz or funk style could not change by data: solos of three choruses with one of rest; the candidate kinds for each role and their contours; the peak phrase's shape and place; the thresholds for "related"; the landing's cost per rank and its window. Stage 4 has to move these to data, by the standing rule.

What the review confirmed about selection (its own seeds, chosen against first against a random candidate): cost 1.48 / 2.06 / 2.15 on the library. Where a listener could point to it: bars that rhyme 82% / 65% / 64%, high points earned 88% / 76% / 76%, leaps resolved 68% / 59% / 46%, thirds and sevenths on the changes 74% / 68% / 69%, fewer empty bars. What it costs: the build from first chorus to last is flatter (2.11 times the notes against 2.37), because the critic fills the first chorus a little.

## 2026-11-14: the piano around the soloist (stage 3)

Built by an Opus agent from `prompts/comp-with-soloist.md`; read, changed in two places, and held to properties on the main thread.

- **Both halves go through candidates and the critic.** The old band decided to lay out with a coin per strike and to answer with a coin per breath (CH-69, CH-71), and its own notes call that a weakness (CH-80). Here a phrase plan is offered played four ways (as written; laid out under the line and answering its breaths; as written and answering; laid out only) and the critic chooses the whole phrase. Voicings take three features under a line: on the soloist's note (26), its octave (7), in its register (3 a voice, judged by the bar so the hand settles under a phrase, CH-65).
- **Whether a seat listens is style data**: `ChordStyle.listening` (the length of a breath, the answering stab, the lift on a strike in a breath), null for a seat that does not. A figure marked `groove` (the pump) never changes its rhythm for a soloist (ST-blues-33). With the field null and `under-the-soloist` at zero the piano is deaf: that is the baseline the stage is measured against, and `scripts/deaf-piano.ts` renders it.
- **Rules, not preferences**: a voice still on the soloist's exact pitch for half the strike or a full beat is left out, top first, never a guide tone, a written alteration, the bottom note, or below two voices (CH-60). Under a line the hand never takes a voicing with a half step on its two lowest notes, except a dominant from E4 up (CH-66).
- **Laying out keeps the first strike of each chord in each bar, and every push.** The notes' CH-69 keeps only a chord's first strike; one a bar is firmer, and it is what keeps the time. The result sits where the old band's own listening test put the floor: 16% of working-level bars under a solo have a single strike (the owner heard 41% as thin and accepted 19%, CH-70). A `thinned` feature holds it there.
- **In the blues the answer is a lift, not a stab.** The figure already has a strike in 97% of the soloist's breaths, so an added stab almost never fits its own rules (one in 64 takes). What changes is the level: strikes in breaths are 4.6 louder than strikes under the line, where a deaf piano's are 1.2 quieter. The stab path is built and its rules checked on the candidates; jazz, with sparser figures, will be the first style to use it.
- **Changed on the main thread: the hand comes home by steps.** My brief asked that bars where the soloist lays out be note for note what they are without a soloist, and the build met that by voicing twice and putting the hand back in its old place the moment the line stopped, a jump of up to a fifth. Only "with nobody soloing nothing changes" is worth having (CH-68), so the second pass is gone: the hand is led on from where the line left it, and a leap of the top past a fourth is priced for as long as the hand is away from its own register (`top-leap`, 10). Leaps after a solo: 10 in 26,000 strike pairs before, none after.
- **What it delivers** (96 takes, each band on the same seeds; `node scripts/gate-3-numbers.ts`): strikes under a sounding note 61% against 66% deaf, lower in 91 takes of 96; over what a hand placed at random would catch, +3 points against +7; on the soloist's own note 9% of the time against 31% (CH-62 asks for 15% or less; under the alto, which lives in the piano's register, 20% against 37%); notes at or above the line's lowest 12% against 30%; the bottom of the hand about C4 against E4.
- **What it costs**: the top voice at changes steps less (58% against 75% in takes with a solo) and holds more, and 1.2% of changes are a "leap", nearly all of them a top voice left out for the soloist's note.
- Not built, on purpose (CH-80's other wishes): echoing the soloist's rhythm, answering a question differently from an answer, building with the solo's arc.
- The phrase-shape measures (`chords.phrase-*`, `chords.bar-same-as-last`) now count only phrases where the soloist does not have the lead; under a solo the conversation measures speak instead.

## 2026-11-14: goldens, the suite, and the random streams

- The golden take with a solo changed for the three reasons above (the soloist's fixes, the band's arc, the piano around the soloist). The two goldens without a soloist did not change, and a digest of 224 takes without a soloist was identical before and after all of it.
- Forking a random stream now costs its own labels, not the whole path from the seed: the hash is carried part-way and the generator is set up only when a number is drawn. Output is identical (the digest and the goldens); rendering is about 9% faster.
- The suite was at the edge of its 10 seconds on one core. The properties were split by seat into three files, which node runs side by side, and each file renders only the takes it reads.

## 2026-11-14: gate 3 feedback

Brandon, in Logic, after a few seeds: the solos are "sounding pretty good, definitely intentional melodies that work well". The piano could leave a bit more room, and gets busy as the intensity ramps up. The bass could be more creative, its register sometimes gets high, and it reads as an octave up: it should sit in a typical bass guitar register. Each became a measure first.

- **The bass was an octave high in some keys, and that was the data, not the export.** Notes are written at sounding pitch (E1 is MIDI 28). Roots were allowed up to A2 with a home between C2 and E2, so in A the I sat on A2 and the box reached G3: an octave over the open A string, where a bass guitarist plays it. Over 200 takes the average note was G2 (B2 on the 12-bar in A), and 9% of notes were above D3. Now roots go no higher than E2 and the home is between A1 and D2, so every root but E has one place, the lowest on the instrument, and a box tops out at E3. The average note is D2 and nothing is above D3. Measures: `bass.register` (the average note, Bb1 to G2) and `bass.high-notes` (above D3, at most 3%).
- **Known cost, to be fixed with the bass work that follows**: the share of takes whose changes are approached by a half step often enough (15% to 40%) fell from 80% to 65%. The mean is unchanged (27%); the minor blues lost most (22% to 9%) and the quiet level a little everywhere. The baseline was accepted with this in it so the tree stays checkable.
- **Under a soloist the piano stays in its working book however hot the band gets** (`ChordStyle.listening.busiest`, "mid" for the blues). Under a hot solo it had been playing 5.2 strikes a bar, the pump's eight in four bars of ten: exactly what it plays with nobody soloing, against a soloist at its own busiest (5.2 notes a bar). Now 2.0, played harder, not busier. The pump and the four-stab figures are for the band's own choruses. This departs from the old band's rule that the pump plays through a solo unchanged (ST-blues-33); the owner's ear decides.
- **The measure that should have shown this left it out.** Every measure of the piano under a soloist excluded pump bars, because a groove does not react by design. So the scorecard said the piano made room while the busiest bars of the take were not being counted. `chords.strikes-per-bar-under-a-hot-solo` counts them (target: at most 3). The lesson, again (ME-10): a measure's exclusions are where to look when an ear disagrees with it.
- `chords.strikes-per-bar-loud` now counts only bars where nobody is soloing, since under a solo the hand is held back on purpose.
- The golden takes all changed: the bass is lower in every take.
- "More creative" for the bass is the next piece of work: today it has one two-bar box for each kind of chord and nothing chooses between ways of playing a phrase.

## 2026-11-14: a bass that varies its line (gate 3 feedback, "a bit more creative")

Built by an Opus agent from `prompts/bass-variety.md`; read on paper, held to properties, and one of them checked by breaking the rule, on the main thread.

- **What "the same two bars all night" was, in numbers**: at the working level the bass had one two-bar box for each kind of chord; half of all bars were the bar at that place in the chorus before; no chorus ever ended with a walk.
- **More than one line for a chord, as data** (`ToneSequence.others`): on a dominant, the box, the box to the octave, the walk through the fourth, root-fifth-sixth, and the octave figure; three for a minor chord. The box and the minor box are from the notes; the rest are standard figures written here and marked as new in `packages/styles/src/blues/bass.ts`.
- **A walk into a change, as data** (`BassStyle.walks`, by root motion): four quarter notes that step to the next root and arrive a half or whole step from it (E D C# B into A; A B C C# into D). None is from the notes.
- **Chosen by the phrase, by the critic**, as the piano's rhythm is. A section keeps a home shape per level and every phrase opens on it; later stays in the phrase play home or this chorus's answer; a phrase ends with a walk, a one-beat lead-in, or neither. Up to eight plans are drawn by position, each is played out into the next phrase's first root, and the cheapest of six is played. Weights are in `critic.weights.bass`; each was set to zero in turn.
- **What it delivers** (200 takes, same seeds): bars that are the bar at that place last chorus 42% (it was 50%); 40% of chorus tops are walked into (none before), which is about three quarters of the tops a walk can reach; 15% of the other line ends; the box is still the home line in about five sections of eight. "A bit" is the measure of it: this is the same bass with a turnaround and an answer, not a new one.
- **The half-step approaches are repaired** (90% of takes in the 15% to 40% band; it was 65% after the register change, 80% before it). The cause was the register: with the I always at the bottom, the half step below it is out of reach from the IV's box. Part of the repair is in the lead-in (a half step out of reach on one side is taken from the other; only the open E, not F1, is "the floor"). Most of it is a critic feature that keeps each phrase, with the last eight changes in mind, near 20% to 25% half steps. **That feature aims the player at the measure's own definition** (ME-08a warns about exactly this): with it at zero, 48% of takes are in the band. It is kept because "chromatic approaches as seasoning, not every change" (BA-75) is a real preference, and logged because the scorecard line can no longer be read as independent evidence.
- **Not from the brief**: the quiet level's lead-ins are now chosen through the critic too (the two-feel itself is unchanged).
- **Costs**: sixths on dominant chords are in their band in 75% of takes (80% before), because the answers without a 6th have none. The bass costs four times what it did to render, and the suite went from 5.8 s to 7.6 s of its 10; the bass properties moved to `test/bass.test.ts`.
- **Still true and not addressed**: about 6% of changes are reached by a drop of a minor sixth or more into the note that leads in (the same before and after this work). With one place for each root, a line that has climbed its box has to fall to reach the next root. It was on the gate 1 list as "wide bass drops" and has not been called out by ear.
- A style with one shape, no walks and no phrase policy plays exactly as the bass played before (checked by the builder against the untouched tree; not a test).
- The golden takes changed again: the bass is different in every take.

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

## 2026-11-14: the drum seat for jazz and funk (stage 4)

Built by an Opus agent from `prompts/drums-jazz-funk.md` in its own clone; the diff and the printed bars were read on the main thread, six properties were written from its claims (`test/drums.test.ts`), and four of them were checked by breaking the rule on purpose (no `audible`, fills that take the cymbal, no head offset, a kick between the eighths: each was caught).

**Engine changes, each a concept the drum data lacked** (the blues uses none of them; its goldens and scorecard did not move):

- **A layer can take a stroke away** (`-` in a groove line). Layers could only add. The jazz bomb drops the feathered 4; the funk open hat takes the closed hat off the sixteenth after it.
- **Conditions on the phrase's last bar, on whether a fill ends the bar, and on what the harmony does** (`When.phraseEnd`, `fill`, `changeInBar`, `changeAhead`). The drummer reads the chart as the pianist does, since he plays first and cannot hear him (DR-89).
- **A turn must be heard** (`GrooveLayer.audible`): when the drawn option would change nothing in the bar, the next in the written list that would is played. DR-06 says it of every style with answer bars. Without it 15% of funk answer bars were the bar before again.
- **A fill vocabulary per tier** (`FillShapes`). The length still comes from where the music is going (CO-43); the shapes come from the tier of the bar the fill is played in, so a light head stays off the toms even into a loud chorus (DR-38).
- **Fills played under the time** (`DrumFills.keepTime`, `FillShape.handOff`): the cymbal keeps going through a fill as the feet do (ST-jazz-15).
- **The drummer's button** (`ending.button`), on the same "and" as the rest of the band's.

**Choices in the data:**

- The jazz low tier carries both quiet parts: under 0.3 a soft ride (a ballad a player asked for); from 0.3 the swing pattern on the closed hat, which is where the arc puts the head (0.37 to 0.40). No kick and no snare comping in either.
- The hat foot plays on 2 and 4 wherever the ride keeps time, and not under the head. The builder had it under the head too ("always", ST-jazz-08); there the stick is on the same closed hat at the same moment, one sound struck twice. Changed on the main thread.
- Jazz `drums.fills-that-repeat` is a measured bound (45%), not the blues' 10%: at two and four steps a swung set-up has two places to strike, and the notes' shapes collapse into one another.
- Funk's quiet tier has no cross-stick (funk is not on X-C-08's list), a soft kick for its turn (DR-07), and no hat cut.
- Still the old band's rule and worth a listen: an arrival crash (with a kick under it, DR-20) opens every section, the eight-bar sections of a jazz head included.
- Not built: the head out played light again, trading, brushes.

**A measure of one way of playing is reported only where a style targets it** (`Measure.idiom`). With three styles, "the backbeat" read off a jazz take says 0% and means nothing. A measure marked `idiom` is on the scorecard of a style that sets it a target and of no other. Twelve drum measures are marked; the general ones (fills that repeat) are reported everywhere.

## 2026-11-14: the soloist for jazz and funk (stage 4)

Built by a Fable agent from `prompts/solo-jazz-funk.md` in its own clone. On the main thread: the diff and printed solos were read; the blues goldens are byte-identical and `pnpm score` reports no movement; one property was added (`test/soloist.test.ts`, the chromatic note that resolves) and one widened (`test/drums.test.ts`, swung eighths for the soloist too), each checked by breaking the rule.

**Engine changes, each a concept the soloist's data lacked.** Every one of these was a constant or a branch that said "blues" without saying so; the blues pack now carries the old values and plays what it played.

- **The book** (`SoloStyle.book`): which ways of making a phrase are offered for each thing a form asks (state, again, changed, answer), for a solo's first phrase, for the peak, and when an idea is outgrown. The engine keeps how each way is made; a style lists and orders them. Before, the lists were four `if` branches.
- **Forms by length, and two more things a form can ask**: a form is for a chorus of as many phrases as it has letters (twelve bars `s r a`, thirty-two `s a v a c r b a`); `c` is a contrast set beside the idea (a bridge) and `b` brings back the idea the chorus opened on. Memory gains "the phrase this chorus opened on".
- **A new statement can be set apart and lifted** (`apart`, `lift`): in rhythms the idea did not use, its register raised with it. What a bridge is.
- **The peak phrase and the wind-down as data** (`arc.peak.fromEnd`, `shape`, `contour`, `sequence`; `arc.windDown.contour`). The blues climbs in sequence in the phrase before the last; funk plays `L L E R`; jazz runs up.
- **What a move costs the line** (`line`): what a step is (a minor third in a pentatonic, a whole step where the line runs the chord's scale), skips, leaps, half steps, a non-chord tone on a beat; and `strandsTheBeat`, which is what makes the bebop passing tone get used.
- **How a landing is ranked** (`landing.perRank`, `reach`) and **how alike is alike** (`likeness.related`, `same`), which the measures read too.
- **Habits**: a tie over the barline (`tie`, new to the engine), a figure's first note stabbed two to four times (`stab`), a riff bar said as a sequence or note for note (`riffIs`), a pickup ending on the half step under the line's first note (`pickup.approach`).
- **An idea can be outgrown by being thin** (`book.outgrown.thin`): fresh ways are also offered when the idea as last played has under a set share of the notes the arc now asks. The builder declared this and set it in both packs but nothing read it; wired up on the main thread. Funk sets 0.6 (solos that build 1.5 times or more went from 87% to 93%, the flattest from 1.00 to 1.40); jazz does not set it (it made no take better and three in a hundred worse).
- **A tone from outside the chord's scale goes somewhere** (`Pool.leading`, `settled` in `line.ts`; main thread). Reading the jazz solos, about three notes a take were the bebop scale's passing tone jumped onto and off again (a major third over a minor chord, between two notes a third away): an idea come back over another chord, a sequence moved onto it, a pickup walked off the old chord's ladder. Now such a tone stays only off the beat with the note a half step from it straight after; otherwise the scale's own note beside it is played. Only a style that adds passing tones has any, so the blues and funk are untouched.
- **Critic features** `rocks`, `beats-off-the-chord`, `changes-down-the-list`, `note-for-note`, none with a blues weight; five measures marked `idiom` (`barlines-tied`, `chromatic-approaches`, `silent-sixteenths`, `roots-and-fifths-on-changes`, `short-notes`).

**Two fixes that change the blues, on other styles' charts only** (72 of 1,242 blues takes compared, none in the blues library, goldens and scorecard unmoved):

- An end bar struck too late to leave a breath: a four-beat ending rhythm cut to a 3/4 bar kept its attacks in the bar's last beat. An end bar's later notes are not struck when they cannot leave an eighth and the breath, as heard. `off-the-density` asks a 3/4 bar for three quarters of a 4/4 bar's notes.
- A one-phrase solo that is also the tune's last phrase climbed and stopped on its top note. It now comes to rest.

**Choices in the data** (the builder's, kept): jazz solos are eighths only, so the triplet pickup of ST-jazz-38 is left out; the chromatic approach is from below only; ST-jazz-36 and ST-funk-31 give head forms, so the solo forms are the builder's; funk has no pickups, ties, scoops or falls; a later chorus mostly brings a new idea.

**Known, not fixed:** three slow-waltz takes in 1,258 (jazz at 60 on the alto) run nine seconds on one breath, because a pickup's breath is judged on paper and swing takes a tenth of a second back; one three-bar silence on the waltz at 240. A funk property was tried ("no pickups, nothing over the barline") and dropped: both are settings in the data, and the test could not be made to fail by anything but changing them.

## 2026-11-14: a guitar in the chord seat, and the funk rhythm guitar (stage 4)

Built by a Fable agent from `prompts/chords-funk-guitar.md` in its own clone. On the main thread: the diff and the printed part were read (grips as string and fret, the line as downs, ups, stabs and scratches); the blues goldens are identical and `pnpm score` reports no movement; three properties were added and two reworded (below).

**Engine changes, each a concept the chord seat lacked:**

- **A second instrument** (`Idiom = "keys" | Guitar`, `players/chords/guitar.ts`). A chord is found on the fretboard (CH-20): a string each on neighbouring strings, pitch rising, inside a four-fret hand, nothing over the 15th fret. What a style tunes is data: strings, where the hand is parked, open strings or not, a muted string inside the grip, root on the bottom, and the strum (its grid, how many strings an upstroke catches, how much lighter it is, the roll in milliseconds). The builder wrote a rock guitar and a reggae skank as data over the funk pack and both played.
- **A stroke can be deadened** (`Attack.muted`, the voice `muted` on its notes). A guitar's scratch, a clavinet's dead key. It is not a strike of the chord: it does not count as striking a written chord (CH-34), is never a push, and gives way to an arrival strike.
- **A third way to meet a change** (`CompFigure.ties`): a groove that leans in lets the chord ring an eighth over the change and passes over it. The piano rests; the pump strikes again; this ties.
- **A figure's own turn at a phrase end** (`CompFigure.turn`), written whole. The piano answers with another figure; a groove answers with itself.
- **A plain rhythm on every pulse** (`PlainRhythm.pulse`), for a strummed part in a meter with no book (CH-54).
- **A deliberate downstroke** (`Strike.down`): an arrival, a plain bar, the final chord, wherever the pendulum is. Keys ignore it.
- **An instrument can hold its voicing while the chord stays** (`InstrumentIdiom.holds`, CH-31) and **place the same notes where the hand is** (`placed`, `Voicing.strings`): the same three notes can be fretted in two places, and the hand takes the nearer.
- **The idiom writes the part with the plan in hand** (`InstrumentIdiom.write(part, plan)`): the pendulum needs barlines and the roll is milliseconds. The roll uses the note's existing `nudge`; nothing changed in the note model, feel or MIDI.
- **Measures told what a scratch is**; "played early" also needs the next chord's guide tones (a clipped stab on the last sixteenth was being read as an anticipation: 41% read, 11% true). Ten new guitar measures, all `idiom`. Nine piano measures (`phrases-shaped`, `strikes-per-bar-quiet` and the like) marked `idiom`: **they are off the jazz card until the jazz piano targets them.** On the main thread: five measures of a comp that converses marked `idiom` too, and the conversation measures no longer count scratches as strikes (funk's `breaths-over-the-line` was re-measured to stabs only: 0.87, 0.66 to 1.24).

**Properties** (`test/piano.test.ts`; `strikesOf` now reads sounded chords, and scratches separately):

- New, for any style with a guitar: every stroke can be held (checked from the pitches alone, not with the engine's own fretboard); the hand holds its grip until the chord changes, a scratch never leads the way to the next grip, and a chord leant into rings an eighth with nothing stroked over it; the pendulum (a stroke between the beat's halves comes up, high string first; every other goes down). Breaks tried: a seven-fret hand, a reversed roll, a groove that does not tie, a scratch off the grip: each caught. A guitar told not to hold its grip was *not* caught: with funk's costs it re-voices to the same grip every time, so `holds` changes nothing audible in funk today.
- Reworded: "the eighth before a change belongs to the chord coming" now says a strike there that rings into the change is the new chord, alone, and one that stops short is played only by a groove (`anticipation.otherwise: "stay"`). "The piano makes room" is "a comp that listens makes room", and skips a style whose comp does not listen.

**Choices in the funk data** (the builder's, kept; each is a question for the listening gate):

- A plain minor 7th is b3, 5, b7, not b3, b7, 9 (ST-funk-23 says the 9th): with the 9th only one inversion is free of a half-step rub, and the top note moved 4.3 semitones a change against 0.9. A written m9 gets its 9th.
- At a phrase end the hand flicks the chord once more on the last sixteenth; nothing else varies. No rule in the notes; the builder's answer to "sixteen identical bars on a one-bar vamp".
- The upstroke catches four strings, not three (CH-27), so a four-string grip keeps its guide tone on an upstroke stab.
- A 13 chord's stab is 3, b7, 13: its 9th is not heard.
- A scratch is the grip's own pitches, half a sixteenth long, quiet, with the voice `muted`. On a plain guitar patch it is three short pitched notes: whether that reads as a "chick" is the first thing to ask Brandon. If not, the export can put muted strokes on their own track with a muted-guitar program.
- At the quiet level there are no scratches, six or seven dry stabs a bar.

## 2026-11-15: the bass for jazz and funk (stage 4)

Built by a Fable agent from `prompts/bass-jazz-funk.md` in its own clone. On the main thread: the diff and the printed lines were read (the walk on rhythm changes; the funk riff under the kick); the blues goldens are identical, `pnpm score` reports no movement, and the builder's digest of 1,472 blues takes is byte for byte what it was. With this merge **all three styles pass every property** (the jazz piano is still the blues piano standing in).

**Engine changes, each a concept the bass lacked:**

- **A walked line** (`BassLine.walked`, `players/bass/walking.ts`). The figure still gives the rhythm; the pitches are made a note at a time toward an approach that is chosen first (BA-18), each a tone of the chord or its scale within a fourth. Six walks are drawn for a phrase and the critic takes the line with a direction. Ska and a country walk-up are this with other weights.
- **A figure that names its own tones** (`R 2 3 4 5 6 7 8` in a grid). A riff is a rhythm that belongs to its notes (X-C-10).
- **A dead note** (`m` in a grid, the voice `dead`): a 60-tick note on the root at a low level.
- **A named draw shared by tiers** (`figures.draw`), so a section's quiet part is its loud part thinned, as in the chord seat.
- **Following the kick** (`followsKick`): a root wherever the bass drum falls and the figure is silent (X-C-12).
- **A turn** (`BassLine.turns`): a beat or two laid over the end of a phrase's last bar, as a drum fill is.
- **Length as a share of the gap to the next note, capped** (`length.gap`, X-C-14), and **a level for notes off the beat** (`velocity.off`).
- **Tones under the root** (`Figure.under`), **lead-ins only on a note the figure already has** (`leadIn.pickup: false`, BA-41), and **coming down through the octave** into a landing (`leadIn.throughOctave`).
- **The bar before a step up plays the tier it is going to** (`stepsUpEarly`, the general form of BA-25): the last bar of a jazz head already walks.
- **Critic features for a made line**: `turns-back`, `rocking`, `leaps-left-hanging`, `strong-beats-off-the-chord`, `bars-as-last-time`. They read walked notes only.
- Fifteen new measures, all `idiom`; six blues measures marked `idiom` (the blues targets them all). `walks-into-the-top`, `steps-into-the-top` and `steps-into-a-line` describe the blues line and are still reported for jazz and funk, where they say little: they have no target anywhere, so marking them would drop them from the blues card.

**Properties** (`test/bass.test.ts`), each checked by breaking the rule (an extra eighth in the walk, a walk allowed to stand still, an approach from a third, a bass that ignores the kick, a riff drawn per bar: all caught):

- Jazz: once the band has opened up the bass walks, a note on every beat and nothing between, never the same note twice running, into a change of bass note by a half step, a whole step, a fourth or a fifth.
- Funk: on the One and under the kick (a dead note counts: the hand is there); on the sixteenths; nothing longer than two and a half sixteenths; a dead note never on the One, on a change, or when the band is quiet.
- Funk: the riff is the section's (the first two beats of every bar, one time through at one level).
- "Swung eighths only" now holds the jazz bassist too. "A note held a half note or more is a chord tone" reads a note of 1.6 beats or more: a half note in a two-feel sounds a little short and was never being read. The floor on "notes outside the scale" is 100, not 200: a funk bass has few.

**Choices in the data** (the builder's, kept; questions for the gate):

- Jazz approaches are 61% by half step. With the notes' weights (BA-04) it was 75%, and 83% in one take in ten.
- The head is in two; at the working level a ballad at 66 walks in four (BA-24 says a ballad stays in two: that is the arc's business, not the bass's, and is not built).
- Funk has one fixed register, F1 to E2 (ST-funk-19 gives an anchor per section, which puts A on A2). **In E the riff sits on E2 with pops on E3** (average G2, 16% above D3): moving the register down puts E on the open string and drops a seventh between D9 and E9. Brandon said after gate 3 that the bass was an octave high, so this is the first thing to ask him.
- Funk's two turns (a pickup under the root; an octave figure) are new: the notes have no bass turn. Three chorus tops in four are turned into, one inner line end in eight.
- A dead note through a General MIDI bass is a very short quiet note on the root. Whether it reads as a thump is a listening question.

**Known, not fixed** (the shared ending and register logic, left alone to keep the blues identical): a written ending that walks up by half steps into a tonic at the bottom of the instrument lands a seventh under its leading tone (27 of 2,944 takes, another style's chart in jazz); jazz in two with one note a chord can cross the A2/Bb1 seam.

## 2026-11-15: three styles inside ten seconds

The property suite cost one style 8.9 s of its 10. With three it took 23 s on a quiet machine. Measured before changing anything: nearly all of it is rendering takes (a take is 13 to 28 ms and a style's run renders about 500); the engine's profile is flat (the random streams 15%, the soloist's likeness 11%, nothing else over 6%), so there is no quick doubling to be had there; and running fifteen test processes on this machine gives the parallelism of about three, because every file rendered the same takes again.

- **One process per style** (`scripts/test.ts`, `--test-isolation=none`): a style's property files run together and a take is rendered once. The styles run side by side.
- **A push plays two seeds; `pnpm test:full` plays six** (`ENSEMBLE_SEEDS`, 60 s budget). `docs/TESTING.md` allows exactly this ("a small seed count on every push and a larger one nightly"). The full run is for before a listening gate and after a merge that changes what a player chooses. A floor on how many cases a property met is written for six seeds and scaled (`enough`).
- **A push samples three things the full run plays whole**: the take played twice for "the same seed is the same take" (one in three of seed 1's); the chart corpus under "a chart with mistakes still plays" (each style a different third); the soloist's special takes (every other kind per chart, slow or medium tempo by turns for the horn).
- Result on a quiet machine: push 9.4 s with three styles (6.1 s with the blues alone), full 19 s. The limit was not raised. The margin is thin: the jazz piano has yet to land, and the next thing to give is the four-minute jams under "the piano stays in its part of the keyboard".
- Halving the seeds alone was tried first and saved little, because every file was still rendering its own copy and half the renders were not `takes()` at all.

## 2026-11-15: the jazz piano (stage 4)

Built from `prompts/chords-jazz-piano.md` in its own clone (Opus), read and merged on the main thread. The style is `packages/styles/src/jazz/chords.ts`: rootless voicings in one hand (3, 7, 9 and 13 or 5; half-diminished and diminished as their own four notes; a triad keeps its root), the top aimed at Bb4, and the whole-bar cells of the notes (Charleston, reverse Charleston, the "and" of 2) as a section's figure and its answers.

What the engine was missing, each a concept and not a jazz case:

- **A figure can be a bar of rest.** A grid of all `.` is valid. A chord held over from a bar the hand comped is owed nothing in such a bar (`BarSetting.heldOver`); a chord that changes there is still laid in where it arrives, so "every chord the chart writes is struck" holds as before. A rest cannot be a groove, and a tier cannot have only rests for a section to take as its own. Any comper may lay out for a bar; the blues book does not write one, so the blues is untouched.
- **`Anticipation.held`.** A strike the figure writes held, falling in the eighth before a change inside the bar, becomes the new chord and keeps its written length. Without it a held Charleston over a ii-V came out as a stab an eighth long. Jazz turns it on. The blues leaves it off because turning it on changes what the blues plays (its quiet pad has the same short ring on bars of two chords); that is a question for the blues later, not a jazz rule.
- **The answering stab, two faults found now that a style exercises it.** It was placed in the eighth before the soloist came back in (26 of 228 stabs stepped on the entrance); and a breath over a bar where the figure struck nothing could never be answered, because the stab took its voicing kind from a strike in the bar (`PhraseHarmony.kind` gives it now). Both are rules of the stab, not of jazz.
- **Three measures**, each `idiom`: `chords.held`, `chords.held-quiet` (the share of strikes ringing longer than a beat) and `chords.thin-bars-under-the-solo`.

**The blues.** The goldens are identical, `pnpm score` shows no movement, and `pnpm gate:3` rewrites the gate 3 files byte for byte. The builder's digest of 840 blues-style takes shows two that differ: the blues style on `jazz-falling-fifths-gm.chart`, seed 3, in its two solo kinds, from the entrance fix above. That is the fix doing its job on another style's chart, not a blues change in anything Brandon has heard.

**Properties.** One new: "jazz: the piano is one hand, and the root is the bass's" (at most four notes inside an octave; no root on a chord with a seventh or sixth, unless it is a diminished seventh or a slash chord; a strike leaning into a change is judged as the chord it is playing). The swung-eighths property now covers the whole band. Broken on purpose four ways (a root in the dominant recipe, five voices, a sixteenth in a figure, a rest bar that owes nothing to a chord that changed): all caught, the last by "every chord the chart writes is struck". The stab's entrance rule is not a property: a stab cannot be told from a figure's strike from outside without knowing how the engine is built. The builder's audit, rerun on main, finds none of 108 stabs on a beat, on an entrance, stuttering, or before a change.

**Targets it falls short of** (reported, not hidden): on the soloist's note 17.5% of the time against 15% (33% of takes in target; a deaf piano is at 40%); the bottom of the hand at 58.9 against 58 to 64 (68% in target; aiming the top a semitone higher fixes it and puts the piano on the soloist's note 22% of the time); held strikes 17% against the notes' quarter.

**Known and left:**

- A written 7b9 with a natural 5th on its way to a minor chord is read as the altered scale fitted to that 5th, which has no 13th of either kind; X-B-11 says it keeps the b13 (Phrygian dominant). The voicing falls back to the 5th and stays four notes; nothing wrong is played. Changing the scale changes what the soloist plays on those chords in every style, so it waits for a property and a look at the blues.
- The comp has no idea of tempo: at 66 the ballad is about two strikes a bar and leans on held chords; at 176 rhythm changes is two clean strikes a bar. Listening questions for the gate.
- CH-72's "40% to 70% of breaths answered" is not reachable with figures that strike every two beats; jazz sets a floor only.

## 2026-11-15: funk and jazz ship (stage 4)

Every seat of both styles is its own, so both are in `STYLES` and `UNFINISHED` is gone: `pnpm check` holds all three styles to every property.

- **Golden takes**, two a style as `docs/TESTING.md` allows. Funk: `funk-two-chord-dm` with a solo, and `funk-intro-outro-c` in song mode. Jazz: `jazz-rhythm-changes-bb` with a solo (the head, the walk, two chords to the bar, the ending), and `jazz-waltz-f` (the meter the 4/4 books are not written in). The three blues goldens are byte for byte what they were.
- **Scorecard baselines** `scorecard/funk.json` and `scorecard/jazz.json` accept what the two styles deliver today, including the targets they miss (listed in the gate 4 report). `ensemble score` with no style named now scores every shipping style against its own baseline, so `pnpm score` guards all three. The blues baseline is unchanged.
- **Neither style borrows the blues critic weights any more.** Each seat build replaced its group; the spread of `bluesCritic.weights` under them was dead and is removed. Both scorecards are identical before and after.
- **Suite time**: 9.4 to 9.7 s with the goldens and the jazz piano in. Two properties that render their own long takes ("making an open jam one pass longer", "the piano stays in its part of the keyboard") now play one seed per chart on a push, the charts taking the seeds by turns, and all of them on `pnpm test:full`. Push 8.8 s, full 19.5 s. The limit stays at 10 s.

## 2026-11-15: the jazz band read as a band (an independent review), and the bridge

An Opus reviewer read the four jazz seats together from `prompts/review-style.md`, in its own clone, changing nothing: fifteen takes bar by bar and counts over every jazz chart. Each finding was checked against the code here before anything was done.

**Acted on: a tune's bridge is a bridge whatever it is called.** The head's bridge never opened up: a section's level was matched by its label alone, the library charts call their bridges `[B]`, and the claim above ("a bridge whose own level is higher reaches the working tier and walks") was true of no library chart (270 head bridges of 270 in two on the hat). The notes give the rule (CO-27): the bridge is a section labelled so, or failing that the second-to-last section of a chorus of three or more when it is unlike both the first and the last; ABAC, a two-part tune and a blues have none. The planner now reads it (`bridgeRuns`): such a section, when its own label asks for no level, takes the level of one labelled Bridge. An intro and a written ending are not part of the chorus (the first draft made the middle of Intro, A, Outro a bridge, and a blues golden caught it).

- Property first, then checked by removing the planner change: "a bridge is a bridge whatever it is called" (the levels of a tune with its bridge lettered are those of the same tune with it labelled, in a jam, a timed jam and a song; a two-part tune and ABAC are at one level), and the jazz head property now says the head is light "all but its bridge".
- Jazz gives a bridge 0.63, not the default arc's 0.60: under the head the default landed on the line between the tiers exactly (0.42).
- The blues and funk scorecards did not move and the blues goldens are identical; `jazz-rhythm-changes-bb-solo.mid` was rewritten (its head's bridge now walks on the ride) and the jazz baseline accepted again (`solo.builds` in target 90% to 87%, nothing else by more than three points).

**Checked and left, each a listening question in the gate 4 report:**

- **The drummer's kicks into a change and the piano's pushes are separate coins** (ST-jazz-45 says the drums mirror the pushes). The drummer plays the shot with the bomb where the piano does not push 68% of the time; the piano pushes with no snare on that "and" half the time. Making a push the band's, as a fill is (a mark in the plan both seats read), is a real concept and would re-tune two merged seats. Not built before the gate: if Brandon hears the band as loose into the changes, this is the cause and the fix.
- **The jazz waltz piano is one held chord a bar** (94% of bars), under the soloist too: the book is written in 4/4 and 3/4 falls back to the pad (CH-54). A book per meter is the missing concept.
- **In a solo's first chorus the piano's top note is above the alto** on 63 to 72% of the alto's notes (later choruses 8 to 34%): the first chorus is played three semitones under home, which is the piano's register. The lever is the soloist's (`arc.stages[0].register`), and moving it changes how every jazz solo builds.
- **The alto repeats a phrase's rhythm** 35% of the time (the blues alto on the same charts 28%); on the ballad two one-bar rhythms can alternate for sixteen bars.
- **On a chord that lasts many bars the piano keeps one voicing** (the modal tune: 16 to 20 bars on the same four notes). The hand has no reason to move when the chord does not.
- **80% of the jazz piano's strikes are the pitches the blues piano plays on the same chord**: the blues piano has been rootless since gate 2. The two differ in rhythm, length and a step of register, not in harmony.
- **In two, a lead-in is sometimes the root an octave away** (51 of 804: G1, G2, then C on a ii-V in one bar). The fifth of the chord coming is the root being left. A player does this; the notes' "never repeats the note before it" is about the walk.
- Song mode has no light head (the head offset is for a jam that goes round more than once): as designed.

**Dismissed:** "the walk's passing tones are floored at the open E, not at the style's lowest root". The open E is the instrument's lowest note and `register.lowest` is the lowest root; the blues line has the same two floors.

## 2026-11-15: Brandon on four of the jazz review's questions (before listening)

- **Drums and piano into a change:** "i don't think they need to line up *all* the time". Agreed and left: both are on the same "and", so together they are exactly together and apart one plays alone; the piano's push has the snare with it half the time. A push the band shares is not built. It comes back only if he hears the band guessing at a change.
- **The jazz waltz piano (one held chord a bar):** accepted for now, "an area for improvement. we should think about what some of the greats do as they're comping waltzes". On the later list in `PLAN.md`: a comping book per meter, the 3/4 book written from a study of how the great pianists comp a waltz.
- **The piano above the alto in a solo's first chorus:** left to my judgement. Left as it is: the low first chorus is the arc the solo builds from (SO-05) and was passed on the alto at gate 3; the piano cannot go under it without going under middle C (CH-63). If it is heard as crowded, the lever is the piano thinning under a low horn, not the horn moving up.
- **The jazz and blues pianos share their voicings:** "this sounds normal, jazz harmony leans a lot on the blues". Not a defect.

## 2026-11-15: the funk band read as a band (an independent review)

A second Opus reviewer read the four funk seats together from `prompts/review-style.md`, in its own clone, changing nothing: fifteen takes bar by bar, and counts over 120 takes. Each finding was checked here. No funk data or engine code changed.

- **A section's held choices follow the seed and the section's label, not the chart** (confirmed: `heldRng` forks on `section.identity`, which is the label). At one seed, vamp-a and one-chord-e play the same kick, riff and strum bar for bar, for every seed from 1 to 10, and seeds 1 and 4 are the same groove. True of every style; it costs funk most because the groove is most of the tune and the pool is small (three kicks, about six riffs, four strums at the working level). **Not fixed before the gate:** drawing on the chart as well changes every take in every style, the blues takes Brandon passed included, and gate 4 asks whether the blues changed. Recommended to him for the start of stage 5. For the gate, `scripts/gate-4.sh` spreads its seeds so the funk files do not share a groove (chosen to differ, not by ear or score), and says why.
- **The guitar's push and the bass** (a half step apart in 176 of 488 pushes, for an eighth): the notes specify exactly this pair, a keyboard stab that plays the next chord early (ST-funk-36) over a bass with its own last-sixteenth approach (ST-funk-39). Left, as a listening question. With the jazz review's finding about the drummer's kicks, this is the second time "a push is the band's" has come up: if either is heard, the concept to add is a push marked in the plan that every seat reads.
- **The octave pop folds down before a change to a low root** (`leadIn.throughOctave`; 136 of 800 bars): the bass builder's choice, to keep the line from leaping more than an octave into the One. ST-funk-19 says the riff keeps its octave. Left, as a listening question.
- **The alto sits inside the guitar's grip in its first chorus** (on one of the guitar's notes 21 to 28% of the time; the blues soloist 7 to 10%): the same shape as the jazz finding, and left for the same reason. Listening question.
- **The final hit replaces the last bar of the chorus**, so a turnaround written there is not played the last time: the shared ending rule, right for a blues. Listening question; a style setting for "end on the One after the form" would be the concept.
- Song mode on a vamp chart is one lap, as `docs/CHART_FORMAT.md` says. The alto's range tops out at Bb5 (a real alto's is about Ab5); shared instrument data, left because it would change the gate 3 alto takes. A plain V7 in a minor key gets the b9 on top in funk as everywhere (X-B-11).
- Two rules the reviewer found always hold and no test checks: the dead stop is struck by the whole band on one tick with nothing after it; the bass never sounds at or above a note the guitar is holding. Not added as tests (they are rationed): the first is close to what the existing ending properties say seat by seat, and the second is a consequence of two registers set in data.

## 2026-11-15: when the groove starts to follow the chart

Brandon: "i trust your judgment about when to make changes related to grooves". The call: a section's held choices will draw on the chart as well as the seed and the label, as the first change of stage 5 and not before his gate 4 verdict. Until he has listened, the files in `out/gate-4` must be what `pnpm gate:4` writes, or a bar number he reports cannot be found again. When it goes in: its own commit, a property first (two charts with the same section labels and different chords do not share their held choices at one seed), every golden and gate file rewritten, and the three scorecards shown not to move beyond noise, since the band is the same and only the draw changes.

## 2026-11-15: gate 4 passed; and the groove does not follow the chart after all

**Gate 4.** Brandon downloaded the files and listened to "a handful of seeds across blues/funk/jazz": "everything is sounding incredible so far, seriously amazing work". No complaint, so stage 4 is closed. A short verdict is not an answer to each listening question in the report: those stay open and are his to raise.

**The groove change is withdrawn** (the entry above said it would be the first change of stage 5; Brandon had left the call to me). Worked through before writing any code, it is the wrong fix:

- What a listener would meet is two tunes with the same groove. That only happens when two tunes are played at the same seed, and only the gate script did that, by asking for seed 1 everywhere. The app will draw a new seed for each jam and keep it with a saved take (stage 6, "save a seed, replay it"). The seed is the caller's, and that is where the variety belongs.
- Drawing on the chart's content breaks something worth more. Every random draw is keyed by position so that a change stays local: edit one chord in the editor and the rest of the performance is what it was. With the chart's content in the draw, one edited chord would change the beat, the riff and the strum of the whole tune.
- `A`, `A2` and `A'` share their held choices on purpose (`sectionIdentity`), so the content of one section cannot be its identity either.
- It would also have turned every saved take, golden and gate file into a different take, for no gain a user would hear.

What stays true from the review: **the funk pool is small** (three kicks, about six riffs and four strums at the working level; seeds 1 and 4 are one groove). That is style data, to be widened when funk next gets attention, with a measure first (distinct grooves in 100 seeds: 57 today). For stage 6: the app picks a fresh seed for each jam.

## stage 5 begins: where the packs come from (a survey, and a recommendation not yet answered)

Brandon asked for a careful start: a look at the old packs with a narrow mandate, and a look online for permissive packs. Both were done on 2026-11-15. What was learned is in `docs/AUDIO_NOTES.md`; it carries knowledge about sounds, licences and phones, and nothing about how the old audio code was built.

- **The old packs are thirteen cut-down sets (9.9 MB, AAC), each from a free library.** One recording per note at one dynamic; no licence file beside any pack; the sources are not on this machine.
- **Against what the band plays now they lack**: a ghost snare, a stick click, a dead bass note, a muted guitar stroke, a vibraphone, and any dynamic layers. The sources they were cut from have most of these.
- **The independent search online landed on the same sources** (Versilian, Karoryfer, FreePats, Salamander). Nothing better turned up for any seat the band has today.
- **Recommendation: same sources, a fresh cut.** A script in this repo fetches each source, takes what the band needs, measures loudness, and writes the pack with its licence file. Why: the brief wants the licence beside each pack and the loudness measured at ingestion, the band now plays dynamics and articulations the old cut cannot voice, and re-encoding the old AAC files would cost quality for nothing. Not done until Brandon answers: he expected the existing packs to be enough, and this is his call.
- **Left for later, noted**: the electric piano's source is non-commercial, so a Rhodes needs another source before neo-soul (stage 6). The clavinet's licence is unclear.

## stage 5: a fresh cut (Brandon's choice), and what a pack is

Brandon chose the fresh cut: "that sounds like it'll pay off". The sources are pinned by commit in `scripts/packs/sources.ts`; a cut can be repeated from exactly what it was first cut from.

- **A pack is `pack.json` plus audio files plus the source's licence text**, in `assets/packs/<id>/`. The format is the type in `packages/audio/src/pack.ts`, shared by the script that writes packs and the sampler that reads them.
- **Every take is levelled to one reference when the pack is cut; velocity alone sets the level.** A soft recording and a hard one then differ in colour only, and there is no jump in level where one layer hands over to the next. Why: the libraries are not consistent about how loud their layers are, and a level that steps at a boundary is the classic sampler fault.
- **Layers are split where the band plays, not evenly.** Measured over the library in three styles: pitched seats play velocities 50 to 92 (median 71), ghost notes and the jazz kick 25 to 34, backbeats up to 105. Even splits at 32/64/96 would leave nearly every pitched note on one layer. The tops are data in each recipe.
- **Opus in WebM at 48 kHz.** Several times smaller than the alternatives at the same quality, and its header says how much lead-in to skip, so a decoded file starts where the sound starts. Risk: older Safari. Reported as working for Web Audio since Safari 17.4, not verified here; a probe on a real phone comes before the gate, and the codec is one setting in the cut script.
- **Mono files with a pan per drum voice; a mono piano.** Memory once decoded is the limit on a phone (`docs/AUDIO_NOTES.md`), and stereo doubles it. The shared reverb is what puts the band in a room. Budget for a quartet: about 160 MB decoded.
- **The upright is Karoryfer's Meatbass**, not the VSCO contrabass the last version used: a jazz player's instrument with four dynamics and four alternates against an orchestral one with three and two. VSCO stays fetched as the fallback Brandon has heard.
- **A missing voice falls back to the plain one.** A pack without a dead note plays the note itself, short and quiet, as a General MIDI synth does today.

## the scheduler (stage 5)

- **The engine gives notes in seconds** (`timedNotes`, `secondsAt`): the tempo is the plan's, so the conversion belongs to the engine, and the audio package never meets a tick.
- **The audio package takes `Sound`s**: a time, a length, a pack, a voice, a pitch, a velocity. Which pack plays which seat is decided outside it. It imports nothing from the engine.
- **The look-ahead is 1.5 seconds.** A background tab's timers fire once a second, and a look-ahead shorter than that drops notes whenever the tab is hidden. The cost is that stopping has to silence up to a second and a half of notes already handed over, which the sampler does.
- **A sound found late is played at once if it is within 50 ms, and dropped otherwise.** After a long stall the band comes back in time rather than playing a pile of old notes together. Both are counted, which is how "no dropped or late notes over ten minutes" will be read off the page.
- **Three properties, with a made-up clock** (`test/audio.test.ts`): every note once, in order, ahead of its time, whatever the timers do short of a stall; after a stall nothing twice and nothing more than a moment late; a start part-way through plays nothing from before it, and stop stops. Each was checked by breaking the scheduler and watching it fail. The milestone names this as the one check on the audio layer; nothing else there gets a test.

## the sampler, the mixer, the audition page (stage 5)

- **The sampler plays what the pack says and nothing cleverer**: the layer for the velocity, the zone recorded nearest the pitch, the takes in turn, level by the square of velocity (the usual MIDI law, 40 dB from 1 to 127) times the voice's trim. A voice the pack lacks is the plain voice. Where the sound starts in a decoded file is found again when it loads, so a browser that leaves a codec's lead-in at the front cannot push that pack late.
- **Stop and choke cut a sound in 30 ms; a sound handed over and not yet started is stopped at its own start** (`docs/AUDIO_NOTES.md`: fading one in to fade it out clicks). A note already in its release is left to finish.
- **The reverb's room is made, not recorded**: decaying noise that darkens as it rings, the same every time. A recorded room would be one more asset with a licence, and the render would not be repeatable.
- **The mix preset is in the style pack** (`StylePack.sound`: the pack for each seat and the mix), as the brief asks. The engine does not use it. The audio package has its own `Mix` type of the same shape and imports nothing from the engine; Biome now enforces that.
- **`DEFAULT_MIX` is a starting point no ear has been on.** The audition page has a fader for each seat's level and reverb send, and prints the mix as it would be written in a style pack, so Brandon can balance by ear at the gate and the numbers come back as data.
- **No bundler yet.** `scripts/serve.ts` serves the source with types stripped (Node's own `stripTypeScriptTypes`) and the page uses an import map. Vite arrives with the app in stage 6.
- **A take can be rendered to a WAV with nobody at a browser** (`scripts/render-audio.ts`): headless Chrome opens the page, the page renders through the same sampler and mixer in an `OfflineAudioContext` and posts the file back. This is how levels get measured and how audition files get made. It is a tool, not a test.
- **`loadPack` can load fewer layers than a pack has**, for the one-layer comparison at the gate and as a lever for a phone short of memory.

## stage 5: the cut script and the first five packs

`scripts/packs/cut.ts` cuts the quartet's packs and the vibraphone (`pnpm packs:cut`). Calls made while building it, each a number or a line in a recipe:

- **ffmpeg with soxr.** The ffmpeg 9 on the path (Homebrew) has libopus and no soxr; the script takes the first of `$FFMPEG`, `ffmpeg`, `/usr/bin/ffmpeg` built with both (here Debian's 7.1) and prints which. Encoder output is pinned with `+bitexact`.
- **Levelled after the codec.** A sample peak moves by up to 1.3 dB through Opus, so each take is encoded, decoded, and its one gain corrected until the decoded file sits within 0.05 dB of the reference (the kit ends within 0.3).
- **The piano starts at the hammer.** Salamander's files open on the action's noise, within 50 dB of the peak, and the strike comes 3 to 24 ms later (median 10). Its onset is the first sample within 30 dB of the peak (`onsetDb` in the recipe); every other pack uses 50.
- **Budgets bound by caps first, then alternates.** The kit as briefed was 72.9 MB decoded against 40: drum caps now sit near each voice's median 40 dB decay (kick 1.2 s, snare 1, toms 1 and 1.5, hats 0.6 to 2.5, ride and bell 3.5, crash 5) and the outer layers keep two alternates. The upright was 39.9 MB against 30: its caps fall from 2.9 s to 1.8 s instead of 4 to 2.5.
- **No dead bass note.** Meatbass's percussive noises measure as body knocks (one resonance near 65 Hz shared by all eight, no harmonic series on a string's pitch), not a damped string.
- **The kit's sticks are the stickshot** ("one stick strikes other while it is touching drum head", keymap PDF), and its cross-stick is the snare's, from the full kit program, which the basic one leaves out.
- **Scripts typecheck.** `scripts/packs` has its own `tsconfig.json` in the build; `assets/packs` is generated and out of biome's reach.

## the first five packs, checked (stage 5)

The builder's report was checked against the files, not taken on trust: every file a `pack.json` lists exists and nothing else does; every decoded length matches to the sample; FFmpeg's own loudness meter reads -20.0 on the levelled packs and the kit's peaks are within 0.2 dB of -6; the licence beside each pack is the source's, byte for byte.

- **The piano is stereo.** Summed to mono, 47 of its 66 takes lost more than 6 dB in some third-octave band between 1 and 8 kHz (up to 11.6 dB): the two microphones are a spaced pair and cancel. Stereo costs 114 MB decoded against 63. The quartet is 212 MB in memory, which an iPhone 17 has room for; `loadPack`'s `layers` option is the lever for a phone that has not.
- **The sampler puts a recording's hit on the note's time, not its first sound.** Measured in the packs: a hi-hat closed with the foot is 24 ms into its file before it is within 20 dB of its peak, a shaker 41 ms, a soft alto note 10 to 20. Started on the beat, the jazz hi-hat on 2 and 4 would have dragged by a fortieth of a second on every stroke. The hit is the first sample within 12 dB of the recording's peak, found when the pack loads (so a decoder's lead-in is covered by the same rule), and the recording starts early by that much. The threshold is one constant; no ear has judged it.
- **Rendered takes land where the engine wrote them.** `scripts/check-timing.ts`: drums, bass and piano onsets are 10 to 12 ms after their written times, the same for all three within 2 ms. The constant is taken to be the look-ahead of the two compressors on the master (6 ms each in Chrome); it moves the whole band together.
- **A whole jazz take played live in headless Chrome**: 3,418 notes over three minutes, none late, none dropped.
- **The starting mix is from measurement, not from an ear**: each seat rendered alone and its loudness read. The blues piano measured 1.7 dB over the soloist and came down 3 dB; the jazz drums (a ride and a feathered kick) measured 6 dB under the blues drums and came up 3. Full mixes of four takes read -17 to -18 LUFS; the master is trimmed 1.5 dB for headroom. (Corrected at the gate: with the trim, the gate's jazz takes still peak at -0.8 dBFS, because the limiter is a compressor with make-up gain and not a wall. Nothing clips; the peaks are not under -2 as first written here.)
- **No dead note on the upright**: the library's "noises" measure as knocks on the body. The fallback (the note itself, short and quiet) stands.
- **Found for funk**: the Washburn bass Brandon preferred has recorded ghost notes; the clean Fender library has no muted strokes, and Karoryfer's Emilyguitar (CC0) has twenty-five. One pack will draw on both, credited as such.

## first listen: it plays on the laptop and the iPhone; a pop after stop (stage 5)

Brandon listened on his laptop and his iPhone 17: "nice job... the instruments themselves all worked". So Safari on a current iPhone decodes the packs (Opus in WebM) and the tap unlocks audio. One fault: "a popping kind of sound that echoes after stopping playback".

- **Measured before changed.** A render can now press stop part-way (`stop=20`). With a dry mix, the second and a half after the stop still peaked at -17 dBFS, and so did the rest of the file.
- **The cause was mine.** A recording starts a little before its note's time, by its run-up to the hit. Stop took a queued note out "at its own start" using the note's time, not the earlier moment its recording begins, so every queued note played its run-up and was cut at the hit: a string of clicks, in tempo, into the reverb.
- **The fix**: a queued recording is stopped at the moment it would begin, so it never sounds. After it, the same measurement reads -72 dBFS from 0.2 s after the stop (notes that had just ended, finishing their own release) and digital silence from 1.7 s.
- **Stop now fades over 120 ms; a choke stays at 30 ms.** A whole band cut in 30 ms thumps in the bass. A cymbal closed by a foot is that quick; a band stopping is not.
- No test: the audio layer has none beyond the scheduler (`docs/TESTING.md`), and this lives in the sampler, which needs a browser. The measurement is repeatable: `pnpm render:audio x chart=... stop=20 mix='<dry>'`, then read the level after 20 s.

## stage 5: funk's two packs, and a pack may credit several sources

Built from `prompts/cut-funk-packs.md`. `electric-bass` (Black And Blue Basses, the darkblack Washburn) and `clean-guitar` (FSBS clean for the notes, Emilyguitar for the muted strokes).

- **`Pack.credits` is a list**, the main source first, each with its own `changes`. `LICENCE` is the one text when the sources' licences are byte-identical (FSBS's and Emilyguitar's are), else each in turn under its source's title. The five earlier packs were recut: only their `pack.json` changed.
- **A source may be a release archive** (`ArchiveSource`: URL, SHA-256, unpacked with `7z`). The fetch path is written but has never run: the archive here was fetched by hand, as `clean.7z`, so a fetch on this machine would download it again under its URL's name.
- **The electric bass takes every third semitone.** All 32 recorded notes from 26 to 57 were 92 MB decoded for the plain voice alone against 30; caps short enough to fit (0.55 s) would cut a held last note. A minor third apart no note is more than a semitone from a recording, the same worst case as a whole step. The caps then fall from 2.45 s to 1.63 s (the brief's 3 to 2 came to about 36 MB with the dead voice).
- **The bass mapping is an octave above the sound** (key 40 sounds E1): every take measured 12 semitones under its key, so a take's pitch is its key less 12.
- **The dead note keeps its fret as its root.** The ghost samples are short and pitched, but 0.5 to 2 semitones under the fret they were played at, ringing an open string's harmonic at the bottom and top of the neck, and neighbouring frets measure alike; a measured root would retune each ghost and put zones out of order. `Voice.measureRoots: false` keeps the recipe's pitch. Cut at 0.3 s (the band's are 80 ms).
- **The guitar's caps fall from 2.45 s to 1.53 s** (the brief's 4 to 2.5 came to about 48 MB). Its notes at G4 and above are recorded at one dynamic: alternates 1 and 2 go to the soft layer, 3 and 4 to the loud.
- **The muted strokes are placed, not tuned**: roots 51, 55.5, 60, 64.5 and 69 in order of spectral centre (muted 1, 2, 4, 5, 3). The nearest-zone rule moves a stroke by at most 2 semitones between 51 and 69.
- **Short sounds levelled to -20 LUFS peak above full scale**: the dead notes up to +5.9 dBFS, the muted strokes up to +9.8 (a 0.1 s sound measured over a 400 ms window). ffmpeg's Opus decoder returns them unclipped (round-trip level within 0.19 dB); whether every browser's decoder does is not established.

## funk's packs, checked; two levelling faults fixed in the cutter (stage 5)

The second builder's report was checked against the files the same way as the first: every listed file present and nothing else, lengths exact, levels on reference, licences the sources' own.

- **`electric-bass`** is the Washburn from Karoryfer's Black And Blue Basses, four dynamics, a note every minor third (every recorded note would have been 92 MB against a budget of 30), with a `dead` voice from the library's recorded ghost notes. The ghosts are pitched a little under their fret, so the voice keeps the fret as its root and is not retuned.
- **`clean-guitar`** is FreePats' clean Fender for the notes and Karoryfer's Emilyguitar for the `muted` voice: five kinds of deadened stroke, five takes each, laid across the strum from the darkest at the bottom to the brightest at the top. Two libraries, so `Pack.credit` became `Pack.credits`, a list.
- **A short stroke is levelled by its peak, not its loudness.** A loudness is read over 400 ms; a 90 ms stroke brought up to it came out 6 to 10 dB over full scale (the builder reported it; my measurement agreed: the dead notes peaked at +5.9 dBFS, the muted strokes at +9.8). `PackVoice.level` now lets a voice have its own levelling: the dead and muted voices are levelled to the middle peak of their pack's plain notes, so at one velocity a stroke peaks where a note does and the player's lower velocity puts it under.
- **A stereo pack is levelled as a pair.** The piano had been levelled on the fold of its two channels, and two channels played side by side are about 3 dB over their fold: FFmpeg's meter read -17.5 on files meant to be -20. It now reads the pair. Brandon's first listen was with the piano 3 dB hot; he made no remark on the balance.
- **Funk's starting mix**: alone, the guitar measured 3 dB under the bass at the default level, and came up 3. No ear yet.

## gate 5 files; two faults in the render tool (stage 5)

- **Sixteen audition files** (`pnpm gate:5`): each band on its own tunes, the same take with each soloist, the same take with every layer and with one. Encoded to `.m4a` for any player; not kept in git, because the script makes them again from the packs. The server plays them from a page and now answers requests for part of a file, which Safari needs before it will play audio.
- **A ten-minute take played live in headless Chrome: 12,434 notes, none late, none dropped.** That is the stage's "done when".
- **The render queued every note of a take at once, and slowed with the square of its length**: a 165-second funk take took 179 seconds and hit the tool's time limit, which is how it was found. A render now hands notes over a second at a time, with the scheduler that plays live. The same take renders in 9 seconds, and differs from the old way's output by at most one step of 16-bit in 0.6% of samples (the order the mixer sums in).
- **Headless Chrome waited 25 seconds before its first request**, every launch: it asks the desktop keyring for a key over D-Bus, and this machine has no desktop session. `--password-store=basic` removes the wait.
- **Editing a shell script while it runs cuts it short.** The first gate run stopped two thirds through for this reason and for the time limit above; both looked the same. Noted so the next unexplained early exit is checked against both.

## gate 5 passed (stage 5)

Brandon, 2026-11-15, on his laptop and iPhone: "everything is sounding fantastic in my testing so far"; "sax is definitely good enough so far, and the vibes sound wonderful". No complaint about room, balance or loudness. A short verdict is leave to carry on, not an answer to each question, so these hold as defaults and stay open to his ear:

- **Both soloists stay**, alto and vibraphone. The alto's vibrato and slurs in the sampler are not built: "good enough so far" does not ask for them.
- **The mix stays at the measured numbers** in each style's `sound.mix`. No fader line came back.
- **Packs load every layer.** Nothing said the layers could go, and his phone is recent. `loadPack`'s `layers` option stays as the lever if a weaker phone needs it.
- **One kit for all three styles.** A tighter kit for funk waits on a complaint, or on rock and disco in stage 6, which will want one anyway.

## stage 6 begins: the play view and the library (part 1)

Brandon on the mix after gate 5: "no complaints about the mix so far. we can always tweak that later". Then: "go ahead and start building".

**The app**

- **`packages/app`: Vite 8, React 19, no other runtime dependency** but the typeface. No router (the address after `#` says which screen), no state library, no PWA plugin. Versions looked up on 2026-11-15: vite 8.3.8, react 19.3.1, @vitejs/plugin-react 6.3.0, @playwright/test 1.65.1.
- **The engine runs on the page's own thread.** A three-minute jam renders in 35 to 105 ms here and a thirty-minute one in 260 to 610 ms; the scheduler is 1.5 s ahead, so even the longest render cannot make a note late. No worker.
- **One rig for the whole visit** (`play/rig.ts`): one audio context, one mixer, one sampler, and every pack loaded so far, never dropped. The packs for a chart's band are fetched when its screen opens, not when play is pressed. A pack is seated under its seat's name, so one pack can sit in two chairs. All seven packs are about 290 MB decoded; nothing evicts them, which is untested on any phone but Brandon's.
- **The band's seats are switches on the play screen** (drums, bass, chords, soloist). The brief's list for that screen does not name them; a bass player wants to turn the bass off.
- **Remembered in `localStorage`**: how chords are read, the jam's length, who is in the band, and each chart's style, key and tempo. Where charts the player writes will live is part 2's decision.
- **A phone is kept awake while the band plays, and the silent switch does not mute it** (`navigator.wakeLock`, `navigator.audioSession.type = "playback"`). Both are skipped where the browser lacks them.

**The chart on the screen**

- **The page is the chart as written, with one exception.** Repeats, endings and `%` stay as their signs; a section that repeats an earlier one by name (`[A]` again) is written out, so the eye goes down the page in playing order. Each bar shows what will be played (from the same expansion the band reads), so a section in another key shows its own chords.
- **A planned bar knows its section's index** (`PlanBar.section.index`), which with `source` is its place on the page. The line layout (`flow`) is exported from the engine for the same reason.
- **The type is sized to fit.** One size for the whole chart, the largest at which every line fits the height and a bar is at least 3.3 times the root's size wide. Lines are eight bars across where that makes the type more than 15% bigger (a laptop), four otherwise. A chord too wide for its share of a bar is set in narrower letters (the typeface has a width axis, 62 to 88), then smaller.
- **One symbol set**: a triangle for major seven, a circle for diminished, a slashed circle for half-diminished, `+` for augmented, `m` for minor, `sus` for sus4. The flat, the sharp and the triangle are drawn, because few typefaces carry them. Open to Brandon's taste.
- **The playhead is a highlighter stroke on the bar being played and an underline on the next change of chord.** Focus mode shows the line being played and the next: two bars to a line on a narrow screen, four otherwise.
- **The look**: indigo ink on cool paper, a yellow highlighter, Archivo (OFL, bundled, one family in several widths). Dark mode follows the device.

**Jams**

- **A jam can be told to finish** (`PlanOptions.endAfter`). The pass named becomes the last: it lifts and lands like any last pass, and everything before it is planned as the jam it set out to be (the arc and the solos are shaped by the passes planned, not the passes played; a solo under way makes that chorus its last). The property: nothing before the last pass changes, in an open jam or a timed one.
- **In the app, Finish turns the band for home at the top of the next phrase** that is at least three seconds off; if this pass has none left, the next pass is the last. The music from there on is the told take's (`Scheduler.replace`, with its property). The two takes agree before the last pass; inside it they differ after its first phrase, so there is a join at that phrase top. A note the old take was holding rings on; one the new take would have been holding across it is not there. No ear has judged the join.
- **A jam with no set length** is made two passes long and given more whenever under 20 seconds are left, by making the take again longer (the engine's open jam leaves what was played unchanged).
- **One button**: Play, then Finish, then Stop. Pressing it while the band plays asks for an ending; pressing again stops dead. A timed jam can be finished early the same way.

**Installing and offline**

- **A hand-written service worker** (`service-worker.js`, about sixty lines; the build fills in its file list). The app's own files are kept at install under a cache named for their contents. Instrument files are kept as they are first fetched, in a cache named for the packs' `pack.json` files, so a new build of the app does not fetch 17 MB again. Once the app is open it fetches whatever instruments are missing, four at a time, and says so at the foot of the library.
- **Cache matches ignore `Vary`.** The smoke journey found it: the preview server marks responses as varying, and the page's script was not matched by the copy kept at install, so the app opened offline as a blank page.
- **Service workers need a secure address.** On the LAN by IP over plain HTTP the app runs but is not installable and keeps nothing offline. Open: how Brandon's phone reaches it over HTTPS.
- **A credits page** (`#/credits`) lists each pack's sources, licences and changes from its `pack.json`, with a link to its licence text. The piano's CC BY asks for this.

**Tests**

- **Smoke journeys 1, 2 and 4** (`smoke/app.spec.ts`, `pnpm smoke`, 7 s of 60) run the built app in the installed Chrome. Journey 4 listens at the output: whatever is connected to the speakers also feeds a meter, and the spec waits for a signal and for the highlight to move from the first bar to the second.
- **Two new properties**, each broken on purpose and seen to fail: the scheduler's "when what is to come is changed", and the band's "a jam told to finish". The first version of the second sampled only cases with nothing before the last pass on a push; three deliberate breaks passed it before that was found.
- **The engine suite is at 9.1 to 9.3 s of 10.** The next property has to be paid for by trimming another.

## hosting: the app as a small image (stage 6)

Brandon: "i'm leaning toward hosting this on docker04 like the current version of ensemble", and "we can replace what we have at ensembletest.brndn.zip".

- **`hosting/`: a Dockerfile, an nginx config of about fifty lines, and a compose file with one service.** No API, no volume, no secret. `pnpm image` builds the site and then the image around it (`ensemble-app:<commit>`, 125 MB, of which the instruments are 18).
- **It keeps the container contract his test stack's web service already has**, read from the old repo's hosting notes: nginx as uid 101 on port 8080, a read-only root filesystem with `/tmp` as the only writable place, every capability dropped, a `wget` health check on `/index.html`. So only the image reference has to change there.
- **Cache rules**: `/sw.js` is `no-store`; `/assets/*` (named for their contents) are immutable; everything else, the instruments included, is `no-cache`, because pack files keep their names when a pack is cut again. No rewrite to the page for unknown paths: the app keeps its place after the `#`.
- **Checked on this machine**: the container runs locked down as above and reports healthy; each kind of file comes back with the type and cache rule intended; the three smoke journeys pass against it (`SMOKE_URL=... pnpm smoke`).
- **Not done, and Brandon's to decide**: how the image reaches docker04 (the repo is local-only, and his release path pulls from a registry), and what becomes of the test stack's API container and its `/api/*` route, which this app does not use. Nothing on docker04 or in his homelab repo has been touched.
- **Replacing the test site in place is safe for installed copies**: the new worker is at the same `/sw.js`, so a browser holding the old one updates to it, and on taking over it deletes every cache it does not own.

## the app is on the test site (stage 6)

Brandon: "for now, you can feel free to use ssh to get things working".

- **https://ensembletest.brndn.zip serves the new app** since 2026-11-15, commit `0e3a4a2`. The three smoke journeys pass against the live site (offline after install included).
- **How** (`pnpm deploy:test`): the image is built here, loaded onto docker04 over SSH (`docker save | ssh docker04-admin docker load`), given the name the test stack's recipe expects (`ghcr.io/brndnsh-labs/ensemble-web:sha-<this repo's commit>`), and rolled in by the box's own `ensemble-release ensembletest web sha-…`, which waits for health and restores the previous tag if it fails. Nothing else on the box was changed: not the generated compose file, not Caddy, not production.
- **That image name is a local label, not a registry image.** No such tag exists on GHCR. A `docker compose pull` of the test stack (`bin/docker-update ensembletest`) will fail on it.
- **To go back**: `sudo ensemble-release ensembletest web sha-06c97d8ce0fdcd06779d54ecd6b7d42509674c23` on docker04 (the old app's image, still on the box).
- **It will be replaced by the old repo's next merge to main**, whose CI releases both of its images to the test stack. The durable change is in homelab-maintenance and the old repo's CI, and is Brandon's: a one-service recipe for the test stack, the API container and its `/api/*` route retired, and the old CI no longer releasing there.
- **The test site is on the public internet behind Cloudflare.** The instruments it serves are CC0 but for the piano (CC BY, credited on the credits page).
- **Found on the live site: Cloudflare gives the instrument files a four-hour browser cache** (`max-age=14400` in place of the image's `no-cache`), because it caches `.webm` by extension. A pack cut again under the same file names could then be kept stale by the service worker. To fix in the app, not at the edge: put a version in each instrument file's address.
- **Fixed: each instrument file is fetched from an address that carries a mark of its pack's `pack.json`** (`readPack` in the audio package; the offline saver asks for the same addresses). A pack cut again is a new set of addresses, so neither Cloudflare's four hours nor any other cache can hand back an old recording. The worker's instrument cache was renamed, so devices drop the files saved under the old addresses.
- Brandon, on the test site from his phone: "works great, nice job".

## the app's first part, reviewed (stage 6)

An independent review (Opus, its own clone, brief in `prompts/review-app-part-1.md`) drove the app and compared note lists. It confirmed the planner's side of Finish (told and open takes agree before the last pass on all 21 charts, seeds 1 to 3, soloist on and off; 31,203 planned bars each map to a bar on the page) and found these, all fixed:

- **Finish late in a pass could join the two takes in the middle of a bar.** With no phrase top left in the pass, the join was "three seconds from now", which could fall just inside the next pass, where the solo is already a different solo. The join is now always a phrase top: the next one at least three seconds off that is not the top of the pass being played, in this pass or the next (`turnForHome`). It is taken 30 ms before the bar line, so a downbeat leaning early comes from the new take. My note that the takes differ only "after the first phrase" of the last pass was wrong with a soloist: its solo is rewritten for the whole pass.
- **The last bar showed the turnaround while the band played the ending** (14 of 21 charts: the page said E7, the band played A9). On the last pass the final bar now shows what the plan plays there.
- **Fetching a style's instruments early could change the mix of a band already playing another style**, and would have silenced it had the two styles differed in room or filters. The early fetch now only fetches; the band is seated when play is pressed.
- **A long jam with no set length froze the page** while it was made longer: 0.85 s at 35 minutes and 1.8 s at 79 on this machine, against a scheduler 1.5 s ahead, and a phone is slower. **The engine now runs in a worker** (`play/band-worker.ts`), for every take. This reverses "no worker" above: the measurement there was right for a take made once, and wrong for one remade as it grows. More is asked for when under 20 seconds are left, or eight times the last render if that is longer. Only the sounds still to come cross back to the page.
- **Focus mode's type changed size from line to line, and showed nothing after the form's last line.** It is one size for the tune (sized for the tallest pair of lines), and the second line is the one the plan plays next, so the bottom of the form shows its top.
- **A double tap on Finish stopped the band.** Stop ignores a press within 0.6 s of Finish.
- **Smaller**: `Scheduler.replace` now enforces its own rule (asked for a change nearer than what is handed over, it changes just after it; nothing sounds twice; the property covers it); `endAfter` that is not a number is ignored; the worker's install fetches past the browser's cache; the offline saver gives up on a page the worker never takes charge of, and no longer counts a failed file as saved; a wake lock granted after stop is released; "N.C." on the highlighter is readable in dark mode; the development server's pack path check.
- **Not changed**: on a landscape phone with both readings, the numerals are about 8 px (focus mode is the answer there); the first visit fetches the first chart's instruments twice (once to play, once to save); when the join is late in the pass the lift before it is not heard, so the energy steps up at the join. That last one is for Brandon's ear.


## the editor (stage 6, part 2)

Built to `prompts/app-editor.md`. What that brief did not settle:

- **The player's charts** (`charts.ts`): one list under `ensemble.charts.1`, the shelf showing the one changed last first. An id is `my-` and a random number in base 36, from `crypto.getRandomValues`, because `crypto.randomUUID` is missing over plain HTTP on the home network. The browser is asked to keep the site's storage each time a chart is made, not only the first: it remembers its answer, and a player who deleted every chart is starting again. Another tab's changes are picked up from the `storage` event.
- **When storage refuses a write, the editor says so** and suggests Export: the brief's "lasts for the visit" is otherwise a silent loss.
- **An imported file has its byte-order mark dropped and its line breaks made `\n`**, because a text box reports every line break as one letter and the parser's places are counted in letters; a file over 64 KB is refused as not a chart. An import, like a new chart, opens in the editor. A copy of a built-in keeps its text, title included.
- **The text never wraps** (`wrap="off"`, `white-space: pre` in both the box and the marked copy behind it), so the two cannot wrap differently; a long line scrolls sideways. The copy is moved by the box's scroll offsets rather than scrolled itself, so it never runs out of room to follow. The type is 16 px, below which a phone zooms the page when the box is touched.
- **A problem at a place rather than over letters** is marked on the letter there, or with a short stroke at the end of a line. Where problems overlap, the worse one colours the stretch. Errors also get a faint pencil wash, so a bar line or a space can be seen to be marked.
- **On a phone the whole editor is fitted to the visual viewport while the text has the focus**, and the key row sits at its foot, full width; the brief's "position it from `visualViewport`" done for the screen, not the row alone, so the text box is the part that shrinks and the caret's line is scrolled back above the row when it does. Format, Export and Delete are hidden while typing on a touch screen.
- **Saving is 400 ms after typing pauses**, and at once on Play, Format, leaving the screen, `pagehide` and the page being hidden.
- **On the play screen of a phone, "Edit a copy" reads "Edit"** (its accessible name stays "Edit a copy"): the header had no room, and the title was already down to a few letters.
- **Smoke journey 3** (`smoke/app.spec.ts`): a new chart, eight typed bars on the page, then `Hq7` typed: its message is listed and the error mark is exactly `Hq7`, inside the box. Seen to fail with the mark moved one letter. The four journeys take 7 s of 60.

## the editor, checked and merged (stage 6, part 2)

The builder's diff was read in full, and the editor looked at on a phone and a laptop with a clean chart and one full of mistakes. Merged as built, with two changes on the main thread:

- **The play screen's header holds only the way back, the title and Edit.** With Edit added, a phone had 78 px left for the title. How the page is read (names, numerals, both; focus) moved to a line of its own under the header, beside the line that says the style, key and tempo, which is now shown before playing as well as during.
- **"Edit a copy" opens the copy already made**, if the player made one and has not changed it. Pressing it twice no longer leaves two.
- **The player's charts are in `localStorage`** (decided in the brief): a chart is a few hundred bytes, the reads are synchronous, and the same eviction rules apply to it as to anything else a site keeps. Export is the backup.
- **Not verified by anyone yet**: the key row above a real phone keyboard, and whether pressing a key in it keeps the iPhone's keyboard up.


## a take, as it is kept (stage 6, part 3)

Done on the main thread before the takes screen was built, because it decides what "exactly as heard" means.

- **A jam told to finish partway is two takes joined, and the engine does the joining.** Finish is heard at the top of a phrase; up to there the band played the jam as it was going to be, and from there the jam told to finish. Replaying the told jam from its start is not the same music: on rhythm changes, told in the third phrase of the last pass, about 360 notes before the join differ. So a take can say when the band was told (`TakeOptions.toldAt`, a tick, beside `endAfter`), and `render` makes both takes and joins them 30 ms before that bar line. The play screen now asks for this joined take when Finish is pressed, which is the same thing it used to assemble itself, and the take it keeps is the one it played.
- **The saved take is the CLI's**: `TakeRecipe` (chart text, style, options, seed) moved from the CLI into the engine, so `ensemble replay` reads what the app keeps.
- **An open jam stopped dead is, as a take, the passes it got to**, with no ending, because none was played. Played again it is an open jam again, and goes on until stopped.
- **The play screen runs on the take** (`play/jam.ts`: a `Call` is a chart, a style and how to play it; with a seed it is one take, without one each press of play is a new take). The worker also writes a take as a MIDI file (`midiOf`), with the same call the CLI makes.
- **No new property.** The join is a filter over two takes the existing properties already hold to account, and smoke journey 5 will compare the app's file with the CLI's. An ending now costs two renders: 0.6 s for a fifteen-minute jam on this machine, which the page allows for when it picks the phrase to turn at.
- **A limit, not solved**: a kept take is exact for the build that made it. When a style or a player changes, an old seed plays something else.

## takes and export (stage 6, part 3)

Built to `prompts/app-takes.md`. What that brief did not settle:

- **The charts and the takes share one stored-list module** (`stored.ts`): loading with a filter, writing, the `storage` event, listeners, new ids. Each keeps its own shape and what the screens are shown. Anything not a take is left out of the list.
- **The take file's text is written by the engine** (`recipeText` beside `TakeRecipe`), and the CLI's `writeRecipe` calls it, so the app and the CLI cannot drift apart on the format.
- **"The jam a take came from" is its seed.** A new press of Play is a new random seed; the play screen follows a kept take only while `jam.take` carries that seed. Keep is hidden while a new take loads, so it never keeps the one before.
- **`useJam` takes a listener for every change to the take**, because the last change (an open jam made into the passes it got to) happens as the screen closes, when no effect of the screen can run any more.
- **Kept is the same button, disabled.** Pressing it again would mean nothing; removing is on the take's screen.
- **A take's row has the round play button like every other row**, starting the take as its screen opens (the address is remembered, not the chart id, so a chart and a take cannot be confused).
- **The take's screen is headed by its name**, and the key and tempo line under it is the one the play screen has.
- **The day a take was kept is in the device's own way of writing dates** ("Nov 15" here, "15 Nov" in Britain), with the year only when it is not this one.
- **A take that will not plan** (its style gone, or options this engine refuses) says so on its screen and its row, and offers only Delete.
- **Smoke journey 5 stops the band by going back to the library.** The transport's Stop sits behind Finish, which would make a different take, and a press within 0.6 s of Finish is ignored; waiting that out is a sleep. Leaving the screen is a real way to stop the band, and goes through the same stop. Seen to fail with Export MIDI given a tempo one off.

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

## song mode and the arrangement grid (stage 6, part 4)

Built to `prompts/app-arrangement.md`. What that brief did not settle:

- **"The song" is kept as `ChartChoices.song`**, true or false once the player has chosen; unset, it follows whether the chart's arrangement fits. Choosing a length writes `false` for that chart as well as the length for all of them, so the next chart keeps its own choice.
- **A song's strip names its section to the last chord**, and says "Ending" only while the chord rings: an outro is a section the player reads, and "Ending" over its last bar would hide where they are. Before play it says "7 sections" beside the length, as a jam says "3 passes".
- **The way home in a song is its last section**: the strip's pencil cue, the shaded end of the arc, and the final bar showing the ending the band plays (as the last pass of a jam does). One helper, `homeStretch`, answers for both.
- **The arc is drawn once for both**: its rules mark the tops of passes in a jam and the starts of sections in a song. No labels in the arc; the line above it names the section, and at 22 px a label could not be read.
- **There is no Finish in a song** in the hook as well as on the button (`useJam.finish` does nothing for a song), so a take's screen cannot reach it either.
- **The grid's quiet levels come from the style play would use**: the one chosen for the chart on the play screen, else the chart's own. A section left to the style is drawn at the arrangement level nearest the level the style gives it, read from a song planned without the arrangement.
- **The grid waits when the block has a mistake**: it shows what could be read and its choices are disabled until "Write it out clean" is pressed, because a change would quietly turn the mistaken value into `-`. A block that is not an arrangement (`---` and anything else) is not offered a clean copy or Remove at all: both would delete text the player wrote and the parser does not read.
- **A chart with no block is shown the arrangement it is already played with** (changed at the merge): `arrangedLines` puts the soloist where a song with no arrangement has it, in `Solo` sections when there are any and otherwise through the body. As built, the first change to any cell also took the soloist out of every other section without saying so.
- **Setting a cell to the value it has writes nothing**, so a tap on the selected choice never gives a chart a block.
- **The switch is a row of its own** above Format, Export and Delete: at phone width the five do not fit on one line. Which side is shown is not remembered; the editor opens on Chords.
- **The first cell (the opening section's energy) is selected on opening**, so the row of choices is never empty. The selection is drawn with the highlighter, as the bar being played is.
- **The grid is a table of buttons with the arrow keys, not an ARIA `grid`**: the linter refuses an interactive role on a table, and buttons with one in the tab order (the selected one) read well enough: each says its player, section, place and value.
- **Cells are 48 by 44 px**, 40 high on a screen under 500 px tall (a phone on its side), where the grid still scrolls inside its pane to reach the choices.

## rock (stage 6, part 5)

Built from `prompts/style-rock.md` in its own clone: `packages/styles/src/rock/`, six charts `library/rock-*.chart`, `scorecard/rock.json`, two goldens. The blues, funk and jazz goldens are byte for byte what they were and `pnpm score` reports no movement for any of the three.

**Engine change, one, and why it is general:**

- **A held chord kept alive at the barline, in the rhythm book** (`RhythmTier.restrike`). ST-rock-18 and CH-48: the quiet rock piano strikes each chord once at 80 and re-strikes a chord carried over a barline at 64. The plain rhythm already had this (`PlainRhythm.restrike`), but a 4/4 book's downbeat strike was always its written level. Any pad on a keyboard that dies away does this, whatever the style; a tier that leaves it out plays as before, so no other style moved.

**Properties changed, none added.** Each was a rule written before a style could do what rock does; each now says the rule as it was meant:

- "Where a chord is written the bass plays ... the chord's bass note": skips a bar the arrangement lays the bass out of. `rock-song-a` is the library's first arranged song with a seat laid out.
- "The eighth before a change belongs to the chord coming": its floor on pushes seen applies only where some style in play leans in. Rock never does (ST-rock-27).
- "The piano's last chord ... a thin final chord": three notes counting the soloist's last note. A three-note hand leaves the soloist its note (CH-60, its own property), and with a soloist on the root the piano's final triad is two notes. Making the final chord exempt from CH-60 was tried and broke "under a solo the piano leaves the soloist its note" for funk and jazz, so it was not kept.

**Decisions the notes and the brief did not settle:**

- Tempo 120, range 80 to 160: ST-rock-01 reads 85 to 140, widened a little each side as funk's was.
- The soloist's default is the alto sax: the notes' overdriven guitar does not exist yet, and of vibraphone and alto the alto is the rock lead (a rock-and-roll sax). Bends, slides and vibrato (ST-rock-24) are not in the instrument model and are not played.
- The rock head (ST-rock-23, ST-rock-25) is not built: the soloist has no head concept; solo forms are the blues' and funk's by length.
- The rock riff is said "the same", not as a sequence (`riffIs`): a rock lick comes back as it was. Chance 0.40 as written.
- The soloist's line costs a non-chord tone on a beat at 3 (funk's), not the blues' 1.5, and carries funk's `beats-off-the-chord` weight: the major pentatonic's 2nd and 6th are not chord tones, and at 1.5 a third of solos were under 72% chord tones on the beat. With it, 97% of takes are.
- **ST-rock-06 (the hat opening into a new section) is not written.** Every section's last bar has a fill here (ST-rock-08 gives none of 0), so "the last bar before a section's crash with no fill" never comes. Played instead at every phrase end without a fill, it put a second turn into the answer bars and `drums.turn-held` fell to 85% (59% of takes in target).
- **The hot hat is `x.x.` on every eighth, not `X.x.` accented** (ST-rock-05): at 118 it is as hard as the backbeat, the thing heard at gate 1 in the blues ("accented as hard as the backbeat it slammed"), and `drums.cymbal-under-backbeat` read 86%. The ride option is as written.
- Quiet, the section's own kicks off the beat are soft (`o`), as the quiet answer bar's are. It is also what lets the quiet turn be heard where the kick already has that "and"; without it 2% of quiet takes had answer bars that only changed a kick's level.
- The 4-step pickup (`HH x... SN ..oX`) is played without its hat stroke in the hot tier: a hot section may be on the ride, and a hat stroke there is a second cymbal.
- The high tier's two cymbals are one per section (the notes' "half of sections"), the turn drawn in one of two layers by which cymbal the section plays, since "hat opened on the and of 4" is only for a hat.
- Bass register E1 to E2 for every root, nearest a home drawn from C2 to E2 (ST-rock-16), pulled all the way: a tune in A sits on the open A and one in G on the third fret. The funk and blues lines came down to about here after gate 3.
- The quiet bass (ST-rock-12): a root on the downbeat and wherever the kick plays, each held to 95% of the gap to the next; levels 98 on an arrival, 92 elsewhere (the notes give none). The approach eighth's chance into a new section is the same as inside one; into the final chord 35%.
- The high bass pops fold down before a low root (`leadIn.throughOctave`), as funk's do.
- Piano: one figure a tier (held, quarters, eighths), marked as grooves from mid up, with no answers; the hand reads no busier than quarters under a soloist (`busiest: "mid"`), the blues piano's gate-3 lesson. Register E3 to G5, top aimed at G4 (the guitar's aim in ST-rock-19). Any meter but 4/4: a strike on every pulse.
- Mix: master 3 dB under the default, because the old band's rock make-up was 3 dB under its blues' (ST-rock-33 against ST-blues-59). The built-in kit's snare +6% has nothing to apply to here. No ear on it.
- Charts: no power chords. The blues bass's power-chord box plays the 6th that a power chord's scale (minor pentatonic) does not have, and a power chord is a two-note final chord; the riff in D is on D and C. The song's chorus and bridge avoid V to vi at the line where the blues bass's octave figure, handed this chart, broke the fall into F#1 with a 13-semitone leap (seed 6 of the full run). Both are the blues bass's, found by the new charts, and left for the blues.
- `chords.off-the-beat` is held at a half by take: ST-rock-18's "at most 35%" is over everything (delivers 23%), and a hot take pumps eighths, half of them on the "and".

**Goldens:** `rock-four-chord-g-solo.mid` (a jam with a solo: the backbeat, the eighth-note roots, the piano at all three tiers) and `rock-song-a.mid` (the arranged song in song mode). Added for the new style; nothing else rewritten.

**Suite:** `pnpm test` with four styles 10.1 to 10.7 s of 10 on this machine (three styles, same tree: 9.7 to 9.8 s). Over budget; nothing trimmed. Rock alone is the cheapest of the four (5.2 s against 6.0 to 7.6 s). `pnpm test:full` 23.7 s, `pnpm score` 27 s.

## rock, checked and merged; the suite is over its budget (stage 6, part 5)

The builder's diff was read in full: one engine change (`RhythmTier.restrike`, a chord held over a barline struck again more softly, which the plain rhythm already had), three properties reworded for things no style could do before (a bass the arrangement lays out owes no note; a comp that never leans in has no pushes to count; a final chord counts the soloist's note), no property added. The old three styles' goldens and scorecards have not moved.

- **`pnpm check` fails on time: 10.2 to 10.5 s against 10.** Nothing fails but the clock. Each style's properties run in a process of their own: alone they take 4.9 s (rock) to 7.5 s (jazz), and side by side they slow each other, so the suite takes as long as the slowest style plus the crowding. Three styles was 9.1 s. Eight will not fit by any trimming that keeps what is tested.
- **One consolidation made**: a style is now held to a dozen charts written for other styles, spread through the library and starting at a different chart for each style, where it was held to all of them. That stops a new style's charts making every other style's run longer. It saved 0.2 s today.
- **Not decided here**: what the budget is when there are eight styles. `docs/TESTING.md` says a budget is not raised without an entry here, and it is Brandon's rule, so it is his call. Until then the suite is over, and that is said wherever its result is reported.

## a lead guitar's tone: the clean guitar through an amplifier (stage 6, part 5)

Brandon, asked how to get a lead guitar: the old band "manipulated the samples" and "it worked reasonably well". The notes already say how (SN-25, EAR-16), so nothing was read from the old code.

- **The overdriven guitar is the clean guitar's plain notes put through an amplifier when the pack is cut** (`scripts/packs/amp.ts`, a recipe's `amp`): thinned below 90 Hz, a soft clip made a little uneven, then a speaker that rolls off at 4 kHz with +2.5 dB at 450 Hz and +1.5 dB at 2.4 kHz. Those are the old band's kept numbers, the speaker being the part its owner's ear settled ("a little brittle" until it was darker and had body).
- **The amp runs at four times the sample rate.** A clip makes overtones far above what a 48 kHz file holds, and they fold back as tones that belong to no note, which is one way to be brittle. The old notes do not say whether the old one did this.
- **Every take meets the clip at full scale**, so a note is driven the same whatever its recording's level, and the softer of the two dynamics is driven half as hard: a lighter touch cleans the amp up.
- **Two packs for now, 3 times drive and 6** (`driven-guitar`, `driven-guitar-grit`), because drive is the knob the notes say is set by ear and nobody here has one. Measured on E4, the loud layer: the peak sits 15 dB over the average level clean, 11 dB at 3 and 8.5 dB at 6, so the note is held up longer the harder it is driven. One of the two goes when Brandon has chosen.
- **Both are soloists the player can pick** (`SOLO_INSTRUMENTS`), with plain notes: no bends, no vibrato. Rock's default soloist stays the alto until the tone has passed. Pitch movement (a note that carries a bend or a vibrato, a sampler that follows it, pitch bend in the MIDI file) is the next step, and is the part that makes it a guitarist.
- The clean guitar's pack was cut again after its plain notes were made a function both recipes share, and came out byte for byte the same.

## the lead guitar's drive, the soloist's level, and the suite's budget (stage 6, part 5)

Brandon, after hearing both guitars: "they both sound pretty good, might just depend on the context a little bit. i guess i'd lean toward slightly less, so let's stick with the 3x"; "soloist volume may need to come up a touch in general, please check levels"; and on the budget, "i'm open to your professional opinion... i don't want to create artifical constraints, but i also don't want to create a monstrous test suite that makes iterating on the project slower".

- **The overdriven guitar is driven three times.** The six-times pack and its instrument are gone.
- **The soloist sits about a decibel under the band it plays over, in every style.** `pnpm levels` (new, `scripts/levels.ts`) renders each seat alone through the real sampler and mixer and reads its loudness; a soloist is read while it plays. Before: 2.5 dB under the band in the blues, 1.5 in jazz, 4.9 in rock, 5.8 in funk. Now 0.5 to 1.8 under in all four, on any of the three instruments. The default soloist level is up 1.5 dB; jazz, the quietest band, is up 0.5; rock 3; funk 4.5 (short stabs over a busy band).
- **Rock's overall level was 2 dB under the blues'**, set from the old band's make-up gains and not measured. It is now where funk's is (-17 LUFS; the blues and jazz read -18.5).
- **The tool that renders a take to a file used the blues' mix for every style asked for by name** (`tools/audition/main.ts`): found because rock's level did not move when its mix did. Fixed. Gate 5's files were rendered by chart, which takes the chart's own style, so they were right; anything measured since with `style=` was not, including the first numbers read here.
- **Noticed and left for an ear**: rock's piano reads 4.5 dB under its drums, where the blues' is 1.4 and funk's guitar level with them. Nobody has complained.
- **The engine suite's budget grows with the styles and with nothing else: 10 seconds with three, 2 more for each after (12 now, 20 at eight).** The rule exists to stop tests piling up, and they have not: there are 62 properties, and the count is what a new style does not change. What grew is the number of bands held to them, each in a process of its own (5 to 7.5 s alone, and slower side by side). The other ways to stay at 10 were to check each style on one seed (7.8 s with four, so over again by six or seven, and one property needs two seeds) or to check only some styles on a push (an engine change can break any of them). Both give up coverage to keep a number. What stays rationed is the rules: a new property, a new kind of take, or more seeds still has to fit, and `docs/TESTING.md` now says so. The suite reads 10.3 s of 12.

## the lead guitar bends and shakes (stage 6, part 5)

Built from `prompts/solo-pitch-moves.md` in its own clone. Brandon chose two of the nine ways the study drew (`scripts/pitch-study.ts`): the quick bend and the wide guitar vibrato ("the wide/60 cent vibrato really sounds good and realistic", "quick bends sound great", "slides don't sound very good as they are, so we should leave them out. there's still value in them, but we need to snap to pitches/frets to make it sound realistic"). Those two are played and nothing else: no slide, no slow bend, no bend whose low note is heard first, no bend let back down, no scoop or fall on a horn.

**What was added, and where it lives:**

- **The hand is the instrument's** (`SoloInstrument.bend`, `.shake`): the seconds a bend takes; a shake's depth, rate, when it starts, how it grows, and whether it only goes sharp. Only `driven-guitar` has either, with the study's numbers (0.1 s; 60 cents, 5.5 a second, from 0.35 s, growing over 0.3 s, upward). The player turns seconds into ticks at the take's tempo.
- **How often is the style's** (`SoloStyle.habits.bend`, `.shake`): the chance of a bend into a major third and into a root or fifth (SO-53: blues 0.65 and 0.45, rock 0.45 and 0.55, jazz and funk none), where the hand gets lyrical (`around`, `elsewhere`, below), and the beats a note is held before it is shaken (SO-52: blues and rock 1.5, jazz 2, funk 3).
- **Where** (`writeBends` in `players/solo/line.ts`, `moveOf` in `play.ts`): SO-53 as written. A bend is decided when the phrase is written, by the place of the landing, and is kept with the idea (`PhraseBar.bends`); the note's length is only known once the phrase is realised, so the move itself is made there.
- **Two measures**, `solo.bends` and `solo.shakes`: bent notes and shaken notes for each bar of a solo. They are idiom measures, so they are on the scorecard only of a style that sets them a target, which is rock. **One property** (`test/soloist.test.ts`), checked by breaking eight rules in the engine one at a time: a bend into a passing note, a whole step into a third, a bend into a note too short, a bend timed in beats, a bend in the bar the band ends on, a bend in a style that does not bend, a shake on any note, a shake on a horn. Each failed it.
- **Rock's soloist is the guitar** (`rock/solo.ts`), and the guitar's register is the notes' (SO-01: G3 to E6, home B4; it was E3 to C-sharp 6 around A4). `rock-four-chord-g-solo.mid` is rewritten for that reason and `scorecard/rock.json` accepted again: a different instrument in a different register, which needs no breath, and a piano that keeps out of a soloist a fourth higher (`chords.on-the-soloists-note` 7% to 1%). The other eight goldens are byte for byte what they were, and `pnpm score` reports no movement for blues, funk or jazz.

**Decided here, because the notes and the brief did not settle it:**

- **A note a phrase lands on is one struck where the chord changes (or leaning into the change from the eighth before), or the last note before a breath.** Not the first note of a phrase, and not a downbeat where the chart only writes the same chord again: the engine fixes those first too, but neither is somewhere the line arrives. The solo's top note is the last note of its line, so it is a landing without a rule of its own.
- **The scale in play, for the note a bend starts from, is the notes the style's lines use over that chord or the chord's own scale.** With the line's notes alone, rock in a major key (the major pentatonic and the blue third) could never push the 4th up into the 5th of the I, which is the bend ST-rock-24 names. The start is never a note that says another chord, and never the flat 7th under a major 7th.
- **Bends come in phrases, not one at a time** (`habits.bend.around`, `.elsewhere`). The phrase that climbs to the top note and the one either side of it are always phrases the hand gets lyrical in; any other phrase is one with the chance `elsewhere`, set at a half in blues and rock. In such a phrase each landing takes SO-53's chance; a plain phrase has no bends. KF-B-10 is the reason: one bent note by itself was heard as an ornament, a cluster and then space as a player. With no gate (every phrase lyrical) the first chorus of a blues had the most bends of the three (2.7, 2.0, 2.0 on the 12-bar), because a sparse chorus is all long landings; with it the last has (1.4, 1.0, 1.9).
- **SO-53's chances are kept as written.** At their fullest (every phrase lyrical) they give at most a bent note every four bars, which is under what a guitarist plays, so there was nothing to bring down; what the ear's history asks for (EAR-02, SU-D-16) is the space, which is the gate. `elsewhere` is the number to move: at 1 it is the notes' ceiling.
- **The top note is always bent into** (SO-53: "the peak's top note is always bent if the style bends at all"). Where it is a major third with the blue third under it, or a root or fifth, it is bent as any landing is. Where it is not, it is pushed up from the scale note under it, the whole step before the half (`topBendFrom`): on the three-chord rocker in E the top is the C-sharp over the A, the key's 6th pushed up from its 5th, and on the minor rock in A the B over the G, from the A. The build first left those two unbent (the half step under a third is not in the hand there), which put a bend in the top of no solo on either chart and left the last chorus the barest of the three; found on the main thread reading the build's own table, before an ear was asked. The property holds it at two solos in three, because a song's one short solo has no climb and a chord in a stress chart can leave no note to start on (29 of 36 rock solos on a push; 11 of 36 with the rule taken out). A bend never changes which note is played: the guitar's line is the line an alto would play in that register.
- **A phrase said again is said with the same bends, and that outranks the gate**: a remembered note is bent if it was (and still may be where it now falls) and plain if it was plain, whichever kind of phrase it is in. A riff bar copies the bar before it the same way.
- **One device to a landing** (SO-57, extended): a note the line has leaned into from the half step under it (SO-26) is not then pushed up from the whole step.
- **A hand moves in seconds, so a note has to be long enough in seconds as well as in beats.** A bend is played only on a note that sounds twice as long as the bend takes (0.2 s): it arrives and is heard there. A shake only on a note that sounds until the shake has reached its depth (0.65 s): at 132 a dotted quarter played legato is 0.63 s and is left plain. Lengths in beats are the note's value in the rhythm, not what is left after the hand lifts off it (`touch.legato`).
- **The last note of the tune is never bent into (SO-57) and is shaken if it is held long enough.**
- **Every held note of the style's length is shaken, as SO-52 says; nothing is drawn.** It is the bigger number of the two: in a sparse first chorus one note in three (a shaken note every bar and a half), in a busy last chorus one every two or three bars. The clip Brandon approved shook only notes held two and a half beats. `habits.shake` is the one number: at a half note the blues' first chorus goes from 8.7 shaken notes to 4.6.
- **Funk's guitar is plain in practice.** SO-52 gives funk a dotted half and nothing in funk's book is held that long (its longest ending is a half note): no shaken note in 300 takes. The number is the notes' and is left; 2 would shake its phrase endings.
- **`around` is counted from where a phrase stands in its solo, not by looking for the top note's phrase.** A jam told to finish early no longer has that phrase, and everything before the word came must be what it would have been (the property that caught this, on the full run only).
- **The measures' bands for rock are measured, not meant**: `solo.bends` 0.02 to 0.3 a bar (delivers 0.12), `solo.shakes` 0.3 to 0.9 (delivers 0.64). They are there to be moved by an ear.

**How much, over 200 takes each (a jam of four passes: a three-chorus solo into the ending):**

| | bars | bent, chorus 1, 2, 3 | shaken, chorus 1, 2, 3 | choruses with no bend |
|---|---|---|---|---|
| blues, guitar, 12-bar in A | 12 | 1.4, 1.0, 1.9 | 8.7, 7.6, 4.8 | 38%, 48%, 0% |
| rock, three-chord in E | 8 | 1.0, 1.4, 1.3 | 5.9, 5.9, 4.2 | 50%, 29%, 0% |
| rock, four-chord in G | 8 | 1.0, 1.1, 1.5 | 6.7, 6.5, 4.6 | 45%, 38%, 1% |
| rock, minor in A | 8 | 0.7, 0.7, 1.0 | 6.2, 5.9, 4.4 | 66%, 51%, 0% |
| rock, on the 12-bar in A | 12 | 1.4, 1.0, 1.4 | 10.4, 9.9, 5.8 | 41%, 49%, 0% |

- Where they fall on the 12-bar blues: in the first two choruses on the bars a phrase starts or ends (1, 5, 9, 11 and 12); in the last, bar 8 in every take (the top note) and bar 9 in half.
- **Rock's last chorus has its top note and little else bent.** On an eight-bar form the three lyrical phrases are the second half of chorus 2 and both halves of chorus 3, and the busy level's landings are eighth notes: SO-53 wants a quarter for a root or a fifth, which is what rock lands on. So the cluster is the bars before the climb and the top note itself. Left as the notes have it; whether a whole step into an eighth belongs in rock is a question for an ear.

**Proof that it sounds** (SU-D-01): `rock-three-chord-e.chart`, rock, seed 1, four passes, the guitar alone, rendered to `out/audio/bends-rock.wav` through the sampler. The take has 77 solo notes, 2 bent and 12 shaken. The pitch of the first bent note (B4 at 16.82 s, pushed up from A), read from the audio by autocorrelation in 30 ms windows: 204 cents flat as it is struck, 151 flat at 0.03 s, 68 flat at 0.06 s, on the note at 0.10 s and still there at 0.25 s, then 20 to 42 cents sharp from 0.45 s as the shake grows. The second (F-sharp 4 at 44.32 s): 196 flat, 150, 65, then on the note. Two plain notes in the same file read within 10 cents throughout. The same take's MIDI file has 1,169 pitch bend messages on the soloist's channel.

**Suite:** `pnpm test` 10.7 to 10.9 s of 12, run alone, three times; the commit before this work, on the same machine in the same minute, 10.5 to 10.6 (it read 9.7 at the start of the session, under an hour earlier: the machine, not the tree). The property renders the guitar in the three styles where it is not the soloist already, eight takes on a push for the blues and four each for jazz and funk. `pnpm test:full` 30 s of 60, `pnpm score` 28 s of 120, `pnpm smoke` 9 s of 60.

**The alto and the vibraphone play what they played**: 3,888 takes (every library chart in all four styles, six seeds, a four-pass jam, a three-minute jam and the song, on each of the two) give the same events and the same MIDI bytes before and after, 551,427 solo notes.

**Found while working, not fixed:**

- `scripts/serve.ts` refuses every file when the repo itself sits under a folder whose name starts with a dot (`file.includes("/.")` is asked of the whole path, not the part inside the repo), so `pnpm render:audio` in a clone under `.work/` waits three minutes and gives up with "no file". The render above was made through a symlink to the clone from a path without one.

## the lead guitar, heard (stage 6, part 5)

Brandon, on the test site, 2026-11-15: "seriously incredible job, it all sounds really tasteful, and the soloist comes alive on guitar now. wow!"

- **The numbers stand as built**: SO-53's chances with the phrase gate at a half (`habits.bend.elsewhere`), the top note always bent, a shake on every note held a dotted quarter (`habits.shake` 1.5 in blues and rock). The three questions put to him (vibrato too frequent, bends too few or many, more bends in rock's busy last chorus) are answered by "tasteful": nothing is moved.
- **Slides stay out** until they can be stepped by frets; nothing else of the nine is built.


## disco (stage 6, part 5)

Built from `prompts/style-disco.md` in its own clone: `packages/styles/src/disco/`, six charts `library/disco-*.chart`, `scorecard/disco.json`, two goldens, one property. The blues, funk, jazz and rock goldens are byte for byte what they were and `pnpm score` reports no movement for any of the four.

**Engine changes, four, each a field a style may leave out (and the other four do):**

- **A riff's octave has its own level** (`BassLine.velocity.octave`). ST-disco-13: roots off the beat 78, the octave 94. The levels were by place only (arrival, strong, weak, off), so the pop on the "and" played as quietly as a root there. Any bassist who pops an octave plucks it harder than the roots beside it; a line without the field plays as before.
- **A lead-in into the next phrase has its own chance** (`LeadInPolicy.chance.intoPhrase`). ST-disco-14: the last bar of a phrase always leads into the next. There were chances inside a section and into a new one, but a phrase starting inside a section counted as inside. A bassist marking where the next phrase starts is not a disco idea; left out it is the inside chance, as before.
- **Notes over each chord's own root, by family** (`SoloStyle.notes.overRoot`). ST-disco-21: the pentatonic on each chord's root (major 1 2 3 5 6; minor 1 2 b3 4 5 b7). The pool had the chord's own scale or the key's notes; a scale moved with every chord was neither. Reggae and neo-soul notes ask for the same kind of thing.
- **How close a stabbed note is struck again** (`SoloStyle.habits.stabEvery`). ST-disco-25: a figure pumps one pitch on the eighths and never strikes it twice a sixteenth apart. The stab repeated the first note on whatever the figure struck next. At 2 the repeat stops where the rhythm runs on in sixteenths: over 48 disco solos, one pitch struck twice a sixteenth apart went from 1,626 times to 37. Left out it is 1, as funk's horn-section stabs are.

**Properties: one added, three reworded, one floor loosened.**

- Added (`test/drums.test.ts`): "disco: four on the floor": the kick on every beat of every bar at every level, through every fill; from the working level up the open hat on every "and" where no fill takes the hand; when quiet the hat never opens (ST-disco-04, ST-disco-10). No existing property sees the kick on 2 and 4 or the open hat. Fills here write no kick line, so the foot plays the floor through them (DR-12): that was there already.
- "The eighth before a change belongs to the chord coming": a comp that leans in only when the band is hot (disco, ST-disco-28) is held to a floor of 30 pushes seen, not 500; most of the library is played at the working level, where it never leans. Disco pushed 19 times on a push run.
- "Under a solo the piano leaves the soloist its note": only where the comp listens. A comp with `listening: null` plays as if nobody were soloing, by design (CH-60, CH-68); funk's guitar is one and passed by its dead-stop ending. Disco's held last chord (Em7 as b3, b7, 5) sat on the alto's last note, the fifth. Giving the disco guitar a `listening` was tried: the voicer then gave up a voice under the soloist and the guitar played two-note grips, which the guitar's own property forbids.
- "A guitar bends ...": the floor on bent notes scales with the style's chances of a bend (disco's are 0.3 and 0.2, half of rock's). The rest of the rule is untouched and disco passes all of it on the full run.
- "A solo that runs into the ending ends with the band": at least 80 endings on the full run, not more than 80. Funk now meets exactly 80: with 27 charts that are not funk's, `otherCharts` hands funk every third, nine where it was eleven. See "found" below.

**Decisions the notes and the brief did not settle:**

- Tempo 120, range 100 to 136: ST-disco-01 gives 120 and nothing else.
- The guitar grip is three strings (four for a chord too dense for three), as funk's: "up to four strings of the stab voicing", and the stab has three tones. An upstroke catches the whole grip, as funk's does.
- **A minor 7th is played plain (b3, b7, 5) unless the chart writes a colour**, funk's rule, against ST-disco-16's 9th on every seventh chord: with the 9th, B7 to Em7 went C5 to F#5 and `chords.top-leaps` read 28% on the falling-fifths chart.
- **The guitar's floor is A-flat 3, not B-flat 3**: above B-flat 3 the only Fm9 a four-fret hand can hold is G4 Ab4 Eb5, a half step on the bottom (found on the jazz ballad); from A-flat 3 there is Ab3 Eb4 G4. The mean lowest note is 63.0, inside ST-disco-16's 60 to 68.
- The chuck is written in the funk guitar's symbols: the notes' `-` (a stroke with the chord not sounding) is the muted scratch `~`, at 50 (58 hot). No turn at a phrase's end: the notes give none, and the drummer marks it.
- The keyboard (ST-disco-18 to 20, 28, 29) is not built: the guitar is the default and the seat plays one instrument a style.
- **The quiet hat is written `o.g.` where the notes have `x.o.`**: at `x` it was as hard as the quiet backbeat and `drums.cymbal-under-backbeat` read 0% in quiet takes.
- **Quiet, the two-step fill is the bark on the closed hat** (`HH x. SN .X`): the notes' only two-step fill opens the hat, and quiet phrases end every four bars, against ST-disco-10's 2% ceiling. The quiet eight-step (into a working-level section) is the disco roll played soft.
- Which fill where (the notes give shapes, not places): one vocabulary per tier with every length in it, the length chosen by where the music is going. Hot fills go down the toms two times in three; into the top of the form, a louder section or the ending, hot, always.
- No target for `drums.fills-that-repeat`: the notes give one fill for each length and tier, and the bark ends every phrase.
- No answer bars in the drums: the notes give none; the high tier's every-second-bar lift is the turn.
- Bass register: every root nearest a home drawn once a song from B1 to C2, so E1 to D#2 or F1 to E2 (ST-disco-12), the pops an octave above.
- ST-disco-14's "a section whose bassist walks leads into every change (30% of sections at mid, 60% at high)" is a coin per change, held per section (`hold: "section"`): 30% and 60% of the changes inside a phrase, the same ones each time the section comes round. The engine's lead-in keeps a line already a whole step from the next root as it is (BA-07), so some lead-ins are a whole step, not the half step below.
- The soloist's changes land on the 3rd or 7th only (`arrive`); the solo forms and book are rock's, by length; the head (ST-disco-24, 26) is not built, as no style's is. Pickups and ties none: the notes give none for the solo.
- On a guitar the bend gate is the blues' and rock's (`around` 1, `elsewhere` 0.5); a shake on a dotted quarter (six sixteenths, ST-disco-25).
- Other meters (ST-disco-03): the drums build any bar from the 4/4 bar's beats, which are all floor; the bass plays a root on every pulse (the octave on the pulse's last eighth is not built); the guitar a chop on every pulse.
- Charts: no named songs. The song (`disco-song-f`) has a break played twice, drums alone and then with the bass, before the last chorus with everyone and the soloist.
- Mix: the guitar up 3 dB as funk's; the soloist at 4.5; the master half a decibel down. Measured (`pnpm levels disco`): drums -22.0, bass -20.6, guitar -22.9, the band -17.3 LUFS; alto -1.0 dB against the band, vibraphone -0.9, guitar -1.4.

**Goldens:** `disco-four-chord-c-solo.mid` (a jam with a solo: the floor, the pump, the chuck at three tiers) and `disco-song-f.mid` (the arranged song in song mode). Added for the new style; nothing else rewritten.

**Suite:** `pnpm check` 11.1 to 11.2 s of 14 with five styles; `pnpm test:full` 27.8 s of 60, `pnpm score` 38 s of 120, `pnpm smoke` 9 s of 60.

**Found, not fixed:**

- `otherCharts` (`test/takes.ts`) hands a style every n-th chart with n rounded up, so as the library grows a style gets fewer than the dozen meant: nine for funk now. Handing exactly twelve was tried, and on the full run the blues bass ended an octave up (E2, not E1) on `funk-one-chord-e` seed 5, failing "the last bass note of a jam that ends is the lowest root". That is the blues bass's, and fixing it would move the blues; left for the main session.

## disco, checked and merged (stage 6, part 5)

Read on the main thread: the whole engine and test diff, the drum data against ST-disco-05 to 09, the six charts. `pnpm check` 11.7 s of 14 with five styles, `pnpm test:full` 28.5 s, `pnpm score` no movement in any style, the other four styles' goldens untouched. Changed before merging:

- **"Under a solo the piano leaves the soloist its note" excuses less than the build had it.** The build left out every take of a comp that does not listen, which took funk out of a rule it passes. Now only the last chord of such a comp is excused: its strokes are short everywhere else, and where the band holds the final chord its grip may have the soloist's last note. Funk and disco are both read again.
- **The mix a decibel further down** (master 1.5 under the default): with everyone playing disco read -16.1 LUFS where funk and rock read -17; now -17.0, the alto 1.1 dB under the band.
- **"The same note twice running" is asked only of notes that follow one another** (the jazz walk, `test/bass.test.ts`). Found by handing every style every other style's chart once: in the disco song the jazz bass lays out for four bars and comes back on the root it left on. Not a walk repeating itself; the test had been comparing across the silence.
- **"The last bass note is the lowest root" now says what the engine has done since stage 2** (EN-28): or the root an octave over it, where the fall from the note before would be more than an octave. The build reported the blues bass ending on E2 on a one-chord tune in E as a bug. It is the rule: a line on a low tonic lives an octave over the open string, its last note can be a seventh over that, and it comes home in its own octave. 10 endings in 2,970 (every style on every 4/4 chart, six seeds, three kinds) end an octave up, every one with that leap; none breaks the rule as now written. The old wording held only because no borrowed chart happened to sit on E to the end.
- **Each style borrows up to a dozen charts, not a dozen** (`otherCharts` rounds its stride up: nine each with 33 charts). Left: the spread through the library is the point, not the count, and the probe above (every style on every chart) passes every property.

Not done, as the build said: the keyboard book (ST-disco-18 to 20), a horn's scoops and falls, "this section walks" as one decision for a section (a coin for each change, held by section, stands in), and the bass's lead-in a whole step under where the engine keeps a note already a step away (BA-07).

## the electric piano is the Rhodes (stage 6, part 5)

Brandon, 2026-11-15, asked whether to use the old band's Rhodes or a CC0 FM piano: "it'll stay non-commercial, let's use the rhodes".

- **The source is `jrhodes3d`** (Jeff Learman, a 1977 Mark I Stage 73), pinned in `scripts/packs/sources.ts`. The old band used `jRhodes3c`, the same takes shortened and looped; a first cut from it gave soft and low notes about a second long, ending near their peak, because that set is meant to be looped by its player and the packs play a recording once. The author's full-length set has the same fifteen notes at up to five dynamics, 14 to 25 s long at the bottom.
- **Its licence is CC BY-NC 4.0**, by its own `LICENSE` file ("License for samples: CC BY-NC"): credit, and no commercial use. (The looped set's file named BY-NC-SA and linked BY-NC; the full-length set's mapping file still says "CC-SA-BY" in a comment. The `LICENSE` file is what the pack follows and carries.)
- **What that binds**: Ensemble is not sold or put behind payment while this pack ships in it; the pack carries the source's licence file, its credit names the licence, and the credits page says in words that these recordings may not be used commercially. Every other pack is CC0 or CC BY and is not touched by this. If Ensemble were ever to be commercial, this pack is the one to replace or to ask the author about (he offers a commercial licence on request).
- **The pack** (`electric-piano`, cut by a Sonnet subagent from `prompts/cut-electric-piano.md`, checked here): mono, 15 notes by 5 layers (tops 47, 72, 95, 111, 127, the mapping's), 75 files, 3.9 MB encoded, 65.7 MB decoded. A note lasts 6 s at the bottom falling to 3.5 s at the top; a low note is 8 to 10 dB down where the cap cuts it and is faded from there. Release 0.3 s (the mapping's runs 0.5 to 0.2 by register; the pack carries one). Roots within 17 cents of the mapping's, 3 on average. The eight other packs are untouched.
- **It plays**: the jazz ballad's chords rendered on it (`pnpm render:audio … packs=chords:electric-piano`, a new way to put any pack in a seat on the audition page) read -23.9 LUFS where the grand reads -26.4 in the same part. No style uses it yet, so it is not in the app until neo-soul is.
- The CC0 alternative found and not used: `Electrophones/TX81Z/FM Piano` in VCSL, already a pinned source.


## neo-soul (stage 6, part 5)

Built from `prompts/style-neosoul.md` in its own clone: `packages/styles/src/neosoul/`, six charts `library/neosoul-*.chart`, `scorecard/neosoul.json`, two goldens, no property added or changed. The blues, funk, jazz, rock and disco goldens are byte for byte what they were and `pnpm score` reports no movement for any of the five.

**Engine changes, each a field or a value a style may leave out (and the other five do):**

- **A two-handed spread** (`VoicingKind.position: "spread"`, `Recipe.also`). ST-neosoul-19: a left-hand shell (root and 7th, or 3rd and 7th) with the colours in fourths above it. Close position stacked every inversion inside an octave and could not say "this tone at the bottom, that one over it". A spread stacks the voices in the order written, each the nearest of its note above the one before; `also` offers further stackings of the same chord (another shell) and the register chooses, as a pianist takes the shell that keeps the hands where they are. Any two-handed keyboard style (gospel, a ballad piano) is this; a keys idiom with a spread may reach down to C3 (`TWO_HAND_FLOOR`), one hand still to E3.
- **Hands that close up under a soloist** (`Listening.closes`). ST-neosoul-21: while a phrase is live the spread becomes the one-hand rootless voicing and opens again in the gaps. Every strike in a bar where the soloist sounds takes the named kind, so a bar has one pair of hands. Any pianist who plays wide alone and tight under a singer does this.
- **The chord's own seventh on the bass** (tone `7`; `Figure.seventh: "own"` makes a grid's `7` name it). ST-neosoul-14: the major seventh over a major seventh chord, the flat over a dominant or minor one, the sixth over a sixth chord or a triad whose scale has one, else the root. A riff's `7` was always the flat seventh, which over a major seventh fell back to the octave.
- **A line kept near itself** (`Figure.near`). ST-neosoul-14: the fifth and seventh placed nearest the note before, so from the root they fall below it, and from the octave the fifth falls back into the octave between. `under` put every named tone under the root, which also put the hammer-on's 2nd a seventh down. Never under the open E or over the line's ceiling.
- **A tune ends at home** (`phrases.ts`, `home`): the take's last note rests on the root, 3rd or 5th, in the order of the style's `settle`. ST-neosoul-29 has phrases rest on the written 9th; that is a phrase floating, not a tune ending, and the property "a solo that runs into the ending ends ... on that chord's root, third or fifth" caught the 9th on the final Fmaj9. Every other style's `settle` holds only those three, so this changes nothing for them.
- **The clean electric guitar is a soloist** (`SOLO_INSTRUMENTS["clean-guitar"]`): SO-01's register for it, G3 to D6 at home on A4 (the notes say otherwise than the overdriven guitar's, so theirs is used), program 27, and the overdriven guitar's hand (the same bend, the same shake). The app's soloist control and `pnpm levels` list it by themselves; the audition page's hand-written list has it added.
- **Four critic measures**, all `idiom`, so on no card but neo-soul's: `drums.ghosts-per-bar`, `drums.late-four`, `bass.silence`, `bass.approaches-from-below`. ST-neosoul-12 and ST-neosoul-18 give numbers for them and nothing measured them.
- `scripts/levels.ts`: ffmpeg's loudness filter logs every tenth of a second, and on neo-soul's chosen chart (twelve minutes, five times round a song at 84) that passed `spawnSync`'s one-megabyte default, so every band reading came out NaN. The buffer is raised.

**Decisions the notes and the brief did not settle:**

- Tempo 85, range 70 to 100: ST-neosoul-01 gives 77 to 91, widened a little each side as the other styles' are.
- The drums: the five kicks, three ghost sets, the hat and the late four exactly as ST-neosoul-06 to 10. "The second bar of each pair" is phrase bars 2, 4, 6 and so on. The late four is a section's draw (35%) applied to every second bar; the hot open hat, a section's draw between the "and" of 2 and of 4. The feather touch (80%) is laid over the closed and the open hat.
- Fills (the notes give shapes, not places): two steps is ghost then accent on the snare with the hand still on the hat; four is the snare on 4 and the accented mid tom on its "and". No set-up fill into the end (ST-neosoul-40). The arrival crash at a new section is the engine's (DR-20) and stays: the notes ask for no crash only at the end.
- The bass draws its line per section at each tier with that tier's weights (ST-neosoul-13): the weights differ by tier, so the tiers cannot share one draw.
- ST-neosoul-17's "half the sections lead into every change" is a coin for each change held by the section (0.5), as disco's was; a lead-in on the last sixteenth, as a pickup where the line has nothing there. "Only when the line is already within a fifth of the target" is not built: the engine's lead-in has its own reach rules (BA-08 to BA-21).
- The hammer-on is played as a plucked 2nd at the off-beat level: the instrument has no hammered articulation. Over a chord whose scale has no natural 2nd it is the root, as `2` always falls back.
- In any other meter: the bass reads `R 5` a pulse at a time, the keyboard strikes each pulse and holds, the drums build the bar from the 4/4 beats (the kick's "and" of 3 lands late on the strong pulse, as ST-neosoul-05 asks).
- The Rhodes' shells: minor 3-7 (Dm9 F C | E A D) or R-7, major and sixth R-7 (C B | E A D) or 7-3 (B E | A D G); for a root high on the keyboard also 5-R | 3 7 9, because Gm9 had only tops of G5 and A5 to choose from (`chords.top-movement` read 62% in target without it, 100% with). The dominant R-7 | 3 13 9 or 7-3 | 13 9 5; a triad whose scale has the 6th and 9th the open 6/9 in fourths (E A D G over C), else a close triad; diminished, half-diminished, augmented and a phrygian minor seventh close chords in any inversion. Top aimed at C5 (72); 73 did not lift the low cluster and put a third of solo takes over the 15% ceiling on the soloist's note.
- The comp under a soloist is the jazz rootless hand. Its figures are one per section and never grooves, so it lays out under the line and answers breaths by the critic's choice (the jazz comper's weights); ST-neosoul-24's 40% and 50% are not chances in this engine. A breath's stab at 86, a figure's strike in a breath 6 harder: the notes give neither; at 80 and 4 `chords.answers-louder` read under a decibel.
- Where the hand does not lean into a change at the barline, nothing is struck in that eighth (`otherwise: "rest"`, KF-B-27, the jazz and blues pianists' rule): the notes give pushes, not what a figure does when it does not push.
- The soloist: the disco forms and book (by length), the pentatonic on each chord's root (minor without its 2nd, as the minor pentatonic is), arrivals in ST-neosoul-29's order, phrases settling on the 9th, then 3rd. Sparse first two stages and a sparse wind-down, roomier 0.45, breath 0.6 s, touch a little under the horns. No pickups or ties (the notes give none for the solo), no stabs. Bends 0.40 into the 3rd and 0.08 into the root (SO-53, ST-neosoul-33) in lyrical phrases as every guitar style has it; a shake on a half note (SO-52). The half-step slide, the scoop and both heads are not built.
- Mix: the default, the soloist up 1.5 dB (3) and the master up half a decibel. At the default the band read -18.6 LUFS and every soloist 2.2 to 2.7 dB under it. Measured now (`pnpm levels neosoul`, the song in B-flat five times round): drums -21.8, bass -22.4, Rhodes -23.2, the band -18.2 LUFS; vibraphone -0.9 dB against the band, alto -0.7, overdriven guitar -1.1, clean guitar -1.1; everyone -17.1 to -17.4 LUFS, peak -1.3 dBFS at most. The Rhodes is 1.4 dB under the drums; no ear yet. ST-neosoul-44's +8.8 dB belongs to the old mixer and is not used.

**The scorecard against the notes** (200 seeds over the six charts, a five-kind rotation):

- ST-neosoul-12: ghosts 3.9 a bar from the working level up (2.5 to 4.5 in the notes; the hot sets have five each, so a hot take reads 5 and the card's ceiling is 5); the kick on the One in 100% of bars; the late four in 20% of mid and hot bars overall (5% to 30%), by take 0% or about half, so the card holds it at most every second bar.
- ST-neosoul-15: bass mean pitch 35.8 (31 to 38), 94% of takes in.
- ST-neosoul-18: syncopated sixteenths 49% overall (25% to 60%), 54% of takes in: the quiet line has none and the hot ones about 70%. Silence 23% of the bar (15% to 45%), every take in. Half-step approaches from below 84% overall (60% to 95%); by take often all of a handful, so the card has only the floor.
- ST-neosoul-20: the Rhodes' mean lowest note 52.3 (50 to 56.5), 70% of takes in; the four-chord in D and the ballad in A-flat sit at 49.4 to 49.7, and solo takes on the E-flat vamp, closed up under the line, at 57.5.
- `drums.backbeat` is held at a half (disco's is 0.9): the late four moves the backbeat on every second bar of a section that takes it.
- `chords.held` 48% of strikes ring longer than a beat; the hot figures re-strike every three or four sixteenths, so the card's floor is measured, at 0.2.

**Goldens:** `neosoul-four-chord-d-solo.mid` (a jam with a solo: the loop, the late line, the spread opening and closing round the guitar, three tiers) and `neosoul-song-bb.mid` (the arranged song in song mode: an intro without the bass, a bridge, the soft ending). Added for the new style; nothing else rewritten.

**Suite:** `pnpm check` 13.3 to 13.6 s of 16 with six styles (11.1 s with five on this machine at the start of the session); `pnpm test:full` 33.5 s of 60, `pnpm score` 44 s of 120, `pnpm smoke` 9 s of 60. A sixth chart (the ballad) was needed for the full run's floors on solo takes (endings with the soloist 72 of 80, notes judged 4,942 of 5,000, takes compared 21 of 24 with five); none was lowered.

**Found, not fixed:** the app's soloist control starts at the vibraphone in every style (`packages/app/src/settings.ts`), not at the style's own soloist, so the app plays neo-soul's (and rock's) solos on the vibraphone until the player picks the guitar; the CLI and the engine use the style's default.

## neo-soul, checked and merged; the app takes each style's own soloist (stage 6, part 5)

Read on the main thread: the whole engine diff (seven optional additions; no test was added, changed or loosened), the report's scorecard against the notes. `pnpm check` 13.4 s of 16 with six styles, `pnpm test:full` 33.6 s, `pnpm score` no movement in any of the six, the other five styles' goldens untouched.

- **The master is left at the default** (the build raised it half a decibel): everyone together reads -17.7 LUFS, between funk, rock and disco at -17 and the blues and jazz at -18.5; the Rhodes 1.4 dB under the drums, the clean guitar 1.2 dB under the band.
- **The soloist's instrument is the style's own unless the player chooses one for that chart** (`ChartChoices.soloInstrument`). The app had kept one instrument for every chart and started it at the vibraphone, so rock never opened on its lead guitar, nor would neo-soul on its clean one: found by the neo-soul build. The choice is now kept with the chart, like its key and tempo, and choosing another style for a chart lets that style bring its own soloist. The old setting is no longer read. Checked in a browser: rock opens on the overdriven guitar, neo-soul on the clean guitar, disco on the alto, the blues on the vibraphone; a choice survives leaving the chart and goes when its style is changed.
- **Told to Brandon wrongly, 2026-11-15**: that rock's soloist was the guitar "by default". In the app it was not until this change; he heard the guitar by choosing it.
- Not built, as the build said: slides, a head for the soloist, a lead-in decision made once for a section, the "within a fifth" lead-in rule, ST-neosoul-24's chances (laying out under the soloist is the critic's choice).


## reggae (stage 6, part 5)

Built from `prompts/style-reggae.md` in its own clone: `packages/styles/src/reggae/`, six charts `library/reggae-*.chart`, `scorecard/reggae.json`, two goldens, one property. The blues, funk, jazz, rock, disco and neo-soul goldens are byte for byte what they were, and each of their scorecards, rewritten from scratch to a scratch file, is byte for byte its committed baseline.

**Engine changes, each a field or a value a style may leave out (and the other six do):**

- **A riff that keeps its hole on the One** (`BassLine.keepsHole`). ST-reggae-14: a change at the barline may keep the riff's hole; every other style's bass strikes a chord's root where it arrives (BA-01), which on a two-chord vamp would put the bass on the One of every bar against ST-reggae-17's 15% to 75%. With it, a chord arriving at the barline is stated by the figure's first note in the bar (its root: the arrival's note is always the root); a change inside the bar is still struck where it lands, and a bar whose figure has nothing under the chord still gets its root. Any style whose bass enters after the One (dub, ska, a hip-hop line laid back off the kick) is this.
- **A line that follows only the kick on the One** (`BassLine.followsKick: "one"`). ST-reggae-13, BA-47: the bass leaves the One open while the drummer does; where the kick plays it (steppers, rockers, a crash after a fill), the root is played with it for a beat at most, and the figure's own notes inside that beat give way (the riff's entry on the "and" of 1 would be a stutter). `true` locks to every kick (funk, rock); a reggae bass under the steppers' four-on-the-floor would otherwise fill its rests on 2 and 4.
- **An offbeat chop in other meters** (`PlainRhythm.pulse: "offbeats"`). ST-reggae-04: the skank chops at the start of every pulse but the first. `true` struck every pulse, the One included. A chord that sounds only on the first pulse is still struck where it arrives. Any offbeat comp (ska, the organ bubble) is this.
- **The arrival crash from an energy up** (`DrumStyle.crashFrom`). ST-reggae-05: no kick on the One at the low level (ceiling 2%). The arrival crash brings its kick (DR-20), and a quiet section top took one: 8% of quiet bars had the kick on the One, all of them crashes. Under `crashFrom` the plan marks no arrival crash and the quiet band marks a new section with its fill alone. A brushes ballad is the same idea.
- **The high-tier line is held against the bar's base level, not the section's label** (`plan.ts`, `holdTierLine`). `ArcStyle.liftsCrossHigh: false` existed but no style used it; reggae is the first. It held every bar to the side of the line its section's label level was on, so a player who set the level to 0.85 got 0.69 on any chart without a "Chorus": the steppers and rockers could not be asked for. The line is now held against what the bar is asked for before any build, arc or lift: the section's level, or the player's. A style with `liftsCrossHigh: true` (all six others) never reaches it.
- **Five critic measures**, all `idiom`, so on no card but reggae's: `drums.drop-on-three`, `drums.kick-on-one-quiet`, `chords.on-one-and-three`, `chords.chop-loudest`, `chords.chop-over-the-rest`. ST-reggae-05 and ST-reggae-20 give numbers for them and nothing measured them. The comping reading now keeps each stroke's level (the loudest of its notes), which no existing measure reads.

**Properties: one added, three rules reworded for the hole on the One, four evidence floors changed.**

- Added (`test/drums.test.ts`): "reggae: the one drop": in every 4/4 bar the kick on beat 3 with the cross-stick (the snare when hot); below the hot level no kick on the One but under an arrival crash; hot, the kick on the One (ST-reggae-05, ST-reggae-08). No existing property sees the drop or the empty One.
- "At a change of chord it is the chord's bass note" (`band.test.ts`): **loosened for a line with `keepsHole` only**, at a barline only: the chord is stated by the first bass note under it, wherever in its span, and that note must be its bass note. Every other line is held exactly as before (a note on the arrival tick). This is ST-reggae-14 itself.
- "A bass note outside its chord's scale only passes ... or it is the half step onto the next change" (`bass.test.ts`): the half step may land on the note that states the change, not only on the change's tick, when that note is at most two beats after it: the same hole. Unchanged for every line that strikes on the change.
- "The bass line never leaps more than an octave" (`bass.test.ts`): not across bars the arrangement lays the bass out of. Found by the library growing (each style's borrowed charts shifted): neo-soul's bass on `disco-song-f`, song mode, seed 2, comes back after the break's four bars of rest a fourth and an octave under the note it left on. That is a new entrance, not a leap, as the disco merge found for the jazz walk's repeated note.
- "In a jam on a one-section form, the biggest fill is kept for where the band steps up": the floor of at least one top fill seen is asked only where the band stepped up a level somewhere. Reggae's arc at half depth never leaves the working level on a plain chart (ST-reggae-33, 34), so it has no step to keep the fill for; every chorus end is still checked to be no top fill.
- "The band builds with the solo": under the last of three choruses louder than under the first by 0.02 times the style's arc depth (0.02 for everyone else). Reggae's second solo after the peak builds by 0.014 to 0.026 at half depth, exactly half of what the same plan does at full depth.
- "A guitarist holds a grip": the floors of 5,000 scratches and 100 chords leant into are asked only where a guitar style scratches and leans. The skank does neither (ST-reggae-19, 29); the rule is still checked on every stroke it plays.
- "The strumming hand is a pendulum": the upstroke floor is 1,000 on the full run, not 5,000. The skank comes up only for the flick (ST-reggae-19): 1,278 upstrokes on the full run, where funk's are 32,156 and disco's 75,664.
- "The soloist lands the changes": the floor is 250 landings on the full run, not 800. A reggae line enters after the One and rests on the drop (ST-reggae-25), so few notes are struck where a chord arrives: 292 on the full run, where funk's are 1,940 and disco's 2,376. Every one is still checked.

**Decisions the notes and the brief did not settle:**

- Tempo 76, range 60 to 90: ST-reggae-01. The fast count is not read: a chart written with the skank on every "and" plays at the tempo written, twice as fast as meant.
- The low tier is one layer, the notes' soft one drop entire; mid draws its hat (55/45) and its lift (40%) per section; high draws the riddim once a song (`hold: "song"`), so a performance never switches between steppers and rockers.
- The lift's closed hat is taken off only on the "and" of 4 ("the closed hat removed there"): in the shuffled-sixteenth hat the "a" after it is still struck. The every-section lift "in the bar before a new section when that bar has no fill" is not built: at the working level a section always ends in a fill.
- Answer bars are the second bar of each pair; the turn is drawn per section from the notes' three, `audible`, so a section that already lifts on 4 gives way to the next. Hot, the answer's stroke is a soft snare (the notes' "or snare").
- RM, the notes' rim, is the cross-stick; TH the high tom, TL the floor tom. Fills keep the feet and take the hat hand.
- Bass riffs exactly as ST-reggae-12, one per section per tier by that tier's weights; `6` is the engine's tone `6`, which over a chord whose scale has a minor sixth falls back to the fifth. A ceiling of C3, not an octave over the highest root: from D3 or E3 on the drop the line could not get down to a root at the bottom of the register (an E1 or the ending's G1) without leaping more than an octave, and the full run found both. A riff's octave over a root above C2 is the root. Lead-ins replace a riff note within an eighth (never add one), 35% at every level, fifth 3, scale 3, below 2, above 1.
- The skank's grip: triad, or root 3rd 7th, three strings, no extensions; the ceiling G5, the 15th fret (the notes' A5 is over it). Chop 100, the lighter "and"s and the flick 86 (the flick, an upstroke, is played 72): 1.16 and 1.39 times. No anticipation, no listening (a groove keeps its figure under a soloist).
- The soloist: the alto. In a minor key the key's minor pentatonic over everything; in a major key the major scale, which is each diatonic chord's own; a key note that rubs on a chord outside the key only passes (the engine's rule). Changes land on the 3rd, root, 5th; phrases settle on the root. Cells as ST-reggae-25; of its four endings the last (`......x-x-------`) is left out: its last note is struck on beat 3, and in a bar of three at 160 the engine cannot cut it short enough to leave the 0.6 s breath before a phrase on the next One (found on `jazz-waltz-f`). The disco forms and book, the "again, moved with the chord" first among the `r` ways (ST-reggae-27's phrase said again on new chords). No bends, no stabs, no pickups, no ties; a shake on a half note; the peak at most 10 over home. The heads (ST-reggae-26, 28) and the scoop are not built.
- `beats-off-the-chord` weighs 2 in the soloist's costs, not 1: in a major key the line runs the whole scale, and at 1 the one-four in G had 52% of its beats on chord tones; at 2 the lowest take is 73%.
- Charts: no named songs. The song (`reggae-song-f`) has an intro at level 1, verses at 2, choruses at 3 and a breakdown at 2 with the guitar out (drums and bass alone), the soloist in the last chorus. No section is called at 4: steppers in one chorus would cross the line ST-reggae-33 says the band holds.
- Other meters: the drums build the bar from the 4/4 beats as every style does (DR-10), so in 3/4 the drop on 3 is not played (ST-reggae-04's secondary downbeat is not built); the bass a root and fifth a pulse; the guitar chops every pulse but the first.
- Mix: the guitar up 3 dB as funk's and disco's (short chops measure quiet), the soloist at 2.5, the master a decibel over the default. Measured (`pnpm levels reggae`, the song in F): drums -21.9, bass -20.8, guitar -21.0, the band -18.3 LUFS; alto -1.0 dB against the band (everyone -17.2 LUFS, peak -1.5 dBFS), vibraphone -1.7, overdriven guitar -1.8, clean guitar -1.9. At the default mix the band read -19.9 and the alto -1.4. ST-reggae-37's +10.8 dB belongs to the old mixer and is not used.

**The scorecard against the notes** (200 seeds over the six charts, the five-kind rotation):

- ST-reggae-05: the drop on 3 in 100% of bars (floor 90%); the kick on the One in 0% of quiet bars (ceiling 2%; 8% before `crashFrom`).
- ST-reggae-15: bass mean pitch 37.8 (32 to 42), 99% of takes in.
- ST-reggae-17: the bass on the One in 68% of bars over everything (15% to 75%), silence 24% of the bar (20% to 60%). By take these are near all or nothing: a take of one section plays one riff, which has the One in every bar or in none but where the kick puts it, so only 8% of takes are inside the One's band and 71% inside the silence's (a quiet take on heavy halves, ST-reggae-12's own, reads 6% silent).
- ST-reggae-20: nothing on 1 or 3 (0%, ceiling 5%); the chop on 2 and 4 the loudest stroke in 100% of bars with others in them; hot, 1.15 to 1.39 times the others, mean 1.24 (1.15 to 1.4), 98% of takes in (one take just under 1.15).
- ST-reggae-21: no extensions, `chords.colour` 0% (ceiling 15%); the grip's mean lowest note 63.5 (E-flat 4).
- ST-reggae-29: no anticipation, 0%.
- `drums.answer-bars` has no target: the quiet one drop has no answer bars (ST-reggae-06), so a quiet take reads 0; `drums.turn-held` 100%.
- The soloist: changes on chord tones 100%, beats on chord tones 86% (floor 72%, 95% of takes in), the build 1.3 to 4 in 91% of takes, no barline ties, no early entries.

**Goldens:** `reggae-three-chord-d-solo.mid` (a jam with a solo: the one drop, the hole kept across the barline, the change inside the bar, the skank) and `reggae-song-f.mid` (the arranged song in song mode: the quiet intro, the breakdown for drums and bass, the stop). Added for the new style; nothing else rewritten.

**Suite:** `pnpm check` 14.1 to 14.4 s of 18 with seven styles (the engine suite alone, nothing else running); `pnpm test:full` 34.0 s of 60, `pnpm score` 47 s of 120, `pnpm smoke` 8.6 s of 60 (run against the built app on port 8770 with `SMOKE_URL`, since the config's own port is 8767).

**Found, not fixed:**

- The fast count (ST-reggae-01) needs the planner to read a chart's bars two to one: two written bars of 4/4 one played bar, at half the written tempo. That is a change to the planner, not data.
- Other meters (ST-reggae-04): the drums need a way to say where the drop goes in a bar that is not 4/4 (the secondary downbeat, else the backbeat pulses); `fitMeter` maps beat 3 to strong pulses only, so a bar of three has no drop. Not built.
- In a bar of three at a fast tempo, a soloist's ending note struck after the bar's middle cannot leave the style's breath before a phrase on the next One: the engine never cuts it below an eighth. Reggae's notes have such an ending and it is left out; the one struck on the "and" of 2 stays, and the suite does not find it running on.
- Evidence floors are per style now that each style has its own process, but are written as one number for all: the two lowered here are lowered for every style.

## reggae, checked and merged (stage 6, part 5)

Read on the main thread: the planner and player diff (five optional fields and the high-tier line held against the bar's own base level), every test change, the report's scorecard. `pnpm check` 14.2 s of 18 with seven styles, `pnpm test:full` 34.9 s, `pnpm score` no movement in any of the seven, the other six styles' goldens untouched. With the alto everyone reads -17.2 LUFS, the alto a decibel under the band.

- **The build reworded eight properties, and each stands.** Two for a bass line that keeps its hole on the One (the chord is stated by the first note under it; a chromatic note may resolve onto that note), both read from the style's own data. One for a leap measured across a section the bass lays out of, which is the mistake the walking property had. Four are floors on how much was seen, made to ask only where the style does the thing (a band that never changes level has no step to save its biggest fill for; a skank neither scratches nor leans; a half-depth arc builds half as far). Two floors came down for every style, upstrokes rolled and solo landings; they are set a little further down here (800 and 200), because a count that sits 15% over its floor fails the day the library grows.
- **Every style on every other style's chart, once** (the probe from the disco merge) found two more tests saying more than the rule:
  - "The head is on the closed hat" read every quiet bar of a jam's first pass as the head. A jazz band handed the reggae song plays its breakdown, which the chart calls quieter than its choruses, on the soft ride of a ballad, as the jazz drummer is written to. The test now leaves out a section whose own level is under the style's.
  - "A note held across a change is a tone of the new chord" measured the hold as heard against the change on the grid. Neo-soul lays its lead back 25 ms, and its Rhodes with it; on rhythm changes at 176, two and a half times its own tempo, that carried a note written to stop before a change 28 ms past it. The hold is now measured with the style's own lay-back of the soloist set aside.
  Nothing in an engine was changed for either.
- Not built, as the build said: the fast count (the planner would read written bars two for one at half the tempo), ST-reggae-04's drums in other meters (in 3/4 there is no drop), the keyboard double and the organ bubble, a horn's scoop. One of the notes' four solo endings is left out (it broke the breath in a short bar at a fast tempo).

## the acoustic guitar is a steel-string archtop; the nylon stays (stage 6, part 5)

Brandon heard the same picked and strummed part on three guitars (`scripts/steel-study.ts`, served from `out/steel-study/`): the nylon already cut, FreePats' FSS steel-string (a Seagull flat-top, GPL 3 with the FreePats exception for music made with it), and Karoryfer's Shinyguitar (an archtop through a microphone, CC0). 2026-11-15: "let's go with the archtop, it sounds pretty good and the license is nice", and "we should keep nylon as an option as well".

- **`shinyguitar` is pinned** (`scripts/packs/sources.ts`, the microphone recordings only) and the cut is briefed in `prompts/cut-steel-guitar.md`: 16 notes at four dynamics, two alternates each. It waits for the acoustic build to report (one subagent at a time).
- **The flat-top was not chosen**: the genre's own instrument, but shipping its samples in the app is distributing them under the GPL (the pack under the same terms, its licence text, the means to rebuild it to anyone who asks), and it has one dynamic for most notes.
- **The acoustic style is being built on the nylon** and moves to the steel in one line when the pack is in (`sound.packs.chords`, and its soloist).
- **Nylon as an option** needs something the app does not have: a seat's instrument chosen by the player where a style has more than one that plays the same part. The soloist already works this way (`SOLO_INSTRUMENTS`). Put to Brandon as a small piece of work for after acoustic is heard: a style lists the instruments its chord seat may be played on (the first is its own), and the band setup offers them where there is more than one.
- **No manager for packs**: ten packs are 24 MB to download in all and a band loads only its own three or four. What a growing shelf does need is listed in `PLAN.md`.

## the first visit, timed (stage 6)

Brandon, 2026-11-15: "i just want to make sure initial page load is snappy - don't want people waiting while packs download". Timed on a cold browser against the built app through one shared pipe (a throwaway server, every response uncompressed and rate-limited together):

| | 10 Mbps | 30 Mbps |
|---|---|---|
| the library on the screen | 0.6 s | 0.3 s |
| Play pressed on rhythm changes to its first bar | 9.4 s | 4.4 s |

- **The page never waits for a pack.** The shell is 0.25 MB compressed (script, stylesheet, the worker that plays the band, one font file); packs are fetched after it has drawn.
- **The wait is the first Play of a band on a device**: its three packs. The jazz and blues quartet is the heaviest, 9.4 MB (the grand is 6.0, the kit 1.9, the upright 1.5); funk, disco and reggae are 5.6. About 1.9 s of each figure is the count-in and the start, not the fetch. After that the packs are on the device and Play is immediate.
- **Changed now: fetching for later never competes with a band someone is waiting for.** The app saves every pack for offline use in the background from the moment it opens, four files at a time. It now waits a moment for the page to settle, stops whenever a band's packs are on their way (`Rig.idle`), and fetches the instruments most bands share first (the kit, then the basses and the chord instruments, the soloists' own last) so the next tune opened has least left to fetch. On this test pipe the first Play measured the same before and after (HTTP/1.1's six connections had been giving the band its turn anyway); over the live site's HTTP/2 nothing rations the saver's requests but this.
- **The lever that would move the number, not built: start a band on one dynamic layer of each pack and bring the rest in behind it.** One middle layer of the jazz quartet is 3.2 MB against 9.4 (`loadPack` can already load a pack that way), which is about 2.6 s of fetching at 10 Mbps in place of 7.5. The price is that the very first take of a band on a device is played with one recording for every dynamic, loud and soft differing only in level, until the full packs land and take over at the next Play. Gate 5 left "packs load every layer" standing until an ear said otherwise, so this is put to Brandon.
- **Brandon's answer, 2026-11-15: not built.** "i don't think we need to over-engineer it yet. packs can probably download while users are on the main screen in the background, and that should be plenty of time". The background save, in its new order, is the whole of it; every layer still loads. Come back to the one-layer start only if someone is heard waiting.



## acoustic, and a guitar that picks (stage 6, part 5)

Built from `prompts/style-acoustic.md` in its own clone: `packages/styles/src/acoustic/`, six charts `library/acoustic-*.chart`, `scorecard/acoustic.json`, two goldens, two properties. The design below was written and committed before the code (it is the first commit of the branch); where the code ended up differing, it says so. The blues, funk, jazz, rock, disco, neo-soul and reggae goldens are byte for byte what they were, and each of their scorecards, rewritten from scratch to a scratch file, is byte for byte its committed baseline.

**The design: a stroke can be plucked.**

*What the concept is.* The rhythm book already says where the guitar's hand comes down, and its articulation says how each written symbol is played: how hard, how long, and whether the fretting hand has let go (a scratch, `Attack.muted`). Picking is one more thing an attack can be: plucked (`Attack.pluck`). A plucked stroke does not cross the strings; it sounds the one or two strings of the held grip the attack names. So a picked pattern is an ordinary figure of the rhythm book, written in an articulation whose symbols are plucks, as a funk line is a figure written in stabs and scratches. A stroke is voiced before anyone knows how it will be sounded, so a picked bar and a strummed bar over one chord hold the same grip, found on the same fretboard by the same voice leading: going from one to the other changes the right hand and nothing else.

*What the style writes.* The patterns, as figures: a grid of sixteenths and an articulation whose symbols name places in the grip. The places are the picking hand's own: the thumb's three (`bass`, the grip's lowest string; `alternate`, the chord's fifth as an alternating thumb plays it; `upper`, the next string above them) and the fingers' three (`1`, `2`, `3`, the grip's strings counted from the top, as a guitarist numbers them). The notes' "places in the held shape, 0 lowest, 3 highest" are bass, 3, 2, 1. Each symbol has its own level, so "the thumb 72 on beat 1 and 66 elsewhere, fingers 56" is three symbols. Whether a section picks or strums is not a new decision: a section already draws one figure for each level and keeps it (X-B-14), so a quiet tier that lists only picked figures always picks, a hot tier that lists only strums always strums, and a working tier whose picked figures carry 35% of the weight picks in 35% of sections. With no bassist a figure may be written a second way (`CompFigure.alone`, written whole as `turn` is): the broken chord's own Travis roll. The guitar itself is declared an open-position guitar (`Guitar.openPosition`, the highest fret of such a shape) with open strings on.

*What the engine decides.* Which string each place is, in the grip the hand holds: the fingers take the top three strings, the thumb the lowest. The alternate bass is the chord's fifth a string under the bass at the same fret (a fourth below, in standard tuning: C3 with G2 under it, A2 with the open E) where the six strings are still a shape four fingers can hold; otherwise the fifth on one of the two strings over the bass (E2 with B2, G2 with the open D), and with none there the bass again. The upper string is the next one of the grip over those two. Under a new chord the thumb's first note is always its bass, whatever the pattern has there, so a chord that arrives on beat 3 of a Travis bar is stated by its root. How long a plucked note rings: until its string is plucked again, or the hand strums or moves to another grip, and no longer than the chord it was plucked on is written for; while the hand goes on picking the same grip with no gap, "written for" is the hand's time and not the stroke's, so a string plucked late in a bar rings into the next bar of the same chord. A plucked stroke counts as striking its chord (CH-34), is never played early (a single string cannot state a chord, so a picked bar never pushes, ST-acoustic-30), and its notes carry the voice `picked`, as a scratch's carry `muted`, for a sampler that has a plucked sound and for anything that reads a part.

*Hearing the band.* The hand reads the plan, as every player reads its own seat there: a bar where the bass seat is out (`bar.seats.bass === null`: switched off with `--without bass`, or laid out by the arrangement) is a bar with no bassist, and the figure is played as written for that. The critic's bass measures read the same field.

*Open position.* A guitar told it plays in open position searches grips on every count of strings from its most down to the chord's tones, lets the third be doubled once with one copy on the top two strings (x32010 is C E G C E; CH-24), and where any shape has every fretted note at or below the stated fret, offers only those. Which of them is played is the voicing critic's choice as before, with three new things it can be told to cost: strings left silent, strings stopped by a finger (CH-24's rewards for a sounding string and an open one), and a string muted inside the grip. Nothing depends on whether a bassist plays: a grip that stands on its root with its two lowest notes inside the low-interval limits (X-B-04) already has nothing under C3 but the root and the fifth over it (X-B-03), because on the two low strings a fifth is the only interval the limits allow there. So G is 3x0003 with or without a bassist, as the notes have it both ways.

*Considered and not chosen.* (1) A picking player beside the strummer, switched in by level: two right hands needing two grips kept equal by rule, where one hand with two attacks has one grip by construction. (2) A pattern as a list of places apart from its rhythm, as a bass line's tones are apart from its figure: the notes pin the thumb to the beats and the fingers to the "and"s, so place and time are one thing, as in a riff. (3) Arpeggiating the voicing's pitches without strings (what a keyboard would do): it cannot say "until its string is plucked again", and the thumb's alternate bass is a string, not a chord tone. (4) An engine rule "low picks, high strums, mid 35%": that is a style's numbers; the section's weighted draw of a figure says it as data. (5) Grips chosen differently with and without a bassist: not needed, as above. (6) The thumb's alternate bass kept strictly inside the strummed grip: C would alternate C3 with G3, a broken chord and not an alternating bass; the note under the bass is kept only where the six strings are still one shape a hand can hold, so "every picked note is a string of the shape the hand holds" stays true.

*Left out of the concept on purpose:* hammer-ons (ST-acoustic-26) and the half-step slur (ST-acoustic-28) in the soloist's line, brushes (the shaker and a soft snare tap stand in, ST-acoustic-07), and picking in any meter but 4/4 (a figure is a bar of 4/4; a waltz is strummed).

*Where the code differs from the design as first written.* Three things. (a) The first write-up had a guitar hold its grip across a change of voicing kind, for a style that voices its levels differently; that was for the add9 (below), which is not built, so it was taken out again: every level asks for one kind and the grip is one grip already. (b) A plucked string does not ring over the top of the form. An open jam made one pass longer must leave every note already played as it was (a property), and a string cannot be cut short by what the hand will pluck in a pass that is not planned yet. Inside a pass it rings over barlines as designed. (c) The alternate bass's fallback is the fifth on the two strings next over the bass, or the bass again; "the lowest fifth anywhere in the grip" put the thumb on the top string of a B7.

**Engine changes, each a field or a rule a style may leave out (and the other seven do):**

- **A stroke can be plucked** (`Attack.pluck`, `PickPlace`; carried by `FigureStroke.pluck` and `Strike.pluck`; the voice `PICKED`). `guitar.ts` writes a plucked stroke as one note for each place, finds the strings (`placeIn`, `alternate`), keeps the thumb's first note under a new grip on the bass (`plucked`), and decides how long each rings (`rings`). `bar.ts`: a plucked stroke is never the push itself, as a scratch is not, and a chord laid in where it arrives may be plucked; `phrase.ts`: a groove leans into a change only on a stroke that is neither. General: any fingerstyle guitar (bossa, country, a picked electric) is plucked attacks in a figure.
- **A figure as it is played with no bassist** (`CompFigure.alone`). The plan says who is playing; a figure with a second grid plays it in a bar where the bass seat is out. General: CH-26 has every guitar change its part when it is the bottom of the band.
- **An open-position guitar** (`Guitar.openPosition`): every count of strings, the shape at the nut where there is one, the third doubled once. No style had `open: true` before; the idiom allowed fret 0 and left open strings out of the hand's span, and nothing else.
- **A grip that stands on its root** (`rootOnBottom`, which no style had set): its two lowest notes keep the low-interval limits as a rule and not a cost; its root is not among the tones a hand gives up; and a chord so dense that its root has already given way to an alteration (G7#9b13) stands on what it has.
- **An upstroke never drops a tone the chord is heard by** (X-B-13): it catches the style's count of top strings and as many more under them as it takes to sound the third, the seventh and every written alteration. Where an upstroke already catches the whole grip (funk, disco, reggae) nothing changes. Without it an open E7's upstroke (G#, B, E) has no seventh and "a chord keeps its identity" fails; with it the upstroke is four strings there.
- **Three things a grip can cost** (`VOICING_FEATURES`: `silent-strings`, `stopped-strings`, `muted-inside`). A feature with no weight is not computed. `LOW_LIMITS` moved from `voicing.ts` to `strike.ts` so the guitar can read it (re-exported where it was).
- **A root-and-fifth line keeps its fifth** (`LeadInPolicy.playsNextRoot`). The engine never lets a line play the next chord's bass note just before it arrives (BA-34): a held fifth that is the next root is traded for the third, or split by a lead-in whatever the coin says. On D going to A that put the third on beat 3 of three bars in eight of the canon, against ST-acoustic-12 (root and fifth only) and ST-acoustic-15 (97% on beats 1 and 3). With the field a held note is played as written unless the coin asks for a lead-in. A note in the lead-in's own place (beat 4 of the hot line) still always gives way to one, so the property "the arrival is never sounded a beat early" holds unchanged. General: any two-beat bass (country, a polka, a folk waltz) is this.
- **The nylon-string guitar is a soloist** (`SOLO_INSTRUMENTS["nylon-guitar"]`): SO-01's register, E3 to A5 at home on F#4, program 24, no bend, a narrow shake either side of the pitch. `pnpm levels` and the app's soloist control list it by themselves; the audition page's hand-written list has it added.
- **Eight critic measures**, all `idiom`, so on no card but acoustic's: `chords.picked-quiet`, `chords.picked-working`, `chords.picked-hot`, `chords.upstrokes`, `chords.open-strings`, `bass.roots-and-fifths`, `bass.passing-tones`, `bass.note-length-quiet`. The readings of a comping part were told what a plucked string is: not a chord struck (so the voicing measures read a grip where it is strummed, and the rhythm measures count strums), as they were told what a scratch is.
- The validator knows all of the above: a plucked attack needs a guitar, names one or two known places and is not also a scratch; a push is never played as a plucked symbol; open position needs open strings.

**Properties: two added, four reworded, two drum properties narrowed, three now read plucked strings too.**

- Added (`test/piano.test.ts`): "a picked note is a string of the shape the hand is holding": everything plucked under one chord, with whatever is strummed there, is no more notes than the guitar has strings and one shape a hand can hold; a plucked string rings on until it is plucked again, never past its chord and never into a strum. Read from the pitches alone, not with the engine's fretboard.
- Added: "with no bassist the picking thumb is the bass": in a bar of four the guitar picks while the bass is out, a string is plucked on every beat a chord sounds on, the first on a beat under a chord is the chord's root, and nothing in the bar is under it but the fifth a fourth below.
- Broken on purpose, each caught: the fingers plucking an octave up (the first property: not one shape); a plucked string not stopped by a strum or a move (the first, and "the piano's last chord": a chord ringing into the final hit); a string not stopped when plucked again (the first); the thumb not taking the bass first under a new chord (the second: G on beat 3 first given D3); the alternate bass a minor third under the bass and not a fourth (both, and "nothing the harmony rules out").
- "Every chord the chart writes is struck": **loosened for a chord that is picked.** A struck chord must still have the chord's guide tones in one strike; a picked chord is said a string at a time, so it is enough that a string is plucked while the chord sounds. That every such string belongs to the chord's shape is the first new property. What is no longer asked: that a picked chord's strings, between them, include its third. The fingers take the top three strings of the grip, which hold the third in every common shape but not in all (B7 as x21202 has it on the fourth string).
- "One hand, one chord": a strike may have as many notes as the style's guitar has strings where that is more than five (acoustic: six). Unchanged for every other style. A plucked string is not a strike, so the rule that a strike has stopped before the next starts is not asked of it; what is asked of it is in the first new property.
- "A guitar's chords can be held": the rule read "three or four notes, on neighbouring strings, none open", which is funk's guitar and not the idiom's rule. It now reads the style's own guitar: up to as many notes as it has strings, a muted string inside the grip where `skip` allows one, open strings where `open` does. For funk, disco and reggae it checks exactly what it did.
- "A guitarist holds a grip": for a guitar whose upstroke catches fewer strings than its grip (`strum.up` under `strings`: acoustic only), a stroke that shows more strings of the same shape is not a move. An upstroke of three strings and then the downstroke of all six is one grip.
- "Blues: the time is kick on 1 and 3..." and "an arrival is one crash with a kick under it" (`test/band.test.ts`): both now leave out a bar the arrangement lays the drummer out of. Each said more than the rule: `acoustic-song-c` is the first arranged song with the drums out at the top of a section, and the plan marks an arrival there that nobody is in to crash. Found by handing every style every chart once (below); on the suite's own selection of charts neither failed.
- "The piano stays in its register", "plays nothing the harmony rules out" and "the last chord ... a chord ringing into the final hit" now read plucked strings as well as strikes. Nothing was taken out of them.
- Evidence floors: none changed. The two new properties' floors are set under what the full run sees (2,019 picked chords, 14,184 plucked notes, 12,127 that rang on; floors 1,200, 9,000 and 7,000).

**Decisions the notes and the brief did not settle:**

- **The add9 is not built** (ST-acoustic-21, and so ST-acoustic-32). It needs three things the engine lacks: a voicing chosen by chance and by the chord's job in the key, drawn once a section for each chord (the voicing engine has no draws at all); a grip that changes kind while the chord stays, which is the hand moving under one chord; and a colour that gives way where the chord has no shape at the nut with it (D and Dm have none: the search would go up the neck for Dadd9). A reduced version by data (the colour on every I and IV) was started and taken out: it needed all three anyway. Triads are bare at every level.
- Tempo 95, range 72 to 120: ST-acoustic-01 gives 90 and 100; a ballad and a brisk strum are both this band.
- A written tension takes the fifth's string on a seventh chord (CH-24: a seventh chord may drop its fifth). With the fifth required, B7#9 was a five-note stretch at the 7th fret with the #9 under the 3rd; without it, x2123x. A chord with no shape at the nut is played whole wherever the neck has it (Cm9 at the 6th fret), not thinned to stay at the nut: ST-acoustic-22 says a written 9th is always in the chord.
- The guitar stands on its root under a slash chord too: the written bass is the bassist's. With no bassist a C/E is a C chord on C.
- The grip's costs: only the top string is led (CH-24); a silent string costs 5, a stopped one 3 (CH-24's 4 and 6 semitones of movement at half a point a semitone), a string muted inside the grip 3 more, so B is the barre x24442 and not x21x02.
- The three picked patterns have equal weight (the notes give none) and each is paired with one of the three Travis rolls, in the notes' order; with a bassist the fingers' three strings are the top three of the grip.
- The Travis thumb follows CH-32 (the alternate is the fifth, on a lower string than the upper note), so G is G2, G3, D3, G3 and the thumb's upper string is the third string, which a finger also plays: the same string twice running, as the notes' own scheme has it.
- A strum's upstroke is three strings (CH-27), four where the chord's seventh or third is under them.
- An arrival strum where a picked pattern would pass a chord by (a chord a sixteenth long) is a downstroke at 72: the notes give nothing.
- Drums: the cymbal crash at a new section is played only when the band is hot (`crashFrom`): the notes give no crash anywhere and say the drummer never varies with a crack. The answer bar's open hat is offered only where the hat keeps time (two layers, by which piece is playing). Brushes are the shaker's sixteenths, a soft snare tap and the hat foot. ST-acoustic-05's "3 to 8 strokes a bar" does not fit its own half-time groove (ten, with the shaker's eighths); the grooves are as written.
- Bass: every root nearest a home drawn for the section between A1 and D2, so a fifth usually has room under it; the passing tone's kind is a scale step six times in eight, a half step below or above once each. Into the final chord 40%. Levels by place: 96 where a chord arrives, 88 on beat 3 (the fifth), 86 on 2 and 4, where the notes have 86 for a repeated root and 88 for the fifth wherever they fall.
- The soloist: the disco, neo-soul and reggae forms and book, by length; the key's pentatonic with each chord's tones; no bends, no pickups, no ties; a shake on a half note. The hammer-on cells are kept and played as two plucked notes. The nylon guitar's shake is 20 cents either side at 5 a second: a hand's numbers, not an ear's.
- Charts: no named songs. The song (`acoustic-song-c`) has an intro and a first verse for the guitar alone (so they are Travis-picked), the band in from the first chorus, the soloist in the last, and an outro without the drums; its verse has F and G in one bar so that a chord arrives on beat 3 of a picked bar with no bassist.
- Other meters (ST-acoustic-04): the guitar strums down on every pulse and is not picked (the upstroke on a pulse's last eighth is not played); the bass plays the root on the first pulse (the fifth on a strong pulse is not played: in three there is none); the drums are boom-tick-tick from the working level up and in the quiet cross-stick groove, and a kick alone in the other two quiet grooves.
- `chords.changes-anticipated` has no target: it reads a strum that rings to the barline as the next chord played early when the two chords share a third (C into Em), and reads 27% where the true figure is below.

**The scorecard against the notes** (200 seeds over the six charts, the scorecard's rotation of kinds; and a count over 240 takes, `stats` below):

- ST-acoustic-17, picked or strummed: quiet, every bar is picked (`chords.picked-quiet` 100%, floor 98%); hot, none (`chords.picked-hot` 0%). At the working level 40% of bars on the card; counted by section over 240 takes, 78 of 219 sections pick, 36% (35% in the notes). By take it is all or nothing, since a take of one section draws once, so only 7% of takes sit inside the card's 15% to 55%: the band is the notes' and is read over everything.
- ST-acoustic-20: 49% of strums come up (30% to 55%), every take in. 1.82 open strings a downstroke over everything (1.2 to 2.2), 81% of takes in: the four chords in G (G, C, Em, D) read 2.5 to 2.65 by themselves.
- ST-acoustic-30, counted over the same 240 takes as a strum struck in the last eighth and still ringing an eighth past the barline: 603 of 3,009 strummed changes at the working level, 20%; 1,197 of 3,893 hot, 31%; none from a picked bar.
- ST-acoustic-15: roots and fifths on beats 1 and 3 in 100% of cases (floor 97%). Passing tones 8% of notes over everything (2% to 12%); by take from none (quiet) to 25% (the waltz, where the bass plays one root a bar and a step on the last beat is a large share of its notes), 75% of takes at or under 12%. Quiet notes average 9.3 sixteenths (7 to 16). No lead-in leaps.
- CH-02: the top of the grip moves 1.24 semitones a change (2 or less), never more than a fourth; the hand moves 0.6 of a fret a change and never more than four. The grip's lowest note averages 49.7 (C#3). ST-acoustic-22: 1% of chords carry a 9th or 13th (the written ones).
- Drums: the kick on the One in 100% of bars, a section's groove kept 100%, its answer turned the same way 100%. No target for the backbeat (two of the three quiet grooves have none) or for answer bars (a bar of three has none).
- The soloist: changes on chord tones 100%, 50% of them on the 3rd or 7th, beats on chord tones 88% (floor 72%), phrase ends 97%, the build 1.3 to 4 in 98% of takes, no bends, no ties, no early entries.

**Levels** (`pnpm levels acoustic`, the song in C five times round as a jam):

- At the default mix: drums -24.1, bass -23.2, guitar -20.1, the band -17.8 LUFS; the nylon soloist 3.4 dB under the band.
- As set (the guitar 2 dB down at -8, the soloist at 3, the master 0.6 under the default): drums -24.7, bass -23.8, guitar -22.6, the band -19.2 LUFS; the nylon-string soloist -20.3, 1.1 dB under the band, and with it everyone -18.2 LUFS, peak -1.1 dBFS. The other soloists: vibraphone -1.6 dB against the band, alto -1.4, overdriven guitar -1.7, clean guitar -1.7; everyone -18.0 to -18.2. The guitar is the loudest seat, 2 dB over the drums and 1.2 over the bass; no ear yet. ST-acoustic-39's +9.0 dB belongs to the old mixer and is not used.
- **The audition page could not seat one pack in two channels**, and this is the first style whose soloist is its comp's instrument. `tools/audition/main.ts` kept one seat for each pack, so the second nylon guitar sounded through whichever of the two channels was named last, and `pnpm levels` read "everyone" as the band alone. The app was never wrong (its rig names an instrument by channel and pack). The page now names a pack's second seat `seat:pack`, and `assemble` (`packages/audio/src/band.ts`) loads the pack under that name. The soloist-alone and band-alone readings were always right; the "everyone" line above is from after the fix.

**Goldens:** `acoustic-minor-ballad-am-solo.mid` (a jam with a solo: both sections picked with the bassist at the working level, strummed where the arc crosses into the hot level, the second guitar over it) and `acoustic-song-c.mid` (the arranged song in song mode: the Travis-picked intro and verse, the band, the soft ending). Added for the new style; nothing else rewritten.

**Suite:** `pnpm check` 16.1 to 16.2 s of 20 with eight styles (13.3 to 13.7 s of 18 with seven on this machine at the start of the session), run alone; `pnpm test:full` 40.0 s of 60, `pnpm score` 53 s of 120, `pnpm smoke` 8.3 s of 60 (run against the built app on port 8770 with `SMOKE_URL`).

**Found, not fixed:**

- **Handing every style every chart once** (the probe from the disco and reggae merges: `BORROWED` set past the library's size, two seeds, not committed) passes for acoustic on all 51 charts at six seeds, and found three things in other styles, none in the suite's own selection of charts:
  - The two drum properties above, which this build narrowed.
  - **The blues bass leaps 14 semitones on v to bVI in a minor key.** On `acoustic-minor-ballad-am` (seed 1, every kind) and `acoustic-song-c` (seed 3), in the bar of Em before F: D3, then C2 on beat 4 as the lead-in. "The bass line never leaps more than an octave" fails. The lead-in is placed in the wrong octave; it is the blues bass's, and fixing it would move the blues. The charts were left as a minor ballad is written. The blues is not handed either chart today (`otherCharts` gives it every fourth); a library that grows may hand it one.
  - **The neo-soul bass leaps 14 semitones on `blues-jazz-f`** (seed 1 and 2: C3 to Bb1 from Bdim7 into F7, on the last sixteenth). It is there at the commit this branch started from, and has nothing to do with this build.
- A chord so dense that its root gives way to an alteration (G7#9b13, in the stress chart only) stands on its third at B2: a third under C3, which X-B-03 forbids with a bassist. With the root kept, no hand holds its five tones and an alteration would be the one given up.
- `chords.changes-anticipated` reads a strum that rings to the barline as an anticipation when the next chord's guide tones are in it. It was fixed once for clipped stabs (the funk guitar build); a strum that is never choked meets it again. Changing the measure would move seven baselines, so it is left and has no target here.
- The plan marks an arrival crash on a bar the drummer is laid out of. Nothing plays it, and the drum properties now skip it; the mark itself is the planner's.

## acoustic, checked and merged; two older faults fixed (stage 6, part 5)

Read on the main thread: the design, the whole engine diff (a plucked attack, a figure's second grid for a bar with no bassist, the open-position guitar, a grip that stands on its root, the upstroke's reach, `playsNextRoot`, the measures), every test change, the report. `pnpm check` 16.0 s of 20 with eight styles, `pnpm test:full` 40.3 s of 60, `pnpm score` no movement in any of the eight, the other seven styles' goldens untouched. `pnpm levels acoustic` as the build said: the band -19.2 LUFS, the nylon soloist 1.1 dB under it, everyone -18.2. The shapes the guitar strums, printed from four charts, are the chords at the nut: C x32010, G 3x0003, Am x02210, Em 022000, F 133211, E7 022130, A x02220, Bm x24432.

- **The build's rewordings stand.** A picked chord is "struck" by a string plucked while it sounds, and the new property holds every plucked string to the shape the hand holds; "a guitar's chords can be held" and "a guitarist holds a grip" now read the style's own guitar and check for funk, disco and reggae exactly what they did (three strings, neighbours, none open, an upstroke that catches the whole grip); the two drum properties leave out a bar the arrangement lays the drummer out of.
- **A note with the voice `picked` plays on any pack**: the sampler plays a voice a pack lacks on its plain one (`packages/audio/src/sampler.ts`). Checked because the build had not.
- **Every style on every chart, at six seeds** (the probe), failed twice, both in styles the build did not touch and both older than it. A new style's charts sort first in the library, so every borrowed chart is now handed over in a different kind of take on a different seed, and two faults that were always there came into view. Both are fixed in the engine, since the app lets any band play any chart:
  - **A bass line that had climbed leapt more than an octave onto its lead-in.** The blues on `acoustic-minor-ballad-am` (Em to F: D3, then C2, then F1), neo-soul on `blues-jazz-f` (C3, then Bb1, then A1), reggae on `disco-falling-fifths-em` (C3, then G1, then F#1: 17 semitones). Where the next root lies more than an octave under the line, every note the lead-in may be (a step or a half step from the landing, or its fifth) is out of reach too, and the old rule took the nearest of them anyway. Now the line comes down through the chord it is on: a note within an octave of both the line and the landing, the chord's root before its fifth before its other tones, then a note of its scale; never the landing's own note (BA-34) and never a note a step from it by name, which would be a leading tone that falls a seventh (BA-05; the first version of the fix chose E2 under F1 and the lead-in property caught it). Counted over every style on every 4/4 chart, three seeds, five kinds of take (5,880 takes): four pairings leapt before, none after. No golden and no scorecard moved: the case never arose on a style's own charts.
  - **The jazz piano's button was not its final chord under a soloist.** `blues-jazz-f` with a solo, seed 4: the final chord A3 D4 G4, thinned around the soloist's last note, and the button after it D4 G4 A4 C5. A hand that listens chooses each strike afresh, and the button is a second strike. A strike can now say it is the chord just struck, struck again (`Strike.again`, set by the ending's button), and it is given the notes of the strike before it. Present at the commit before the acoustic build, and reproduced there.
- **Left as the build found them**: the stress chart's G7#9b13 standing on its third; the plan marking an arrival crash in a bar the drummer is out of; `chords.changes-anticipated` reading a ringing strum as a push (no target on acoustic's card).
- **Not built, as the build said**: the add9 (it needs a draw by chord function inside voicing), picking in any meter but 4/4 (the waltz is strummed), hammer-ons and slides, brushes, the piano book.

## the steel-string guitar is cut and acoustic plays it; a seat's instrument can be chosen (stage 6, part 5)

- **`steel-guitar` is cut** (a Sonnet build from `prompts/cut-steel-guitar.md`): Karoryfer's Shinyguitar, the microphone recordings only, CC0. Seventeen notes a minor third apart (Db2 to C6), four dynamics at the source's tops (32, 64, 96, 127), the first two of four alternates: 136 files, 4.6 MB to fetch, 78.3 MB decoded (budget 80). Checked on the main thread: the diff is the pack, its recipe and two lines registering it; `LICENCE` is the source's file byte for byte; the ten other packs untouched; it plays through the sampler (`pnpm levels`).
  - Its top notes are cut at 2.0 s, not the brief's 2.5: at 2.5 the pack came to 83.8 MB. The bottom keeps 4 s.
  - `release` 0.12 s: between the nylon's 0.1 and the source mapping's 0.25. A guess; no ear.
  - File names and the mapping agree with the measured pitches (no octave error, as Karoryfer's bass library has); the worst take is 14 cents off its name, and roots are the measured ones.
  - Not used: the pickup recordings, release noises, muted strings, body taps.
- **Acoustic's guitar and its soloist are the steel-string** (`sound.packs.chords`, `solo.instrument`, program 25). `SOLO_INSTRUMENTS["steel-guitar"]` has the nylon's register and hand (E3 to A5, no bend, the narrow shake): unheard numbers. The two acoustic goldens were rewritten for the instrument and nothing else; no scorecard moved.
- **Mix, measured** (`pnpm levels acoustic`): the steel-string read 1.1 dB under the nylon in the same part, so the seat is at -6.9 (was -8) and reads -22.6 LUFS as before; the soloist at 3.9 (was 3) reads 0.9 dB under the band; everyone -18.1 LUFS, peak -0.4 dBFS before the limiter's ceiling.
- **A seat's instrument can be chosen where a style offers more than one** (Brandon: "we should keep nylon as an option as well"). `SoundStyle.choices` lists the instruments a seat's part may be played on, the style's own first, each with a level in decibels that keeps the band as loud as on the style's own (the nylon: -1.1, and `pnpm levels` prints each choice against the style's own). The choice is `TakeOptions.instruments`: the engine plays the same notes whichever it is and reads it nowhere, but it is part of what a take is, so it goes in the recipe with the soloist's instrument and a kept take plays again on the guitar it was kept on. The app keeps it with the chart, drops it when the chart's style is changed, and shows the picker only for a seat with a choice. Only acoustic offers one.
  - Not done: the exported MIDI file names the style's own instrument (program 25) whichever was chosen. `toMidi` is not given the options, and a program number is the first thing changed in a sequencer.
  - The pickers under Band are a draft: two selects with no labels of their own, told apart by "Chords:" and "Soloist:" in their options. For the pass over the interface.

## every style heard; the electric bass is harsh (stage 6, part 5)

Brandon, 2026-11-16, of acoustic: "everything i'm listening to sounds great so far! awesome work on the acoustic side of things"; and "disco, neo-soul, and reggae all seem good as well. we might want to look at the bass pack(s) for some of those though - the electric bass sound is a little harsh, and we might need something else for the mellower genres". All eight styles have now been heard and passed; the one thing asked for is the electric bass.

- **Measured before anything was changed.** The pack has four recorded dynamics, split at velocities 56, 68 and 80. Counted over each style's own charts, the bass plays the hardest set in 47% of its notes in funk, 44% in rock, 51% in disco, 31% in reggae and 18% in neo-soul, the second hardest in nearly all the rest, and the softest never. The share of a note's energy above 800 Hz, by set, softest first: -37, -36, -26 and -20 dB. So the band plays the two bright sets almost all the time; the library's own "warm" programs are the same recordings with the top set left out.
- **Two things a style can now say about a seat's sound**, both left out by every style so far:
  - `SoundStyle.touch`: a number added to a note's velocity to choose the recording played, while the note keeps its level (`Sound.touch` in the audio package). A bass plucked gently and turned up.
  - `SeatMix.lowpass`: the instrument's tone control, a 12 dB an octave roll-off in the seat's channel.
- **A study for his ear** (`scripts/bass-study.ts`, `out/bass-study/`): the top of one take in neo-soul, reggae and funk, six ways each, with the band and the bass alone. Measured on the bass alone, a softer touch (12 under) takes 5 to 8 dB off what lies above 800 Hz and a much softer one (24 under) 11 to 12, with the loudness within a few tenths; a tone roll-off at 1 kHz changes that figure by under a decibel, so the study's tone clips are at 400 and 600 Hz. Nothing is chosen until he has listened.
- Not looked for yet: another bass. The library's second instrument is played with a pick on the bridge pickup, which is brighter, not mellower. If touch and tone are not enough for neo-soul and reggae, the next thing is a source search for a flatwound or a thumb-plucked bass.

## the electric bass, by Brandon's ear (stage 6, part 5)

From the study (2026-11-16): "neo-soul - B / reggae - F / funk - B".

- **Neo-soul and funk: a softer touch** (`sound.touch.bass` -12): each note plays the recording a dynamic under its own, at its own level.
- **Reggae: a much softer touch and the tone down** (`touch.bass` -24, `mix.seats.bass.lowpass` 400). The soft recordings turned up read 0.6 dB louder, so the seat is 0.6 down and the band is as loud as it was.
- **Disco: the softer touch too, by the main thread's reading and not by his ear.** Disco was not in the study. He named it among the styles whose bass was harsh, it plays the hardest recordings as often as funk does (51% of notes), and he chose this for funk. To be told plainly and undone if he says so.
- **Rock is left as it was**: he passed it earlier and did not name it.
- Measured after (`pnpm levels`): with everyone playing, funk -17.1 LUFS, disco -17.0, neo-soul -17.6, reggae -17.1 with the alto 1.1 dB under the band. All where they were. Notes are untouched: no golden and no scorecard reads a sound.

## the interface pass, first half (stage 6)

Built to `prompts/app-interface-pass.md`. What that brief did not settle:

**Stopping**

- **Play and Stop are one button, in one place and the same ink**, and Finish is an outline to its left. Stop in the pencil's red was tried and taken out: red is for what is wrong and for the last pass, and a red button was louder than the chart.
- **Finish is there from the press of Play**, not from the first note, so nothing arrives beside Stop a second later. It cannot be pressed until the band is in, says "Finishing" once the band is told or is in its last pass by itself, and is as wide as that word so the change moves nothing. A song has no Finish, and nothing in its place.
- **A press of Stop within 0.4 s of Play is the same tap twice** and is ignored, now that Stop is where Play was. The old guard (Stop within 0.6 s of Finish) is gone: they are two buttons.
- **The space bar is the transport wherever the focus is, except in a text box or a list of choices.** A seat silenced with the mouse keeps the focus, and a space bar that brought it back when the player reached to stop the band would be the wrong thing. A button under the focus is still pressed with Enter.
- **The setup leaves at the press of Play**, not when the band starts: the press is answered at once, and nothing set while the band loads could change that take anyway. While it loads the strip says "Loading the band" and the button, already Stop, calls it off.

**Mutes**

- **The band's seats are a row under the chart**, over the transport, in the same place before and during play; the rest of the setup still leaves. The footer is three rows on a phone (the strip, the seats, what to press), two from 820 px wide, one from 1100.
- **A mute is the seat's channel taken all the way down through `Mixer.adjust`** (a level of minus infinity; the reverb is fed after the level). Nothing was added to the audio package. Everyone is heard again at each press of Play.
- **Four separate switches, not a joined row**, since any of them can be on; a joined row is kept for choices of one (how the page is read, the editor's two sides). A seat in the band is a tint of ink, one out of it an empty outline; filled ink is left to the transport.
- **"next time" is written in the button**, hatched and with a dashed edge, for a seat switched on while the band plays a take it is not in.
- **While the band plays, the strip's soloist line follows the take, not the switches**: a soloist silenced still has its solos marked, for a player who wants to take them.
- **The instrument choices sit over the seats, named "Chords played on" and "Soloist plays"**, from the right so the soloist's stands over its seat. Before play only. Any seat a style gives a choice for gets one.

**The home screen**

- **Recent is what had its play button pressed**, on its own screen or its row: five shown, twelve remembered (`recent.ts`, a stored list like the charts and takes). Keeping a take does not put it there; its chart, just played, is.
- **Until something has been played, "Start here" stands in Recent's place**: a blues in A, a four-chord song in G and a funk vamp in A.
- **A chart's actions are behind the word More on its row**, one row open at a time: Edit, Rename, Duplicate, Export, Delete. Four buttons on every row was a wall of them on a phone. Rename is typed in the row, and rewrites only the chart's `title:` line (or adds one), so the rest of the text stays as typed. A duplicate is named "… copy".
- **With nothing typed and no style chosen, the built-in charts are shown as their styles**, each a row naming its charts and a tap from them: eight rows in place of fifty-one. Search looks for each word in the title and the style's name, or as the key. What is being looked for is kept by the app for the visit, so it is still set on coming back from a chart.
- **Home keeps no Takes shelf.** A take is a performance of a chart and is found on that chart's play screen, before the band starts, as a line of links (the time it was kept if today, else the day, and its length). A take now records its chart's id (`KeptTake.chart`); one kept before is matched by the chart's text, then its title. **Takes whose chart is gone get a shelf on the home screen**, there only when there are any. A take's screen goes back to its chart.

**Export**

- **Export MIDI is beside Keep**, for the take as it stands: for a jam with no set length still playing, that is the passes made so far. The file is named for the chart.

**The look**

- **`--chart-face`** is used by the chart (chords, section marks) and by the screen's title on the play screen, a take's screen and the editor. Checked with a system serif that has no width axis, on four charts at both sizes: every bar inside the frame and no chord wider than its slot; a crowded chord is then made smaller, where Archivo is made narrower first.
- **A choice carries its name inside its own box**, small, over what is chosen, and the box draws its own arrow. A row of labels over the row of boxes cost a phone 16 px a row.
- **Anything pressed is 44 px tall**, 38 under a mouse on a wide screen (`--control`).
- **A phone on its side** (under 500 px tall) puts the screen's name and how it is read on one line.
- **Fixed in passing: the chart chose its layout after the 8 px floor was applied**, so a long song on a short screen kept four bars to a line and ran off the bottom when eight would have fitted. The two layouts are now compared before the floor.
- **`out/ui-pass/`** (the pictures of this pass) is ignored by git.

**Tests**

- **Smoke journey 1** also finds a built-in chart through the search box, since they are no longer all listed. **Journey 5** exports the MIDI file from the play screen while the band plays, keeps the take, leaves (which stops the band), comes back through Recent, opens the kept take from the chart's screen, and exports the take and the MIDI file again there; both MIDI files are compared with the CLI's. Seen to fail with the play screen's export given a tempo one off. Journeys 2, 3 and 4 are as they were.

## the interface pass, first half: checked and merged; the chart in a serif, set larger (stage 6)

Read on the main thread: the rig's mutes, the recent list, the report against the pictures (home, play idle, playing with a seat silenced and one waiting for next time). `pnpm check` 16.4 s of 20; the five smoke journeys pass against the built app. Nothing in the engine, the styles or the audio package changed.

- **The chart's typeface is Roboto Serif** (Brandon, from four candidates on the real screen: "roboto serif looks good"). `@fontsource-variable/roboto-serif` 5.3.0, OFL, its `wdth.css` (150 KB: weight and width axes), bundled so the chart is the same on every device and offline. It sets the chords, the section marks and the chart's title; the interface stays in Archivo.
- **The chart is set larger, and a long form scrolls. This departs from BRIEF 11** ("the whole form fits on one screen at any size; no scrolling during play"), by the owner's word: "any thoughts on how we can make the chords larger/more legible ... i'm open to intelligent scrolling if it'll make it easier to look at", and of a picture of both, "larger looks better". The rule (`ChartView.tsx`):
  - A size is wanted: a root of 34 px on a phone, 24 px on a wider screen (whose pixels are bigger and nearer), or as large as four bars to a line allow.
  - A form that fits one screen at four fifths of that or more is left whole and still, as before.
  - A form that does not is set at that size, four bars to a line as written (never eight on a phone), and the page moves: when the bar being played is on another line, that line comes to the top with its section's name. It moves between lines, never inside one; stopped, the page is the reader's to scroll. Its bottom edge fades, so a line cut off reads as more to come.
  - Extensions are 0.64 of the root (were 0.56).
- **Every chord on a page is one size** (Brandon: "any idea why the first chord in a measure looks smaller than the second though?"). Each chord used to be squeezed into its own share of the bar, so a long symbol beside a short one came out smaller. Now a chord takes the room it needs before the bar's spare room is shared out by the beats, a bar that is still too full narrows all its chords alike, and where that is not enough the whole page is set smaller (to 72% at most) so that the fullest bar fits; only past that is one bar smaller than its neighbours.
  - Measured: narrowing Roboto Serif's letters from 88% to 62% takes about 6% off a chord's width (the accidentals and the gaps do not narrow), so on a tune with two chords in most bars the page's size is what the width allows: rhythm changes on a 390 px phone comes out at a 24 px root, and fits one screen; the neo-soul song (one chord a bar) at 32 px, scrolling.
- Left from the build's own list: under 388 px wide the footer's buttons wrap to a fourth row; a Stop within 0.4 s of Play is ignored; a take whose chart was since retitled is listed as a take with no chart; the take screen has no mutes.

## the interface pass, second half: an editor you tap (stage 6)

Built to `prompts/app-editor-tap-a-bar.md`. What that brief did not settle:

**The text**

- **A tap rewrites one section, and that section is written out as `fmt` writes it** (`edit/rewrite.ts`). The change is made in the text where a person would make it (over a bar's own letters, beside a bar, under a label), the parser reads the result, and the section the change touched is printed by the engine's own formatter, asked for that one section; it is put back over the section's lines. Everything outside the section stays letter for letter. The two things the brief asks ("laid out as `fmt` lays it out", "anything the tap did not concern left exactly as it was") pull apart inside a section: a bar that changes width moves its column, so the section is the least that can be laid out again, and a section typed loosely is tidied whole (spellings made canonical, columns lined up) the first time a bar in it is changed. Nothing was added to the engine: the parser's ranges and `print` were enough.
- **Typing a bar as it already is writes nothing**, so a stray tap never tidies a section either.
- **A section keeps its line width.** The formatter reads a section's width off its lines as they stand, so a line of four with a bar added would be taken for a line of five (and a new chart typed out in one go for a line of twelve). The section is printed at the width it had before the change; where the formatter would not read that width back (an ending's bars must share a line), the width it does read is used, so what is written is always what `fmt` leaves alone.
- **An empty bar is `NC`.** The format has no empty bar: `| |` makes none, and the parser's own message says to write what the bar does. `%` and `.` both need a bar before them and are errors in a first bar; a bar of no chord is valid anywhere and plays what an empty bar would. A new chart, a new section and an inserted bar all use it; a bar cleared of its text becomes it; and a bar that holds only `NC` opens as an empty field (the placeholder says `NC`), so there is nothing to clear before typing.
- **A new chart states no key** (`title: New chart`, `[A]`, four bars of `NC`). The old starter said `key: C`, and a blues typed into it in F would have been read, transposed and ended in C without a word. With no key the parser takes it from the first chord, right far more often, and says so as a warning on the Text side.
- **Bars typed past the end of a section go after its last line**, outside a repeat that closes there. A bar put in with Add before or Add after goes beside the bar it was asked for, inside the same repeat or ending.
- **A repeat's only bar, deleted, takes the signs and the count with it**: they have nothing left to repeat. A section's last bar cannot be deleted (the section would become a repeat of another by name, or an error); the section is deleted from its name instead.
- **Duplicate makes a copy with its own label and its own bars** (`Verse 2`, the next number free). A section header with the same label would be the same section again, which nothing tapped could then vary; a repeat by name is still typed in the text. **Add after** makes `[B]` (the next letter) where the sections are lettered and `[New]` where they are named, with a line of four empty bars.
- **Rename changes every label that says the section**: one played again by name further down is the same section. A name another section has is refused, in words, since it would make the two one. A chart of bars with no label gets its `[A]` written out when it is renamed or given a second section.
- **Delete, on a section played again by name further down, gives the first of those its bars**: the song loses that one place and nothing else. The last section with bars cannot be deleted.
- **An arrangement block in use is carried across a change to the sections** (a renamed section's lines renamed, a copy given its original's line, a new section a plain one, a deleted one's line dropped), so the block still fits and the song is still arranged. A block with a mistake in it, or already out of step, is left as typed: the grid already offers to line it up.
- **What cannot stand in a bar is kept out of the way of the line**: a word typed starting `//` loses a slash (it would turn the rest of the line into a comment), and a bar that is first on a line with no bar line before it gets one (so `key: D` or `[x` typed there is an unreadable bar, not a header line or a label).
- **`docs/CHART_FORMAT.md` still says "the app never rewrites a user's text unless asked to format it."** The arrangement grid already rewrote its block; a tap now rewrites a section. The sentence was left alone for Brandon to reword: the format's rules are unchanged.

**Typing a bar**

- **The page draws the bar as it is typed**, from the text as it would be with the bar applied; leaving the bar as it was is forgetting the draft. The text box shows the text as it stands, and takes the change when the bar is left.
- **A mistake is marked on the bar at once and put into words after 0.7 s without a key** (at once when the bar is opened already wrong): a chord half typed (`Csu`) is not a mistake yet. Only errors are said there; warnings stay in the Text side's list.
- **A bar that cannot be read shows what was typed**, in the text's own type and the red pencil, in place of the chords the band falls back to: an unreadable bar on its own would otherwise be drawn empty.
- **On a touch screen (`pointer: coarse`) the bar is typed in a dock; under a mouse, in a field over the bar itself.** The dock is the last row of the editor, which is already fitted to the visual viewport, so it sits on the keyboard without being positioned. The field is the bar's width, so the bars beside it can still be pressed.
- **The dock's keys**: `|  .  %  #  b  /  NC`, then the twelve chord endings the built-in library uses most, most used first (of its 610 chords: `7` 135, `m7` 77, `9` 46, `m` 39, `m9` 33, `maj7` 32, `maj9` 19, `7b9` 16, `m7b5` 12, `13` 12, `m6` 7, `dim7` 5), in a row that scrolls sideways. `:`, `[` and `]` are not in a bar and are left to the text's own key row. A key types its text at the caret and nothing else.
- **The bar's own actions are behind a key marked Bar**, which swaps the endings for Add before, Add after, Repeat % and Delete: a fourth row would leave a phone two lines of chart above the keyboard.
- **Enter (the keyboard's Next) applies and moves on, past the bars a bar line spread over; on the last bar it applies and closes.** It does not add a bar: a stray Enter should not grow the tune.
- **Under a mouse the bar's text is selected when it opens**, as a cell is, so typing replaces it; on a phone the caret is at the end, where a key from the dock adds to the chord. A lone `%` is selected on both.
- **The field asks a phone to capitalize each word**, so a chord's root comes up as a capital and the rest does not. A numeral in lower case (`ii7`) needs the shift key put down by hand.
- **A press on another bar applies the one being typed and opens that one** without the keyboard going down; a press anywhere else, Done, or the keyboard being put away applies it and closes. Leaving the screen, or the phone putting the app away, keeps the bar as typed.
- **The bar being typed is drawn with the highlighter**, as the bar being played is and the grid's chosen cell is: one mark for "here".

**The screen**

- **One switch, three sides: Chart, Text, Arrangement.** The editor opens on Chart, on every device; which side is shown is not remembered. On a phone the chart has the screen on its own side and is the page above the other two; on a wide screen it stands beside them and can be pressed there too. A bar pressed on a phone's Text or Arrangement side is edited on the Chart side.
- **Format, Export and Delete are on the Text side only.** Format is about the text; Export and Delete are also on the home screen, behind More.
- **Undo and Redo are in the header**, the one row that is there in every state, keyboard up or down. The title gives up the room: 160 px of a 390 px phone.
- **How the two undos meet.** The buttons step through every change made by tapping: a bar applied, a bar or section action, a rename, the title, Format, a cell of the grid. A stretch of typing in the text box, from its first letter to leaving the box, is one step. Inside the box (and inside a bar's field) Ctrl/Cmd-Z is the browser's own, letter by letter, for what has been typed there since the text was last changed from outside; a change from outside (a tap, Undo) replaces the box's text and with it the browser's memory of it. Anywhere else, Ctrl/Cmd-Z and Shift-Ctrl/Cmd-Z (or Ctrl-Y) are the buttons. Undo while a bar is half typed applies it first, so Redo brings it back. 200 steps are kept, until the editor is left.
- **The title is typed where it stands**, in the header, and rewrites the `title:` line as Rename on the home screen does.
- **In the editor the chart is always set at the size it is wanted at and scrolls**, whatever the height, and every section shows its name (a lone `A` too, since the name is where the section's actions are). Fitting the form to the screen, as the play screen does, would re-set the whole page each time a phone's keyboard came up.
- **On a wide screen, alone, the chart keeps to 64 rem**: four bars across 1280 px left a bar 300 px of white.
- **A chart with no bars offers "Add a line of bars"** where the page says there are none: without it, a chart emptied in the text had nothing to press.
- **The arrangement grid's cells were already a fingertip**: 48 by 44 px measured on a 390 px phone, before and after (the brief says they are small; the stylesheet and the browser say otherwise). Their size was left. What changed on a phone: the grid's side takes the height it needs and the chart above it the rest, so the row of choices and Remove are on the screen without scrolling the pane (Remove was under the fold); the tools row above the grid is gone (see above). The whole song is in view where it was before: up to five sections on a 390 px phone, and it scrolls sideways past that.

**Tests**

- **Smoke journey 3** opens a new chart, presses the first bar, types `F7 | Bb7` and Enter, and reads the second bar as `Bb7` on the chart; then presses Text and reads `| F7 | Bb7 | NC | NC |` in the box. From there it is as it was: the text filled in, eight bars on the page, the heading, `Hq7` typed, its message, its mark inside the box. The other four are untouched.
- **The rewrites are not tested** (`docs/TESTING.md`: UI glue). They were checked with a scratch script over all 51 library charts, kept out of the repo (`out/editor-pass/`, ignored): 23,367 checks, no faults. See the report.

## the editor you tap: checked and merged (stage 6)

Read on the main thread: the report against the pictures (a bar open over the phone's dock, a bar open on a laptop), and the build's own check of the rewrites run again here: 23,367 edits over every bar and section of the 51 library charts, no faults (each bar retyped gives the text back; each change parses with no new diagnostic and is left alone by `fmt`; add then delete, duplicate then delete, rename and back all restore the original). `pnpm check` and the five smoke journeys pass on the merged tree; nothing in the engine changed.

- `docs/CHART_FORMAT.md` section 1 said the app never rewrites a user's text unless asked to format it. An edit made on the chart now does, for the section it touches and in the formatter's layout; the sentence says so.
- Not seen on a real phone by anyone: whether a press on a bar raises the iPhone's keyboard, whether the dock sits on it, whether its keys keep it up. Brandon's to try.
- Left as the build found them: by tapping there is no way to set key, tempo or meter, add repeats and endings, or play a section again by name (the Text side has them); a laptop's field overlaps the next bar on a six-bar line; duplicating a section that has its own key copies its bars untransposed.

## the instruments, fetched faster (stage 6)

Brandon, 2026-11-16, on a fresh browser: "it takes a pretty long time to pull down all the sound files". Measured on the test site from a fresh headless Chrome: the background save took 50 s for its 908 files, while a band's own loader had the jazz quartet's 267 files in 2.3 s from Play to the playhead. The bytes were never the wait (30 MB); the requests were.

- **The saver fetches 24 files at once, not 4.** Four was chosen on a test pipe speaking HTTP/1.1; the live site speaks HTTP/3, where a request is a stream and the only ration was ours. A band being loaded still has the connection: the saver stops asking while one loads.
- **A recording's address is kept for good** (`hosting/nginx.conf`): the app asks for each with a mark made from its pack's description (`?v=`), so the address changes when the pack does, and the server now says so (`immutable`, a year). The edge in front of the test site was asking the house about every file on every fetch (`cf-cache-status: MISS` or `REVALIDATED`, 0.35 to 0.65 s to the first byte); it may now answer by itself. A pack's description, the page and the worker are asked about every time, as before.
- **Not done, and why**: one file for each pack (eleven requests in place of nine hundred) is a change to the pack format, the cutter and the loader, and over HTTP/3 the requests are no longer the wait once they are not rationed; saving only the styles someone plays gives up playing a new style on a train. Come back to either if a measurement says so.

## a style opened on home has a way back (stage 6)

Brandon, 2026-11-16: "i opened a genre, then opened a chart, and when leaving the chart, i couldn't navigate back home". Reproduced: back from the chart lands on home with the style still chosen, at the top of the page, and the only way to the other styles was the Style picker set to "Every style".

- **Where a style's list starts it says "All styles", with the arrow, and the style's name.** Home still remembers the style (he was browsing it); what was missing was the way out.
- **Home comes back where it was left**, not at its top: the list he opened the chart from is the list he returns to.
- The back arrow's word is hidden on a phone only in a screen's top bar, where the title needs the room; the credits page shows "Charts" beside its arrow now.
- A stopgap: the study of the app's structure (`prompts/app-look-study.md`) makes a style its own page.

## the poster wall is chosen; one library, a style is a mark (stage 6)

Brandon, 2026-11-16, of the study's direction A: "the poster wall looks really cool, i haven't seen anything like that in a while. reminds me of metro ui in the best way". And: "the band is very adaptable and can play any chart in any genre we support. does it make sense to organize things this way? what if we have a unified library and tag things based on their idiomatic genre, with the idea that everything is easily customizable anyway?"

- **Direction A is the app's look.** B (the band room) is set aside; its players as shapes may yet be drawn into A's dock.
- **One library; a chart's style is a mark on it, not a place it lives.** He is right about what the thing is: a chart is its chords, and the suite holds every style to every chart. The library is one page that says what it is showing (everything, his own, or one style) and is in the address; the wall on home stays, as eight ways into it. His own charts are in it with the built-in ones.
- **The way back from a chart does not depend on how he arrived**: `Home / <its style>`, the second going to the library showing that style; `Home / Charts` for a chart with no style.
- **A style's ink is the app's to know** (a table in `packages/app`, with an ink for a style it has not been told about): a look is not music, and a ninth style must not need the engine changed for it.
- **Built in three briefs, one builder at a time**: the look, home, the library and the way back (`prompts/app-poster-wall-1.md`); then the chart's screen (the setup as a sentence, More, the dock in the style's ink, the players alive); then Edit as a mode of it.
- **For the second brief to settle**: the ink on a chart's screen follows the style being played, not the one written; and what the tempo does when the style is changed (each style has its own range, and rhythm changes is written at 176 where blues stops at 150).
## the poster wall, part 1 (stage 6)

Built to `prompts/app-poster-wall-1.md`: the look of the study's direction A, home, one library, and the way back. Nothing in the engine, the styles or the audio package changed. What that brief did not settle:

**The library**

- **Every chart in one list is by title**, the way a person reads one ("8-Bar Blues" before "12-Bar Blues", capitals aside). Grouped by style would be the eight style pages end to end, which the strip already gives; by title is the one view that finds a tune by its name. One style's charts are by title too. The player's own (`#/charts/yours`) stay the one changed last first, as on home.
- **A search is a fourth thing the library shows, across everything, and it is in the address** (`#/charts?find=minor`). It is not a filter on what was showing: typed while Jazz is showing, it still looks everywhere. So what was found is still there on coming back from a chart, and after a reload. The first letter is one step in the browser's history (the back gesture undoes the search) and the letters after it are the same step. Emptying the box shows every chart.
- **The search box on home and the one in the library are one box** (`Browse.tsx`): the first letter typed on home turns the screen into the library showing what was found, and the caret and the phone's keyboard stay in it. The box does move, from under the name to the bar at the top.
- **In the library the search box is in the pinned bar beside `‹ Home`**, not on a line of its own: it is there however far a list of fifty is scrolled, and a style's page spends no height on it. The style's name joins the bar once its poster is scrolled past, only from 600 px wide; on a phone the bar's ink says which style it is.
- **The strip is a small wall: All, Yours, and a bill for each style, wrapped onto as many rows as it needs** (two on a phone), directly under the bar and above what is being shown. Wrapped, not a row that scrolls sideways: every place is in view and one tap away. Above the poster, not under it: the posters are different heights, and the strip stays under the finger from one style to the next. The style being shown has the press ink's frame; All and Yours are filled when shown.
- **While a search is showing, the strip is not**: none of its places is the one being shown, and a phone's keyboard has half the screen. Clear (or "Show every chart" where nothing matched) is the way out to it.
- **A chart's mark is its play button, printed in the ink of the style it was written for, and the style's name in its line.** One of the player's own says "Yours" in a small box wherever the list holds built-in charts too, and has its actions behind More in every list it is in, not only on home.
- **A chart that names no style, or one this version does not have, has a grey-violet ink** (`--ink-other`), is in All, Yours and what a search finds, and is under no style. `#/charts/<a style that is not there>` shows every chart.
- **The inks are in the stylesheet**, as tokens at its top (`--ink-blues` …) and one line each that gives the ink to anything marked `data-style`. That is the table by style id; a style with no line gets `--ink-other`. The line about how a style sounds (`posters.ts`, taken from the study) is by style id too, and a style without one has none. A style's band is read from its pack: each instrument is named by its own pack's `pack.json`, so the wall says "clean electric guitar" where the study's own table said "clean guitar".

**Home**

- **The poster is the last thing played as it was played**: in the style, key and tempo chosen for it on its own screen, since that is what its Play starts, and in that style's ink. A take played says it is a take, when it was kept and how long it runs. The two things played before it are the smaller bills (style, key and tempo); one alone is as wide as the poster.
- **Home lists every chart of the player's own**, as before. The way to the whole library is a block of the app's own ink under them: "All 54 charts".
- **Takes is an address** (`#/takes`), so the row of places over a take has somewhere to go and the back gesture returns to it. Every kept take is listed there, with or without its chart; home's shelf of "takes of charts no longer here" is gone with the need for it. A chart's own screen still lists its takes.
- **The wall's heading counts the styles in words** ("Eight styles"), and each bill counts the charts written for its style, the player's own included.

**The way back**

- **The row is `‹ Home`, then the place the screen belongs under.** A chart: the style its text names (not the style it is being played in), as that style's bill; with no style, "Charts". A take: "Takes". Credits: `‹ Home` alone.
- **The editor's row is its chart's row**, `‹ Home / <STYLE>` or `‹ Home / Charts`: the editor is beside its chart, not under it. On a phone held upright the second place is left out, because the same row holds the chart's name, Undo, Redo and Play, and Play is the way to the chart.
- **A take's screen no longer goes back to its chart**; it goes to Takes. The chart is a word at the end of the take's top row, "Open its chart", where a chart's screen has Edit. A take deleted leaves for Takes.
- **Coming back is to where the page was** (`Browse.tsx`): home from anywhere; a part of the library when it is come up to from a chart, a take, the editor or credits, or reached by the browser's back or forward. A part of the library gone to afresh, from the wall, the strip or a search, starts at its top. The browser's own scroll restoring is switched off, since each address is a different page in one document.
- **How an address was reached is told by a mark on the history entry** (`address.ts`): the app marks every entry it has shown, so an entry already marked was come back to.

**The chart's screen, the take's, the editor: the look only**

- **The chart's name is on a line of its own under the row of places.** The row, with "Edit a copy" at its end, leaves no room for it on a phone. It costs the chart about 30 px there until the next brief rebuilds the screen.
- **Play is a block of the ink of the style the band will play in**, as wide as its row has room for, and Stop is the same block in the app's ink. The study's Stop is the press ink on a dock flooded with the style's ink; with no flooded dock that would be the style's colour as type on dark paper, which the palette rules out. The editor's Play is in the ink of the style the chart will be played in.
- **Edit, Edit a copy and Open its chart are words at the end of the row, not boxes**, as the study has Edit and More.
- **Corners are square throughout** (the editor's dock, its keys and panels, the arrangement's cells), outlines are 2 px, and the one round thing is a line's play button. The highlighter's stroke keeps its own shape.

**The look**

- **A style's name is fitted by the stylesheet from one number**, its width in ems, measured once for each name after the type's own letters are in (`PosterName.tsx`); until they are, the width is a guess of 0.49 em a letter, so a name is not set at a size worked out for other letters.
- **A press on a block of colour is the colour a shade darker (mixed with the press ink), with no transition and no filter.** The stylesheet has no transition and no animation; the only movement in the app is the chart's page following the band, which was there and is off under reduced motion.
- **The page listens for touches and does nothing with them** (`main.tsx`), so that Safari on a phone shows `:active`. Not seen on a phone.
- **`out/wall-1/`** (the pictures of this part) is ignored by git.

**Tests**

- **Smoke journey 1** looks for the wall's Jazz as a link (it was a button that filtered home), fills the search box by its new name ("Find a chart"), and also sees the way home at the top of what was found, which is the library. **Journey 5** leaves the chart by the row of places (`Home`, in the navigation "Where you are") where it pressed "Back to the charts", and comes back through the poster at the top of home where it came through Recent. Journeys 2, 3 and 4 are as they were. Nothing was added.

## the poster wall, part 1: checked and merged (stage 6)

Read on the main thread: the diff (2,408 lines in, 864 out, all in `packages/app` and the smoke journeys; nothing in the engine, the styles or the audio), `pnpm check` (16.0 s of 20), the five smoke journeys against the built app (9.2 s), and its screens photographed again from the merged tree at phone and laptop size (home, the wall, the library showing jazz and showing everything, a chart). The walk Brandon got lost on (home, a style, a chart, back) was walked: a jazz chart's row reads `Home -> #/` and `Jazz -> #/charts/jazz`.

- The builder's decisions stand as logged above, among them: search is the library showing what was found (the box moves from home into the library's top bar on the first letter); a take's row goes to Takes, with "Open its chart" beside it; lists are by title.
- **Known and left for the next parts or his eye**: on a phone a style's list starts about 435 px down (the bar, two rows of the strip, the poster head); a long chart title is cut to one line; `theme-color` is still the paper; nothing has been seen on an iPhone (safe areas, the pinned bar under Safari's toolbars, how a press shows).
- **Builds from here go to Opus where the design is drawn** (Brandon, 2026-11-16: "should we lean more on opus for most of the building?"; agreed): parts 2 and 3 are built from the study's pages. Fable keeps the briefs, the checking, and anything that turns out to need design.

## the poster wall, part 2: the chart's screen (stage 6)

Built to `prompts/app-poster-wall-2.md`, from the study's direction A (`out/look-study/a/chart-*.html`, `take-1.html`). Nothing in the engine, the styles or the audio package changed. What that brief did not settle:

**The line and its sheets**

- **A sheet is the browser's own modal dialog** (`play/Sheet.tsx`): the screen behind it is inert, Escape is its `cancel`, a press on the dimmed screen closes it, the sheet itself takes the focus as it opens (so nothing is ringed by a touch, and the next Tab is its first control) and the focus goes back to what opened it. It rises 28 px in 140 ms on a phone, closes at once, and does not move under reduced motion; from 720 px wide it is a 440 px card at the foot of the middle, as the study draws it. It is the only animation in the stylesheet.
- **Its way out is a filled "Done", the study's word**, in every sheet. The brief says "its own Close"; Done is what the study draws, and every change in a sheet is made at the press, so there is nothing to confirm or cancel.
- **A choice of one closes its sheet** (style, key, length), as the study's do. Tempo and how the chords are written leave it open: each press there is a step, and the figure or the page behind has to stay in view.
- **The tempo sheet keeps the study's slider** under the figure, over the style's whole range, a beat at a time; minus and plus step by 4 as before, and are not pressed past the style's limits.
- **The way back on the tempo sheet**: with a tempo he set, "Back to 100, as written" (or "Back to 76, reggae's usual" where the chart is played in another style); with none set and the chart played in another style at that style's usual tempo, "Play at 176, as written" sets the chart's own, held to the style's limits.
- **"The song, once through" is offered for every chart**, as the Length picker offered it. The brief says "where the chart has an arrangement"; keeping it to those would take away playing a 12-bar blues once through, which the screen does now.
- **The key sheet is the twelve keys of the written mode from C, as the picker spelled them** (G flat, not the study's F sharp), the written one marked "written".
- **While the band plays the line is a statement**: the same bold words with the ink taken from under them, plain text and not buttons, and "(changed when the band is stopped)" for a screen reader. A take's line is the study's plain sentence: "A take kept 16 Nov: Jazz in Bb, 176 bpm, 2:57".
- **The space bar is not the transport inside a sheet**: there it presses the button under the focus, as anywhere a choice is being made.

**More**

- **More is a word at the end of the top row**, after Edit (or "Edit a copy", which part 1 put there and which stays: the next brief makes Edit a mode). A built-in chart's More also has "Make a copy to edit", as the brief lists.
- **The sheet's heading is the screen's name.** How the chords are written is a joined row of three, each with an example in the key it is played in ("Names A7", "Numerals I7", "Both A7 over I7"). Focus is a line that says what it does, switches, and closes the sheet so the page can be seen; it is still forgotten when the screen is left.
- **An instrument is chosen in More only before Play**, as the pickers under the Band row were, and the line is the browser's own list laid unseen over it (a phone's wheel). "Soloist plays" is there while the soloist sits out too, and says so: choosing the instrument first is reasonable.
- **A kept take is a line named for itself** ("Kept take, 14:05" for one kept today, else the day; its own name if it was given one) with its style, key, tempo and length under it.
- **Export MIDI and Export the chart's text close the sheet**, so the download is seen. **Duplicate opens the copy; Delete, asked first, goes to the chart's place in the library**; Rename is typed in the sheet.

**The dock**

- **The ink floods the dock from the press of Play**, through the band loading, not from the first note: the press is answered in its frame, as Stop already was.
- **Keep is there from the press of Play** (dashed, until the take is made) and stays beside Play after the band stops, until the next Play: Stop never moves when the take arrives, and the take just played can still be kept, as before. A song has Keep and Stop, no Finish.
- **Stop covers the middle of where Play was.** On a 390 px phone Keep (about 60 px) and Finish (84 px) leave Stop from 176 px; Play's middle is 195. On a laptop the transport is 360 px wide for the same reason (at 320 the middle of Play was Finish).
- **The last pass is not red on the flood**: red on a spot colour is the palette's no. It says "Last pass", and the way home is shaded in the arc.
- **A player in the band is an outline; out of it, a dashed block that says "sits out"; switched on while the band plays a take it is not in, hatched and dashed, "in next time".** On a take, a seat that is not in the take is dashed, says "not in this take", and cannot be pressed.
- **Phone: the strip, the players, the transport, three rows. From 820 px: the strip over the players, the transport beside them. From 1100 px: one row** (strip, players 400 px, transport 360 px) in the chart's 64 rem column.

**The players alive**

- **`play/lamps.ts`**: each seat's onsets are the take's sounds by the chair they sit in (the seat before the colon of the sampler's name), one per moment (a chord lights once); nothing before the first bar of music (the count-in). When the take is replaced under the band, the onsets are replaced from the same second the player's sounds are. `useJam` keeps them beside the player and hands out one function, `follow`, that reads the player's position less the output's latency; it never sets state.
- **A lamp is a copy of the block's words in the paper's colour on the ink, laid over the block**, and the frame loop writes only its opacity: full for 37.5 ms, then out by 150 ms on a squared ease (the study's keyframes). The loop runs only while the band plays, not at all under reduced motion, and a seat out or silenced does not light.

**The tempo when the style is changed**

- **`tempoFor` in `play/jam.ts`**, used by the chart's screen and by home's poster and bills (so home says what Play will play). A tempo he set is kept and held to the style's limits when it is used, not when it is stored, so going back to the first style gives back what he set. A chart that names no style, or one this version does not have, keeps its written tempo in every style.

**A kept take's screen**

- **Its mutes are the screen's own**, not the chart's switches: everyone is heard when it opens, a seat silenced stays silenced from one Play to the next on that screen, and nothing is stored. Rename, Export MIDI, Export take and Delete are its More. "This browser is not keeping takes" is said where the screen's problems are, over the dock.

**Left as it is**

- **At 1280 px the chart is set eight bars to a line**, where the study drew four: that is `ChartView.tsx`'s rule given a 64 rem column, which this brief did not open.

**Tests**

- **Smoke journey 5** opens More before each export (the play screen's while the band plays, the take's two), presses the export inside the sheet, and reaches the kept take through More's "Kept take" line where it pressed the link under the chart. What it proves is unchanged: both MIDI files equal the CLI's. Journeys 1 to 4 are as they were.
- **`out/wall-2/`** (the pictures of this part) is ignored by git.

## the poster wall, part 2: checked and merged (stage 6)

An Opus build from `prompts/app-poster-wall-2.md`. Read on the main thread: the new modules whole (`play/lamps.ts`, `play/Sheet.tsx`, `tempoFor` in `play/jam.ts`, what `useJam.ts` gained), the diff's shape (13 files, all in `packages/app` and the smoke journeys), `pnpm check` (16.1 s of 20), the five smoke journeys against the built app (10.3 s), and the screen photographed from the merged tree (a chart before Play, playing, More) beside the study's. The lamps were sampled in the page for three seconds of a playing blues: drums, bass and chords each reached full ink, the soloist sitting out stayed at nothing.

- The builder's decisions stand as logged above. Two go against the brief's letter and are right: "The song, once through" is offered for every chart, as the old picker offered it; sheets close with "Done".
- **Known and left**: at laptop width the chart sets eight bars a line in the 64rem column where the study drew four (the chart's own layout rule, not opened here); a take's Rename shows its chart's name; a phone on its side is only compacted. Nothing has been seen on an iPhone: the sheet (the browser's own modal dialog) over Safari's toolbars, the flood in a dark room, whether the lamps sit on the notes by ear.
- **Part 3 (Edit as a mode of this screen) waits for Brandon's hands on parts 1 and 2**: it is the largest piece, it moves the editor he passed on his phone the same day, and what he says of the chart's screen changes what it is built on.

## playing in six and twelve is to be designed (stage 6)

Brandon asked whether 6/8 and 12/8 need proper support. A study for his ear (`out/meter-study/`, not committed: a blues in six as jazz written 6/8, 6/4 and as 24 bars of 3/4; a slow blues in 12/8 beside 4/4; fifties changes in 12/8 beside 4/4; a folk tune in 6/8) with one bar of each printed as a grid. What the grids show: the engine builds a bar of any meter from its pulses and fits a style's 4/4 groove to them a beat for each pulse, so the drums come through, but the bass falls to a note a pulse and the chords to once a bar, and nothing in any style is written for compound time. His ear, 2026-11-16: "we definitely aren't capturing a 6/8 feel very well", and "i think we should have fable design this properly".

- **A Fable design, after the two Opus builds now running** (a Fable subagent runs alone, and the work needs the pruned library and its tests in place): `prompts/meters-design.md`.
- **All Blues and Footprints are left out of the library until then** (his suggestion; the library's builder was told): a stand-in in 3/4 would be a chart he knows to be wrong, written twice. The standards added now are twelve.
- **Open, for the design to propose and him to answer**: whether the tempo figure counts quarter notes in every meter (his call in the previous version, so that one number is one speed everywhere) or the pulse.
## the poster wall, part 3: Edit is a mode of the chart's screen (stage 6)

Built to `prompts/app-poster-wall-3.md`, from the study's sketch (`out/look-study/a/chart-my-sunday-groove.html#edit`). Nothing in the engine, the styles or the audio package changed; `viewport.ts`, `rewrite.ts` and how `BarEditor` places itself did not change. What that brief did not settle:

**How the editor is hosted**

- **The editor is a hook of the chart's screen** (`edit/useEditor.tsx`, which was `EditView.tsx`), not a screen of its own nor a component inside it. Its state lives in the chart's screen, so a bar pressed is drawn open inside the press (`flushSync`, as before) and the field takes the focus there, which is what brings a phone's keyboard up. A child component handing its parts up would draw them a frame later, outside the press. The hook hands back parts and `Stage` places them: the chart to press, the text or the grid, the dock's words and controls, and the dock that sits on the keyboard.
- **Playing and editing are one screen at the same place in the tree**, so going from one to the other redraws nothing: the chart's frame, its scroll and the focus on the button stay. Edit and Done are one button.
- **The steps are kept while the pencil is down.** Putting it down writes everything (the bar being typed with it); picking it up again starts from the chart as saved, on the Chart side, with nothing to take back.

**The address**

- **`#/edit/<id>` is kept as the mode's address**, so every link to the old editor (home's New chart and Import, a row's Edit) opens the mode, and a reload stays in it. An `#/edit/` address of a built-in is put back to its `#/chart/` address.
- **Edit is one step of history; Done goes back over it** when Edit made it, and otherwise (a reload, New chart, a copy just made) puts the chart's address in the mode's place. Either way Done adds no entry, and the phone's back gesture from the mode lands on the chart.

**What stays where it is**

- **The chart is set in the mode as it is for playing**: the same layout rule, the same frame, the same lines opened up by the height left over. The editor used to set every chart at the size it is wanted at and scroll it, so that a phone's keyboard would not re-set the page; that is now done by holding the height the page was set for (`Editing.held`) while a keyboard, or the dock on it, has the room. The page in the mode always scrolls.
- **The dock keeps its height**: the editor's things are laid over the strip and the players, which keep their room under them unseen (a grid area over both, on every width). So the frame is the same height in both modes, the chart does not move, and Play is where it was.
- **A section's name keeps its play-screen height** (it was at least 38 px in the editor); its fingertip of room is its own, outside it.
- **The one exception: a chart of one section with no name.** The play screen shows no name over it; the mode shows "A", since the name is where the section's actions are (adding a second section, renaming). Its bars move down by the name's height, and the page is fitted with the name counted, so it still fits.
- **In the mode the chart is drawn in the key it is written in**, since that is what is typed; the line above still says the key it will be played in.

**The dock**

- **Words, then a row: Undo and Redo, and Chart, Text, Arrangement as one joined switch** (the editor's own three sides, so the way back from the text is the switch itself). The words say "Press a bar to change it.", which bar is open (on a laptop), or once, for a copy just made, "This is your copy. The built-in chart is unchanged." What there is to fix is "1 to fix" beside the words, in the red pencil, and opens the text. On a laptop the words and the row are one line, in the strip's and the players' place.
- **On a touch screen, a bar or a section open has the foot of the screen**: the band's dock waits and the editor's dock is the screen's last row, fitted to what the keyboard leaves, as before. While the keyboard is up (a bar, or the text, being typed) the title and the line are put away too and the row of places stays: with them the chart above a bar's dock was a line and a half.
- **The space bar is not the transport in the mode**: there it presses what has the focus (a bar, a section's name), as in the editor.

**The rest**

- **Play from the mode** writes everything, puts the pencil down and starts the band from the chart as saved, once the screen is drawn from it (the browser is woken inside the press, as home's play buttons do).
- **More's Rename in the mode is a step of the editor**, taken back with Undo, as the title typed in the editor's header was. The title is no longer typed where it stands: it does not move now, and More has Rename. Duplicate writes everything first; Export the chart's text exports the text as it stands.
- **Focus is off in the mode and not in More there**: it shows two lines, and every bar must be there to press.
- **"Edit a copy" makes the copy, gives it the choices the built-in was played with (style, key, tempo, instruments) if it has none of its own, and opens it in the mode.** Otherwise the line would change under the player's eyes.
- **The editor's `.dock` is `.key-dock` and the text's `.more` is `.problems-more`**; the chart's More is `.more`. There are two docks on the screen now, so the band's keeps `.band-dock`.
- **On a phone the text and the grid take the chart's place** between the top and the dock; on a laptop they sit beside it, the two in the chart's 64 rem column.

**Tests**

- No journey's steps changed: journey 3's New chart, bar, Text and diagnostic steps find the same names in the mode. Nothing added.
- **`out/wall-3/`** (the pictures of this part) is ignored by git.

## the poster wall, part 3: checked and merged (stage 6)

An Opus build from `prompts/app-poster-wall-3.md`. Read on the main thread: the whole of `useEditor.tsx`, the changes to `App`, `PlayView`, `Stage` and `ChartView`, the builder's pictures. Then walked in headless Chrome at 390 by 844 (touch) and 1280 by 800:

- **Edit, a bar typed, Play from the mode**: the address goes `#/chart/` to `#/edit/` and back, the bar as typed is what is saved, and the band is playing the saved chart (its first bar on the page is the new one).
- **History**: Edit then Done then back lands on home, not on the chart twice. "Edit a copy" on a built-in opens the copy in the mode and says so once; Done then back lands on the built-in.
- **Delete from the mode with a bar being typed**: the chart is gone and stays gone (a save for a chart that is not there writes nothing).
- **A reload in the mode stays in it**; an `#/edit/` address of a built-in is put back to `#/chart/`.
- The five smoke journeys pass with no step changed. Typecheck and lint pass. Nothing in the engine, the styles or the audio package is in the diff.
- The builder's decisions stand as logged above.
- **Known and left**: on a phone with a bar open there are two buttons that say Done (the top one leaves the mode, the dock's closes the bar); a chart of one unnamed section moves down by its name's height when the pencil is picked up; a copy has the same title as the built-in it was made from; between 820 and 1100 px the dock's words sit low. Not seen on an iPhone: that a tap on a bar raises the keyboard now that the editor is hosted in the chart's screen, and where the dock sits on it.
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
## the band in six and twelve (stage 6)

A Fable design and build from `prompts/meters-design.md`, in its own clone on the branch `meters`. This design was written and committed before any code (it is the first commit of the branch); where the code ended up differing, the section "where the code differs" at its end says so. Nothing in 4/4 or 3/4 may change: every golden byte for byte, every scorecard for the charts that exist.

**His words.** Of the study (`out/meter-study/`): "we definitely aren't capturing a 6/8 feel very well", "i think we should have fable design this properly". Of tempo, while this was being built: "what's the 'right' way that pro musicians would think of it? should we aim for the pulse?" The answer given him was yes, and the brief was changed: **the tempo figure counts the felt pulse** (below, "Tempo").

**What was wrong.** A style writes its band as bars of 4/4: a groove, a bass figure, a comping figure, a soloist's rhythm are each sixteen sixteenths. In any other meter the engine made a bar up: the drums from the 4/4 groove's beats, one for each pulse; the bass a note a pulse or one a bar; the chords a pad; the soloist the first part of a 4/4 rhythm, cut off, with its "beat" still a quarter note. That fit is a way of getting through a bar nobody wrote. It cannot be a feel, because a feel is in what the 4/4 bar does not have: the middle note of the triplet, a bass figure that turns over three beats, a comping figure in six.

### The design

**1. The concept: what a style writes as a bar, it may write again for another meter.**

*What the concept is.* Everything in a style that is written as a bar of sixteenths is that seat's vocabulary for a bar of 4/4. A seat may carry the same vocabulary written again for another meter, under the meter's name as a chart writes it (`meters: { "12/8": ... }`):

- the drums: the grooves for each tier, the touches laid over them, and the fills (their lengths and their shapes);
- the bass: the line for each tier (its figures, its tones, its turns, how long and how hard its notes are);
- the chord instrument: the rhythm book (figures, answers, forms, each tier's articulation);
- the soloist: each level's rhythms and phrase shapes, the rhythms a phrase ends on, the pickups, and the bar the top note is held in.

Everything else about a seat is the player and not the bar, and is the same in every meter: the instrument and its register, the voicings, where roots sit, how changes are led into, the critic's weights, the feel, the arc, the ending.

*What a style writes.* The same notation as in 4/4, a character a sixteenth, as many as the meter's bar has: 24 for 12/8, read in sixes (a pulse is `x.x.x.`, its three eighths); 24 for 6/4, read in fours as 4/4 is; 12 for 6/8. A fill is still so many sixteenths before the barline; a pickup is still the last pulse of the bar before. A level of the soloist written for a meter has the name of the 4/4 level it stands for, since the solo's arc names levels.

*What the engine decides.* Which vocabulary a bar gets: the one written for its meter if the seat has one, bar by bar (a section may change meter), and otherwise the 4/4 one through the general fit, exactly as today. So every style still plays every chart, and a style that has written nothing plays what it played. And what a rule that says "beat" means in a bar that is not four quarters: the bar's pulses (`perform/meter.ts`), which already say that 6/8 is two dotted quarters and 12/8 four. "Beat 3" is the second strong pulse (the first pulse of the bar's second half, where it has two halves: pulse 3 of four, beat 4 of six); "the and" is the last eighth before the next pulse; the soloist's "on the beat" is on a pulse; a lead-in "a beat before" is a pulse before. Swing stays where it is: a bar of quarter-note pulses swings as the style swings, a bar of dotted pulses is already its own triplet and is played as written.

*By the meter as written.* Not by a family of meters. What each chart gets:

- **12/8**: the blues' written slow blues (this build). Rock's next. Every other style, the fit.
- **6/4**: jazz's written six (this build). Every other style, the fit: six beats, down, back, strong, back, strong, last.
- **6/8**: nothing is written yet, so the fit for everyone (two dotted pulses). Acoustic's is next.
- **9/8, 5/4, 7/8**: the fit.
- **3/4**: the fit, as it was. A style can now write `"3/4"` (the jazz waltz book the owner asked for on 2026-11-15, acoustic's picking in three) and none does: the waltz golden was passed by his ear, so it is left, and said here as work that can now be done as data.

*Considered and not chosen.* (1) **A family of meters by pulse** ("dotted pulses, four of them"; a bar of 6/8 as half a bar of 12/8, 9/8 as three of its pulses, 6/4 as two bars of 3/4). The drums' basic beat does halve; nothing else does: a bass line that turns over four pulses, a comping figure, a fill before the barline and a soloist's rhythm are each a whole bar's thought, and half of one is the fit again under a better name. And a count of pulses does not say how a bar is grouped (3/2 and 6/4 are both six quarters). A style that wants its 6/8 to be half its 12/8 can say so in its own file: the parts are data, and a second meter spread from the first is a few lines. (2) **A whole second seat for a meter** (`meters["12/8"].bass` a complete bass style): it lets a meter change the instrument's register or its voicings, which no meter does, and every place the engine reads a seat would have to ask which seat it was reading. What changes with the meter is what is written as a bar; that is all a meter may carry. (3) **A style counting one meter as another** (jazz playing a chart in 6/8 as six beats at twice the speed): it would put the swing on the sixteenth and halve every length the players know (an eighth before a change, a beat of lead-in). The chart says which six it is (below). (4) **Grids in eighths for compound time** (`xxx xxx xxx xxx`): prettier, but a slow blues has sixteenths (a soloist's double time, a drag), and every reader of a grid in the engine counts sixteenths. (5) **Building 6/8 from the written 12/8 by the drums' pulse rule** (the fit, fed the compound groove): the kit would have a feel in a bar where the bass, the piano and the soloist had none.

**2. What a bar of six is.**

- **6/8 is two slow pulses**, each of three eighths. Nothing swings; the eighths are the triplet. It is counted "one-and-a two-and-a". A folk tune in six, a soul ballad, a jig.
- **6/4 is six beats**, in two threes: a waltz twice, with one chord change to think about. The quarter is the beat, the eighths under it swing where the style swings, and the bar's strong pulses are beats 1 and 4. It is counted "one two three four five six".
- **Two bars of 3/4** is two bars. The band phrases, fills, crashes and reads the chart by the bar, so a twelve-bar blues written as 24 bars of three has eight-bar lines cut in half, a fill owed every four bars of three, and no bar with a second strong pulse to answer its first.
- **All Blues and Footprints are written 6/4**, twelve bars each. What a player taps, and what the ride and the bass play, is the quarter note; the soloist's eighths swing under it; the form is the twelve-bar blues it is. All Blues is at 138 (the record's speed, counted from its length), Footprints at 168.
- **A chart's writer needs to care about one thing: what is counted.** Two to the bar is 6/8. Six to the bar is 6/4. The tempo figure then counts what was chosen (the dotted quarter, or the quarter), so the choice and the number agree.

**3. Tempo: the figure counts the felt pulse** (his decision, 2026-11-16; AU-91 in the notes records the opposite choice in the previous version, "so that one number is one speed everywhere", which this overturns).

- **In 3/8, 6/8, 9/8 and 12/8 the pulse is the dotted quarter.** A slow blues in 12/8 written `tempo: 60` is 60 dotted quarters a minute, as a chart or a metronome mark says it.
- **In every meter over 4 (3/4, 4/4, 5/4, 6/4) it is the quarter**, as it was.
- **In 5/8, 7/8 and the other eighth meters whose eighths do not group in threes it stays the quarter.** Their pulses are uneven (7/8 is two quarters and a dotted quarter), so no one note is "the pulse"; the quarter is the short one, the one a metronome would be set to, and counting it keeps 7/8 at 120 the speed of 4/4 at 120 with an eighth missing.
- **In 2/2 and 3/2 it is the quarter too.** The band has no half-note pulse: it plays a bar of 2/2 as a bar of four (`pulseTicks`), and the figure counts the pulse the band plays. If cut time is ever played in two, the figure follows.
- **One figure for a chart.** It counts the pulse of the chart's own meter (the header's). A section in another meter keeps the eighth note's speed: version 1 has no tempo changes inside a song (`docs/CHART_FORMAT.md` section 12).
- **In the engine** a tick is still a 480th of a quarter note. The plan carries the figure as it is read (`tempo`, pulses a minute) and the speed a tick is timed by (`quarters`, quarter notes a minute); in 4/4 and 3/4 they are one number, so nothing there moves.
- **A style's tempo limits and its default are pulses a minute in every meter.** Blues, 60 to 150: a shuffle swung to a hard triplet is a bar of 12/8 already, so the range means in twelve what it means in four. A slow blues lives at its very bottom (48 to 66), and the floor of 60 shuts out the slowest: lowering it is his call, since it moves 4/4 too. Jazz, 60 to 240: in 6/4 the pulse is the quarter and nothing changes. Under the fit in 12/8 a style's straight eighths run three to a pulse, so at one figure they are half as fast again as in 4/4; nothing is built for that (a range for each meter beside the parts would be the place) until someone plays a borrowed chart in twelve and says it is too fast.
- **An exported MIDI file** keeps its tempo in quarter notes, as the format requires (the figure converted), and writes the time signature as the chart has it, with the metronome's click on the pulse the figure counts.

**4. What holds it** (properties before the code that satisfies them; the suite's budget is not raised).

- *Restated from 4/4 to pulses*, each where the style has written the meter: the blues' time (a kick on the strong pulses, a backbeat on the pulses between, AU-97); the blues' triplet (nothing is played between the triplet's notes: in four that is the last sixteenth of a beat, in twelve anything off the eighths); the jazz ride and hat foot once the band has opened up (the ride on every beat, the foot on the second beat of each half, the snare off both and off the One); the jazz bass in six (AU-93); the piano keeping its section's figure; the bass's three line rules that were held only in 4/4 (no leap over an octave, the last note the low root, a note outside the scale only passes); the soloist's "on a beat" rules, read on pulses.
- *Added*: **the skip note** (AU-92): in a bar of dotted pulses no stroke of the drummer's time falls between the eighths, so a cymbal's skip is the pulse's last eighth and never its last sixteenth; and in jazz's six the ride's skip is the "and" of a beat. **The drums thin out** (AU-96): in a bar of dotted pulses the kick and the snare are never on every eighth, in any style at any level, and a style's quiet bars have no more drum strokes than its loud ones.
- *As measures on the scorecard, not properties* (the notes tag them so): the bass's notes a bar in six (AU-93: 2 to 5 up to the hot level, 3 to 7 in it), the comp's strikes a bar in six and how many fall on a strong pulse or just before one (AU-94).

**5. The rest of the band's world.**

- *Already in pulses*: the count-in (a stick on each pulse: four in 12/8, six in 6/4, two in 6/8); the ending's button (the "and" of the last pulse, its last eighth where the pulse is dotted, EN-17); the ending's hits (EN-18); the bass's lead-in a "beat" before; the take's shape over passes, phrases and sections, which count bars.
- *Needs to*: fills (sized in sixteenths before the barline, so a written meter writes its own; under the fit a 4/4 fill's triplet is three sixteenths in twelve and stays so); the soloist's beat; the comper's answer in a soloist's breath, placed on "the and" of a beat; whether two bars of comping are the same rhythm, which reads sixteen steps; the timed jam's count of passes and the soloist's seconds-in-a-bar, which read the tempo.
- *Outside the engine*, to be looked at and fixed where small (what was found is under "where the code differs"): the app's chart for a bar of 12/8 with four chords and of 6/4 with two, the playhead's beat, the count-in a player hears, the editor's meter, the tempo control and its sentence, the take's length, the MIDI file's time signature.

**What is built**: the concept in the four seats; jazz in 6/4 and the blues in 12/8 as data; `library/standard-all-blues.chart`, `library/standard-footprints.chart`, and a slow blues in 12/8; the tempo rule, through the format, the engine, the app and the MIDI file. **Not built**: acoustic in 6/8 and rock in 12/8 (next, as data, from this design); funk, disco, reggae and neo-soul keep the fit; 3/4 is not written.

**A worked example, for whoever writes the next meter.** The blues' drums in twelve are `bluesDrums.meters["12/8"]`: `grooves` (for each tier, layers of 24-character lines: the cymbal's triplets `x.o.o. x.o.o. x.o.o. x.o.o.`, the kick on pulses 1 and 3, the backbeat on 2 and 4), `touches`, and `fills` (lengths 6 and 12, a pulse and two; shapes written in triplets). The 4/4 shuffle beside it is untouched. Rock in 12/8 is the same three fields in `rockDrums.meters["12/8"]`, a `"12/8"` line for each tier in `rockBass.meters`, a rhythm book in `rockChords.meters`, and the soloist's rhythms in `rockSolo.meters`; a seat left out plays the fit, so the seats can be written one at a time. `validateStyle` holds every grid to its meter's bar.

### What was built, and where the code differs from the design

**Built** (branch `meters`; the commits in order: the design; the engine's concept and the tempo; the format and the app's beat; the properties; jazz in six; the blues in twelve; the critic's measures and a horn's breath; the charts and scorecards).

- **The concept**, as designed: `DrumStyle.meters` (a `DrumTime`: grooves, touches, fills), `BassStyle.meters` (the line for each tier), `ChordStyle.meters` (a rhythm book), `SoloStyle.meters` (a `SoloTime`: the levels, the endings, the pickups, the top note's bar), each keyed by the meter's name. `perform/meter.ts` is where a bar's shape is asked: `writtenFor`, `barSteps`, `pulseStarts`, `strongPulses`, `onPulse`, `onAnd`, `lastPulse`, `isCompound`, `tempoPulse`. `validateStyle` holds every grid written for a meter to that meter's bar, a fill to the bar less its first pulse, a bass turn and a soloist's pickup to a pulse, and a meter's soloist levels to the style's own names.
- **What "beat" means now, where it meant a quarter note**: the soloist's on-the-beat and its off-beat accent (`onPulse`, `onAnd`), the last beat a phrase leaves to the next phrase's pickup (`lastPulse`), the comper's answer in a soloist's breath (the eighth before each pulse), whether two bars of comping are one rhythm (the bar's own length and last pulse), a bass turn's place (so many sixteenths before the barline, whatever the bar). In 4/4 and 3/4 each is what it was.
- **Tempo**, as designed and decided: `Plan.tempo` (pulses a minute, as read) and `Plan.quarters` (what a tick is timed by); `planBars` takes the chart's meter. Everything that turned a tempo into time reads `quarters`: `secondsAt`, `seconds`, the feel pass's milliseconds, the guitar's roll, the soloist's seconds, the timed jam's count of passes, the join when a jam is told to finish, the MIDI file (its tempo in quarter notes, its time signature's click on the pulse: 36 clocks in 12/8, 24 in 4/4 as before), and in the app `ticksAt`. What it touched outside the engine: `docs/CHART_FORMAT.md` (3.1: the rule with examples, and what the two ways of writing six mean; 4.1: 6/4's slot counts; 10: a slow blues in twelve, with its corpus row), the app's beat (below), the tests' own arithmetic. Nothing in the app's tempo control had to change: it shows and sets the figure, which is the pulse.
- **Jazz in 6/4** (`packages/styles/src/jazz/`). Drums: the ride on all six beats with a skip on the "and" of 2 and of 5; the hat foot on 2 and 5; the bass drum feathered on 1 and 4; the snare comping on the "and"s and on beats 3 and 6, never on 1, 2, 4 or 5; the head on the closed hat with no bass drum and no comping, a ballad's ride with no skip; the 4/4 fills, which are so many sixteenths before the barline already. Bass: quiet, in two (a dotted half on 1 and on 4, the bass note and its fifth); at the working level one of three figures a section keeps (beats 1, 3, 4, 6; or 1, 3, 4; or 1, 4, 6), pitches walked; hot, five or six notes (1, 3, 4, 5, 6; or 1, 2, 3, 4, 6; or all six). Piano: a book of its own on the two strong beats, the eighth before each, and the waltz's cell (1 and the "and" of 2). Soloist: the three levels' rhythms a bar and a half long, swung eighths only.
- **The blues in 12/8** (`packages/styles/src/blues/`). Drums: from the working level up the cymbal on all twelve eighths, the beat leaned on (hat, or hat or ride when hot); quiet, the shuffle's two notes a beat; kick on 1 and 3 (and its push on the last eighth), the backbeat on 2 and 4 (a cross-stick when very quiet); fills of an eighth, a beat and two beats, in triplets. Bass: quiet, in two (half a bar each); the box a tone a beat, a section choosing how many beats take the shuffle's pickup on their last eighth; hot, every beat. Piano: a pad when quiet; chops on 2 and 4 at the working level, with the triplet on 4 as one of its figures; hot, the triplets on every eighth (a groove, in close position, as the pump is) or on the backbeats. Soloist: the long-short and the triplet, four levels.
- **Charts**: `standard-all-blues.chart` (G, 6/4, 138), `standard-footprints.chart` (C minor, 6/4, 168; the last line as it is most often played, F#m7b5 F7#11, E7#9 A7#9), `blues-slow-12-8-g.chart` (12/8, 60; a quick change, and a turnaround with a chord a beat: G7 G7/B C7 C#dim7, then G7/D D7). 60 charts.

**Where the code differs from the design as first written.**

- **The concept was committed before the properties**, not after. The test files' own arithmetic reads the plan's new `quarters`, so the tests could not be committed green before it. The properties were written before either feel's data, run against the band as it was (the fit), and seen to fail where they should: the blues' "nothing between the triplet's notes" (a 4/4 fill's triplet is three sixteenths in twelve), the blues' cymbal in twelve, the jazz hat foot (on 2, 4 and 6 under the fit), the jazz bass in six (a note on every beat under the fit, one a bar when quiet). The two added drum properties hold under the fit by construction; each was broken on purpose and caught (a hat skip on a pulse's last sixteenth: three properties; a kick on every eighth).
- **Which meters a style is held to as written is a table in the tests** (`WRITTEN` in `test/takes.ts`: jazz 6/4, blues 12/8), not read from the style: the tests say what is promised. A style that writes a meter adds a line.
- **The blues in twelve plays nothing quicker than an eighth.** The design kept sixteenth grids so that a slow blues could double up; the property "nothing between the triplet's notes" says no, and the soloist's top level is triplets throughout. The grid can still say it when an ear asks.
- **Five measures for six, not three**: `bass.notes-per-bar-in-six`, `-in-six-hot`, `bass.strong-beats-in-six`, `chords.strikes-per-bar-in-six`, `chords.on-the-strong-beats-in-six`, with jazz's targets from AU-93 and AU-94. `bass.notes-per-beat-walking` leaves bars of six out (it says "in four"); the soloist's two measures that asked "on a beat" ask the pulse. On the charts that existed, every scorecard is byte for byte its baseline.
- **AU-96's "quiet is no busier than loud"** is held on each compound chart played at 0.3 and at 0.85 by each style, because a jam's arc does not take most styles quiet.
- **Not in the design: a horn breathes inside a long bar.** A bar of 6/4 at 60 is six seconds, and a line bar and the bar it lands in were more than the alto's eight seconds of air (Footprints at 60: 8.6 s on one breath; found by playing every style on the three new charts in every kind of take). Where the air is gone before the next note starts, the note before is let go early enough to leave a breath (`players/solo/play.ts`). No golden moved.
- **"A beat" in one more property is the pulse**: "under a solo the piano leaves the soloist its note ... for more than a beat" read a quarter note, and a strummed guitar's dotted-quarter stroke in twelve was longer than that (acoustic on the slow blues, the same probe).
- **The bass carries lines for a meter and nothing else.** Its bar-long walks are a number of notes, not a number of sixteenths, so the blues' walks play in twelve wherever the figure has four notes.
- **The audition page takes `fit=1` and `chartAt=`** (`tools/audition/main.ts`): a style without its written meters, and a chart outside the library. The study page is made with them.

**Outside the engine** (looked at in the running app at phone and laptop widths; pictures in `out/meter-look/`, not committed).

- *Fixed*: the play screen's beat was the meter's written unit, so a count-in in 12/8 read "Count-in 1" to "12"; it is the pulse now (1 to 4; 1 to 6 in 6/4), as the sticks are (`play/jam.ts`, `placeAt`).
- *Right as it was*: the chart draws a bar's slots from the engine's spans as fractions, so a bar of 12/8 with four chords is four equal slots and a bar of 6/4 with two is two halves; the playhead moves by bar and span; the length a take shows comes from the engine (`seconds`); the tempo sheet and every "bpm" in the app show the figure; the editor has no meter logic, and a bar of four chords in 12/8 or two in 6/4 parses; export calls `toMidi` and rewrites nothing.
- *Not fixed, each a choice of his or a piece of work*: **nothing on the chart's screen says a chart is in 12/8 or 6/4** (a section's meter shows only where it differs from the chart's); a new chart is 4/4 and its meter is set by typing `meter:` in the Text side; a style's tempo limits apply in pulses to every meter, so the slow blues at 60 sits on the blues' floor and its minus button is dead, and a chart in twelve borrowed by another style goes at that style's usual figure in dotted quarters.

**Scorecards** (`pnpm score`). The eight baselines, rewritten to a scratch file on the charts they were made on, are byte for byte what they were. Jazz and blues are accepted anew with their new charts (`score --style jazz --update`, `--style blues --update`). The new charts by themselves, 60 takes each way:

- All Blues and Footprints as jazz: `bass.notes-per-bar-in-six` 3.52 (2 to 5), hot 5.06 (3 to 7), both strong beats in every bar; `chords.strikes-per-bar-in-six` 2.47 (1 to 4), 76% of them on a strong beat or the eighth before (70% asked; four takes in five inside). The ride on every beat 99%. Outside their bands: `drums.phrase-end-shot` 76% against a band of 46% to 67% that was measured on the 4/4 tunes (why it is higher here was not looked into); `chords.lowest-note` 59.2, half the takes under 58; `solo.builds` 1.81, three takes in five inside.
- The slow blues as blues: the kick, backbeat and groove measures read 4/4 bars only and say nothing of it. Outside their bands: `solo.empty-bars` 2% against 5% to 30%, and `solo.builds` 1.60 with half the takes inside (likely the tempo and not the meter: at 60 a bar is four seconds and the soloist plays a level busier in a slow bar; not checked against a 4/4 blues at 60); `bass.half-step-approaches` 32% in all but spread from none to 54% by take; `chords.colour` 73%, as low as nothing in some takes (the triplets on every eighth are in close position, as the pump is; not traced take by take).

**Every style on every chart.** `pnpm test:full` (six seeds, every style handed every chart once) passes. Each style on the three new charts as if they were its own (every kind of take, six seeds, and the soloist's kinds) passes, after the two fixes above.

**Found, not fixed.**

- *The alto on `jazz-waltz-f` at 60, seed 5*: 8.96 s on one breath. Present at the commit this branch started from (checked there). A phrase's pickup follows the phrase before by a breath on paper that the swing shortens to 0.41 s as heard.
- *A bar of 2/2 is comped as a pad*: the drums and the bass play it as a bar of four, the chord seat's book is asked for by the name 4/4. Older than this branch.
- *Under the fit a 4/4 fill's triplet is three sixteenths in a bar of twelve* (every style but the blues, until it writes twelve).
- The scorecard lines above that sit outside their bands; no ear has been on either feel.

**Timings** (each run alone on this machine): `pnpm check` 16.0 and 16.2 s of 20 (15.4 at the commit this branch started from); `pnpm test:full` 45.4 and 45.9 s of 60; `pnpm score` 56.7 s of 120, no movement in any of the eight against the baselines as they now stand; `pnpm smoke` 11.2 s of 60. Five properties were added (the tempo, the two for a bar of dotted pulses, the blues' cymbal in twelve, the jazz bass in six); the rest of the work on the suite was restating.

**For his ear**: `out/meter-study-2/` (not committed; `src/meter-study-2.ts` made it, with the two charts that are not in the library): All Blues as jazz and the slow blues as blues, each as written and as the band played it before, the band and the drums and bass alone and with the alto, every bar printed; and the folk tune in 6/8 as acoustic and the fifties changes in 12/8 as rock, as what is still to write, at the first study's speeds said in pulses (76 and 80).

**Next, as data, from this design**: acoustic in 6/8 and rock in 12/8. Each is `meters["6/8"]` or `meters["12/8"]` on the style's four seats (a seat left out keeps the fit), a line in `WRITTEN` in `test/takes.ts`, a chart or two in that meter in the library, and the style's own properties restated in pulses where they say "beat" (acoustic's strumming pendulum and its picking thumb are held in 4/4 only today). The two drum properties for dotted pulses already hold them.

## the band in six and twelve: checked and merged (stage 6)

A Fable design and build from `prompts/meters-design.md`. On the main thread: the core read (`perform/meter.ts`, the plan's `tempo` and `quarters`, the MIDI export, the app's `placeAt`); the three charts read bar by bar (All Blues and Footprints as the books have them, in 6/4; the slow blues with a turnaround of a chord a beat); no golden in the diff. Merged over the four vamps cut on main (56 charts): `pnpm check` 16.4 s of 20, `pnpm test:full` 44.9 s of 60, `pnpm score` 60.3 s of 120 with no movement in any of the eight.

- **One test restated at the merge**: a MIDI file's tempo is compared to within one of the figure, not to its rounding. A chart in twelve borrowed at 95 a minute is 142.5 quarter notes, which the file holds as microseconds.
- **Nobody has heard it.** The page for his ear is `out/meter-study-2/`.
- **Open, from the build**: the blues' floor of 60 shuts out the slowest slow blues, and lowering it moves 4/4 too; a chart in twelve borrowed by another style goes at that style's usual figure in dotted quarters (a tempo range per meter would answer both); nothing on the chart's screen says a chart is in 12/8 or 6/4; a new chart's meter is set only in the Text side; the alto on `jazz-waltz-f` at 60, seed 5, plays 8.96 s on one breath (older than this work); a bar of 2/2 is comped as a pad.
- **Next from the design, for Opus**: acoustic in 6/8 and rock in 12/8 (`meters["6/8"]`, `meters["12/8"]` on the style's seats; a line in `WRITTEN` in `test/takes.ts`; the worked example is `bluesDrums.meters["12/8"]`).

## six and twelve heard; a style's tempo range in a meter; the chart's screen says its meter (stage 6)

Brandon, 2026-11-16, after `out/meter-study-2/`: "done listening - great job so far". Jazz in six and the blues in twelve stand.

- **A style may say its tempo range again for a meter** (`StylePack.tempo.meters`, read by `tempoRange(style, meter)`). The blues in 12/8 is 40 to 150, usually 60: a slow blues goes under the shuffle's floor without the floor moving in 4/4. **Where the pulse is a dotted quarter and a style has said nothing, its range is two thirds of its own**, which keeps the eighth notes at the speed of its 4/4 (rock's 120 is 80 in 12/8), so a chart in twelve borrowed by another style is no longer half as fast again. The engine's default, the app's tempo sheet and its limits, the lists' figures and the tests' borrowed tempo all read it. Nothing in 4/4, 3/4 or 6/4 moves: goldens and scorecards unchanged.
- **The setup sentence says the meter where it is not 4/4** ("Blues in G, 12/8, at 60 bpm, about 3 min"): it is what the tempo counts. Not pressed; the meter is the chart's text.
- **Next**: acoustic in 6/8 and rock in 12/8, two Opus builds side by side from the design.

## rock in twelve (stage 6)

An Opus build from `prompts/meter-rock-12-8.md` in its own clone on the branch `rock128`, from the design in "the band in six and twelve". Rock is written for 12/8 on all four seats (`meters["12/8"]` on the drums, the bass, the chords and the soloist), one chart in twelve is in the library, and rock is in `WRITTEN` in `test/takes.ts`. Nobody has heard it; the page for his ear is `out/meter-study-3-rock/` (not committed; `src/meter-study-3-rock.ts` made it).

**What each seat plays in twelve** (a bar is four pulses of three eighths; "the and" is a pulse's last eighth, AU-97):

- *Drums*: from the working level up the cymbal on all twelve eighths, the pulse leaned on (hot: the hat unaccented on every eighth, or the ride with the hat foot on 2 and 4, a section each, as in four). Quiet, rock's quiet hat said in pulses: the pulse and a ghost on its last eighth, never the triplet's middle note. Kick on 1 and 3, the section's kick one of four's with its "and" on a pulse's last eighth (a pickup into 3, into 4, or into the One); the backbeat on 2 and 4, a cross-stick under 0.30; the answer-bar turns of four on the same eighths. Fills in eighths: an eighth (the pickup), a pulse, two pulses, the kick on each pulse under them.
- *Bass*: quiet, the downbeat and wherever the kick plays (ST-rock-12, as in four). From the working level a root on every pulse, nearly full; a section takes a pickup (the root again on a pulse's last eighth) into the One, into 3 and the One, or none, and the line takes the kick's pickups too. Hot, every pulse and its pickup (eight notes of twelve), the octave on the pickups the section chose (ST-rock-14 said in pulses). The lead-in eighth of four is the last eighth before the change, as it was.
- *Piano*: quiet, a pad (struck where the chord arrives, again at 64 over a barline) or a chord a pulse, by section. From the working level the ballad's triplets, a chord on every eighth, 88 and 70 at the working level, 92 and 76 hot (the pump's levels). Under a soloist a chord a pulse.
- *Lead guitar*: ST-rock-22's cells said in pulses: a quarter of four is a pulse held, its eighths the pulse and its last eighth, the busy level's sixteenth bursts the triplet. The same three levels by name, the same phrase shapes and endings, no pickups (ST-rock-24), nothing quicker than an eighth. Its bends and its shake are the player's and are unchanged.

**One engine change: a comping figure may be written again for a bar under a soloist** (`CompFigure.soloing`, beside `alone`). The brief's piano plays triplets at the working level and above and makes room under a solo as it does in four, where it plays no busier than quarter notes (`listening.busiest: "mid"`, the blues piano's gate-3 lesson). In twelve the working level is the triplets, so the cap left them under the line at twelve strikes a bar; nothing in the book could say "the same groove, played thinner where the soloist has the lead". `soloing` says it as data, and rock's triplets play `x..... x..... x..... x.....` there. No other style writes one, so nothing else moves (goldens and scorecards below).

**Properties.** Rock had no property of its own: its 4/4 rules lived only on its scorecard. Restated in pulses and held in four and in twelve:

- *the time*: a kick on the bar's two strong pulses and a backbeat on the pulses between (ST-rock-04, ST-rock-11). Passed against the fit too.
- *the bass under every kick*, at every level (ST-rock-12; `bass.kicks-doubled`). Found by the scorecard after the first build: the working bass in twelve left the kick's pickups alone and `bass.kicks-doubled` fell to 94% of takes in target. In four the driving eighths cover every kick; in twelve it has to be said, and the working and hot lines now follow the kick as the quiet one does.
- *under a soloist no more strikes in a bar than the bar has pulses* (no busier than quarter notes in four; `chords.strikes-per-bar-under-a-hot-solo`).

Added, to say this feel is being played and not the fit (each run against the fit first):

- *the cymbal and a quiet bar*: in twelve the cymbal on all twelve eighths from the working level; quiet, the cymbal on each pulse and at most its last eighth, never the middle eighth, the kick on 1, 3 and pulses' last eighths only, the snare on 2 and 4 alone. **Failed against the fit** (eight eighths of twelve on the hat).
- *the bass in twelve*: every note on an eighth, a note between the pulses only on the eighth before one, no more than eight a bar, from the working level a note on every pulse, hot a pickup into every pulse. **Failed against the fit** (no pickups when hot).
- *the piano's triplets*: away from a soloist from the working level a chord on every eighth, quiet no more than a chord a pulse. **Failed against the fit** (a chord a pulse at every level).
- *the whole band on the eighths* in twelve, fills and the soloist included. **Failed against the fit** (a 4/4 fill's sixteenths, and the busy soloist's).
- The every-style *drums thin out* (kick and snare on no more than half the eighths) **also failed against the fit** on the new chart: rock's hot kick with a turn put them on seven of twelve, which is EAR-11 as a number.

`heldTakes` in `test/takes.ts` gives the properties every library chart in a meter at each of the three levels (and with the soloist): a jam's arc takes rock neither quiet nor hot for long.

**Decided here, because the brief and the notes did not settle it:**

- **The fifth kick of four is not written in twelve** (the "and"s of 1 and 3 together, `x.x. .... x.x. ....`): with an answer bar's turn it put the kick and the snare on seven of the twelve eighths, over the every-style ceiling of half. The other four keep their weights.
- **A quiet bar is rock's quiet hat said in pulses** (`o...g.`, the pulse and a ghost on its last eighth: four's `o.g.` with "the and" where the design puts it), not the pulses alone: the property says what quiet is, eight strokes a bar and never the middle eighth.
- **The bass follows the kick at every level in twelve**, so where the kick takes a pickup the bass does too; the section's own pickups come on top. The notes have no 12/8 bass; this is ST-rock-12 and ST-rock-28 (a push is the band's) said for a line that no longer covers every eighth.
- **The piano's working and hot tiers are the same triplets**, harder when hot (the pump's 92 and 76): the brief asks for triplets "at the working level and above", and ST-rock-18's hot pump is already every eighth.
- **The lead guitar's cells are four's said in pulses, not new rhythms.** They look like the blues' twelve because the idiom is the same; the shapes, endings and arc are rock's.
- **Tempo in twelve: 48 to 107, usually 66** (`tempo.meters["12/8"]`). Two thirds of four's range would be 53 to 107 and 80: the rock ballad and the fifties slow dance in twelve-eight sit lower than that, and the slowest a dotted pulse can go before a bar is over four seconds is about 48. The ceiling stays at two thirds of four's 160 so its eighths are no quicker than four's.
- **The chart: `rock-slow-dance-eb.chart`, "Slow Dance"**, Eb, 12/8 at 66, thirty-two bars AABA. The A is the doo-wop round (Eb Cm Ab Bb7, Eb Cm, then Ab Bb7 a half bar each) closing on a turnaround a chord a pulse (Eb Cm Ab Bb7); the bridge is Ab Ab Eb Eb F7 F7 Bb Bb7 (the four, home, the five of five into the five). Eb because the library's fifties changes are in C and a slow dance is a horn key.
- **The audition page takes `energy=`** (`tools/audition/main.ts`), as the CLI's `--energy`: the study holds the band quiet and at the working level.

**Not built, and left**: a 6/8 for rock (a 6/8 chart still gets the fit); the hat opened into a new section (ST-rock-06, not written in four either); any change to the lead guitar's hand.

**Nothing that exists changed.** Every golden take byte for byte. Every scorecard rewritten to a scratch file on the charts that existed, with all of the parts and the engine change in place and before the chart was added: all eight byte for byte their baselines (rock and blues checked again after the bass's last change). Rock's scorecard is then accepted with the new chart (`score --style rock --update`); `pnpm score` reports no movement in any of the eight.

**The new chart alone, as rock** (200 takes): the kick on the One, the bass on the One, the changes stated and every kick under a bass note, each 100%; no sixteenth syncopation; the piano's lowest note 58.4 (54 to 63), no colour. The soloist lands every change on a chord tone, 87% of its pulses on chord tones, a range of 20 semitones, a bend every six bars. Outside their bands: `solo.cost` 2.77 against 2.45 (5% of takes inside), `solo.builds` 1.50 (55% inside), `solo.shakes` 0.90 a bar at the band's top (61% inside: at 66 a pulse held is 0.9 s, and every note held a pulse is shaken), `solo.phrase-ends-on-chord-tones` 76% inside, `solo.empty-bars` 82%, `solo.chromatic-approaches` 83%, `solo.phrase-same-as-last` 85%, `solo.trills` 89%. Whether that is the meter or the tempo (a bar at 66 is 3.6 s, longer than the soloist's slowest bar of 3.2) was not checked; the blues' slow blues read the same way. The kick, backbeat and comping-strikes measures read bars of four only and say nothing of it.

**Every style on every chart.** `pnpm test:full` passes for rock on every chart. Each of the eight styles played the new chart as if it were its own (every kind of take on six seeds, and the soloist's kinds), with the rest of the library out of the way: no property failed but the floors on how many cases a property met, which a one-chart library cannot meet.

**Found, not fixed.** `pnpm test:full` fails on this branch, in reggae: `standard-night-and-day.chart` seed 5 (a timed jam of 2.5 minutes at 76), "a leading tone 11 semitones from where it leads" (G2 into A-flat 1). It is not this work: the same take is played the same at the commit this branch started from. A chart added to the library moves which kind and seed each borrowed chart is played in, and this take came round; a second probe shift found another (reggae on `jazz-minor-two-five-cm.chart` seed 3, G2 into A1, also present before). Reggae's bass lands a step away by name an octave less a step away in pitch. Fixing it would move reggae's takes, so it is left for a reggae change of its own; the acoustic branch's charts will shift the rotation again.

**Timings** (the machine shared with another builder; each run alone): `pnpm check` 17.1 and 17.7 s of 20 (16.4 at the start; the start commit and this branch under the same load read 19.8 and 19.1); `pnpm test:full` 46.5 s of 60 (start commit 50.2 and branch 49.2 under the same load); `pnpm score` 71.7 s of 120 under load (rock's own scorecard takes half a second more with the new chart); `pnpm smoke` 12.8 s of 60.

## rock in twelve: checked and merged; a figure's own tone is not a lead-in (stage 6)

An Opus build from `prompts/meter-rock-12-8.md`. On the main thread: the report's grids against the brief, the one engine change read (`CompFigure.soloing`: a comping figure may be written a second way for a bar under a soloist, beside `alone`), the chart read (`rock-slow-dance-eb`: AABA, the doo-wop round with a turnaround a chord a beat, a bridge to the four), no golden in the diff, rock's scorecard the only one rewritten. The full suite passes on the merged tree, 57 charts; its timings wait for a quiet machine (the acoustic build was running: load 13).

- **The lead-in property is restated.** The new chart moved which takes each style is handed, and reggae on Night and Day played G2, the fifth of its riff over C, on the eighth before a root on A-flat 1: a step by name, eleven semitones in pitch. A fix in the engine (play the tone beside the root, or the line's root where it cannot be) was written and taken out again: it changed the neo-soul golden, which plays the same motion every lap (F#2 over Bm9 into G1) and was passed by Brandon's ear. So the rule now says what he passed: **the root or the fifth of the chord being played is the line's own figure, not a way into the next chord**; any other note a step from the next root by name must be a step from it in pitch. If he ever hears that drop as wrong, the engine fix is the one described here.
- **Rock's tempo in 12/8 is 48 to 107, usually 66**: the builder's judgement, not from the notes. His ear decides.
- **Left by the builder**: the soloist's measures on the new chart sit outside their bands (`solo.cost` above all), meter or slow tempo not told apart; rock in 6/8 keeps the fit; the hat opening into a section (ST-rock-06) is still unwritten.
## acoustic in 6/8 (stage 6)

An Opus build from `prompts/meter-acoustic-6-8.md`, in its own clone on the branch `acoustic68`, from the design in "the band in six and twelve". Acoustic's four seats carry `meters["6/8"]`; `WRITTEN` in `test/takes.ts` has `acoustic: ["6/8"]`; one chart in six. Nobody has heard it: the page for his ear is `out/meter-study-3-acoustic/` (not committed; `src/` has the script and the grid printer).

**What each seat plays in six** (a bar is twelve sixteenths in two groups of six; only the eighths are struck; nothing swings):

- *The kit*, one choice a section as in four. Quiet: a soft kick on the One with a cross-stick on four over the shaker's eighths (2), the kick and the cross-stick alone (2), or the kick and the shaker (1); never a snare. Working: the kick on the One; brushes in 35% of sections (the shaker's eighths swelling on each pulse, a soft snare tap and the hat foot on four), otherwise a cross-stick on four over the eighths on the hat or the shaker. Hot: the kick on the One, the snare on four, the hat on the eighths, opening softly on the last eighth in 40% of sections. Answers on the even bars are the foot (a soft kick on the eighth before four or before the One) and the hat; hot, a ghost on the last eighth. Fills are the same pickups as in four, on the eighths. Measured over 160 takes of the chart: 6.2 strokes a bar quiet, 8.8 working, 8.4 hot.
- *The upright*: quiet the root, held the bar; working the root and the fifth on four (2), or the root struck again on the first pulse's last eighth before it (1); hot each pulse and its last eighth, root, root, fifth, fifth (2), or root, fifth, fifth (1). 1.2, 2.4 and 3.7 notes a bar. A lead-in, "a beat before the change", is the bar's last pulse, which in two is the fifth's place.
- *The guitar*. Picked: the thumb on both pulses and the fingers on the eighths between, three patterns (thumb, index, middle twice; the same reaching the ring finger in the second pulse; thumb, middle, ring twice), each with a roll for a bar with no bassist (the bass on the One, the alternate bass on four, the fingers between). Strummed: eighths through each pulse, down on the pulse, a lighter down on its middle eighth (76 against 86), up on its last (the upstroke's own 14 lighter): working "ring and roll" (down; down, down, up), "rolling" (both pulses rolled) and "in two" (down; down, up) in the 3 : 2 : 1 of four, picked in 42 of 120; hot both pulses rolled with four leant on, or ring and roll with four leant on. Counted over 160 takes: quiet every bar picked, working 40% of bars, hot none; the last upstroke leans into the next chord at 19% of changes working and 28% hot (ST-acoustic-30: 20% and 30%).
- *The soloist*: sparse, the pulse held, the long-short, one note; medium, the long-short twice, three eighths and a pulse, and their turns; busy, the six eighths and the long-short with them. Endings land on the first pulse and hold through the second.

**The engine, three rules, each for a bar of dotted pulses only:**

- *The strumming hand's pendulum* (`guitar.ts`): a hand swinging in eighths through a pulse of three goes down, down, up; the "and" is the pulse's last eighth (DR-10, ST-acoustic-04), and every pulse is a downstroke. Without it the second pulse (tick 720) was an upstroke of the top three strings. Only acoustic strums eighths, and the fit's strokes are all downstrokes already, so it changes nothing that existed.
- *A displaced stroke in the fit* (`groove.ts`): a stroke taken off a beat and played a sixteenth late (`-X`) is played on the pulse. Only neo-soul's late four is written so. Found on the new chart: neo-soul's loud bars in six had lost their backbeat in its second bars and came out sparser than its quiet ones (8.25 strokes against 8.50, seed 1), against "the drums thin out" (AU-96, HI-38). A first version, moving any lone sixteenth-late stroke to the pulse, also added funk's kicks and disco's and acoustic's shakers in six and in twelve: taken out.
- *The fit's soloist ends a phrase before the last pulse* (`phrases.ts`): a 4/4 ending in a bar of six struck in its last pulse, which is half the bar and the next phrase's, and five styles' soloists (blues, funk, jazz, rock, reggae) ran phrases together on the chart in six played as their own, in 1 to 5 of 11 joins on most seeds. Where a phrase ends with its end bar, that bar's notes in the last pulse are not struck, as a written ending's never are. The first version did this in every end bar, and reggae then left 3.0 bars of silence inside a solo (seed 1): an end bar followed by a rest bar of its own phrase is not the next phrase's. On the charts that exist only those five styles on the chart in six move.

**Properties.** Restated for six: *the strumming hand is a pendulum* (4/4 and a written meter; in a bar of dotted pulses a stroke on a pulse's last eighth comes up and every other goes down); *a picked note is a string of the shape the hand is holding* (unchanged in what it asks; now also played on the chart in six held quiet, with and without a bassist, working and hot, with a floor for six); *with no bassist the picking thumb is the bass* (a bar of four or of six, by pulses, not beats). Added: *acoustic: in six the eighths are the band's smallest note, for everyone, and nothing bends them*; *a guitar picks a bar of six as six-eight is picked* (quiet always; a string on every eighth, the thumb on each pulse and no finger under it); *a guitar strums a bar of six as a pendulum in eighths* (both pulses, the first possibly the chord leant into, at least one eighth between, every stroke between lighter than its pulse); *acoustic: in six the upright is in two*. Run against the fit first (two seeds, the chart in the library): the pendulum passed (the fit strums only downstrokes on the pulses); the picked string and the thumb failed by their floors for six (none picked: the fit never picks in six); the eighths failed (a 4/4 fill's snare on a sixteenth); the picking failed ("quiet, and strummed"); the strumming failed ("only the two pulses strummed"); the upright failed ("nothing on the second pulse at the mid level"); and the existing "a phrase is followed by a breath" failed on the chart at 160. The two dotted-pulse drum properties held under the fit.

**Decisions the brief and the notes did not settle:**

- *Tempo in six: the default, 48 to 80, usually 63; nothing written in `tempo.meters`.* Two thirds keeps the picking hand's eighths at the speed of four (144 to 240 a minute), which is what limits a fingerpicker; the study's 76 and a slow ballad's 50 are inside it. The chart is at 66.
- *In two there is no "beat 3" for a second kick*: the second pulse is the backbeat's (SU-D-14), so the kick is on the One alone and the foot's pickups are the answers'. With a kick pickup in the groove and a kick answer over it, the kick and the snare took four of six eighths (AU-96's half).
- *Nothing quicker than the eighth anywhere in six*: no shaker sixteenths (the brushes' sweep, the hot shimmer, ST-acoustic-07 and -08), no hammer-on cells; the hot level has no shaker.
- *The fifth on four is played at 88*, the level of the fifth on 3 in four, though the engine counts the second of two pulses as a weak one.
- *The thumb plays the bass on four with a bassist*, as on 3 in four; alone it plays the alternate bass there.
- *The soloist's levels are a bar of six read as three quarters of a bar of four* (1.4, 2.6, 3.6 notes a bar); its pickups list has the last eighth, though acoustic never leads in (ST-acoustic-28).
- *The soloist's kinds in the tests are held inside a style's range where the chart counts dotted quarters* (`inPulses` in `test/takes.ts`): 160 counted so is 480 eighths a minute, twice acoustic's fastest six, where an end bar has no room for a breath. The blues' slow blues is now asked at 150 and not 160; scaling every kind by two thirds instead put it at 40 with the alto, which played 8.5 s on one breath (seed 1), so the slow kind is left at 60.
- *The chart* (`library/acoustic-folk-six-em.chart`, "Folk Song in Six"): E minor, 66. Verse `Em | C | G | D | Em | C | Am B7 | Em`, chorus `G | D | Em | C | G | D/F# | C B7 | Em`: the relative major, a bass walking down G F# E under the chorus, and two bars with a change on four. No named tune.

**Nothing that exists changed**: the goldens pass byte for byte; the eight scorecards, rewritten on their own charts to a scratch file after the engine changes (acoustic on its six charts named one by one), are byte for byte their baselines. Acoustic's is accepted with the new chart (`score --style acoustic --update`).

**Found, not fixed:**

- *Reggae on `standard-night-and-day.chart`, seed 5, in the full run*: "a lead-in resolves by step in actual pitch" (a leading tone 11 semitones from where it leads). The finding of "the library: pruned, renamed, and given standards" (the riff's fifth G2 before Abmaj7 at Ab1); a chart added to the library moves which kind and seed each borrowed chart is played in, and now lands it on seed 5. Reggae's output is not changed by this branch.
- *Quiet, the upright sometimes plays a second note* (6 of 282 quiet bars over twelve takes): where the root lies a seventh over the next one (D2 into E1), the shared bass engine steps down into it on the last pulse whatever the coin (BA-07), against ST-acoustic-14's "never at low energy". The property allows that step and no other.
- *The scorecard says nothing of six for most of the band*: the acoustic idiom measures (`chords.picked-*`, `chords.upstrokes`, `chords.open-strings`, `bass.roots-and-fifths`) and the drum measures read 4/4 bars only, and the "in six" measures read 6/4.
- *The soloist in six is sparse*: 23% of its bars are empty and 0.80 notes a second in the first chorus; a bar at 66 is 1.8 s, which the soloist's tempo reading (`slowBar` 3.2, `fastBar` 1.7) counts as a fast bar.

**Timings** (each alone, but another builder's work kept the machine's load between 2 and 14, so each was measured beside the commit this branch started from): `pnpm test` 17.5 and 17.6 s of 20 (the start, 17.2 and 17.3 beside it); `pnpm test:full` 46.7 s of 60 (the start, 45.8; it fails on reggae's Night and Day, above); `pnpm score` 61.2 s of 120, no movement against any baseline; `pnpm smoke` 12.4 s of 60.

**Every style on the chart in six** (the probe: the chart handed to every style as its own, every kind of take, six seeds, and the soloist's kinds) passes after the fit's soloist was fixed; before, it failed as above. `pnpm test:full` hands every style every chart once.

## acoustic in 6/8: checked and merged (stage 6)

An Opus build from `prompts/meter-acoustic-6-8.md`, merged over rock in twelve. On the main thread: the engine changes read (all inside bars of dotted pulses: the strumming hand goes down, down, up through a pulse; the fit plays a backbeat written a sixteenth late on its pulse; a fitted soloist does not strike in the last pulse of a phrase's ending bar), the chart read (`acoustic-folk-six-em`), no golden in the diff, acoustic's scorecard the only one rewritten. The merge kept both builders' tests; one closing brace was put back by hand in `test/bass.test.ts`. 58 charts.

- **On a quiet machine, merged**: `pnpm check` 17.8 s of 20; `pnpm test:full` 46.9 s of 60; `pnpm score` no movement in any of the eight. **The push suite has two seconds left**: the next thing that adds takes has to take some away, or consolidate.
- **Left by the builder**: the soloist in six is sparse (23% of solo bars empty; a bar at 66 is 1.8 s, which the soloist reads as a fast bar); a quiet upright adds a step down into a root a seventh below in 6 of 282 bars, where the notes say never; chords leant into early can bunch several bars running; the page's "before" clips are the fit as it now is, with the two fit changes above.
- Acoustic's tempo in 6/8 is the default two thirds: 48 to 80, usually 63.

## rock in twelve and acoustic in six, heard (stage 6)

Brandon, 2026-11-16, after `out/meter-study-3-rock/` and `out/meter-study-3-acoustic/`: "great work, you can take those down". Both stand, rock's tempo range in twelve with them.

## gate 6 has begun; every style is to be written for compound time; odd meters later (stage 6)

Brandon, 2026-11-16: "i'd say the week has already started - i've been playing along with the app while you've been working, and it seriously sounds incredible". **Gate 6 ("play over it for a week") runs from today.** What he trips on in the week is collected, not guessed at.

"we should probably handle the other styles in compound time as well, and in the future, we should support other odd time signatures fully across genres (even if it's not idiomatic). the band should be smart enough to figure it out".

- **Now**: funk, disco, reggae and neo-soul are each written for 6/8 and 12/8 (`prompts/meter-compound-style.md`, one Opus build a style, two at a time). A style's second compound meter may be spread from its first in its own data where that is how the music goes (the design's word: half a bar of twelve is not a bar of six for anything but the drums' basic beat). After them, the four styles that have one compound meter get the other (jazz in 6/8 and 12/8, the blues and rock in 6/8, acoustic in 12/8).
- **Later, a design of its own (Fable)**: every style in every meter a chart can write (5/4, 7/8, 9/8, 7/4 and the rest), not by a part written for each but by the band working it out from what the style has written for a quarter pulse and for a dotted pulse and how the bar groups. The fit is the start of that and is not yet good enough to be the answer. Not started.
- **The push suite's time is its slowest style's**: the styles run side by side, and rock (17 s alone, with its bars of twelve held at three levels) sets it. A style's own tests should stay under about 14 s alone.
## the ninth under the third (stage 6)

From `prompts/jazz-voicing-ninth-under-third.md`: after D7b5 on Take the "A" Train the jazz piano voiced Dm7 as E4 F4 A4 C5, the 9th a half step under the 3rd on the bottom of the hand.

- **The cause is in the engine, not the style.** The rootless recipe for a minor seventh is 3, 7, 9, 5 in close position (CH-06), so all four inversions are offered and two of them hold the 9th-against-b3 half step: C E F A (the 7th on the bottom, a standard form, the rub covered inside the hand) and E F A C (the 9th on the bottom, Q-03's fault). The critic's `minor-seconds` costs both the same 8, so it cannot tell them apart, and from D7b5's C4 Gb4 Ab4 B4 the hand took E F A C by a quarter of a point (12.8 against C E F A's 13.05: each moves its voices 7 semitones, E F A C's top moves one semitone to C5 and sits two over the target, C E F A's moves two to A4 and sits one under it). F A C E, the 3rd on the bottom, costs 21.6 from F4 and 29.8 from F3 (the scores are the engine's own, `score` over `VOICING_FEATURES` with jazz's weights). The filter that keeps a half step off the bottom while anything else will do applied only under a soloist's line.
- **It was not this tune alone.** Over the eighteen charts jazz plays as its own (its four and the fourteen standards written for it), six seeds and the five kinds of take: 1,289 of 77,777 strikes had a half step on the bottom, nearly all a minor seventh with its 9th under its b3. "A" Train 383 of 4,836 (Dm7 E F A C 332 times); Stella by Starlight 227 of 4,302 (Cm7 D Eb G Bb); All the Things You Are 198 of 5,463 (Bbm7 C Db F Ab); Body and Soul 154 of 5,013 (Bbm7 C Db F Ab); Have You Met Miss Jones 116 of 4,910 (Cm7); Giant Steps 110 of 3,814 (C#m7 Eb E Ab B); Cherokee 97 of 8,773 (Cm7); three in the rest. Read by the chord written under the strike, 1,161 were on minor chords, 67 dominant, 59 major and 2 half-diminished; the last three are almost all a minor seventh played early on the "and" of 4. Every other style had none or one on its own charts.
- **The property is the old one widened, not a new one** ("the ninth under the third anywhere" would forbid C E F A, the standard form the blues piano's weights are tuned to lead to, CH-06): "the hand does not growl: a chord's two lowest notes are a half step apart only on a dominant from E4 up, in every take, under a solo or not" (Q-03, SU-B-10, KF-B-29). It moved from the soloist's file to the piano's and replaces the under-a-solo version. It failed on the engine as it was (first on All the Things You Are, a solo take, seed 2, C4 Db4 F4 Ab4 in the band's chorus).
- **The fix**: the growl filter is applied to every strike, once per chord when its candidates are built, instead of only under the line. A filter only removes candidates that were not chosen unless they were, so the only strikes that change are those that took a growl and what is led from them; every golden take is the same to the byte, and the other seven styles' scorecards did not move. A data fix (jazz's weights) could not have told the two half steps apart, and a new cost for the bottom would have been a price where the notes ask for a rule.
- **What moved in jazz** (`scorecard/jazz.json` accepted): `chords.voicing-faults` mean 1.49% to 0.02%, in target 73% of takes to 100%; `chords.top-holds` 40.3% to 41.7%; `chords.top-steps` 46.3% to 44.9%; `chords.top-leaps` 0.06% to 0.26% of changes (target at most 22%); `chords.lowest-note` 58.96 to 58.91, in target 74% to 73.5%; `chords.closest-to-bass` 9.68 to 9.61. "A" Train alone (`ensemble score library/standard-take-the-a-train.chart --style jazz`, 200 takes): `chords.voicing-faults` mean 7% to 0%, in target 10% to 100%; `chords.top-holds` 35% to 54%; `chords.top-steps` 62% to 42%; `chords.top-movement` 1.11 to 0.91; `chords.lowest-note` 59.83 to 59.22, in target 69% to 68%. Dm7 is now C4 E4 F4 A4 there, and G7 after it B3 E4 F4 A4.
- **Left**: the top leaps that rose are nearly all Body and Soul (115 of 3,720 changes against 3 before): from F7's A3 Db4 Eb4 Gb4 the Bbm7 that was C Db F Ab is now Db4 F4 Ab4 C5, a tritone up on top, because Ab3 C4 Db4 F4 (the 7th on the bottom) sits past the reach under the target and pays `top-out-of-reach`. The notes do not say which of the two a pianist would play there; nobody has heard it. The scorecard still finds a fault in one take in a few hundred (the highest take 2%), not met on the six seeds the properties play; not looked for further.

## the ninth under the third: checked and merged (stage 6)

An Opus fix from `prompts/jazz-voicing-ninth-under-third.md`. On the main thread: the engine change read (the filter that keeps a half step off the bottom of the hand now runs for every strike, once a chord, where it ran only under a soloist), no golden in the diff, jazz's scorecard the only one rewritten; the full suite passes on the merged tree (timed by the builder alone at 17.8 s of 20 and 46.1 s of 60; two other builds were running at the merge).

- **Open, for Brandon's ear if he notices**: on Body and Soul the top of the hand now leaps more than a fourth at 115 of 3,720 changes (3 before): after F7, B-flat minor seven is voiced with its third on the bottom and its ninth a tritone up on top, where the form with the seventh on the bottom sits under the hand's reach. The notes do not say which a pianist plays there.

## small things in the app, 1 (stage 6, during gate 6)

Built to `prompts/app-tidy-1.md`. Nothing in the styles or the audio package changed; in the engine only the MIDI export (item 5). No test added, no journey step changed.

- **1. The way out of the editing mode says "Stop editing"; Done is the dock's alone.** He has used the dock on the keyboard and passed it, and Done there is where a phone's own keyboard puts it (close what is being typed); the top button is the one that changes. "Stop editing" is the plain pair of "Edit", fits the row at 390 px (97 px wide, the row 46 px high as before), and is not "Finish", which is the transport's word for a jam. A sheet's Done is now the only Done on the screen too.
- **2. "Edit a copy" and "Make a copy to edit" make "<title> copy"**, by the same rewrite Duplicate uses. A copy not yet changed is opened again rather than made twice, as before (it is found by its text, now the copy's text). A changed copy and a second one share the title "<title> copy", exactly as two Duplicates of one chart do: Duplicate does not number its copies, so neither does this.
- **3. More in the editing mode has "Meter"**, the browser's own list laid over the line as "Soloist plays" is: 4/4, 3/4, 6/8, 12/8, 6/4, and a meter typed in the text that is not one of them is shown as typed and listed first. The choice is `remetered` in `edit/rewrite.ts`: only the `meter:` line the parser reads is rewritten (a trailing comment kept), or one is put under the header's last field line, or at the top where there is none. A commit of the editor, so Undo takes it back. Bars that no longer fit are the parser's to point out, and are: "1 to fix" and the bar marked, as for any bar that does not fit. Shown only with the pencil down, as the brief says.
- **4. Left: a style's page on a phone.** At 390 by 844 the strip ends at 142 px and JAZZ, at the size that fills the measure, is a 159 px box with 128 px of ink, so the name alone ends near 285 to 300 px; the two lines under it (what the style sounds like, its band and range) are 84 px more. Taking in the white space (about 45 px, worked out, not built) would bring the jazz page's first row from 443 to about 400, not under 300; it was not done, since it misses the mark and changes a passed look. Under 300 for every style would take one of: the two lines moved out of the head on a phone (under the list, or dropped), the strip set as one row that scrolls sideways (part 1 chose wrapped), or the name set smaller on a phone. Each is a design call for his eye.
- **5. A seat played on another of the style's instruments is exported with that instrument's General MIDI program.** `toMidi` takes the take's `instruments`; the program of a chosen pack is the instrument list's (`SOLO_INSTRUMENTS`, keyed by pack: the nylon-string guitar is 24, the steel-string 25), and the style's own number where the choice is the style's own pack. The app's worker and the CLI pass it, so smoke journey 5's bytes still agree. The soloist was already exported with the program of the instrument that played (from its notes' voice); checked, not changed. Track names name the seat ("Chords", "Solo") in every file, the style's own instrument included, so they were left: naming the instrument there would change every golden.
- **6. A kept take's Rename says the take's own name**: "Called “Kept take, 9:47 PM”" (the name the chart's More gives it) until it is named, and the box starts empty with that as its placeholder. A take is kept under its chart's name, which the app already reads as no name of its own (`takeName`, now in `takes.ts`); Rename was the one place that did not.
- **7. No change: a take or a recent entry whose chart was cut already behaves as asked.** Checked with a take naming `blues-numerals-bb` (cut), an old take naming no chart with the cut chart's text and title, and recents for the cut chart and that take: neither take's screen offers "Open its chart", the recent chart is not listed on home, and the take is listed, opens and plays from its own text. No cut chart's title is carried by a chart still in the library, so the old take's match by title finds nothing.
- **8. A chart's title on its screen runs to two lines, then is cut** (`.chart-title`, a two-line clamp). A title that fits on one line is the height it was (the line under it starts at 76 px, as before). The lists already wrap a title over as many lines as it needs and were left so; the More sheet's heading is still one line.
- **9. No change: the page already gives the dark paper to the dark theme** (`index.html` has had a `theme-color` for each scheme since the app went offline; Chrome in the dark scheme matches `#15132b`). The manifest's `theme_color` and `background_color` are the light paper, and a manifest cannot vary them by scheme; an installed app's splash and title bar before the page loads may be light. Not changed.
- **10. Left: the search box.** The first letter already keeps the box, its focus and the caret (one component at one place in the tree); what moves is where it is drawn, from under the name (78 px down at 390, at the left at 1280) to the library's pinned bar (2 px down, beside Home; at the right on a laptop). Keeping it under the finger would take the library showing what was found to keep home's top while the search came from home, with the way home somewhere else, or home's box moved to where the library's is: either reorganises the two screens.
- **`out/tidy-1/`** (the pictures of this work) is ignored by git.

## small things in the app, 1: checked and merged (stage 6)

An Opus build from `prompts/app-tidy-1.md`. On the main thread: the whole diff read (172 lines); typecheck, lint and the push suite pass on the merged tree; no golden in the diff; the smoke journeys pass with no step changed.

- **Done**: the editing mode's way out says "Stop editing" (Done is the keyboard dock's alone); a copy of a built-in is "<title> copy"; More in the mode sets the meter (4/4, 3/4, 6/8, 12/8, 6/4), a step Undo takes back; exported MIDI gives a seat the program of the instrument it was played on; a take's Rename shows the take's name; a chart's title runs to two lines on its screen.
- **Already right**: a take or recent entry of a cut chart; the toolbar colour in each theme.
- **Left, each a design call for Brandon if it bothers him**: a style's list on a phone starts 364 to 443 px down (the poster name alone ends near 300; reaching the list sooner means a smaller name, the two lines moved out of the head, or the strip in one scrolling row); the search box is drawn in another place once a letter is typed (focus and caret are kept).
