# Musical Audit

A running log of musicality findings surfaced from reading the critique suite (`tests/standards/`) and the engines it covers. The audit's goal is to keep the suite **honestly enforcing** the musical claims its test names make — and to surface engine bugs hiding behind tests that pass for the wrong reason.

Started: 2026-05-16. Archive when the "Open findings" section is empty.

## Methodology

The recurring pattern that lets musical bugs hide:

> A test's *name* asserts a musical claim, but its *implementation* either (a) computes the expected pattern by replaying the engine's own predicates (tautology), (b) uses a threshold below the random-baseline (passes with any output), or (c) measures a different quantity than the name implies.

The audit looks for any of those three smells per test file, then verifies the engine against the *named* musical claim before deciding whether the test, the engine, or both need to change.

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

## Open findings

Items surfaced by the initial pass but not yet investigated/fixed. Listed in rough priority order.

### 1. Soloist has no phrase-end-specific resolution bias
- **Symptom:** With the corrected phrase-end metric in `blues-soloist-authenticity.test.ts`, Response phrase-endings beat Call by anywhere from +9 points to −4 points across runs (sample-size driven RNG variance). The musical claim "Response resolves more than Call" should be reliably directional, not coin-flip.
- **Test status:** Test no longer asserts directionality — both rates are above the 33% baseline, that's what the engine reliably delivers. Directional gap removed from the assertions to avoid flakes.
- **Root cause located:** `soloist-pitch-engine.ts:578-587` applies an 8× resolution-tone weight uniformly across every note of a call-response phrase. There is no separate phrase-end-specific kicker, and Call phrase endings get the same resolution pull as Response endings (musically they should pull in opposite directions: Call leaves the question open, Response answers it).
- **Fix idea:** Two paths converge here. (a) Smallest: add a phrase-end pitch-weight boost on the last 1-2 notes of a phrase, asymmetric by role — Response gets stronger resolution pull (root/3rd/5th), Call gets *negative* resolution pull (favor 2/4/6 suspended tones). (b) Cleaner: now that devices are gated against the rhythm plan (2026-05-16 fix), the planner is a much better home for "this attack is the phrase-end resolution cell" markers — the planner can mark a `kind: 'resolution-cell'` node on the last attack of Response phrases and route pitch selection through a phrase-end-aware path. Once the engine reliably produces e.g. ≥10pt Response>Call gap, re-enable the directional assertion in the blues test.

## Future passes

Lower-priority sweeps to consider once the open findings list is empty:

- **Placeholder-threshold sweep**: find every `> 0.01`, `> 1%`, `> 0.15` (suspiciously below uniform-random baseline), or `* 0.95` style assertion across `tests/standards/` and tighten to honest values.
- **Velocity-as-gain naming**: drum and bass engines treat the `velocity` field as a multiplicative gain coefficient that can exceed 1.0 (capped at 1.2–1.25 in places). Naming is misleading; reports like `Avg Kick Downbeat: 1.16` look invalid to a reader. Consider renaming `velocity → gain` or splitting accent boost into a separate field.
- **Critique-test typechecking**: most files in `tests/standards/` start with `// @ts-nocheck`. They're the gatekeepers of musicality but the least-typechecked code in the repo. Re-enable types when the state shape stabilizes.

## Related

- `tests/standards/CRITIQUE_GUIDELINES.md` — original principles and target thresholds.
- `docs/archive/ARCHITECTURE_FOLLOWUPS.md` — archived TS-migration tracker, same shape as this doc.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.
