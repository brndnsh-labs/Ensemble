# Form / Arranger / Conductor Audit

Reviewer: music-theory-reviewer agent
Date: 2026-05-16
Files audited:
- `public/engine/conductor.ts`
- `public/engine/arranger-utils.ts`
- `public/state/arranger.ts`
- `public/state/conductor.ts`
- `public/arranger-controller.ts`
- `public/form-analysis.ts`
- `public/engine/fills.ts`
- `public/engine/drum-seeder.ts`
- `public/engine/tick-logic.ts` (offline transition mirror at `applyWorkerTransition`)
- `public/engine/groove-engine.ts`, `bass-engine.ts`, `accompaniment.ts`, `chords-engine.ts`, `harmonies.ts`, `soloist.ts` (consumer scan)
- `public/types.ts` (Section / ArrangerState / ConductorState shape)
- `tests/standards/` (scanned — no conductor/arranger/form coverage exists)

## P0 — Sections sound the same, transitions are abrupt, broken form contract

### 1. Only the soloist and drummer know what section we're in. Bass and chords are section-blind.
- **Where:** `public/engine/bass-engine.ts` (no `sectionId`/`sectionLabel`/`loopCount`/`isLastMeasure`/`getSectionContext` reference anywhere); `public/engine/accompaniment.ts:732,739-743` (uses `sectionId` only as a cache-bust key, does not change comping behavior); `public/engine/chords-engine.ts:900-901,1027` (only WRITES `sectionId`/`sectionLabel` onto chord entries — never reads them at generation time); `public/engine/harmonies.ts:733` (uses `sectionKey` only for a memory cache).
- **What a listener hears:** Bass and rhythm guitar/keys play the same line in the verse, chorus, bridge, and outro. The drummer changes ride and snare voice across sections (`drum-seeder.ts:94-140`) and the soloist re-phrases via SRDC, but every other instrument is on autopilot. Real verse-to-chorus has a bass that opens up (broader register, push notes) and a comper that thickens (Charleston upbeats → straight quarters, voicings rise an octave).
- **Musical claim being broken:** "Section-aware orchestration" is implied by the conductor's `lyricalBias` switch on section labels (`conductor.ts:81-94`). The contract is half-implemented: the conductor publishes a bias, the bassist and comper never read it.
- **Suggested fix sketch:** Either the conductor writes per-section behavior knobs (`bass.walkProb`, `chords.density`) that engines read, OR bass/accompaniment join the `getSectionContext` consumer set and key motif/voicing choices off `isRestatement` / `srdcState`. Apply at picker layer as a final-stage `weight *= mult`.

### 2. Section transitions trigger a fill but no pickup/anacrusis on bass or chords.
- **Where:** `public/engine/conductor.ts:309-484` (fires `TRIGGER_FILL` and updates intensity; only the drum engine consumes the fill); `public/engine/tick-logic.ts:105-114` writes `coordination.upcomingSectionFirstChord` when the last measure is reached, but `grep upcomingSectionFirstChord` returns only the writer — no engine consumes it.
- **What a listener hears:** Drummer rolls into bar 1 of the chorus with a tom fill and crash; bass and rhythm guitar arrive cold on the chorus downbeat with no chromatic walk-up, no anticipation. The transition feels like the drummer is leading a band that didn't get the chart.
- **Musical claim being broken:** Real arrangements pickup-bar the bass into a new section (chromatic approach to the new tonic, root-fifth lift) and the comper anticipates the new chord on the "and-of-4" of the previous bar. The state field intended for this is set and dead.
- **Suggested fix sketch:** Wire `coordination.upcomingSectionFirstChord` into bass-engine's last-bar branch — on step `sectionEnd - stepsPerBeat/2`, allow a chromatic approach note (`nextChordRoot ± 1`). Mirror in accompaniment: on the last beat of a section, voice the upcoming chord as an anticipation.

