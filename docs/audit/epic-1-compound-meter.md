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

### S1. BPM unit per time signature ✅ Done 2026-05-27

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

### S7. End-to-end "All Blues feels right" critique test — Blocked by S11–S14

**Status:** Blocked. First S7 authoring attempt (2026-05-27) surfaced four real engine gaps that prevent the cycle's DoD from being met *with the engine as it stands today*. The scheduling foundation (S1–S6, S9) is correct, but the **musical content layer still assumes 4/4** in four places. Promoted to S11–S14 below; S7 will be rewritten and re-attempted after those land.

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

### S8. Visual chart sizing under TS change

User reported chord/measure sizes shifted when switching 4/4 → 6/8 on a long progression. Couldn't reproduce on default `I | V | vi | IV`. Suspect: `arranger.totalSteps` differs by TS (16 in 4/4 vs 12 in 6/8 for a full bar), which flows into `getLeadSheetLayoutProfile` density thresholds (`COMPACT_MEASURE_THRESHOLD`, `ULTRA_COMPACT_MEASURE_THRESHOLD` in `public/lead-sheet-model.ts:255-316, 363-373, 387-445`). If density depends on step count rather than measure count, layout will shift.

Investigate: load a 16+ bar progression in `npm run dev`, switch TS, inspect `data-total-measures` and `data-density` on `#chordVisualizer`. If density differs for the same measure count, fix the density input to be measure-count-only.

**Acceptance:** For any progression, layout profile (density, verticalFillScale, measuresPerRow) is a function of measure count and viewport, not step count or TS. Add unit test in `lead-sheet-model.test.ts` (or create) asserting identical layout output across TSes for identical sectionsState/progression-shape.

**Effort:** ~3h. **Model:** sonnet (investigation may upgrade to opus if cause is non-obvious). **Reviewer:** none required (chart layout, no engine touch). **Source:** investigation 2026-05-27.

### S9. getStepInfo `stepsPerBeat === 4` fragility ✅ Done 2026-05-27

`public/utils.ts:644`: `const isOffbeat = stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1;` — works for the current 2 supported `stepsPerBeat` values (2, 4) but hard-codes the discriminator. If a future TS uses `stepsPerBeat = 3` or `8`, silently mislabels offbeats.

Replace with `const isOffbeat = stepInBeat === Math.floor(stepsPerBeat / 2);` (midpoint of a beat).

**Acceptance:** Equivalent behavior on existing meters (2/4, 3/4, 4/4, 5/4, 7/4: offbeat at `stepInBeat === 2`; 6/8, 7/8, 12/8: offbeat at `stepInBeat === 1`). Existing meter-integrity tests pass unchanged. Add a quick fixture for `stepsPerBeat = 3` to lock in the new math.

**Effort:** ~1h. **Model:** sonnet. **Reviewer:** none required. **Source:** investigation 2026-05-27.

### S10. Genre × TS compatibility surfacing

Some genres are tied to specific meters in real practice (Funk = 4/4, Bossa Nova = 4/4, Reggae = 4/4, Waltz = 3/4, Afro-Cuban 6/8 = 6/8). The UI currently lets users pair any genre × TS, which can produce nonsense feels.

**Decision needed:** soft hint vs hard gate vs no-op. Most likely a "feel hint" badge near the TS or genre selector ("Funk feel is canonically 4/4 — try 6/8 only for unconventional blends"). Defer if S1–S9 already produce a passing S7.

**Acceptance:** TBD on design decision. Could be (a) a hint badge, (b) a feel-genre filter that prefers TS-matched genres at the top of the picker, (c) a no-op with documented "user explores at their own risk."

**Effort:** ~2h (design call) + 2-4h (implementation depending on choice). **Model:** opus (product decision). **Reviewer:** none required. **Source:** investigation 2026-05-27.

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

### S15. Jazz 6/8 walking-bass picker (compound-aware pitch selection)

`public/engine/bass-styles.ts` `getBassNoteStyle 'quarter'` branch (around line 1260+) still applies 4/4-shaped beat-position pitch logic in compound meters. Specifically `intBeat === 2` (line ~1293) — meant as the 4/4 "beat 3 → fifth" idiom — fires on mStep 4 in 6/8, which is the S11/S12 pickup slot. Result: pickup notes play the 5th of the current chord 70% of the time instead of a chromatic / scale-step approach into the next pulse. Canonical Paul Chambers walking 6/8 leans on *leading-tone* approaches at pickup slots, not stable 5ths.

Additional symptom: on pulses where the chord is *held* (no chord change at mStep 6), the picker falls through to the generic scale-tone fallback in `getBassNote`, which can return root, 3rd, 5th, or 7th of the held chord — so even the bass *roots* on pulses are not actually rooted ≥ 90% of the time. This is what blocks the strict pitch-clustering reading of S12's original acceptance.

**The fix:** In the `getBassNoteStyle 'quarter'` branch, branch on `stepInfo.tsConfig?.isCompound`:
- On a pulse (`isPulseStart`), force chord root (with octave choice driven by register-slotting + previous note proximity).
- On a pickup slot (last eighth of the group, mStep 4/10 in 6/8), pick a chromatic-step or scale-step approach into the next pulse's root. Reuse `isChordChangeApproach` or whatever predicate the existing 4/4 leading-tone path uses — don't invent a parallel system.
- On an approach slot (mStep 2/8 — the "and of beat 1"), if it fires at high intensity, prefer chord tones that voice-lead into the pickup slot.

Simple-meter (4/4) `intBeat === 2` behavior must remain byte-identical.

**Acceptance:** A new `tests/standards/jazz-walking-bass-6-8-pitch-critique.test.ts` (or extend the S12 file with a new `describe`) asserts: bass *pitches* on pulses {0, 6} match the chord root ≥ 90% of the time across 30 seeded runs (4-bar progression with at least one held chord — confirms the held-chord pulse still roots). At high intensity, pickup pitches at mStep {4, 10} are within ±2 semitones of the next pulse's root ≥ 80% of the time (the leading-tone claim). Existing 4/4 jazz-walking critique tests pass unchanged.

**Effort:** ~4h (the picker has several stacked biases — chord-tone bonus, register slotting, target awareness; the compound-aware branch needs to integrate cleanly without breaking 4/4). **Model:** opus (pitch-pick decisions are taste-driven). **Reviewer:** music-theory-reviewer. **Source:** epic-1-compound-meter S12 review (2026-05-27). Implementer + reviewer both flagged the picker paired-site as out-of-scope of S12's density-gate fix; promoted to its own story to preserve S12's commit clean.

## Notes

- The synth-audit track does NOT overlap. Voice-level audio changes are out of scope here.
- Compound meters beyond 6/8 and 12/8 (e.g. 9/8) are out of scope. The codebase already supports both via `isCompound`.
- Per-section TS overrides (the state field at `arranger.sections[].timeSignature`) are out of scope. They work but lack good UX; defer.
- Re-authoring drum/bass/soloist *style content* for 6/8 idiom across all genres is a separate musical-content effort. This audit fixes the infrastructure so any future 6/8-tagged content plays correctly.
