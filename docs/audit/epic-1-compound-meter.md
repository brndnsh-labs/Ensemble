# Epic 1: Compound Meter (6/8, 12/8)

## Why this epic exists

The user reports 6/8 playback feels "jumbled" — All Blues + 6/8 should sound close to the Miles Davis recording but doesn't. Investigation 2026-05-27 confirmed the preset/config layer is correct (All Blues tagged `'6/8'`, 12-step drum arrays, `isCompound: true`, `pulse: [0, 6]`, `grouping: [3, 3]`). The breakage is in the runtime/engine layer:

1. **BPM is treated as quarter-notes/min everywhere** in the scheduler. In real 6/8 practice the natural pulse is the dotted-quarter — "110 BPM" for a jazz waltz means 110 dotted-quarters/min, not 110 quarters. The engine plays 6/8 at the wrong tempo and the swing/groove pocket math drifts off the dotted-quarter pulse.
2. **Several engines have 4/4-shaped fallbacks** that fire in 6/8 — `is8th` always true for compound, `% 4` literals in accompaniment, latin clave on hardcoded 4/4 16th-note positions, bass anticipation on the wrong step.
3. **Soloist phrasing** is mostly compound-aware in `soloist-seeder.ts` but the rest of the pipeline hasn't been audited.
4. **Chord chart sizing** shifted for the user on one long progression when switching 4/4 → 6/8 (no longer reproducible on default progression). Likely a density-threshold input that depends on step count rather than measure count.
5. **Musical content layer still assumes 4/4** in four places (surfaced 2026-05-27 during the first S7 authoring attempt): jazz 6/8 ride skip-beat lands on the last 16th instead of the last eighth (S11); jazz walking bass density runs 8+/bar via `isBeatStart` on eighths instead of 2-4/bar on the dotted-quarter pulse (S12); jazz comping fires on ~80% of all steps instead of 1-3 sparse hits/bar (S13); soloist has no rest-cadence pipeline — runs 50-90 bars continuously in production-shaped state (S14). The scheduling foundation (S1-S6, S9) is correct; these gaps live in the content/density layer.

## Source

Investigation under `/home/brandon/.claude/plans/i-have-a-very-lucky-wren.md` (2026-05-27). Compound-meter findings from a thorough Explore pass over `scheduler-core.ts`, `bass-engine.ts`, `accompaniment.ts`, `grooves/`, `soloist*.ts`, `utils.ts`, `lead-sheet-model.ts`.

## Definition of Done

`tests/standards/all-blues-6-8-critique.test.ts` (Story 7) passes, AND a manual A/B listening pass with `npm run dev` → load All Blues preset → press play confirms a slow jazz-waltz feel (dotted-quarter pulse, ride swinging in 3-eighth groups, bass on pulses, soloist breathing in dotted-quarters). Existing 4/4 critique tests pass unchanged.

## Stories

### S1. BPM unit per time signature ✅ Done 2026-05-27 · ⏪ REVERTED 2026-05-28

> **Reverted to quarter-universal (2026-05-28).** Per owner call, the displayed BPM is now quarter-notes/min for **every** meter — the DAW/MIDI convention — so one BPM value maps to one absolute tempo regardless of meter and exported MIDI tempo equals the displayed BPM with no conversion. The `bpmUnit` field and the dotted-quarter branch were removed; `secondsPerStepFor` is now `(60/bpm)/4` everywhere. The All Blues preset was re-migrated 60 → **90** (same felt 60-dotted-quarter waltz). The *felt dotted-quarter pulse* (mStep 0/6 grouping) is unchanged — only the BPM-unit interpretation reverted. The S1 description below is retained for history. See `FOLLOWUPS.md` and `chord-presets.ts` provenance.

`public/engine/scheduler-core.ts:444, 531, 576, 780, 866, 883, 987, 1098` all compute `secondsPerStep` from BPM as quarter-notes/min (`60 / bpm / stepsPerBeat`). Add a `bpmUnit: 'quarter' | 'dotted-quarter'` field to each entry in `TIME_SIGNATURES` (`public/config.ts:46-113`). Default `'quarter'` for simple meters (2/4, 3/4, 4/4, 5/4, 7/4); `'dotted-quarter'` for 6/8 and 12/8. In the scheduler, branch:

- `quarter`: `secondsPerStep = 60 / bpm / stepsPerBeat` (unchanged for 4/4).
- `dotted-quarter`: a dotted-quarter is 3 eighths, so `secondsPerStep = 60 / bpm / 3 / (stepsPerBeat / 2)` — for 6/8 (`stepsPerBeat=2`) this is `60 / bpm / 3 × (stepsPerBeat / 2)` = `60 / bpm / 3`. Per-step duration is 1/3 of a dotted-quarter.

Audit every BPM/step-duration math site for a compound branch; metronome click rate must also reinterpret (the click already groups correctly per `scheduler-core.ts:486-487` comment, but verify).