### 3. `formIteration` only differentiates loops 0/1/2+ for the soloist. Drums, bass, and harmony see the same loop forever.
- **Where:** Loop-aware soloist behavior at `soloist.ts:906-1095` (`isStrictHeadPlayback`, `isFirstRestatementLoop`, `isThemedImprov`). `groove-engine.ts:138-143` uses `sectionId` for a per-section seed but does not key on `loopCount`/`formIteration`. The drum orchestration map is computed once per session (`drum-seeder.ts:202-275`) and never re-evaluated per loop iteration. Bass and harmony don't read loopCount at all. Note: `drum-seeder.ts:157-159` even hard-caps `motifComplexity` to 1 ("Standard") for "The Head" but never relaxes the cap on later loops.
- **What a listener hears:** Loop 1 sounds identical to loop 5 on everything except the soloist. A live band on a 5-minute jam over a 16-bar form makes the third chorus busier, drops out instruments on the fourth, brings everyone back for the fifth. Here only the soloist evolves.
- **Musical claim being broken:** CLAUDE.md's "Chorus Evolution" — Loop 0 Head / Loop 1 Conversational / Loop 2+ Exploratory — is implemented for soloist only. 5 of 6 engines don't even claim it.
- **Suggested fix sketch:** Pass `loopCount` / `formIteration` (already on `conductor.loopCount` / `playback.currentLoopCount`) into the coordination context. Let drums escalate motif complexity per-loop (raise the cap to `min(2, 1+floor(loop/2))`), let bass relax kick-lock or add ghost notes on later loops. Epic-sized; first cut is one engine — probably drums.

## P1 — Missing form vocabulary (intro layering, breakdown, repeat differentiation, dynamic arc)

### 4. Intro/Outro role exists in vocabulary but no instrument "drops out" or "layers in".
- **Where:** `public/form-analysis.ts:4-15` (energy map: intro 0.4, outro 0.4); `drum-seeder.ts:71-92` (Intro reduces energy by 0.2, Outro by 0.3 — affects only snare voice and motif complexity); `arranger-utils.ts:42-54`.
- **What a listener hears:** Intro is just "the same band, quieter." No drums-only-into-bass-into-chords build, no outro thin-out. A produced track typically has 2–4 bars of just drums or just hi-hat-and-bass before the full band enters; here all six engines emit from beat 1.
- **Musical claim being broken:** The arranger has the labels but no engine reads "I am in an Intro, so I should rest for 4 bars." `lyricalBias` (`conductor.ts:85-90`) sets outro/intro to 0.9 but routes only into soloist phrasing.
- **Suggested fix sketch:** Add per-engine `introMutes` / `outroMutes` to the orchestration map, applied during first/last N bars: bass from bar 2, chords from bar 3-4, harmony from bar 4-5. Outro inverse. One-pass orchestration-map enhancement.

### 5. No "breakdown" / "drop" structural mechanic.
- **Where:** `public/form-analysis.ts:10,14` lists `drop: 1.0` and `breakdown: 0.3` in the energy map but no engine code branches on these labels for behavior beyond energy. `drum-seeder.ts:73` aliases `drop` to `Chorus`, erasing the drop semantics. `conductor.ts:84-90` doesn't branch on either.
- **What a listener hears:** Label a section "Drop" or "Breakdown" and you get a normal chorus or a slightly quieter verse. EDM, hip-hop, modern rock, and metal all assume a drop is a structural event — instruments cut for half a bar, then slam back. None of that exists.
- **Musical claim being broken:** Section vocabulary advertises features that don't ship. A user labeling a section "Drop" gets no drop.
- **Suggested fix sketch:** Either delete `drop`/`breakdown` from the energy map (be honest about scope), or add a 1-bar pre-drop mute + crash event when `currentSection.label` includes "drop" or next section's energy delta crosses +0.3.

### 6. No "final bar" / "isLastMeasureOfForm" signal to non-soloist engines.
- **Where:** Only the soloist has `isLastSection && isLastMeasureOfSection` logic (`soloist.ts:164-167`, `soloist-seeder.ts:1601-1603`). `playback.isEndingPending` is read by `conductor.ts:53` and `tick-logic.ts:536` (harmony complexity only) but no instrument receives "this is the last bar — land hard on beat 1, hold." `resolution.ts` exists separately and only fires on end-button press, not at the natural last bar of a song-mode arrangement.
- **What a listener hears:** A song that ends on the loop's final downbeat with no signposting — drums don't crash hard, bass doesn't sustain tonic, harmony doesn't cadence. The band hits the loop boundary and falls off a cliff.
- **Musical claim being broken:** Real arrangements signal the ending across all instruments. The soloist's Conclusion phase exists; the band doesn't follow.
- **Suggested fix sketch:** (1) `applyWorkerTransition`/`checkSectionTransition` should publish `coordination.isFinalMeasure` when `playback.isEndingPending && modStep + stepsPerMeasure >= total`. (2) Drum/bass/chord engines branch on it. Simplest first cut: fire `resolution.ts` cadence profile automatically on the form's last measure in song mode.

