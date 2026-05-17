# Epic 3: Deterministic Phrasing Sweep

## Why this epic exists

CLAUDE.md § "Deterministic phrasing" mandates `barIndex`/`sectionId`-seeded motifs over raw `Math.random()`. The bossa-bass `barIndex` work (May 2026) is the canonical proof — same musical variation, but stable across loops and critique-test runs. Multiple audits surfaced bare `Math.random()` in load-bearing musical decisions, where the listener perceives the result as "the comper forgot what they played last bar."

Almost every story here is small (under half a day) but compounding: each one shipped reduces future critique-flake and makes loop-comparison tests possible. Pick these up in idle slots.

## Source findings

- `chords.md` P0 #1, #2; P1 #5
- `bass.md` P2 #12, #15
- `harmony-coordination.md` P2 #13
- `drums.md` P2 #15
- `form-arranger.md` P2 #11
- `soloist.md` P2 #10, #11

## Stories

### S1. Funk comping cell becomes a deterministic bank
`accompaniment.ts:487-507` picks each 16th-note stab via `Math.random()`. Replace with a small bank of 1–2-bar cells keyed by `(sectionId, barIndex >> 1)`. Same recipe as bossa-bass.

**Acceptance:** funk comping on the same chord across two loops produces the same rhythmic shape. New critique test in `funk-piano-critique.test.ts` asserts ≥3 distinct cells across 8 bars but cell at `barIndex % bankSize` is stable.
**Effort:** ~3h. **Model:** opus (Phase 1 — picks the cell-bank shape that ~7 later stories reuse). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P0 #1.
**Status:** Shipped 2026-05-17

### S2. Jazz/Bossa/Blues Charleston-family pattern picker per phrase
`accompaniment.ts:556-602` re-rolls the comping rhythm every bar. Replace with `(sectionId, barIndex >> 2)` hash → choose one Charleston-family pattern for a 4-bar phrase. In-phrase variation comes from intensity/soloistBusy.

**Acceptance:** 4-bar phrase stability test. STICKY_GENRES list updated to include Jazz/Blues/Bossa (which the current implementation excludes).
**Effort:** ~3h. **Model:** opus (Phase 1 — picks the phrase-stability hash; subsequent rhythm-pattern stories replicate). **Reviewer:** music-theory-reviewer. **Source:** `chords.md` P0 #2.
**Status:** Shipped 2026-05-17. Bossa currently reuses the Jazz bank (port-for-fidelity); follow-up needed to design a partido-alto-specific bank. Sparse-vibe cell collapse + active-vibe ornament collision flagged by reviewer as pre-existing issues; deferred. Bank is a faithful port of the prior 5 random branches, not a curated final set — anticipation-of-1 idiom missing.

### S3. Bass generic walking fallback: target-aware + seeded
`bass-engine.ts:638-668` picks one of top-2 scale tones via `Math.random()`. Replace with a target-distance score (weight candidates by descending distance to `nextChord.rootMidi`) and seed the final pick with `(barIndex * 7 + intBeat * 11) % 3`.

**Acceptance:** walking lines target the next chord's root on beats 2-3-4. Same line on Loop 1 == Loop 2 in jazz mode. Add to `jazz-bass-critique.test.ts`.
**Effort:** ~3h. **Model:** sonnet (after S1/S2 pattern established). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P2 #15.
**Status:** Shipped 2026-05-17. Beat-asymmetric `(intBeat/3)` scaling on the proximity bias (beat 2 weakest, beat 4 strongest); `/7` perfect-fifth approach window (a fifth-away candidate gets zero lift). Top-2 binary parity pick replaces `Math.random()*2` — preserves "vary between the two best" without imposing the monotone closest-to-target walk a `% 3` would. A/B critique test asserts bias-on mean is ≥0.20 st closer to next root than bias-off on beat 3 (empirical -0.25 st across 128 samples). Determinism test stubs `Math.random` to isolate S3's contribution; engine-wide determinism waits on S4 (`withOctaveJump`) and S5 (harmony coin flips).

### S4. `withOctaveJump` becomes structural, not stochastic
`bass-engine.ts:392-405` octave-jumps 2-10% of all notes via bare `Math.random()`. Restrict to `isBeatStart && (isMeasureStart || isSectionStart)` with the same probability budget, and seed the trigger by `barIndex`.