**Acceptance:** All Blues + 6/8 at BPM=110 produces a dotted-quarter pulse at ~110/min (~0.545s per group of 3 eighths). New unit test asserts measured `secondsPerStep` matches expectation for 2/4, 3/4, 4/4, 5/4, 7/4, 6/8, 7/8, 12/8. All existing 4/4 critique tests pass unchanged.

**Migration:** Existing saved sessions in 6/8 will suddenly play slower (correct, but breaks user expectation). Decide during implementation: (a) one-time persistence migration that doubles saved BPM for sessions persisted in 6/8 before this change (mark with a schema-version bump in `persistence.ts:15`), or (b) accept the break since the previous behavior was wrong. Flag for owner decision in the implementer's report.

**Effort:** ~4h. **Model:** opus (Phase 1 — sequential; gates S7). **Reviewer:** music-theory-reviewer + state-discipline-reviewer (config schema). **Source:** investigation 2026-05-27.

### S2. Bass `is8th` always-true for compound meters ✅ Done 2026-05-27

`public/engine/bass-engine.ts:161`: `is8th = step % (ts.stepsPerBeat / 2) === 0`. For 6/8 where `stepsPerBeat = 2`, this is `step % 1 === 0` — always true. Downstream rhythm gates fire every step in compound meters when they expect "the upbeat half of a quarter."

Add `isEighthBoundary` to `getStepInfo()` in `public/utils.ts:620-670`. Replace the `is8th` call site to use the semantic name the consumer actually wants (probably `isOffbeat` from `getStepInfo` for the upbeat case, or a new `isEighthBoundary` for the literal "every eighth note" case). Grep for any other `is8th` consumers in `bass-engine.ts` and downstream.

**Acceptance:** The four `is8th` consumers in `bass-styles.ts` (rock, metal, walking-ska, disco — and the `power-metal` twin in `accompaniment.ts:2082`) gate on a correctly-named `isEighthBoundary` field exposed via `getStepInfo`. Behavior is identical for `stepsPerBeat ∈ {2, 4}` meters (the broken formula happened to coincide with the eighth grid in 6/8 because each step IS an eighth); the rename makes the gate correct by name and correct for any future `stepsPerBeat` value. New `tests/standards/compound-bass-eighth-boundary-critique.test.ts` locks in per-meter eighth-grid semantics and rock-bass onset counts.

Note: the original story wording cited "jazz walking line in 6/8 expects 2-4 onsets" — that's a separate compound-aware-`isQuarter` problem (the Jazz style reads `isQuarter` = `isBeatStart`, which in 6/8 fires every eighth = 6/bar, not the dotted-quarter pulse = 2/bar). Tracked as a follow-up in [`FOLLOWUPS.md`](FOLLOWUPS.md).

**Effort:** ~3h. **Model:** sonnet (mechanical rename + add one boolean to `getStepInfo`). **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S3. Accompaniment `% 4` fallbacks ✅ Done 2026-05-27

`public/engine/accompaniment.ts:1483` and `:1834`: `const isBeat = stepInfo ? stepInfo.isBeatStart : measureStep % 4 === 0;` — hard-coded `% 4` fallback that's wrong for any non-4/4 meter. In the tick path `stepInfo` is always defined, so the fallback is dead defensive code; drop it. Also line 944: `if (genre === 'Bossa Nova' && ts.beats >= 4 && spb === 4)` — `spb === 4` excludes 6/8 silently; either explicitly gate `if (genre === 'Bossa Nova' && !ts.isCompound && ts.beats >= 4)` or document that Bossa is canonically 4/4-only.

**Acceptance:** No remaining `% 4` literals in `accompaniment.ts` (other than legitimate "is beat 4" semantics, which should also go through `stepInfo`). Comping in 6/8 lands on pulse (steps 0 and 6), never on 4/4-derived positions. Add a focused critique test that comps a 6/8 progression and asserts comping density on pulse steps is significantly higher than on non-pulse steps.

**Effort:** ~3h. **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S4. Latin clave 4/4-positioned hits ✅ Done 2026-05-27

`public/engine/grooves/latin.ts:91-100` hardcodes clave positions as `stepInBar === 0 || stepInBar === 6 || stepInBar === 12` — those are 4/4 16th-note positions. In 6/8 (`stepsPerBar = 12`), step 12 is the start of the next measure, so the hit never fires there; the spacing is also wrong (6/8 son clave is 3+3+2 / 2+3+3 over two bars in eighths, not 4/4 spacing).

Simplest fix: gate the current clave logic on `!isCompound`, and rely on the explicit `Afro-Cuban 6/8` preset (`drum-presets.ts:925-932`) for 6/8 latin patterns. If a 6/8 clave is needed in code, encode the 6/8 son cell explicitly.

**Acceptance:** Latin strategy in 6/8 does not place clave hits on incorrect step indices. Existing 4/4 latin behavior is bit-identical.

**Effort:** ~2h. **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S5. Bass "and-of-four" anticipation in 6/8 ✅ Done 2026-05-27

