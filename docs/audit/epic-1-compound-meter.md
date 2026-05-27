# Epic 1: Compound Meter (6/8, 12/8)

## Why this epic exists

The user reports 6/8 playback feels "jumbled" — All Blues + 6/8 should sound close to the Miles Davis recording but doesn't. Investigation 2026-05-27 confirmed the preset/config layer is correct (All Blues tagged `'6/8'`, 12-step drum arrays, `isCompound: true`, `pulse: [0, 6]`, `grouping: [3, 3]`). The breakage is in the runtime/engine layer:

1. **BPM is treated as quarter-notes/min everywhere** in the scheduler. In real 6/8 practice the natural pulse is the dotted-quarter — "110 BPM" for a jazz waltz means 110 dotted-quarters/min, not 110 quarters. The engine plays 6/8 at the wrong tempo and the swing/groove pocket math drifts off the dotted-quarter pulse.
2. **Several engines have 4/4-shaped fallbacks** that fire in 6/8 — `is8th` always true for compound, `% 4` literals in accompaniment, latin clave on hardcoded 4/4 16th-note positions, bass anticipation on the wrong step.
3. **Soloist phrasing** is mostly compound-aware in `soloist-seeder.ts` but the rest of the pipeline hasn't been audited.
4. **Chord chart sizing** shifted for the user on one long progression when switching 4/4 → 6/8 (no longer reproducible on default progression). Likely a density-threshold input that depends on step count rather than measure count.

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

### S4. Latin clave 4/4-positioned hits

`public/engine/grooves/latin.ts:91-100` hardcodes clave positions as `stepInBar === 0 || stepInBar === 6 || stepInBar === 12` — those are 4/4 16th-note positions. In 6/8 (`stepsPerBar = 12`), step 12 is the start of the next measure, so the hit never fires there; the spacing is also wrong (6/8 son clave is 3+3+2 / 2+3+3 over two bars in eighths, not 4/4 spacing).

Simplest fix: gate the current clave logic on `!isCompound`, and rely on the explicit `Afro-Cuban 6/8` preset (`drum-presets.ts:925-932`) for 6/8 latin patterns. If a 6/8 clave is needed in code, encode the 6/8 son cell explicitly.

**Acceptance:** Latin strategy in 6/8 does not place clave hits on incorrect step indices. Existing 4/4 latin behavior is bit-identical.

**Effort:** ~2h. **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S5. Bass "and-of-four" anticipation in 6/8

`public/engine/bass-engine.ts:116`: `const isAndOfFour = step % stepsPerBar === stepsPerBar - 2;` — in 4/4 this is step 14 (the "and of 4"). In 6/8 the same math gives step 10 of 12, which is musically wrong — the anticipation point in 6/8 is the final eighth before the downbeat (step 11, "and of 6").

Rename `isAndOfFour` → `isAnticipation`. Compute as `stepsPerBar - 1` for compound, `stepsPerBar - 2` for simple. Grep for downstream consumers.

**Acceptance:** Bass anticipations in 6/8 fall on the last eighth of the bar (step 11). Existing 4/4 anticipations unchanged.

**Effort:** ~2h. **Model:** sonnet. **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S6. Soloist phrasing audit pass

`soloist-seeder.ts:674-720` is already compound-aware (per `tsConfig.pulse`-driven cell generation). Audit the rest of the soloist pipeline (`public/engine/soloist.ts`, `public/engine/soloist-pitch-engine.ts`, motif-related modules) for 4/4-shaped phrase-length assumptions:

- Phrase-length / phrase-boundary literals that assume 16 steps/bar?
- Motif-length / rest-cooldown that assumes 4 beats?
- `soloist.ts:706` cites "16 steps/measure" — confirm whether real assumption or stale comment.

**Acceptance:** Extend `tests/integration/odd-meter-authenticity.test.ts` or add a compound-meter soloist critique. Assert soloist phrase boundaries align to pulse positions (0, 6) in 6/8, not to step 8 (4/4-style mid-bar).

**Effort:** ~4h. **Model:** opus (musical-judgment audit). **Reviewer:** music-theory-reviewer. **Source:** investigation 2026-05-27.

### S7. End-to-end "All Blues feels right" critique test

Add `tests/standards/all-blues-6-8-critique.test.ts`. Statistical, not snapshot. Loads the All Blues preset, generates N bars in 6/8 at BPM=110, asserts:

