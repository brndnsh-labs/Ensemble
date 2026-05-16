# Musical Audit

A running log of musicality findings surfaced from reading the critique suite (`tests/standards/`) and the engines it covers. The audit's goal is to keep the suite **honestly enforcing** the musical claims its test names make — and to surface engine bugs hiding behind tests that pass for the wrong reason.

Started: 2026-05-16. Archive when the "Open findings" and "Queued" sections are empty.

## Status (2026-05-16)

- **Shipped:** 13 fixes across 8 commits (working tree clean, 8 commits ahead of `origin/main`)
- **Queued (verified, ready to fix):** 4 critique-test rewrites in the same shape as prior passes — see "Queued" below
- **Open (engine-side):** 1 finding — soloist has no phrase-end-specific resolution bias
- **Future passes:** placeholder-threshold sweep, velocity-as-gain naming, re-enable types in `tests/standards/`, harness-silencing audit (new meta-pattern below)

## Methodology

The recurring pattern that lets musical bugs hide:

> A test's *name* asserts a musical claim, but its *implementation* either (a) computes the expected pattern by replaying the engine's own predicates (tautology), (b) uses a threshold below the random-baseline (passes with any output), or (c) measures a different quantity than the name implies.

Two additional smells discovered during the May 2026 audit pass:

> (d) **Report/assertion mismatch** — `console.log` shows "Target: >30%" but `expect(...)` asserts `>15%`. The logged target is aspirational; the assertion is what actually guards. Check that every "Target: X" in the report is the value being asserted.
>
> (e) **Harness silences engine path** — the test passes an incomplete `stepInfo` object (e.g. just `{ isBeatStart: ... }`) when the engine checks other properties (`isBackbeat`, `isOffbeat`, `isMeasureStart`, `isPulseStart`). The engine's relevant lane never fires, so the test measures only the fallback lane while looking healthy. Fix: build stepInfo via `getStepInfo` from `public/utils.ts`, or construct an object containing every property the engine reads. Subtle and high-impact — already caught in `reggae-piano-critique` and `funk-drummer-critique`.

