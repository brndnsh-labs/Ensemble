# Epic 7: Mix Architecture & Genre Calibration

## Why this epic exists

Epics 0–5 rebuilt every voice. The audition-overlay workflow (Phase D of `feat/listening-gate-tools`) made it easy to render the result as a WAV and hand it to a second-opinion listener (GPT-5 in this case). The listener consistently surfaced four issues that **no per-voice rebuild can fix** because they live at the mix-bus and coordination level:

1. The full mix is bottom-heavy.
2. No instrument owns the air band above 5 kHz.
3. The stereo image is functionally mono (all instruments at center).
4. Per-loop intensity is flat — choruses don't build.

A new tool, `npm run mix:analyze`, was then used to render four pro reference mixes (Miles Davis "So What" / Chic / STP / B.B. King) through the same spectral / stereo / RMS pipeline as `mix:report`. The references confirmed the four findings *are real* — and let us **calibrate genre-specific numeric targets** instead of guessing thresholds by ear:

| metric | our jazz-ride | Miles (jazz) | Chic (funk) | STP (rock) | BB King (blues) |
|---|---|---|---|---|---|
| sub+low share | 74% | 47% | 75% | 73% | 79% |
| air (>5 kHz) | 1.3% | 4.5% | 1.7% | 1.7% | 3.6% |
| L/R correlation | 0.984 | 0.589 | 0.834 | 0.695 | 0.716 |
| side energy | 0.9% | 21% | 8% | 15% | 14% |
| spectral centroid | 410 Hz | 753 Hz | 363 Hz | 457 Hz | 458 Hz |

Two important reads on this data:

- **Bottom-heavy is genre-dependent.** Non-jazz pro mixes sit at 73–79% sub+low; that's just what rock/funk/blues *are*. Our engine at 74% is genre-appropriate for those, and the "bottom-heavy" finding fires only for jazz-ride. Don't push EQ in the wrong direction on non-jazz scenes.
- **Stereo is universal and dramatic.** Every reference is at 0.6–0.83 correlation. Our 0.98 is the outlier on every single comparison. This is the highest-confidence, lowest-risk fix.

Calibration baked in at `scripts/mix-report-utils.ts` (`DEFAULT_FINDING_THRESHOLDS` + per-scene `findingThresholds`); the raw reference numbers persist at `tmp/references/calibration.json`.

## DoD pattern (different from Epic 0–5)

These stories change the **shared audio graph and the conductor**, not individual `play<X>New` voices. So the Epic 0 S1 per-voice A/B toggle isn't the right gate. Instead:

1. **Numeric gate:** the corresponding `mix:report --scene=<scene>` auto-finding line stops printing for the targeted scenes (the thresholds are already wired to per-scene `findingThresholds`).
2. **Listening gate:** owner renders an updated session WAV via the Share modal and confirms the change is musical (not just numerically smaller). Reference WAVs in `tmp/references/` are available for direct A/B.
3. **No regression of other scenes:** running `mix:report` against all four scenes must not introduce new auto-finding lines on any scene that previously passed.

`synth-graph-reviewer` reviews any audio-graph change; `state-discipline-reviewer` reviews any conductor-state change.

## Source findings

`scripts/mix-report-utils.ts` `summarizeRenderedFindings` — the four architectural findings calibrated against `tmp/references/calibration.json`.

Memory references:
- `feedback_synth_audit_cross_layer.md` — frozen-Current hygiene exception applies here (any mix-bus change touches the audio path used by both `current` and `new` voices).
- `project_orphaned_latin_content.md` + `feedback_musical_content_runtime_producers.md` — auxiliary percussion lanes already exist in `groove.ts` state but lack a UI trigger path; relevant to S3.

## Stories

### S1. Bus-level stereo placement
Every instrument bus is dead-center. Pro references sit at 0.59–0.83 L/R correlation; our engine at 0.984 / 0.9% side energy is mono in every genre we test. Universal fix: add `StereoPannerNode`s to the drum and soloist buses in `engine.ts initAudio()`, with conservative offsets that don't risk hard-panning. Bass stays center (low frequencies don't localize). For drums, the bigger win is internal — pan the hi-hat/ride slightly opposite the kick within the drum bus rather than panning the whole drum sum.