`public/engine/bass-engine.ts:116`: `const isAndOfFour = step % stepsPerBar === stepsPerBar - 2;` — in 4/4 this is step 14 (the "and of 4"). In 6/8 the same math gives step 10 of 12, which is musically wrong — the anticipation point in 6/8 is the final eighth before the downbeat (step 11, "and of 6").

Rename `isAndOfFour` → `isAnticipation`. Compute as `stepsPerBar - 1` for compound, `stepsPerBar - 2` for simple. Grep for downstream consumers.

**Acceptance:** Bass anticipations in 6/8 fall on the last eighth of the bar (step 11). Existing 4/4 anticipations unchanged.

**Effort:** ~2h. **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S6. Soloist phrasing audit pass ✅ Done 2026-05-27

`soloist-seeder.ts:674-720` is already compound-aware (per `tsConfig.pulse`-driven cell generation). Audit the rest of the soloist pipeline (`public/engine/soloist.ts`, `public/engine/soloist-pitch-engine.ts`, motif-related modules) for 4/4-shaped phrase-length assumptions:

- Phrase-length / phrase-boundary literals that assume 16 steps/bar?
- Motif-length / rest-cooldown that assumes 4 beats?
- `soloist.ts:706` cites "16 steps/measure" — confirm whether real assumption or stale comment.

**Acceptance:** Extend `tests/integration/odd-meter-authenticity.test.ts` or add a compound-meter soloist critique. Assert soloist phrase boundaries align to pulse positions (0, 6) in 6/8, not to step 8 (4/4-style mid-bar).

**Effort:** ~4h. **Model:** opus (musical-judgment audit). **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S7. End-to-end "All Blues feels right" critique test ✅ Done 2026-05-27 · listening gate confirmed 2026-05-28

**Status:** ✅ Complete. Both halves of the DoD are met — the critique test passes 30/30 reliable with no `.skip`s, AND the manual A/B listening pass confirmed the slow jazz-waltz feel (2026-05-28, after the S16 drum-density family + S8 chart fix landed). The cycle's Definition of Done is satisfied.

**History:** the first S7 authoring attempt (2026-05-27) surfaced four real engine gaps that prevented the DoD from being met with the engine as it stood — the scheduling foundation (S1–S6, S9) was correct, but the **musical content layer still assumed 4/4** in four places. Those were promoted to S11–S14, and S7 was rewritten and re-attempted after they landed.

The original spec also contained a musical error: the canonical jazz 6/8 "spang-a-lang" skip-beat lands on the LAST EIGHTH of each dotted-quarter group (steps **{4, 10}** in 6/8), not the middle eighth ({2, 8}) the original story spec listed. S11 fixes the engine to match {4, 10}; the rewritten S7 will assert that target.

Add `tests/standards/all-blues-6-8-critique.test.ts`. Statistical, not snapshot. Loads the All Blues preset, generates N bars in 6/8 at BPM=110, asserts:

- Ride cymbal hits cluster on pulse positions (steps 0 and 6) plus the canonical jazz "skip-beat" on the last eighth of each dotted-quarter (steps **4 and 10** — corrected from the original "2 and 8" via S7 authoring; see S11).
- Bass plays roots on pulse positions; walking-line density is 2–4 onsets per bar (not 6+). Gated on S12 landing.
- Soloist phrase boundaries respect pulse boundaries; no phrase crosses 5 bars without a rest. Gated on S14 landing.
- Comping chord hits land on pulse (allow swing offset) and are not at every-step density. Gated on S13 landing.
- Measured `secondsPerStep` matches the dotted-quarter BPM interpretation from S1.

This is the cycle's Definition of Done. The audit is not done until this passes — and "passes" means every named assertion is enforced, not `.skip`'d.

**Acceptance:** Test passes 30/30 on the reliability loop with no `.skip`'d assertions. Existing 4/4 critique tests still green. Manual A/B listening pass confirms slow jazz-waltz feel.

**Effort:** ~5h (rewrite + thresholds + listening pass) AFTER S11–S14 ship. **Model:** opus (musical-judgment thresholds + statistical ranges). **Reviewer:** music-theory-reviewer + critique-test-author. **Source:** investigation 2026-05-27; first authoring attempt 2026-05-27 (cycle-paused, see review thread).

### S8. Visual chart sizing under TS change ✅ Done 2026-05-28

User reported chord/measure sizes shifted when switching 4/4 → 6/8 on a long progression. Couldn't reproduce on default `I | V | vi | IV`.

