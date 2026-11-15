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