**Acceptance:**
- `mix:report --scene=<any>`: full-mix `correlation` lands ≤ 0.90 for every scene, > 0.65 for every scene (don't go wider than the references).
- `mix:report --scene=jazz-ride`: "functionally mono" auto-finding stops firing.
- Listening: no instrument feels hard-panned; mono compatibility intact (no phase cancellation when L+R summed).

**Effort:** ~3h. **Model:** opus (placement by ear). **Reviewer:** synth-graph-reviewer. **Source:** Reference comparison (all four genres).

### S2. EQ rebalance for jazz-ride
Jazz reference (Miles "So What") sits at 47% sub+low and centroid 753 Hz. Our jazz-ride render is 74% sub+low and centroid 410 Hz — the spectral fingerprint of a kit-and-electric-bass mix, not a small jazz combo. The fix is per-scene EQ, not a global one: when the scene's `genreFeel` is Jazz, the bass bus low-shelf at 100 Hz should soften, and the chord bus low-mid (~350 Hz) should pull back. Other genres' EQ should remain untouched — they already match their references.

Implementation lever: read `groove.genreFeel` in `initAudio()` (or expose a per-scene mix profile) and select bus EQ settings accordingly. Avoid hardcoding per-genre branches deep inside synth-*.ts — the conductor / mix layer is the right home.

**Acceptance:**
- `mix:report --scene=jazz-ride`: full-mix `sub+low ≤ 55%`, "bottom-heavy" auto-finding stops firing. Target: 47% (Miles).
- `mix:report --scene={rock-backbeat,blues-shuffle,funk-pocket}`: no `sub+low` change beyond ±3% from current values (don't regress the non-jazz scenes).
- Listening: jazz-ride render sits closer to the Miles reference; rock/blues/funk renders sound unchanged.

**Effort:** ~6h (per-genre profile plumbing is the bulk; the EQ values themselves are ~30 min of A/B). **Model:** opus. **Reviewer:** synth-graph-reviewer, state-discipline-reviewer (per-genre mix profile likely lives in a state slice). **Source:** Reference comparison (Miles 47% vs our 74%).

### S3. High-register / air content
Air (>5 kHz) is the one finding where even non-jazz references beat us: Chic and STP at 1.7%, ours at 1.3%, Miles at 4.5%. For jazz the gap is large (3.5×); for funk/rock it's marginal. The structural fix is generating real content above 5 kHz, not pushing existing EQ harder.

Two plausible paths:
- **(a) Enable orphaned aux percussion.** `groove.ts` state already contains lanes for shaker/conga/clave/etc. (`project_orphaned_latin_content.md`), but no UI surface triggers them, and Epic 4 S6's listening gate confirmed they aren't auditioned. Wire a UI trigger path so the Jazz / Latin presets actually play their existing percussion lanes — shaker is the most direct air-band producer.
- **(b) Add a shimmer/wash layer.** A sparse, high-register synth voice triggered by the chord engine on certain genre/intensity combinations.

Recommend (a) — it uses content we already half-built and addresses the `project_orphaned_latin_content.md` debt simultaneously. (b) is the fallback if (a) turns out to be a much bigger surface than expected.

**Acceptance:**
- `mix:report --scene=jazz-ride`: max stem air ratio ≥ 0.035 (Miles target).
- `mix:report --scene={blues-shuffle,funk-pocket}`: max stem air ratio ≥ 0.020.
- The UI path to enable the new percussion lanes is discoverable (not a hidden flag).
- Listening: the new content sounds like part of the arrangement, not bolted-on.

**Effort:** ~2 days for (a) including UI surface work. ~1 day for (b) if we pivot. **Model:** opus. **Reviewer:** synth-graph-reviewer, music-theory-reviewer (percussion lane content choices). **Source:** Reference comparison (Miles 4.5% vs our 1.3%); `project_orphaned_latin_content.md`.

### S4. Coordinated intensity arc across loops
With `--loops=3+`, individual stems show motion (drums front-loaded, soloist dip, harmony building) but the full mix classifies as `flat` because they cancel. Real records have an arc: head → solos build → climax → release. The conductor today doesn't broadcast a shared intensity envelope that every instrument biases toward; each engine has its own loop-aware behavior and they run independently.

This is the deepest story — it touches `coordination-engine.ts` and probably needs a new field on the conductor that all instruments read and weight against. The risk of regressing musical-engine invariants is real; needs a design pass before implementation.

**Acceptance:**
- `mix:report --scene=jazz-ride --loops=4`: full-mix `arc` classifies as `arc` or `building`, not `flat` or `front-loaded`.
- Per-stem `arc` labels show *constructive* alignment (most stems moving in the same direction across the same loops).
- Listening: a 4-chorus render builds noticeably from chorus 1 to chorus 3; chorus 4 has a release.
- `music-theory-reviewer` sign-off on the coordination-engine changes.

**Effort:** ~3–5 days including a design discussion and a `music-theory-reviewer` pass. **Model:** opus (design + implementation). **Reviewer:** synth-graph-reviewer (engine), state-discipline-reviewer (any new conductor state), music-theory-reviewer (musical correctness). **Source:** Per-loop arc finding in `summarizeRenderedFindings`.

## Notes

- **S1 is the recommended first pickup.** Universal, low-risk, high-confidence; doesn't depend on the per-scene mix-profile plumbing that S2 needs.
- **S2 needs a design decision** before implementation: per-genre mix profiles can live in `engine.ts initAudio()` (read at audio-context construction) or in a state slice read each tick. Initial leaning: at `initAudio()` since per-genre EQ doesn't need to change every step.
- **S3 has a product gap risk.** Enabling orphaned percussion adds UI surface and may need its own micro-epic for the trigger paths if they don't exist on any presets at all. Scope-check before committing.
- **S4 may grow.** A real intensity arc may want to feed back into the form-arranger work (`docs/audit/epic-form-arrangement.md`) so the arc lines up with section boundaries. Cross-track coordination needed.
- All four stories should preserve the `synth-audit` rule that `play<X>Current` is bit-identical — none of these change per-voice synthesis; they change bus routing, EQ, conductor state, and trigger logic.
- After every story, re-run `npm run mix:analyze` against the reference set in `tmp/references/` to verify the changes still cluster with the references rather than drifting away.