**Root cause (premise corrected during investigation):** the density layer is *already* correct — `getLeadSheetLayoutProfile` / `getLeadSheetDensity` are pure functions of measure count + viewport, no step-count or TS input, and `chord.beats` is already TS-aware (`chords-engine.ts:778`, `ts.beats / chordsPerBar`). The real bug was a **float-accumulation error in measure grouping**: `buildLeadSheetSections` closed a measure on `currentMeasureBeats >= timeSignatureConfig.beats` (exact comparison). Per-chord beats are `ts.beats / chordsPerBar`, often not exactly representable in f64 — e.g. a 6-chord bar in 4/4 gives `4/6` each, summing to `3.9999999999999996 < 4`, so the measure failed to close at the bar line and the next bar's chords bled in, drifting the measure count (16 bars → 14 measures). In 6/8 the same shape gives `1.0` each (exact) → closes cleanly → 16 measures. Different measure count across meters → different density → the shift the user saw. Whether a given chord-count triggers it depends on the meter, so the default 1-chord-per-bar progression never tripped it.

**Fix:** epsilon-tolerant comparison — `currentMeasureBeats >= ts.beats - MEASURE_BEATS_EPSILON` (1e-6), `lead-sheet-model.ts`. Epsilon is far below any real beat fraction (a 16-chord bar in 4/4 = 0.25/chord), so it never closes a measure that is not genuinely full.

**Acceptance:** ✅ Unit tests added to `tests/unit/utils/lead-sheet-model.test.ts` — (1) one bar groups to exactly one measure for chords-per-bar 1–8 in both 4/4 and 6/8; (2) a 16-bar × 6-chord progression yields identical measure count AND identical layout profile across 4/4 and 6/8. Both red before the fix, green after. Existing 11 layout tests unchanged.

**Effort:** ~1h (investigation localized it to a one-line float-tolerance fix). **Model:** sonnet (ran inline). **Reviewer:** none required (chart layout, no engine touch). **Source:** investigation 2026-05-27.

### S9. getStepInfo `stepsPerBeat === 4` fragility ✅ Done 2026-05-27

`public/utils.ts:644`: `const isOffbeat = stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1;` — works for the current 2 supported `stepsPerBeat` values (2, 4) but hard-codes the discriminator. If a future TS uses `stepsPerBeat = 3` or `8`, silently mislabels offbeats.

Replace with `const isOffbeat = stepInBeat === Math.floor(stepsPerBeat / 2);` (midpoint of a beat).

**Acceptance:** Equivalent behavior on existing meters (2/4, 3/4, 4/4, 5/4, 7/4: offbeat at `stepInBeat === 2`; 6/8, 7/8, 12/8: offbeat at `stepInBeat === 1`). Existing meter-integrity tests pass unchanged. Add a quick fixture for `stepsPerBeat = 3` to lock in the new math.

**Effort:** ~1h. **Model:** sonnet. **Reviewer:** none required. **Source:** investigation 2026-05-27.

### S10. Genre × TS compatibility surfacing ✅ Done 2026-05-28

Some genres are tied to specific meters in real practice. The UI lets users pair any genre × TS, which can produce non-idiomatic feels.

**Decision (user, 2026-05-28):** option (a) — a **soft, positive hint**, not a gate. "I'm fine with things getting weird if a user inputs a genuinely unusual combination, but it's fair to highlight the time signatures that legitimately work well and are associated with a genre." Nothing is disabled; the idiomatic meters are simply marked. Chosen visual form: a ★ marker on canonical options in the time-signature dropdown + a legend caption.

**Shipped:**
- `public/data/smart-genres.ts` — added an optional `meters` field to `GENRE_OVERRIDES` and a `CANONICAL_METERS_BY_FEEL` lookup + `getCanonicalMeters(feel)` (defaults to `['4/4']`). Non-4/4 genres: Jazz `[4/4, 3/4, 6/8]`, Blues `[4/4, 12/8, 6/8]`, Country `[4/4, 3/4]`, Acoustic `[4/4, 3/4]`.
- `public/components/KeySignatureControls.tsx` `TimeSignatureControl` — reads `groove.genreFeel`, appends ` ★` to idiomatic options, renders a `★ idiomatic for {genre}` legend (`.time-sig-hint`, styled in `public/css/panels.css`). Every meter stays selectable.

**Acceptance:** ✅ Unit tests in `tests/unit/engine/smart-genre.test.ts` (lookup correctness, 4/4 default, every feel covered, only-real-meters). Playwright smoke in `tests/e2e/arranger.spec.ts` confirms the hint renders and 4/4 carries ★ while 5/4 does not (verified in real Chromium).

**Effort:** ~1.5h. **Model:** opus (product decision — made by user). **Reviewer:** none required (UI, no engine touch). **Source:** investigation 2026-05-27; design call 2026-05-28.

### S11. Jazz 6/8 ride skip-beat lands on the last eighth, not the last 16th ✅ Done 2026-05-27

`public/engine/grooves/jazz.ts:80` defines `isSkipBeat = stepInGroup === groupSteps - 1`. In 6/8 (`grouping=[3,3]`, `stepsPerBeat=2`, so `groupSteps = 6`), this places the skip-beat at `stepInGroup === 5` → mStep ∈ **{5, 11}**, which is the last *sixteenth* of each dotted-quarter group.

Idiomatic jazz 6/8 "spang-a-lang" places the skip on the last *eighth* of each dotted-quarter (the third eighth, anticipating the next pulse) → mStep ∈ **{4, 10}**. The current placement is rhythmically one 16th too late and is the single most audible source of the "jumbled" feel the user originally reported.