The audit looks for any of these five smells per test file, then verifies the engine against the *named* musical claim before deciding whether the test, the engine, or both need to change.

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
| 2026-05-16 | Blues call/response resolution metric (`blues-soloist-authenticity.test.ts:64`) | Test name said "should end Response phrases on resolution tones more often than Call phrases" but counted pitch class on *every* note in each phrase. ~40-48% pitch-class-1/3/5 is the natural blues-scale distribution; the directional assertion `respRate > callRate` was passing at trivial margins (~0.5pt) without measuring phrase endings at all. | Rewrote the metric to detect phrase boundaries (role transitions and rest-onset) and check resolution only on the *last note before* each boundary. New report shows phrase-end rates with sample counts; assertions hold both rates above the 33% baseline. Surfaces a real engine gap, queued as Open Finding #1 below. |
| 2026-05-16 | Jazz bass chromatic-approach metric (`jazz-bass-critique.test.ts:108`) | Counted any chromatic semitone at any "& of beat" position (2/6/10/14) — 4× more positions than the musical claim — against a `>1%` placeholder threshold that guarded nothing. Random pitch picks already hit ~8%. | Restricted detection to step 14 ahead of an actual chord change (the only musically meaningful "approach" position) and report per-chord-change rate. Engine delivers 85.1% chromatic approach across 74 chord changes; threshold tightened to >50% with a real headroom argument. |
| 2026-05-16 | Soloist devices buried planned phrase attacks (`soloist-pitch-engine.ts:907-1017`) | Long melodic devices (`bluesLick` spans up to 12 steps) fired probabilistically mid-phrase. The rhythm planner had laid out 5 attacks across the phrase; a mid-phrase device's `durationSteps` budget overflowed the next attacks, and the plan consumer in `soloist.ts:1497` silently `shift()`ed them off as "step > stepTarget." Audibly: phrases lost their planned shape, cadence slots vanished, and the silencer log flooded with the device's busy-tail. | Added `DEVICE_SPAN_STEPS` lookup in `soloist-devices.ts` and `deviceFitsHere` gate in `soloist-pitch-engine.ts`: long devices (≥6 steps) only fire when zero planned attacks fall inside their span; medium devices (4-5 steps) allow at most one swallowed attack; ornaments (≤3 steps) fire freely. New critique test pins the invariant — 122 device firings over 8000 blues steps, 0 attack burials. |
| 2026-05-16 | `soloist-blues-critique.test.ts:184-189` reported tight targets, asserted loose ones | Report logged "Melodic Smoothness <6.0" but asserted `<9.0`; "Blue Note Bends >30%" but asserted `>15%`; "Note Density 2.0-6.0/bar" but asserted `1.5-14.0`; and the "Blue Note Presence >1.5%" target was itself below the ~17% baseline of uniform-random pitch over 12 chromatic semitones. The test passed regardless of whether the engine delivered any meaningful blues character. | Reconciled report targets with engine reality (engine delivers 3.4 semitones / 27% blue notes / 100% bends / 3.5 notes/bar). Tightened all five assertions with documented headroom: `avgInterval < 5.0`, `chordToneRatio > 0.45`, `blueNoteRatio > 0.15`, `blueNoteBendRatio > 0.5`, `notesPerBar 2.0-6.0`. |
| 2026-05-16 | `reggae-piano-critique.test.ts:61` measured "not silent on steps 0 or 8" instead of "skanks on real reggae positions" | Code comment labeled the right positions ("Skanks (4, 12) or Bubbles") but the check was exclusion-based: a stab on step 5 (no reggae meaning) counted equally with a stab on step 4 (the actual skank). Compounding the bug, the test passed `{ isBeatStart: ... }` as the stepInfo object — the engine's skank lane checks `isBackbeat`, which was missing, so the skank lane was silenced entirely and the test only ever saw the bubble lane. | Use `getStepInfo` for proper stepInfo; replace exclusion metric with explicit skank-position (`[4, 12]`), bubble-position (`[2, 6, 10, 14]`), and off-genre-position tracking. Engine now reports 100% skank coverage, 100% both-skank bars, 0% off-genre — was hidden behind the original test. |
| 2026-05-16 | `soloist-jazz-critique.test.ts:146` logged a chromatism target but never asserted it | Report claimed "Chromatism Ratio Target: >5%" but no `expect(chromaticRatio)...` existed. A completely diatonic jazz soloist (no chromaticism — the heart of bebop) would have passed the test. The note-density assertion was also looser than the logged target (logged 8-16/bar, asserted `>6.5`). | Added `chromaticRatio > 0.15` assertion (engine delivers ~26%). Reconciled note-density report to match engine reality (6-12/bar) and tightened the smoothness assertion (engine ~2.3 semitones; tightened `<9.0` → `<5.0`). Engine pushing toward Kenny-Dorham-density 12+/bar queued as a future engine task, not papered over here. |
| 2026-05-16 | `neo-soul-bass-critique.test.ts:99` "syncopated hammer-ons" measured "any non-beat-start note" | Metric `p.info.mStep % 4 !== 0` counted all upbeat hits — a root on step 6 and a hammer-on on step 6 both incremented the same counter. Threshold `>5` over 16 bars was 0.3 syncopated notes/bar, effectively trivial. The genre-defining hammer-on ornament (`baseRoot + 2` with shortened duration, fired at `complexity > 0.7`, see `bass-engine.ts:414`) was never measured. | Split the claim into both halves: (a) note lands on a syncopated 8th-note offbeat (steps 2/6/10/14), and (b) pitch is a half or whole step above the chord root. Threshold `hammerOnsPerBar > 0.5` and `hammerOnRate > 0.15` with documented engine-probability math. Engine delivers 0.95 hammer-ons/bar at 27.5% of syncopated hits. |

## Queued (verified, ready to fix)