**Acceptance:** octave jumps land on structural points, not mid-line. Walking-bass test no longer flakes on the leap count.
**Effort:** ~2h. **Model:** sonnet (mechanical gate restriction). **Reviewer:** music-theory-reviewer. **Source:** `bass.md` P2 #12.
**Status:** Shipped 2026-05-17. `withOctaveJump` at `bass-engine.ts:451` now early-returns unless `isBeatStartLocal && (isDownbeat || isSectionStart)`. Trigger + direction decisions seeded by mulberry32 hashes of `(barIndex, sectionStart)`. Review caught a P0 on the initial submission: classic Numerical Recipes LCG with `barIndex * 13` produced a contiguous 18-bar sawtooth biased UP, and at baseRoot 48 the UP target (60) exceeded the non-Neo ceiling (55) → all fires clamped to no-op, 0 successful jumps over 256 bars. Fix: (1) replaced LCG with mulberry32 (`scrambleHash`) for proper small-input scrambling, (2) force direction from available headroom (if `canGoUp && !canGoDown`: up; else if `canGoDown && !canGoUp`: down; else seeded coin), so the asymmetric ceiling no longer wipes the texture. Test strengthened from `≥1` floor (smell c — passed via voice-leading drift) to density range `[10, 50]`; empirically lands at 32 displaced downbeats per 256 bars at intensity 0.9, with bit-identical determinism across runs. Reviewer P1 (misleading "determinism proves the gate" framing) and P1 (undocumented `% 1000` on sectionSeed) also addressed. P2 mid-bar chord-arrival as a structural point left out of scope per audit-doc recipe.

### S5. Harmony shadow/response/hype-man seed sweep
`harmonies.ts:190, 223, 265, 294, 314, 352, 361, 364, 478, 590` flip raw coins inside otherwise-seeded harmony logic. Derive a per-step PRNG from `motif.seed + step` and replace.

**Acceptance:** antiphonal response fires reproducibly across loops. `humanizeVelocity` same approach (`groove-engine.ts:55-57` — `drums.md` P2 #15 — can fold into the same story).
**Effort:** ~3h. **Model:** sonnet (10+ call-site sweep with one PRNG helper). **Reviewer:** music-theory-reviewer. **Source:** `harmony-coordination.md` P2 #13, `drums.md` P2 #15.
**Status:** Shipped 2026-05-17. Eight `Math.random()` call sites in `harmonies.ts` (response trigger, melodic-shadow reinforce, hype-man push, busy-suppression, accompaniment/bass collision yields, anchor-tutti latch, per-voice timing jitter) plus `humanizeVelocity` in `groove-engine.ts` replaced with the mulberry32 `scrambleHash` helper introduced in S4 — duplicated locally in both files per the story brief, not extracted to shared util. Seeds: harmonies tags 1-6 use `motif.seed + step * 31 + tag`, tags 7-8 use `chord.rootMidi * 100 + step * 31 + tag (+ i * 7 for jitter)`; humanizeVelocity uses `step * 41 + nameHash * 7` where `nameHash` folds the full instrument-name string (reviewer P1: `charCodeAt(0)` alone collided on Clave/Conga, HiHat/HighTom, Snare/Shaker — real-lane drum velocity correlation). New `tests/standards/harmony-determinism.test.ts` with 4 fixtures (baseline, populated-seed, busy+hits, high-intensity-latched) that bracket all 8 seeded tags, each run twice with Math.random stubs 0.05 vs 0.95 — all bit-identical (event counts 173/395/68/183, confirming distinct branches reached). Reviewer P2 (misleading "across loops" comment claim, low-discrimination stub values) addressed in test rewrite. The 3 remaining `Math.random()` calls in `groove-engine.ts` (lines 259/281/293, drum-strategy probability/velocity randomness) are out of scope per story brief — flagged as follow-up if drum tests start flaking.

## Notes

- Stories S1 and S2 unlock honest "comping develops across a phrase" critique tests that don't exist yet.
- The conductor's three `Math.random()` calls (`form-arranger.md` P2 #11) and the soloist's section-influence shift (`soloist.md` P2 #10, #11) are intentionally NOT in this epic; they're tracked in their respective engine epics so the picker has the right context.