**The fix:** In the compound branch, gate the skip-beat on the last eighth: `stepInGroup === groupSteps - 2` (and verify with `isEighthBoundary` if needed). Simple-meter behavior is bit-identical (this branch is compound-gated).

**Acceptance:** A new `tests/standards/jazz-6-8-ride-position-critique.test.ts` asserts the ride hits cluster on `{0, 4, 6, 10}` (≥ 90% on-cluster) and *not* on `{5, 11}` (≤ 5% on those step positions). Existing 4/4 jazz drummer critique tests pass unchanged.

**Effort:** ~1.5h (1-line engine fix + new critique). **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** epic-1-compound-meter S7 authoring + review (2026-05-27).

### S12. Jazz 6/8 walking bass density (compound-aware `isQuarter`) ✅ Done 2026-05-27

`public/engine/bass-styles.ts:74` jazz/walking branch reads `isQuarter` (= `isBeatStart` = `mStep % stepsPerBeat === 0`). In 6/8 (`stepsPerBeat=2`) that fires on **every eighth** (steps 0,2,4,6,8,10), producing 8+ onsets per bar — running, not walking. Jazz waltz walking targets the dotted-quarter pulse with 2–4 melodic onsets per bar (think the iconic "All Blues" Paul Chambers line, not a 4/4 ride).

**The fix:** In the jazz walking branch, when `isCompound`, drive density off `stepInfo.isPulseStart` (steps 0, 6) rather than `isBeatStart`. Add an intensity taper: at low band intensity, ~2 onsets/bar (pulses only); at high intensity, allow tasteful pickups on the final eighth of each group (steps 4, 10 — the S11 skip-beat slot). The shape is a *melodic* walk, not a sixteenth grid.

**Acceptance:** A new `tests/standards/jazz-walking-bass-6-8-critique.test.ts` asserts onsets-per-bar ∈ [2, 5] at intensity ≤ 0.7 (target ~3) and ∈ [3, 7] at intensity > 0.7 (target ~5). Bass *onset positions* (not pitch) cluster on pulses {0, 6} (≥ 90%) at low intensity. Existing 4/4 jazz-walking-bass critique passes unchanged. **Note (2026-05-27 review):** the original acceptance said "Bass roots cluster on pulses" — a pitch claim. The current `getBassNoteStyle 'quarter'` picker is still 4/4-shaped and can return a 5th or scale-tone on pulses when the chord is held; the strict pitch-clustering claim cannot be guarded without picker-layer work (S15). The shipped test guards the onset-position claim only.

**Effort:** ~3h. **Model:** opus (musical-judgment density curve). **Reviewer:** music-theory-reviewer. **Source:** existing FOLLOWUPS line 78 (S2 review) — promoted via S7 authoring (2026-05-27).

### S13. Jazz 6/8 comping density (sparse compound comp bank) ✅ Done 2026-05-27

`public/engine/accompaniment.ts` jazz lane in 6/8 fires on ~80% of all steps (~9.6 hits per 12-step bar). Idiomatic jazz comping is *sparse and syncopated* — 1–3 chord hits per bar, lands on pulses and anticipations, leaves space for the soloist. The 80% density is "thick mush" — the dominant audible flaw the user reported.

**The fix:** Audit the jazz comping per-step probabilities for compound meters. The 4/4 16th-grid gates pass through unchanged in 6/8 but each compound-meter step is a 16th of a *smaller* bar (12 sixteenths vs 16) and the per-step probabilities haven't been tuned. Two possible directions:
1. Compound-specific comping bank with low base probability + boosted gates on pulse positions {0, 6} and anticipation slots {4, 10}.
2. Inherit the 4/4 bank but apply a per-step probability divisor in compound (~0.3×) so density drops to ~3 hits/bar.

Decide during implementation; the design call is "what does a jazz-waltz comp sound like at slow tempo?" Reference: Bill Evans' "Waltz for Debby" left hand, the comping on Miles "All Blues."

**Acceptance:** A new `tests/standards/jazz-comping-6-8-critique.test.ts` asserts hits-per-bar ∈ [1, 4] at intensity 0.7, with ≥ 70% landing on pulse-aligned positions {0, 4, 6, 10}. Density-per-step ≤ 35% (vs. the current ~80%). Existing 4/4 jazz comping critique tests pass unchanged.

**Effort:** ~4h (design + comping bank rework + critique). **Model:** opus (musical-judgment density + idiomatic syncopation). **Reviewer:** music-theory-reviewer. **Source:** epic-1-compound-meter S7 authoring (2026-05-27).

**Note (2026-05-27 implementation):** The engine fix was already shipped in S3 (commit `d6d094b8`) via `COMPOUND_COMPING_CELLS` at `accompaniment.ts:250-268` + routing at line 1065. S13's deliverable became the end-to-end emission-path critique that proves the engine produces sparse pulse-aligned comping at the full `getAccompanimentNotes` layer (S3's critique guarded only the pattern picker). Measured: 2.73 hits/bar, 100% pulse-aligned, 22.8% density. The "thick mush" the user originally reported was always going to be fixed by S3; this story confirmed it.