Four critique-test smells diagnosed and verified during the May 2026 scout pass but not yet shipped. Same thematic shape as prior `refactor(tests): rewrite critique metrics...` commits — recommend one combined commit. Each finding's diagnosis was confirmed by reading the actual file; the engine numbers cited below were not yet captured (next session should run each test once with `--reporter=verbose` to set honest thresholds with documented headroom).

### Q1. `funk-drummer-critique.test.ts:144` — harness silences syncopation check
- **Test claim:** `should pass an authenticity critique for a 128-bar Funk performance` (the "Kick Syncopation" branch)
- **Smell:** (e) harness bug
- **Evidence:** Metric reads `!stepData.isPulseStart` but the harness at lines 43-52 only sets `isDownbeat`, `isPulse`, `isBeatStart`, `isBackbeat`, `isOffbeat` on `stepData`. The `isPulseStart` property is never assigned, so `!undefined === true` and every kick hit gets counted as syncopated. Threshold `totalSyncopatedKickHits / totalBars > 0.5` passes trivially since the engine emits well above 0.5 kicks/bar.
- **Fix:** Replace the predicate. Real "syncopated kick" is a kick on a position that isn't a strong beat — `stepData.instruments.Kick && !stepData.isBeatStart` (or tighter: `!stepData.isDownbeat && !stepData.isBackbeat`).

### Q2. `hiphop-drummer-critique.test.ts:118-126` — missing assertion + loose threshold
- **Test claim:** `should pass an authenticity critique for a 128-bar Hip Hop performance`
- **Smell:** (d) report/assertion mismatch + (5) missing assertion + (2) loose threshold
- **Evidence:** `[HiHat Density]` is logged but never asserted; report says "Backbeat Target: 100%" but assertion is `>0.95`; `syncopatedKickRatio > 0.5/bar` is trivial for hiphop (genre is heavily syncopated — engine likely runs 4-8× that).
- **Fix:** Add a HiHat density assertion at the engine's real output; tighten `syncopatedKickRatio` to a real headroom value after measuring; reconcile the backbeat target log with the assertion.

### Q3. `rock-drummer-critique.test.ts:148-171` — multiple mismatches in one test
- **Test claim:** `should pass an authenticity critique for a 128-bar Rock performance`
- **Smell:** (d) report/assertion mismatch + (2) wrong divisor
- **Evidence:**
  - `_backbeatScore = backbeatHits / (totalBars * 1)` is computed and prefixed-unused. The `* 1` divisor encodes "1 backbeat per bar" but rock has 2 (beats 2 and 4); the dead code documents the wrong model.
  - Report says "Eighth Note Pulse Target: >95%" → asserts `>0.9`.
  - Report says "Kick Solidity Target: 100%" → asserts `>0.9`.
  - `backbeatHits > totalBars` = ">1 per bar" — passes if the engine produces just over 1 backbeat per bar when rock should reliably deliver ~2.
- **Fix:** Restore the `_backbeatScore` metric with the right divisor (`totalBars * 2`), assert at >0.95 with documented headroom; reconcile both "Target" logs with the assertions.

### Q4. `soloist-musicality.test.ts:80` — sub-baseline chord-tone threshold
- **Test claim:** `should statistically resolve to chord tones in the Conclusion phase`
- **Smell:** (2) below random baseline
- **Evidence:** Chord is a 4-tone (`[0, 4, 7, 11]`); random pitch over 12 chromatic semitones gives 4/12 ≈ 33% chord tones. Assertion `expect(ratio).toBeGreaterThan(0.15)` allows the engine to be *worse than random*. The test name claims "statistically resolves" but the threshold allows statistical noise.
- **Fix:** Measure engine output, set threshold above the 33% random baseline with real headroom (likely `>0.5` based on similar tests in the suite).

## Open findings

Items surfaced by the initial pass but not yet investigated/fixed. Listed in rough priority order.