- Ride cymbal hits cluster on pulse positions (steps 0 and 6) plus the canonical jazz "skip-beat" on the last eighth of each dotted-quarter (steps 2 and 8).
- Bass plays roots on pulse positions; walking-line density is 2–4 onsets per bar (not 6+).
- Soloist phrase boundaries respect pulse boundaries; no phrase crosses 5 bars without a rest.
- Comping chord hits land on pulse (allow swing offset) and are not at every-step density.
- Measured `secondsPerStep` matches the dotted-quarter BPM interpretation from S1.

This is the cycle's Definition of Done. The audit is not done until this passes.

**Acceptance:** Test passes 30/30 on the reliability loop. Existing 4/4 critique tests still green.

**Effort:** ~5h. **Model:** opus (musical-judgment thresholds + statistical ranges). **Reviewer:** music-theory-reviewer + critique-test-author. **Source:** investigation 2026-05-27.

### S8. Visual chart sizing under TS change

User reported chord/measure sizes shifted when switching 4/4 → 6/8 on a long progression. Couldn't reproduce on default `I | V | vi | IV`. Suspect: `arranger.totalSteps` differs by TS (16 in 4/4 vs 12 in 6/8 for a full bar), which flows into `getLeadSheetLayoutProfile` density thresholds (`COMPACT_MEASURE_THRESHOLD`, `ULTRA_COMPACT_MEASURE_THRESHOLD` in `public/lead-sheet-model.ts:255-316, 363-373, 387-445`). If density depends on step count rather than measure count, layout will shift.

Investigate: load a 16+ bar progression in `npm run dev`, switch TS, inspect `data-total-measures` and `data-density` on `#chordVisualizer`. If density differs for the same measure count, fix the density input to be measure-count-only.

**Acceptance:** For any progression, layout profile (density, verticalFillScale, measuresPerRow) is a function of measure count and viewport, not step count or TS. Add unit test in `lead-sheet-model.test.ts` (or create) asserting identical layout output across TSes for identical sectionsState/progression-shape.

**Effort:** ~3h. **Model:** sonnet (investigation may upgrade to opus if cause is non-obvious). **Reviewer:** none required (chart layout, no engine touch). **Source:** investigation 2026-05-27.

### S9. getStepInfo `stepsPerBeat === 4` fragility

`public/utils.ts:644`: `const isOffbeat = stepsPerBeat === 4 ? stepInBeat === 2 : stepInBeat === 1;` — works for the current 2 supported `stepsPerBeat` values (2, 4) but hard-codes the discriminator. If a future TS uses `stepsPerBeat = 3` or `8`, silently mislabels offbeats.

Replace with `const isOffbeat = stepInBeat === Math.floor(stepsPerBeat / 2);` (midpoint of a beat).

**Acceptance:** Equivalent behavior on existing meters (2/4, 3/4, 4/4, 5/4, 7/4: offbeat at `stepInBeat === 2`; 6/8, 7/8, 12/8: offbeat at `stepInBeat === 1`). Existing meter-integrity tests pass unchanged. Add a quick fixture for `stepsPerBeat = 3` to lock in the new math.

**Effort:** ~1h. **Model:** sonnet. **Reviewer:** none required. **Source:** investigation 2026-05-27.

### S10. Genre × TS compatibility surfacing

Some genres are tied to specific meters in real practice (Funk = 4/4, Bossa Nova = 4/4, Reggae = 4/4, Waltz = 3/4, Afro-Cuban 6/8 = 6/8). The UI currently lets users pair any genre × TS, which can produce nonsense feels.

**Decision needed:** soft hint vs hard gate vs no-op. Most likely a "feel hint" badge near the TS or genre selector ("Funk feel is canonically 4/4 — try 6/8 only for unconventional blends"). Defer if S1–S9 already produce a passing S7.

**Acceptance:** TBD on design decision. Could be (a) a hint badge, (b) a feel-genre filter that prefers TS-matched genres at the top of the picker, (c) a no-op with documented "user explores at their own risk."

**Effort:** ~2h (design call) + 2-4h (implementation depending on choice). **Model:** opus (product decision). **Reviewer:** none required. **Source:** investigation 2026-05-27.

## Notes

- The synth-audit track does NOT overlap. Voice-level audio changes are out of scope here.
- Compound meters beyond 6/8 and 12/8 (e.g. 9/8) are out of scope. The codebase already supports both via `isCompound`.
- Per-section TS overrides (the state field at `arranger.sections[].timeSignature`) are out of scope. They work but lack good UX; defer.
- Re-authoring drum/bass/soloist *style content* for 6/8 idiom across all genres is a separate musical-content effort. This audit fixes the infrastructure so any future 6/8-tagged content plays correctly.