### S14. Soloist rest-cadence pipeline (phrasing budget) ✅ Done 2026-05-27

`public/engine/soloist.ts` only decrements `restSteps` from a manually-seeded value; once `restSteps` reaches 0 there is no per-tick path that forces a rest after N bars of continuous play. In production-shaped state with the All Blues preset, the soloist runs 50–90 bars between rest flips. Human soloists breathe every 4–8 bars in jazz; the engine doesn't.

The S6 and S7 critique tests both depend on a hand-cycled mock to produce phrase boundaries — the real engine doesn't have the wake-up→rest cycle wired beyond initial seeding.

**The fix:** Add a phrasing-budget timer that tracks "elapsed active bars in current phrase" and, when it crosses an intensity-aware target (e.g. 4 bars at low intensity, up to 8 at high), schedules a rest entry on the next pulse boundary. The rest length should also be intensity-aware (longer rests at lower intensity). Hook into the existing phrasing state machine rather than building a parallel path.

**Acceptance:** A new `tests/standards/soloist-rest-cadence-critique.test.ts` drives the soloist over 64 bars of production-shaped state (NOT mock-cycled) and asserts: at least one rest entry per 8 bars at intensity 0.7, at least one per 5 bars at intensity 0.5. Mean active-streak length ≤ 8 bars. Existing 4/4 soloist phrasing critique tests pass unchanged. The S6 compound-soloist-phrasing-critique can be refactored to drop its hand-cycle harness (or kept as the picker-level guard while this becomes the end-to-end guard).

**Effort:** ~6h (musical-design pass + budget timer + per-tick wake-up + critique test). **Model:** opus (phrasing pipeline is taste-driven). **Reviewer:** music-theory-reviewer. **Source:** epic-1-compound-meter S7 authoring (2026-05-27).

### S15. Jazz 6/8 walking-bass picker (compound-aware pitch selection) ✅ Done 2026-05-27

`public/engine/bass-styles.ts` `getBassNoteStyle 'quarter'` branch (around line 1260+) still applies 4/4-shaped beat-position pitch logic in compound meters. Specifically `intBeat === 2` (line ~1293) — meant as the 4/4 "beat 3 → fifth" idiom — fires on mStep 4 in 6/8, which is the S11/S12 pickup slot. Result: pickup notes play the 5th of the current chord 70% of the time instead of a chromatic / scale-step approach into the next pulse. Canonical Paul Chambers walking 6/8 leans on *leading-tone* approaches at pickup slots, not stable 5ths.

Additional symptom: on pulses where the chord is *held* (no chord change at mStep 6), the picker falls through to the generic scale-tone fallback in `getBassNote`, which can return root, 3rd, 5th, or 7th of the held chord — so even the bass *roots* on pulses are not actually rooted ≥ 90% of the time. This is what blocks the strict pitch-clustering reading of S12's original acceptance.

**The fix:** In the `getBassNoteStyle 'quarter'` branch, branch on `stepInfo.tsConfig?.isCompound`:
- On a pulse (`isPulseStart`), force chord root (with octave choice driven by register-slotting + previous note proximity).
- On a pickup slot (last eighth of the group, mStep 4/10 in 6/8), pick a chromatic-step or scale-step approach into the next pulse's root. Reuse `isChordChangeApproach` or whatever predicate the existing 4/4 leading-tone path uses — don't invent a parallel system.
- On an approach slot (mStep 2/8 — the "and of beat 1"), if it fires at high intensity, prefer chord tones that voice-lead into the pickup slot.

Simple-meter (4/4) `intBeat === 2` behavior must remain byte-identical.

**Acceptance:** A new `tests/standards/jazz-walking-bass-6-8-pitch-critique.test.ts` (or extend the S12 file with a new `describe`) asserts: bass *pitches* on pulses {0, 6} match the chord root ≥ 90% of the time across 30 seeded runs (4-bar progression with at least one held chord — confirms the held-chord pulse still roots). At high intensity, pickup pitches at mStep {4, 10} are within ±2 semitones of the next pulse's root ≥ 80% of the time (the leading-tone claim). Existing 4/4 jazz-walking critique tests pass unchanged.

**Effort:** ~4h (the picker has several stacked biases — chord-tone bonus, register slotting, target awareness; the compound-aware branch needs to integrate cleanly without breaking 4/4). **Model:** opus (pitch-pick decisions are taste-driven). **Reviewer:** music-theory-reviewer. **Source:** epic-1-compound-meter S12 review (2026-05-27). Implementer + reviewer both flagged the picker paired-site as out-of-scope of S12's density-gate fix; promoted to its own story to preserve S12's commit clean.

### S16. Compound-meter drum density across genres (hat-first pass) ✅ Done 2026-05-27

