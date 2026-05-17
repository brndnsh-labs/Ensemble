# Epic 4: Soloist Idiom & Bebop Vocabulary

## Why this epic exists

The soloist has the most sophisticated layered logic in the engine (Greats profiles, SRDC arc, devices, role-aware phrasing) but several genre-defining idioms are structurally unreachable from the picker. Bebop chromatic vocabulary is blocked behind a `continue` statement. Evans profile is so aggressive it never plays the root. Coltrane wide intervals get washed out by universal large-leap penalties applied AFTER the boost. Several per-style config knobs (`chromaticism`, `tensionScale`, `targetExtensions`) read like a stylebook but aren't consumed at runtime.

The architectural fix — apply profile-boost as a final-stage `weight *= mult` per the project's proven multiplier-placement rule (see `feedback-weight-tuning-multiplier-placement`) — would close half this epic in one structural change.

## Source findings

- `soloist.md` P0 #1, #2, #3; P1 #4, #5, #7, #9; P2 #12, #13, #14, #15

## Stories

### S1. Unlock bebop chromatic neighbors in the candidate pool
`soloist-pitch-engine.ts:501-507` `continue`s on `!isScaleTone && !isBlueNote` — non-scale, non-bluenote tones are dropped before the chromaticism boost can fire. Bird's `chromaticism: 0.9` config knob is dead. Loosen the continue to allow chromatic neighbors of chord tones (±1 semitone from any chord-tone pitch class), gated by `config.chromaticism`. Apply a base penalty (`weight *= 0.05`) so neighbors only win when the profile/SRDC/scale logic explicitly elevates them.

**Acceptance:** Bird/Coltrane profile produces measurable chromatic-approach vocabulary (chromatic neighbor → chord tone on the next attack ≥ 8% of attacks). Add to `soloist-jazz-critique.test.ts`.
**Effort:** ~4h. **Model:** opus (chromatic ladder shape + reliability loop). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P0 #1.

### S2. Profile multipliers move to final stage (Evans, Coltrane, others)
`soloist-pitch-engine.ts:616-625` (Evans) adds `+ 500` plus `× 10.0` *during* the additive phase, drowning competing biases AND washing out under later universal penalties. `:626-633` (Coltrane) boosts wide intervals before the universal large-leap penalty cuts them. Apply all profile boosts as final-stage `weight *= mult` per the project's proven multiplier-placement rule. Drop Evans's `+ 500` floor; reduce `×10.0` to `×2.5–3.0`; remove `×0.01` on root or limit it to non-cadence positions.

**Acceptance:** Evans profile still produces 30%+ extension landings but DOES land on the root at phrase ends. Coltrane non-octave wide leaps audibly survive. Existing critique tests pass.
**Effort:** ~4h. **Model:** opus (per-profile multiplier values + final-stage refactor — same architectural pattern as the SRDC fix). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P1 #4, P2 #15.

### S3. `bebopScale` device anchors to the moving line, not the chord root
`soloist-devices.ts:439-450` builds the 4-note bebop run starting from `root + 12`, so each fires as a leap from `lastMidi`. Rebuild ascending or descending from `selectedMidi` through a bebop-scaled interval set so the *next* beat lands on a chord tone. Compare to `run`/`enclosure` which already do this correctly.

**Acceptance:** bebopScale device fires reproduce the textbook "Charlie Parker passing-tone-to-chord-tone" line. Add to `soloist-jazz-critique.test.ts`.
**Effort:** ~3h. **Model:** opus (bebop-scale construction is musical correctness). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P0 #2.

### S4. Head-bypass jitter respects the scale
`soloist.ts:1130-1144` jitters seed notes by ±3 chromatic semitones with no chord-aware filtering. A seed-note 5th can become a b5. Constrain jitter to scale-tones (offset to next/previous scale tone, not chromatic semitone), OR gate the jittered result through the chord-mask — drop the jitter and play the seed note if out-of-scale and not a leading tone.

**Acceptance:** themed-improv passes never produce out-of-key notes from jitter. Existing themed-improv critique tests pass.
**Effort:** ~3h. **Model:** sonnet (scale-clamp is mechanical; existing tests guard musicality). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P1 #7.

### S5. Role-skeleton response preserves duration shape
`soloist-rhythm-engine.ts:213-245` returns a `durationSteps: 1` 16th for every attack on a "response" skeleton path. Preserve source `durationSteps` from the call (or fall through to the main attack-prob path with a contour overlay). Also tag mid-phrase phrase-end markers inside this branch — currently they're monophonic-only.

**Acceptance:** call/response phrase-pair shapes audibly mirror each other (long-long-short-short reproduces, not flattens). New critique metric in `blues-soloist-authenticity.test.ts` asserts duration distribution similarity between paired phrases.
**Effort:** ~4h. **Model:** opus (musical shape of paraphrase; duration distribution metric design). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P0 #3, P1 #9.

### S6. Wire the dead config knobs (`chromaticism`, `targetExtensions`, etc.)
`soloist-config.ts` defines per-style `chromaticism`, `targetExtensions`, `targetAnchoring`, `tensionScale` — none are consumed at runtime. After S1 lands, wire `chromaticism` as the multiplier on the chromatic-neighbor unlock. Add `targetExtensions` as a `+weight` nudge inside the candidate loop. Delete `targetAnchoring` and `tensionScale` if no consumer can be wired now (don't leave the corpses).

**Acceptance:** changing a style's `chromaticism` from 0.1 to 0.9 produces measurably different chromatic density. Document each knob's mapping in a code comment.
**Effort:** ~3h. **Model:** sonnet (mechanical wire-up after S1's ladder is in place). **Reviewer:** music-theory-reviewer. **Source:** `soloist.md` P2 #13.

## Deferred (need a product call)

- Loop differentiation in the rhythm engine (`soloist.md` P1 #6) is in epic 2, S6.
- SRDC Restatement multiplier of ×1.15 sits inside the noise floor (`soloist.md` P1 #5). Bump to ×1.3, or fold Restatement into contour/repetition logic. Worth discussing whether Restatement should be felt as "I meant that" pitch-wise or as motivic-recall rhythm-wise.
- Coordination consumption (`soloist.md` P1 #8) lives in epic 1, S5.
- Device-selection uniform-random over a ranked list (`soloist.md` P2 #14) — would be a single ~2h story. Adding here if you pick up something nearby; otherwise it's a P2 nice-to-have.