### 7. Repeat differentiation: no equivalent of soloist's "Imperfect Symmetry" for bass / chords / drums.
- **Where:** Soloist has motivic drift on repeated measures (`soloist.ts:1083-1094` and CLAUDE.md "30% motivic drift"). `groove-engine.ts:138-143` keeps `sectionSeedMap[sectionId]` fixed for the whole session — when Verse 1 plays again as Verse 2, the drum motif is byte-for-byte identical. Bass and accompaniment same.
- **What a listener hears:** Two passes of the same chord progression are literally the same MIDI on every instrument except the soloist. A real band always varies something — ghost note on a different 16th, voicing inversion, hi-hat opens at a different spot.
- **Musical claim being broken:** Imperfect Symmetry exists conceptually but only the soloist implements it. Repetition without variation is the strongest "this is a machine" tell.
- **Suggested fix sketch:** Add `sectionOccurrence` (already computed in `soloist.ts:128-138`) to coordination context. Engines apply a small deterministic variation when occurrence > 1: drums permute one ghost note per 16-step pattern, bass adds octave displacement on one beat, accompaniment shifts a voicing inversion. Keyed off `(sectionId, occurrence, barIndex)` so it stays deterministic.

### 8. Song-arc `lyricalBias` is decoupled from the soloist's SRDC arc.
- **Where:** `conductor.ts:60-94` computes `lyricalBias` from `progress = elapsedMins / sessionTimer`, then blends with a section-label override (70% section, 30% arc). `soloist.ts:675-679` derives `srdcState` from `sectionContext` (label keywords + isRestatement + isLastSection). These two arcs don't talk.
- **What a listener hears:** Soloist's Conclusion can fire mid-song (a section happens to be labeled "Outro") while the conductor's `lyricalBias` is at 0.2 (peak). Or `lyricalBias` ramps to 0.95 in resolution phase while soloist is in Statement on a fresh chorus iteration. Band and soloist disagree about where the song is.
- **Musical claim being broken:** A real bandleader's "we're winding down" and a real soloist's "this is my conclusion phrase" are the SAME decision.
- **Suggested fix sketch:** One source of truth. Cleanest cut: let `deriveSrdcPhase` also consume `playback.sessionTimer` progress (when songMode is on) so Conclusion can fire from form position OR temporal position. `lyricalBias` becomes a derived view of SRDC phase.

## P2 — Programmer's-math, dead state fields, missing intent, untested form features

### 9. `applyConductor` lyricalBias arc thresholds (0.3 / 0.7 / 0.9, magic 0.95) have no documented WHY.
- **Where:** `public/engine/conductor.ts:62-75`.
- **Musical claim being broken:** CLAUDE.md § "Musical intent" — probability/offset constants must document WHY.
- **Suggested fix sketch:** Add a `// why:` next to each breakpoint and each magic value.

### 10. Macro-arc energy bands duplicated in two files with no shared source.
- **Where:** `conductor.ts:357-372` and `tick-logic.ts:449-464` both implement the same 5-band session-timer arc by hand-copy. Kept in sync by convention.
- **Musical claim being broken:** "Live engine === offline export" parity (`tick-logic.ts:404`). Two source-of-truth implementations is a future-divergence trap.
- **Suggested fix sketch:** Extract `getMacroArcWindow(progress)` and call from both.

### 11. Three `Math.random()` calls for "humanization" inside `checkSectionTransition`.
- **Where:** `public/engine/conductor.ts:445` (`targetEnergy += Math.random() * 0.15 - 0.075`), `:457` (`Math.random() * 0.2 - 0.1`), `:498` (`const seed = Math.random()` for groove-seed assignment).
- **Musical claim being broken:** CLAUDE.md § "Deterministic phrasing".
- **Suggested fix sketch:** Replace with a hash of `(sectionId, formIteration)` mod a small float.