S11-S15 fixed jazz 6/8 (ride skip-beat + walking bass density/pitch + comping density + soloist rest cadence). The same shape of bug — 4/4-shaped per-step density firing on every eighth in 6/8 — exists in drum grooves across other genres. User-reported 2026-05-27 during the listening session: "drums feel too busy in 6/8, especially obvious on rock; the genre-specific drum energy pushes too hard."

**Scope chosen (hat-first):** A parallel 3-agent audit of all 13 groove files revealed the bug is wider than the audit-doc anticipated — ~9 files have critical hat over-density (12/bar in 6/8), reggae and latin are *partially* compound-aware (some motifs correct, others broken — the worst-to-debug shape), and acoustic is sparse-by-design except its hat lane. Rather than ship one mega-commit, scope was narrowed to the dominant audible symptom (hat over-density) across 10 files. Kick/snare per-genre tuning and reggae/latin partial-broken motif repair promoted to S16b / S16c.

**The fix:** New shared `compoundHatAllowed(context, opts)` helper in `public/engine/grooves/utils.ts` with two profiles:
- **sparse** (Rock, Metal, Country, Blues, Acoustic, Reggae, Latin): hat is *secondary* to the pulse. At intensity ≤ 0.5 → pulses only (2/bar in 6/8); 0.5–0.75 → +and-of-pulse (4/bar); > 0.75 → +offbeats (10/bar).
- **shimmer** (Funk, Hip Hop, Neo-Soul, Disco): hat IS the time-keeping voice. At intensity ≤ 0.4 → pulses; > 0.4 → steady 8ths (6/bar). Suppressing to pulses-only would *invert* the genre identity (hat becomes ornament). Reviewer-required split — uniform suppression failed the music-theory review.