### 1. Soloist has no phrase-end-specific resolution bias
- **Symptom:** With the corrected phrase-end metric in `blues-soloist-authenticity.test.ts`, Response phrase-endings beat Call by anywhere from +9 points to −4 points across runs (sample-size driven RNG variance). The musical claim "Response resolves more than Call" should be reliably directional, not coin-flip.
- **Test status:** Test no longer asserts directionality — both rates are above the 33% baseline, that's what the engine reliably delivers. Directional gap removed from the assertions to avoid flakes.
- **Root cause located:** `soloist-pitch-engine.ts:578-587` applies an 8× resolution-tone weight uniformly across every note of a call-response phrase. There is no separate phrase-end-specific kicker, and Call phrase endings get the same resolution pull as Response endings (musically they should pull in opposite directions: Call leaves the question open, Response answers it).
- **Fix idea:** Two paths converge here. (a) Smallest: add a phrase-end pitch-weight boost on the last 1-2 notes of a phrase, asymmetric by role — Response gets stronger resolution pull (root/3rd/5th), Call gets *negative* resolution pull (favor 2/4/6 suspended tones). (b) Cleaner: now that devices are gated against the rhythm plan (2026-05-16 fix), the planner is a much better home for "this attack is the phrase-end resolution cell" markers — the planner can mark a `kind: 'resolution-cell'` node on the last attack of Response phrases and route pitch selection through a phrase-end-aware path. Once the engine reliably produces e.g. ≥10pt Response>Call gap, re-enable the directional assertion in the blues test.

## Future passes

Lower-priority sweeps to consider once the queued + open findings lists are empty:

- **Harness-silencing audit**: grep `tests/standards/` for `simulatePerformance` helpers (or equivalents) that construct `stepData`/`stepInfo` objects by hand instead of calling `getStepInfo`. Each one is a candidate for the smell (e): the engine reads a property the harness never sets, and the corresponding lane is silently never tested. Already caught twice (reggae-piano, funk-drummer); likely 2-4 more lurking.
- **Placeholder-threshold sweep**: find every `> 0.01`, `> 1%`, `> 0.15` (suspiciously below uniform-random baseline), or `* 0.95` style assertion across `tests/standards/` and tighten to honest values.
- **Velocity-as-gain naming**: drum and bass engines treat the `velocity` field as a multiplicative gain coefficient that can exceed 1.0 (capped at 1.2–1.25 in places). Naming is misleading; reports like `Avg Kick Downbeat: 1.16` look invalid to a reader. Consider renaming `velocity → gain` or splitting accent boost into a separate field.
- **Critique-test typechecking**: most files in `tests/standards/` start with `// @ts-nocheck`. They're the gatekeepers of musicality but the least-typechecked code in the repo. Re-enable types when the state shape stabilizes.
- **Remaining unverified candidates from earlier scout passes** (low priority — would need musical research to set proper thresholds): `country-drummer` velocity tiering ratio (loose at `>2.0×`); `neo-soul-drummer` pocket-width 5ms / 15ms placeholders; `minimal-drummer` 0.5-8 hits/bar range (16× wide); `funk-bass` ghost ratio at `>0.15`.

## Handoff notes for the next session

1. **Repo state:** working tree is clean; 8 audit commits ahead of `origin/main`. No pending changes to land.
2. **Recommended pickup:** ship Q1-Q4 as one thematic commit following the pattern of commit `7822cad3` (`refactor(tests): rewrite four critique metrics to match named claims`). Each Q-finding above has a diagnosed fix; verify engine output with `npx vitest run tests/standards/<file>.test.ts --reporter=verbose` to capture honest threshold values before writing the assertion.
3. **After Q1-Q4:** the natural next move is either (a) close the single Open finding (phrase-end resolution asymmetry — biggest single-fix musical value, now with a clean architectural attachment after the device-gate work) or (b) run the **harness-silencing audit** sweep listed in Future passes — likely to surface 2-4 more findings in the same vein as reggae-piano + funk-drummer.
4. **Listen-test:** the user listened to playback during this session and confirmed the device-gate fix sounded great. Worth re-listening after Q1-Q4 if any engine-side changes get queued.

## Related

- `tests/standards/CRITIQUE_GUIDELINES.md` — original principles and target thresholds.
- `docs/archive/ARCHITECTURE_FOLLOWUPS.md` — archived TS-migration tracker, same shape as this doc.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.
