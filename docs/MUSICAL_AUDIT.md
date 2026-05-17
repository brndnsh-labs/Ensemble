# Musical Audit

A tracker/pointer for active musicality work across the engine. Active findings, prioritized stories, and per-area inventories live under `docs/audit/`; this file holds the history (Shipped), the reusable recipes (Patterns proven), the methodology (5 smells), and the entry point to the current work.

Started: 2026-05-16. Most-recently-restructured: 2026-05-16 — old "Queued" / "Open findings" / "Future passes" / "Handoff notes" sections were retired into the `docs/audit/` tree after the parallel music-theory-reviewer pass. See the Shipped table below for prior history.

## Active work

The current organized backlog lives in **[`docs/audit/EPICS.md`](audit/EPICS.md)** — 8 epics, 49 session-sized stories, synthesized from `docs/audit/{soloist,bass,chords,drums,harmony-coordination,form-arranger}.md`.

| Source of truth | Use |
| :- | :- |
| `docs/audit/EPICS.md` | Pick the next story. Index of epics with story counts and `done` tally. |
| `docs/audit/epic-<slug>.md` | Story-level detail (acceptance criteria, effort, source finding). Mark stories done here. |
| `docs/audit/<area>.md` | The underlying findings, by area. Add new findings during work back to these files. |
| `docs/MUSICAL_AUDIT.md` (this file) | History (Shipped), recipes (Patterns proven), the 5 smells. Don't grow it with active work. |

**Status (2026-05-16):** parallel audit pass complete. 95 findings across 6 areas → 49 stories across 8 epics. Recommended pickup order in `docs/audit/EPICS.md` § "Recommended ordering" — Epic 1 (Coordination Contract) and Epic 3 (Deterministic Phrasing) are prerequisites that unlock work in the engine-idiom epics.

## Methodology — the 5 smells

The recurring pattern that lets musical bugs hide in critique tests:

> A test's *name* asserts a musical claim, but its *implementation* either (a) computes the expected pattern by replaying the engine's own predicates (tautology), (b) uses a threshold below the random-baseline (passes with any output), or (c) measures a different quantity than the name implies.

Two additional smells discovered during the May 2026 audit pass:

> (d) **Report/assertion mismatch** — `console.log` shows "Target: >30%" but `expect(...)` asserts `>15%`. The logged target is aspirational; the assertion is what actually guards. Check that every "Target: X" in the report is the value being asserted.
>
> (e) **Harness silences engine path** — the test passes an incomplete `stepInfo` object (e.g. just `{ isBeatStart: ... }`) when the engine checks other properties (`isBackbeat`, `isOffbeat`, `isMeasureStart`, `isPulseStart`). The engine's relevant lane never fires, so the test measures only the fallback lane while looking healthy. Fix: build stepInfo via `getStepInfo` from `public/utils.ts`, or construct an object containing every property the engine reads. Subtle and high-impact — already caught in `reggae-piano-critique` and `funk-drummer-critique`.

The audit looks for any of these five smells per test file, then verifies the engine against the *named* musical claim before deciding whether the test, the engine, or both need to change.

## Patterns proven

Recipes from prior engine wins, captured here so future passes start from a known shape instead of re-deriving the architecture.

### Engine-knows-where-it-is (form-aware pitch / rhythm selection)

When you want an engine to shape its output based on musical structure (phrase position, section position, loop count, role), the proven recipe is:

1. **Planner / scheduler derives the structural fact** in the layer that already knows it. Phrase-end markers belong in the rhythm planner (`soloist-rhythm-engine.ts`) because it builds the phrase; SRDC phase belongs in the plan-build site (`soloist.ts:preparePhraseResponseContext`) because it already calls `getSectionContext`. Don't try to re-derive structure at the picker layer.

2. **Attach the fact to the work unit.** Phrase-end marks ride on the rhythm node (`isPhraseEnd: true`). SRDC phase rides on the phrase context (`phrase.context.srdcState`). The work unit is the unit of musical thought; the structural fact should travel with it.

3. **Picker reads at use-site** and applies the bias. The pitch picker (`soloist-pitch-engine.ts`) reads both `rhythmNode.isPhraseEnd` and `phrase.context.srdcState`.

4. **Apply as a final-stage `weight *= mult`**, not as a multiplier on one factor's additive bonus. Generative engines have many simultaneous biases pushing the same direction; scaling just one of them gets washed out. See [[feedback-weight-tuning-multiplier-placement]] for the full reasoning.

5. **Add a top-level state override slot for tests.** Production writes the canonical nested location every call; without an override slot, test mocks setting the same nested field get clobbered immediately. Read order: `topLevel || nested || default`. See [[feedback-state-mock-vs-production-override]].

