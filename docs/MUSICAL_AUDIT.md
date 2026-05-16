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

## Open findings

Items surfaced by the initial pass but not yet investigated/fixed. Listed in rough priority order.

### 1. Blues call/response resolution rate is low for both roles
- **Symptom:** `[Blues Audit] Call Resolution: 39.6%, Response Resolution: 48.0%`. The "Response > Call" assertion passes (statistically significant over 50k iterations), but *both* roles resolve to chord tones less than half the time.
- **Test status:** Passes. The qualitative claim "Response resolves more than Call" is technically true but the absolute floor is suspiciously low for blues phrasing.
- **Hypothesis:** Either (a) the resolution-bias logic in `soloist.ts` / `soloist-pitch-engine.ts` is too weak for Blues, or (b) the metric counts every emitted note instead of just phrase-ending notes (the latter is where resolution actually matters musically).
- **Investigate:** What the test calls "Resolution" — is it phrase-end notes, or every note? Then decide which to fix.

### 2. Jazz walking bass chromatic approaches at 37%
- **Symptom:** `[Jazz Bass Critique] Chromatic Approaches: 37.3% (Target: >1%)`. The threshold `>1%` is a placeholder. Real walking bass chromatic-approach density is typically 10–25% and concentrated on bars approaching chord changes.
- **Test status:** Passes (37 >> 1). Threshold provides no real guard.
- **Hypothesis:** Chromatic-approach logic in the walking bass is firing unconditionally per bar rather than gated by "next bar has a chord change." Result will sound more "modern wandering hard-bop" than "Paul Chambers solid walking."
- **Investigate:** Walking-bass branch in `public/engine/bass-engine.ts` for jazz feel, find the chromatic-approach trigger, gate it on chord-change proximity.

### 3. Soloist `busySteps` silencer fires constantly
- **Symptom:** Across a 50k-step blues simulation with `debugSoloist: true`, the log floods with `Silenced because busy holding previous note. busySteps remaining: N` messages. Not a test failure — a code-smell signal.
- **Hypothesis:** The rhythm planner generates notes whose `durationSteps` overlap the next planned hit, then the silencer suppresses the new hit. The right safety net, but the *frequency* suggests the planner and pitch selector aren't coordinated — the planner doesn't know "the previous note will still be sounding when I want to fire this one." Likely a source of muddy phrasing in actual playback.
- **Investigate:** `public/engine/soloist-rhythm-engine.ts` planner, check whether duration-vs-next-step is considered when laying out the rhythm plan.

## Future passes

Lower-priority sweeps to consider once the open findings list is empty:

- **Placeholder-threshold sweep**: find every `> 0.01`, `> 1%`, `> 0.15` (suspiciously below uniform-random baseline), or `* 0.95` style assertion across `tests/standards/` and tighten to honest values.
- **Velocity-as-gain naming**: drum and bass engines treat the `velocity` field as a multiplicative gain coefficient that can exceed 1.0 (capped at 1.2–1.25 in places). Naming is misleading; reports like `Avg Kick Downbeat: 1.16` look invalid to a reader. Consider renaming `velocity → gain` or splitting accent boost into a separate field.
- **Critique-test typechecking**: most files in `tests/standards/` start with `// @ts-nocheck`. They're the gatekeepers of musicality but the least-typechecked code in the repo. Re-enable types when the state shape stabilizes.

## Related

- `tests/standards/CRITIQUE_GUIDELINES.md` — original principles and target thresholds.
- `docs/archive/ARCHITECTURE_FOLLOWUPS.md` — archived TS-migration tracker, same shape as this doc.
- `CLAUDE.md` § Musical Logic & Generative Standards — operating rules for engine work.