### 12. `Recapitulation` and `Resolution` roles in `analyzeForm` are never assigned.
- **Where:** `public/form-analysis.ts:93-140` (heuristic role assignment) returns only `Intro`, `Outro`, `Peak`, `Main Theme`, `Bridge`, `Variation`, `Theme B`, `Refrain`, `Build`. Never `Recapitulation`/`Resolution`. Yet `conductor.ts:420-425` and `tick-logic.ts:491-495` both have live cases for them.
- **Musical claim being broken:** Dead branches that look like features.
- **Suggested fix sketch:** Decide: extend heuristic, or delete unreachable cases.

### 13. `ConductorState.form` is computed on the main thread; worker can read a stale form across the sync gap.
- **Where:** `public/arranger-controller.ts:55-59,66-72` calls `validateAndAnalyze` → `analyzeFormUI` → dispatches `UPDATE_CONDUCTOR_STATE { form }`. Worker reads `conductor.form?.sections` at `conductor.ts:395-435` and `tick-logic.ts:468-501`. If the user edits the arrangement during playback, `form` is recomputed on the main thread and synced on the next `syncWorker`. No guard prevents the worker from reading a stale form mid-edit.
- **What a listener hears:** Practical impact small; on a live performance where the user re-arranges mid-jam, the transition for one or two bars uses the OLD form's role labels.
- **Suggested fix sketch:** Either invalidate `conductor.form` on the worker side when `arranger.stepMap` reference changes, or derive form from the current stepMap at read time and cache by stepMap reference.

### 14. No test coverage for any conductor / arranger / form behavior.
- **Where:** No file under `tests/standards/` named for the conductor, arranger, form-analysis, or transition handling. Grep for `applyConductor`, `checkSectionTransition`, `analyzeForm` returns only test mocks in unrelated files.
- **Musical claim being broken:** The conductor implements the song-arc spec (sessionTimer arc, role-based energy, fill triggering, section-boundary crashes). Every one of these is an unguarded musical claim.
- **Suggested fix sketch:** Add `tests/standards/conductor-arc-critique.test.ts` — simulate 5-min song mode; assert intensity rises 0→0.5 in first 40% of timer, peaks >0.7 in 65–85% window, drops <0.5 in final 15%. Add a section-transition test: fill fires on the bar before any role change. Use the 30-run reliability recipe.

## Notes for synthesis

**Big pattern:** song form is implemented for the soloist and the drummer; everyone else is form-blind. Bass, accompaniment, harmony, and chords-engine all WRITE section metadata onto chord objects but never READ section context at generation time. Same for loop awareness — only the soloist branches on `loopCount`.

**The conductor itself is functional but thin.** It computes a `lyricalBias` and energy target per transition, fires fills, updates a few mix-EQ knobs. It does NOT orchestrate dropouts, layering, ritardando, anticipation, or pickup bars. The `coordination.upcomingSectionFirstChord` field is computed and never read — that's a 30-minute wire-up away from giving bass a real anticipation move.

**Three highest-impact directions**, ranked by ratio of listener impact to implementation cost:

1. **P1 #7 (Imperfect Symmetry for non-soloists)** — single biggest reason the band sounds like a machine on repeat passes. Plumbing exists (`sectionOccurrence` already computed). One day of work per engine, can ship per-engine.
2. **P0 #2 (anticipation / pickup bars)** — the state field is already populated. Wiring bass and chords to read it would make every section transition more musical without any new state. Pure "consume what's already published."
3. **P0 #3 / P1 #4 (loop differentiation + intro/outro layering)** — epic-sized; group as a "Form Evolution" feature. Right first cut is a single engine (drums: drop kick density on loop 2, return on loop 3) to prove the contract, then fan out.

**Things to NOT do without a product call:** song-long dynamic arc that spans across loops (`formIteration % 8` grand-cycle in `conductor.ts:374-391` is the placeholder; replacing it is a bigger conversation); per-section tempo/time-signature ramping (Section type supports `timeSignature`, only `chords-engine.ts` reads it, no setBpm path through the conductor); making "breakdown"/"drop" real structural events (genre-dependent, better to delete the misleading labels until there's a product decision).