Open and HiHatHalf voicings pass through unconditionally (structural turnaround barks, phrase-end punctuation — not the over-density we're suppressing). Helper applied as a post-hoc filter at the end of each affected file's hat branch, preserving all velocity / voicing / motif shaping. 4/4 behavior byte-identical (helper returns `true` in simple meters). Ska-Punk explicitly excluded — offbeat-hat IS the skank identity.

**Acceptance:** `tests/standards/compound-hat-density-critique.test.ts` — parametric across all 11 genres + 4/4 no-op regression guard. Sparse genres assert 6/8 hat density ∈ [1, 4] hits/bar at intensity 0.5; shimmer genres ∈ [4, 8] hits/bar. Measured: sparse 2.0–2.1/bar, shimmer 6.0–6.1/bar. Existing 4/4 critiques pass unchanged (719/719). Listen-test gate: passed 2026-05-27.

**Effort:** ~3h (parallel audit + helper + 10 surgical edits + parametric critique + reviewer iteration). **Model:** opus (per-genre taste calls). **Reviewer:** music-theory-reviewer (caught shimmer-genre identity issue; design revised). **Source:** user listening session during S15 cycle (2026-05-27).

### S16b. Compound-meter kick/snare density per genre ✅ Done 2026-05-28

S16 fixed the universal hat-density bug via a shared helper. The same bug-shape persisted in kick/snare lanes across many of the same files — they gated on `isBeatStart` / `isOffbeat`, firing on every eighth in 6/8.

**The fix (two parts):**
1. New `compoundKickAllowed(context)` helper in `grooves/utils.ts` — sparse-only profile (no shimmer analog; kick is always sparse in compound). Two-tier ramp: pulses at intensity ≤ 0.7, +and-of-pulse (mStep {4,10}) above. Applied as a post-hoc filter at the end of each affected file's Kick branch (same pattern as S16's `compoundHatAllowed`).
2. `!isCompound` gates around 4/4-idiomatic motifs that have no 6/8 equivalent: metal motifs 1-4 (driving 8ths / gallop / double-16ths / blast — implemented via `effectiveMotif = isCompound ? 0 : activeMotif`, forcing motif 0 in compound so the kick isn't intermittently silent), country Train Beat snare (motif > 0), funk Funky Drummer snare-ghost layer (motif 1), latin Samba snare (motif 2).

**Review (music-theory-reviewer) caught two P0s, both fixed before commit:**
- **F1 (second-pulse loss):** rock/country/blues/hiphop/neo-soul/latin foundations gate on `!isBackbeat`, which in default 6/8 excludes mStep 6 (the second pulse coincides with the backbeat). Collapsed compound kick to downbeat-only (1/bar). Fixed with an explicit `if (isCompound && isPulseStart) shouldPlay = true` second-pulse injection per file.
- **F6 (paired-site):** metal blast-beat snare wasn't `!isCompound`-gated to match its kick partner — would have fired a structureless snare 8th-roll in compound. Gated.
- **F2:** helper's middle backbeat tier was dead code in default 6/8 (backbeat overlaps isPulseStart) — simplified to two-tier.

**Applied to 9 files:** rock, metal, country, blues, disco, funk, hiphop, neo-soul, latin. Excluded: jazz (compound-aware), acoustic (fixed-position kick), ska-punk (skank identity), minimal/shred, reggae (deferred to S16c).

**Acceptance:** `tests/standards/compound-kick-density-critique.test.ts` — parametric across 9 genres + 4/4 no-op guard. Asserts 6/8 kick density ∈ [1.8, 2.5] hits/bar at intensity 0.5 AND both pulses {0,6} populated (the both-pulses assertion is the load-bearing F1 regression guard). Measured: all 9 genres land at exactly 2.00/bar on both pulses. Existing 4/4 critiques pass unchanged (729/729). Listen-test gate: passed 2026-05-28.

**Effort:** ~3h (helper + 9 files + critique + reviewer iteration on F1/F6/F2). **Model:** opus. **Reviewer:** music-theory-reviewer (2 P0s caught + fixed). **Source:** S16 audit (2026-05-27).

### S16c. Reggae One Drop + Latin Samba/Partido Alto partial-compound repair ✅ Done 2026-05-28

S16's audit surfaced an anti-pattern *worse* than no compound-awareness: files that use `isPulseStart` in some motifs but `isBeatStart` in others. Two files were flagged — but implementing surfaced a **premise correction** plus an already-shipped overlap with S16b:

- **reggae.ts — One Drop is actually CORRECT.** The audit claimed Motif 0 (One Drop, `isBackbeat && isBeatStart`, line 76) "fires every eighth, destroys beat-1 silence." That was a misreading of `isBackbeat`: in 6/8 the compound branch of `getStepInfo` (`utils.ts:685-688`) resolves `isBackbeat` to **mStep 6 only** (`isGroupStart && backbeat.includes(groupIndex)`, backbeat [1]). So One Drop drops kick+snare on the second dotted-quarter pulse (mStep 6) with beat 1 silent — the structural analogue of the 4/4 beat-3 drop, and the genre's defining feature. No fix needed. The *real* reggae defect was the Rockers motif (motif 2) combining every offbeat → 8 kicks/bar, with reggae kick having no `compoundKickAllowed` filter at all (skipped in S16b).
- **latin.ts — Samba already fixed in S16b; Partido Alto was the live bug.** Samba (motif 2) was gated `!isCompound` in S16b (line 132). The remaining defect was Partido Alto (motif 3): a 4/4 2-bar offbeat clave that produced a **7-hits-vs-1-hit bar split** in 6/8. Gating it surfaced a latent S16b fall-through too: `activeMotif===2 && isCompound` failed the Samba guard and dropped *through* into the Partido Alto `else`, running the broken pattern.

**Fix shipped:**
- reggae.ts — added `compoundKickAllowed(context)` filter to the kick branch. No-op for One Drop/Steppers/Dub (all ⊆ `isPulseStart`); trims Rockers to the two pulses (its source predicate emits only odd-step offbeats, so the filter's and-of-pulse tier is inert here).
- latin.ts — changed the Partido Alto `} else {` to `} else if (!isCompound) {`, consistent with the Samba decision. Closes the Samba fall-through in the same stroke. Compound latin snare/clave is deferred to the dedicated `Afro-Cuban 6/8` drum preset.

**Acceptance (measured, `tests/standards/compound-reggae-latin-critique.test.ts`, 4/4 reliable):** Reggae One Drop — drop (mStep 6) fires 64/64 bars, beat 1 (mStep 0) fires only 26/64 (Steppers bars), density 1.41/bar. Reggae high-intensity — Rockers trimmed, max 2 kicks/bar, mean 1.77. Latin — no 7-vs-1 split: even-bar 1.22 vs odd-bar 1.19 snares (symmetric), 1.20/bar, 4/4 preserved at 4.06.

**Deferred (S16c review P2s, see FOLLOWUPS §C/§F):** verify generic 6/8 Latin auto-surfaces the Afro-Cuban 6/8 preset (else the snare lane is genuinely empty); migrate latin.ts:188 Sidestick velocity `Math.random()` to seeded entropy. The "build a real 6/8 partido-alto pattern" option was offered and the user chose gate-off (consistent with Samba).

**Effort:** ~1.5h (premise verification de-risked it to mechanical; done inline on main thread, not opus). **Model:** opus-tagged but ran as inline sonnet-scope after premise correction. **Reviewer:** music-theory-reviewer (0 P0, 2 P1 descriptive-accuracy patched, 2 P2 → FOLLOWUPS). **Source:** S16 audit (2026-05-27).

## Notes

- The synth-audit track does NOT overlap. Voice-level audio changes are out of scope here.
- Compound meters beyond 6/8 and 12/8 (e.g. 9/8) are out of scope. The codebase already supports both via `isCompound`.
- Per-section TS overrides (the state field at `arranger.sections[].timeSignature`) are out of scope. They work but lack good UX; defer.
- Re-authoring drum/bass/soloist *style content* for 6/8 idiom across all genres is a separate musical-content effort. This audit fixes the infrastructure so any future 6/8-tagged content plays correctly.