6. **Tune to a musical sweet spot, not a statistical one.** A ×8/×0.15 multiplier produces a tight statistical gap but sounds robotic (Response always lands on root, Departure always avoids it). A ×4/×0.3 multiplier produces a smaller but reliably-directional gap AND preserves musical variability. Confirmed on both phrase-end (2026-05-16) and SRDC (2026-05-16) work.

7. **Multi-trial reliability check before locking in thresholds.** A 20-30 run loop (`for i in $(seq 1 30); do npx vitest run ... | grep -E "FAIL|metric"; done`) catches sample-size flake that single-run testing misses. The phrase-end test went through three threshold iterations using this loop before settling on the combined-condition assertion that passed 30/30.

### Test-mock isolation (for bias-comparison tests)

When measuring whether a new engine bias differentiates outcomes, audit the mock state for *other* biases that push the same direction and neutralize them in the test. See [[feedback-test-isolation-competing-biases]] for the recipe.

## Shipped

| Date | Area | Root cause | Fix |
| :--- | :--- | :--- | :--- |
| 2026-05-16 | Bossa drum clave (`grooves/latin.ts:88`) | Engine produced "every 8th except beat 3" in bar 1 and a single hit on beat 3 in bar 2, mislabeled as "Authentic 3-2 Bossa Clave." | Replaced predicate soup with explicit step positions: 3-side `[0, 6, 12]`, 2-side `[4, 8]`. |
| 2026-05-16 | `latin-drummer-critique.test.ts` | Test computed expected clave by replaying same boolean predicates as the (buggy) engine — tautology, calcifying the bug at 100% pass. | Hard-coded expected positions instead of recomputing from predicates. |
| 2026-05-16 | `bossa-drummer-critique.test.ts` "Authentic 2-bar Clave" | Asserted only `patternA !== patternB` — any two different bars passed. | Tightened to verify exact son clave positions across all 16 simulated bars with zero strays. |
| 2026-05-16 | `reggae-drummer-critique.test.ts` "Steppers feel at high intensity" | Test name claimed Steppers, but the simulation exercised the full motif rotation (Steppers/Rockers/Dub/One Drop) via per-bar `sectionSeed`. 87.5% pulse-kick density was the expected mean, not a bug. | Renamed test and split the metric into "pulse kick density" + "full-coverage bars" with thresholds that reflect the real motif mix. |
| 2026-05-16 | `jazz-harmony-critique.test.ts` "should thin out voicings when soloist is busy" | Default Jazz already plays guide-tone shells (2 notes); the deep-thinning path only triggers when `soloistBusy && accompanimentHit`. Test only set one flag, so it never exercised the real coordination path. | Added a "crowded" scenario that sets both flags. Report now shows `Quiet: 2, Busy: 2, Crowded: 1`. |
| 2026-05-16 | `funk-harmony-critique.test.ts` "The One Solidity" | Metric was `downbeatHits / totalStabs` — mathematically capped at ~18% for a funky 5.5 stabs/bar groove even when The One was hit on every bar. Punished syncopation, which is what makes funk feel funky. | Changed metric to `barsWithDownbeat.size / totalMeasures`. Engine reports 100% lock rate; threshold tightened to >95%. |
| 2026-05-16 | `latin-groove-integrity.test.ts` "should play the 3-2 Clave on Snare for Motif 0" | Same calcification anti-pattern as `latin-drummer-critique.test.ts`. Bar-2 predicate `(isMeasureStart && isOffbeat)` was logically unreachable, so the test only ever checked one of two bar-2 hits. | Hard-coded expected positions to match `grooves/latin.ts` engine. |
| 2026-05-16 | Bossa bass mechanical 16-bar loop (`bass-styles.ts:446`) | The bossa branch never referenced `step`/`barIndex` for pitch decisions — same 4-note voicing repeated every bar regardless of position in the form. Real bossa players octave-displace the root or fifth occasionally so the line breathes. | Added deterministic `barIndex`-seeded octave displacement (~20% octave-up beat-3 root, ~15% each deep-fifth on "& of 2" / "& of 4"). Pitch classes preserved so existing root/fifth assertions still pass. Added a new critique test asserting ≥3 distinct bar shapes across 16 simulated bars. |
| 2026-05-16 | Blues call/response resolution metric (`blues-soloist-authenticity.test.ts:64`) | Test name said "should end Response phrases on resolution tones more often than Call phrases" but counted pitch class on *every* note in each phrase. ~40-48% pitch-class-1/3/5 is the natural blues-scale distribution; the directional assertion `respRate > callRate` was passing at trivial margins (~0.5pt) without measuring phrase endings at all. | Rewrote the metric to detect phrase boundaries (role transitions and rest-onset) and check resolution only on the *last note before* each boundary. New report shows phrase-end rates with sample counts; assertions hold both rates above the 33% baseline. |
| 2026-05-16 | Jazz bass chromatic-approach metric (`jazz-bass-critique.test.ts:108`) | Counted any chromatic semitone at any "& of beat" position (2/6/10/14) — 4× more positions than the musical claim — against a `>1%` placeholder threshold that guarded nothing. Random pitch picks already hit ~8%. | Restricted detection to step 14 ahead of an actual chord change (the only musically meaningful "approach" position) and report per-chord-change rate. Engine delivers 85.1% chromatic approach across 74 chord changes; threshold tightened to >50% with a real headroom argument. |
| 2026-05-16 | Soloist devices buried planned phrase attacks (`soloist-pitch-engine.ts:907-1017`) | Long melodic devices (`bluesLick` spans up to 12 steps) fired probabilistically mid-phrase. The rhythm planner had laid out 5 attacks across the phrase; a mid-phrase device's `durationSteps` budget overflowed the next attacks, and the plan consumer in `soloist.ts:1497` silently `shift()`ed them off as "step > stepTarget." | Added `DEVICE_SPAN_STEPS` lookup in `soloist-devices.ts` and `deviceFitsHere` gate in `soloist-pitch-engine.ts`: long devices (≥6 steps) only fire when zero planned attacks fall inside their span; medium devices (4-5 steps) allow at most one swallowed attack; ornaments (≤3 steps) fire freely. New critique test pins the invariant — 122 device firings over 8000 blues steps, 0 attack burials. |
| 2026-05-16 | `soloist-blues-critique.test.ts:184-189` reported tight targets, asserted loose ones | Five mismatches between logged targets and actual assertions (smell d), plus a target below the random baseline. | Reconciled report targets with engine reality and tightened all five assertions with documented headroom. |
| 2026-05-16 | `reggae-piano-critique.test.ts:61` measured "not silent on steps 0 or 8" instead of "skanks on real reggae positions" | Skank lane check was exclusion-based and harness silenced the engine path (smell e). | Used `getStepInfo` for proper stepInfo; replaced exclusion metric with explicit skank-position (`[4, 12]`), bubble-position (`[2, 6, 10, 14]`), and off-genre-position tracking. |
| 2026-05-16 | `soloist-jazz-critique.test.ts:146` logged a chromatism target but never asserted it | Smell d — logged "Chromatism Ratio Target: >5%" but no `expect(chromaticRatio)...` existed. | Added `chromaticRatio > 0.15` assertion (engine delivers ~26%). Reconciled note-density and smoothness assertions. |
| 2026-05-16 | `neo-soul-bass-critique.test.ts:99` "syncopated hammer-ons" measured "any non-beat-start note" | Metric counted all upbeat hits; the genre-defining hammer-on ornament was never measured. | Split the claim into (a) note lands on syncopated 8th-note offbeat, and (b) pitch is half/whole step above chord root. Threshold `hammerOnsPerBar > 0.5` and `hammerOnRate > 0.15` with engine-probability math. |
| 2026-05-16 | `funk-drummer-critique.test.ts:144` (Q1) harness silenced syncopation check | Smell e — harness cherry-picked 5 fields onto `stepData`; `!stepData.isPulseStart` evaluated `!undefined === true`. | Spread the full `getStepInfo` return into `stepData`. With harness fixed, engine delivers 3.02 syncopated kicks/bar at intensity 0.8; threshold tightened to `>2.0`. |
| 2026-05-16 | `hiphop-drummer-critique.test.ts:115-126` (Q2) missing + loose assertions | HiHat density logged with no `expect()`. Multiple loose assertions. | Added HiHat density assertion. Tightened backbeat, kick syncopation, HiHat with documented headroom. |
| 2026-05-16 | `rock-drummer-critique.test.ts:148-171` (Q3) dead metric + wrong divisor + log/assert mismatch | `_backbeatScore` was dead + encoded "1 backbeat per bar" (rock has 2). Multiple smell-d cases. | Real `backbeatScore = backbeatHits / (totalBars * 2)`, asserted `>0.95`. Tightened eighth pulse and kick solidity. |
| 2026-05-16 | `soloist-musicality.test.ts:80` (Q4) sub-baseline chord-tone threshold | Asserted `ratio > 0.15` against a 4/12=33% random baseline. Low iteration count produced flake. | Bumped iterations 200→800. Engine delivers 68-80% across 10 sample runs. Threshold tightened to `>0.55` with documented headroom. |
| 2026-05-16 | Soloist had no phrase-end-specific resolution bias | Uniformly applied 8× resolution-tone weight across every note. Call and Response endings got identical pitch pull. | Planner marks `isPhraseEnd: true` on phrase breaths + final node. Picker adds role-aware phrase-end weight block (Response endings boost root/5th/3rd; Call endings depress them). Across 20 runs: Response landed 48.9-59.0%, Call landed 35.5-46.4%, gap 3.8-18.3pt. 30/30 reliability passed. |
| 2026-05-16 | Soloist pitch engine had no SRDC-phase-specific bias | Chord-mask weight fired the same way regardless of phase. | Plumbing: `soloist.ts` adds `deriveSrdcPhase()` and writes `phrase.context.srdcState` during plan-build. Picker reads srdcState and applies final-stage chord-tone weight multiplier (Conclusion ×1.5, Departure ×0.45 + non-chord-scale ×2.0). New Q4 comparison test: Conclusion 75-86%, Departure 43-59%, gap 18.5-43pt. 30/30 reliability passed. |
| 2026-05-16 | `jazz-drummer-critique.test.ts` smells (d) + (c) + intensity-metric misalignment | Three issues across feathering, snare anchor, and intensity comparison (jazz routes Snare→Sidestick at low intensity). | Tightened kick feathering, added snare anchor assertion, reworked intensity test to count Snare + Sidestick. Surfaced the musical reality that jazz "intensity comping" is mostly timbre/velocity escalation. |
| 2026-05-16 | `blues-drummer-critique.test.ts` smells | Five issues: loose thresholds, missing assertions, inverted intensity test, section-aware claim that engine doesn't deliver. | Tightened shuffle to `>0.95`, added ghost-ratio `<0.3` assertion, raised Texas density. Replaced section-boundary crash test with bar-downbeat crash rate + low-intensity suppression. Fixed intensity test direction. |
| 2026-05-16 | `metal-drummer-critique.test.ts` smell (b) + no multi-intensity + missing backbeat/cymbal assertions | Single-intensity-only test. Multiple loose thresholds. | Tightened kick density and blast-bar threshold. Added backbeat-snare lock, eighth-pulse cymbal coverage, multi-intensity kick density tests. |
| 2026-05-16 | `neo-soul-drummer-critique.test.ts` pocket-width placeholders + no multi-intensity + no timbre routing check | 2-3× unused headroom on pocket-width thresholds. | Tightened all three pocket-width thresholds. Ghost density `>2.0`. Added backbeat-lock + Sidestick-routing + pocket-scaling tests. |
| 2026-05-16 | `country-drummer-critique.test.ts` smells + missing 4OTF + open-hat headroom | Multiple metrics had massive headroom. No four-on-the-floor check, no multi-intensity. | Backbeat strict `=== 1.0`. Velocity tiering `>2.5×`. Open hat ratio `<0.3`. Added 4OTF test at intensity 0.95 + intensity scan with snare-hit ratio. |
| 2026-05-16 | `disco-drummer-critique.test.ts` smell (b) + no ghost/syncopation + no intensity scaling test | Single test only, all assertions had 60pt of unused headroom. | Tightened backbeat → `=== 1.0`, offbeat-hat → `>0.95`. Added high-intensity ghost lane test, velocity-scaling test, Open-share floor test. Surfaced two latent patterns (entropy always-on; disco intensity is velocity not density). |
| 2026-05-16 | `acoustic-drummer-critique.test.ts` smell (b) + missing multi-intensity + no backbeat + no kick syncopation | Sidestick test asserted `>0` (smell b). Two it() blocks, neither tested motif structure. | Tightened sidestick threshold. Added backbeat-lock test + kick syncopation gate test. |
| 2026-05-16 | `minimal-drummer-critique.test.ts` smell (b) wide range + missing motif tier verification | Single test with density bound `0.5 < density < 8` over 16× range. | Replaced with four targeted tests: motif-0 floor, motif tier escalation, Snare↔Sidestick routing, wide-range test removed. |
| 2026-05-16 | `ska-punk-drummer-critique.test.ts` smell (b) + missing kick four-on-floor + missing intensity scaling | Multiple loose thresholds. | Tightened skank ratio, open-hat. Added kick quarter-note coverage + snare density scan. |
| 2026-05-16 | `shred-drummer-critique.test.ts` thin coverage on Metal alias | Single test with kick density `>6` vs 14.97 delivered. Backbeat measured but discarded. | Tightened kick density. Activated backbeat counting. Added blast-beat alignment + multi-intensity test. |
| 2026-05-16 | `snare-creativity-integrity.test.ts` missing floor assertion (smell b in reverse) | Asserted upper bound but no lower bound. Engine emitting zero ghosts would pass. | Added `>0.5` floor. |
| 2026-05-16 | `funk-bass-critique.test.ts` smells (e) + (b) | Single-test file. Cherry-picked stepInfo silenced engine lanes; loose octave/ghost thresholds. | Rebuilt harness to use `getStepInfo`. Tightened octave ratio + ghost ratio. Added intensity-scaling test. 30/30 reliability passed. |
| 2026-05-16 | `rock-bass-critique.test.ts` smell (b) + missing intensity test | "Occasionally add 5ths" asserted `>5` over 256 possible — 10× too loose. Multiple loose deterministic metrics. | Tightened 8th-note continuity, root grounding, non-root hits. Added intensity-density scaling test. 30/30 reliability passed. |
| 2026-05-16 | `country-bass-critique.test.ts` smell (c) — engine surface mismatched test claim | "Alternate Root and Fifth on quarter notes" test had dead-code branch because country plays Two-Step half-notes. | Renamed test, tightened with strict assertions. Refocused register test. Added velocity-scaling test. Surfaced Open Finding: country missing quarter-note R-5 (still open). |
| 2026-05-16 | `acoustic-bass-critique.test.ts` smell (b) + missing multi-intensity | All three deterministic metrics had massive headroom. | All tightened to `=== 1.0`. Added density-scaling + velocity-scaling tests. |
| 2026-05-16 | `blues-bassist-critique.test.ts` smells + missing intensity scan | Multiple deterministic metrics asserted with placeholders. | Tightened to engine-deterministic strict values. Pinned duration ratios. Added intensity-scan test. 30/30 reliability passed. |
| 2026-05-16 | `bossa-bass-critique.test.ts` smell (b) + missing intensity test | Rhythmic accuracy and lay-back asserted loosely against deterministic 100%. | Tightened to strict equality + total-hits invariant. Added intensity-scaling test (loudness, not density). |
| 2026-05-16 | `disco-bass-critique.test.ts` smell (b) + missing intensity test | Gallop hits `>10` over 16 bars vs observed 57-79. | Tightened gallop hits to `>50`. Added gallop-suppression test at low intensity/complexity. 30/30 reliability passed. |
| 2026-05-16 | `metal-bass-critique.test.ts` smell (b) + smell (c) + missing intensity test | "Stay grounded in roots and fifths" counted pc 0 OR 7, but metal engine NEVER plays fifth. | Tightened gallop motifs, hit density. Renamed grounding test, tightened to `=== 1.0`. Added density-scaling test. 30/30 reliability passed. |
| 2026-05-16 | `reggae-bass-critique.test.ts` smells (c) + (e) — test measured an empty performance | `checkBassActiveStyle` had no `'dub'` branch, so `isBassActive('dub', ...)` returned false universally. | Restructured harness to force activation via `{ kickHit: true }` coordination. New assertions: One-Drop bias, Steppers full beat-1 fire, riddim-position switching, register clamp. 30/30 reliability passed. |
| 2026-05-16 | Bass kick-lock was unconditional across all styles | `bass-engine.ts:40` returned `true` whenever `coordination?.kickHit` was set, regardless of style. Wrong for jazz walking, reggae one-drop, country two-step, shuffle blues, hip-hop/trap. | Added `KICK_LOCK_STYLES` set `{rock, funk, rocco, metal, disco}`. Music-theory review pass caught hip-hop mis-categorization. Reviewer also requested positive-firing test for dub's independent active-lane. |
| 2026-05-16 | `checkBassActiveStyle` had no `'dub'` branch | `isBassActive('dub', ...)` returned false universally; production reggae bass fired only via the kick-lock. Removing kick-lock for style-gating would have silenced reggae outright. | Added `'dub'` branch that mirrors `getBassNoteStyle:710-719`'s intensity-banded riddim selection. 30/30 reliability passed. |

## Related

- `docs/audit/EPICS.md` — current active backlog (8 epics, 49 stories).
- `docs/audit/*.md` — per-area findings (soloist, bass, chords, drums, harmony+coordination, form/arranger).
- `tests/standards/CRITIQUE_GUIDELINES.md` — original principles and target thresholds.
- `docs/archive/ARCHITECTURE_FOLLOWUPS.md` — archived TS-migration tracker, same shape as this doc.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.
