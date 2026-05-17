# Epic 2: Form & Arrangement Awareness

## Why this epic exists

Form is implemented for two of six engines: soloist (SRDC, Imperfect Symmetry, Loop 0/1/2+ branching) and drums (per-section seed, fill triggering). The other four — bass, chords, harmony, accompaniment — are functionally form-blind. They WRITE section metadata onto chord objects but never READ it at generation time. CLAUDE.md's marquee Chorus Evolution claim, the Imperfect Symmetry pattern, and the conductor's `lyricalBias` arc all stop one engine short of reaching the listener.

This is the epic where the "the band sounds like a machine on repeat passes" reputation lives. Highest perceptual impact relative to surface-area touched.

## Source findings

- `form-arranger.md` P0 #1, #3; P1 #4, #5, #6, #7, #8; P2 #14
- `soloist.md` P1 #6 (rhythm engine has zero loop awareness)
- `chords.md` P1 #5 (per-chord-retrigger extension randomization, related to repeat differentiation)

## Stories

### S1. Drums: motif complexity cap relaxes per loop
`drum-seeder.ts:157-159` caps `motifComplexity` to 1 ("Standard") for "The Head" and never relaxes. Raise the cap to `Math.min(2, 1 + Math.floor(loopCount / 2))`. Proves the Chorus Evolution contract on one engine before fanning out.

**Acceptance:** Loop 0 and Loop 2 produce measurably different motif distributions on the same chart. Critique test in `tests/standards/drummer-chorus-evolution.test.ts`.
**Effort:** ~3h. **Model:** sonnet (small change, clear test). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P0 #3, `drums.md` P2 #17.

### S2. Imperfect Symmetry for bass on repeated sections
Add `sectionOccurrence` to coordination context (already computed in `soloist.ts:128-138`). When `occurrence > 1`, bass adds a deterministic octave displacement on one beat per phrase, seeded by `(sectionId, occurrence, barIndex)`. Same pattern proven on bossa-bass (May 2026 shipped).

**Acceptance:** Verse 1 and Verse 2 of the same chart produce different but deterministic bass lines. Critique test asserts repeat-pass divergence > 10% of notes while staying same pitch-class.
**Effort:** ~4h. **Model:** opus (musical judgment on what variation is right). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P1 #7.

### S3. Imperfect Symmetry for drums + accompaniment
Mirror S2 for drums (permute one ghost note per 16-step pattern) and accompaniment (rotate one voicing inversion). Same `(sectionId, occurrence, barIndex)` seed.

**Acceptance:** repeat-pass divergence for both engines. Critique tests for each.
**Effort:** ~4h. **Model:** opus (musical judgment per engine). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P1 #7.

### S4. Final-bar resolution cascade
Publish `coordination.isFinalMeasure` when `playback.isEndingPending && modStep + stepsPerMeasure >= total`. Drum engine fires Crash + sustained cymbal. Bass holds tonic. Chords use cadence voicing. Currently only the soloist senses the form's end.

**Acceptance:** song-mode playback's final bar is audibly distinct. New `tests/standards/final-bar-cadence.test.ts`.
**Effort:** ~4h. **Model:** opus (musical judgment on each engine's last-bar behavior). **Reviewer:** music-theory-reviewer + state-discipline-reviewer. **Source:** `form-arranger.md` P1 #6.

### S5. Intro/Outro instrument layering
Add per-engine `introMutes` / `outroMutes` config (default e.g. `{ bass: 2, chords: 4, harmony: 4 }`). During first/last N bars of intro/outro sections, engines stay silent. One-pass orchestration enhancement.

**Acceptance:** intro is audibly drums-only → +bass → +chords → +full band layering. Critique test asserts instrument-onset bars match the config.
**Effort:** ~4h. **Model:** opus (per-engine bar-count judgment). **Reviewer:** music-theory-reviewer. **Source:** `form-arranger.md` P1 #4.

### S6. Soloist rhythm engine: density scales with loopCount
Currently only pitch engine reads `loopCount` (device frequency +20%/loop). Rhythm engine has zero loop awareness. Add `densityScale *= 1 + loopCount * 0.15` and `attackJitter += loopCount * 0.05`. Closes the rhythm-side of the Chorus Evolution claim.

**Acceptance:** Loop 0 vs Loop 2 soloist attack count + interval distribution differ measurably. Add to existing soloist critique suite.
**Effort:** ~3h. **Model:** opus (rhythm-engine tuning per the proven phrase-end recipe). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P1 #6.

### S7. Conductor arc baseline tests
No tests guard the conductor's session-timer arc, role-based energy, fill triggering, or section-boundary crashes. Add `tests/standards/conductor-arc-critique.test.ts`: simulate 5-min song mode; assert intensity rises 0→0.5 in first 40% of timer, peaks >0.7 in 65–85% window, drops <0.5 in final 15%. Section-transition test: fill fires on the bar before any role change. Use the 30-run reliability recipe before locking thresholds.

**Acceptance:** baseline coverage for everything in `conductor.ts` that the conductor audit lists as untested.
**Effort:** ~4h. **Model:** sonnet (tests against documented behavior; thresholds need 30-run reliability loop). **Reviewer:** none (tests are the deliverable). **Source:** `form-arranger.md` P2 #14.

## Deferred (need a product call)

- `breakdown` / `drop` semantics (`form-arranger.md` P1 #5): genre-dependent; either implement as a structural mute+slam bar or delete from the energy map. Discuss before picking up.
- Macro-arc grand cycle (`form-arranger.md` P2 #11 + P2 #10): `formIteration % 8` placeholder; replacing it is a product conversation, not engine work.
