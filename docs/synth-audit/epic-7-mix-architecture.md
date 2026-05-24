# Epic 7: Mix Architecture & Genre Calibration

## Why this epic exists

Epics 0–5 rebuilt every voice. The audition-overlay workflow (Phase D of `feat/listening-gate-tools`) made it easy to render the result as a WAV and hand it to a second-opinion listener (GPT-5 in this case). The listener consistently surfaced four issues that **no per-voice rebuild can fix** because they live at the mix-bus and coordination level:

1. The full mix is bottom-heavy.
2. No instrument owns the air band above 5 kHz.
3. The stereo image is functionally mono (all instruments at center).
4. Per-loop intensity is flat — choruses don't build.

A new tool, `npm run mix:analyze`, was then used to render eight pro reference mixes through the same spectral / stereo / RMS pipeline as `mix:report`. The references confirmed the findings *are real* — and let us **calibrate numeric targets** instead of guessing thresholds by ear:

| metric | our jazz-ride | Miles (jazz, sextet) | Bill Evans (jazz, trio) | Chic (funk) | Daft Punk (modern pop) | STP (rock) | Queens (modern rock) | BB King (blues) | Reel Big Fish (ska-punk) |
|---|---|---|---|---|---|---|---|---|---|
| sub+low | 74% | 47% | 83% | 75% | 75% | 73% | 82% | 79% | 91% |
| air (7.2 kHz probe) | 1.3% | 4.5% | 2.4% | 1.7% | 0.5% | 1.7% | 0.8% | 3.6% | 0.8% |
| L/R correlation | 0.984 | 0.589 | 0.095 | 0.834 | 0.940 | 0.695 | 0.730 | 0.716 | 0.816 |
| side energy | 0.9% | 21% | 45% | 8% | 3% | 15% | 14% | 14% | 10% |
| spectral centroid | 410 Hz | 753 Hz | 349 Hz | 363 Hz | 272 Hz | 457 Hz | 288 Hz | 458 Hz | 251 Hz |

Three reads on this data:

- **Bottom-heavy is instrumentation-dependent, not genre-dependent.** "Jazz" isn't one number: Miles (with horns) sits at 47%, Bill Evans piano trio sits at 83%. Our `jazz-ride` scene has horns enabled so Miles is the right calibration; the lesson is to think about what's actually in the scene, not the genre label.
- **Side ratio > 2% is the real stereo discriminator, not correlation.** Daft Punk's "Get Lucky" sits at correlation 0.94 (almost in our engine's mono range) but sounds genuinely stereo because side energy is 3%. Bill Evans at correlation 0.095 / side 45% is also great — but that's a 1961 hard-pan we don't need to imitate. Our engine at 0.984 / side 0.9% is the outlier on side energy across every reference. Target the side ratio, not the correlation number.
- **The 7.2 kHz air probe may be in the wrong place.** Get Lucky's audibly aggressive hi-hat content registers only 0.5% at our probe — *lower than our engine.* That can't be right; the probe is likely missing where modern hat / shaker energy actually lives (~5 kHz). S3a investigates before S3b commits to engine work.

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
Every instrument bus is dead-center. Reference span is wide: Bill Evans 1961 at correlation 0.095 / side 45% (extreme hard-panned width — channels are nearly independent), Daft Punk "Get Lucky" 2013 at 0.940 / side 3% (almost mono — but with real side content). Our engine at 0.984 / side 0.9% is the outlier — close to Daft Punk's correlation, but with **3× less side energy**. Universal fix: add `StereoPannerNode`s to the drum and soloist buses in `engine.ts initAudio()`. Bass stays center (low frequencies don't localize). For drums, the bigger win is internal — pan the hi-hat/ride slightly opposite the kick within the drum bus rather than panning the whole drum sum.

**Stereo target — side ratio, not correlation.** Get Lucky proves a correlation of 0.94 can sound great when there's real stereo content (3% side); Bill Evans proves correlation 0.095 also sounds great with 45% side. The discriminator is the side ratio — *is there any non-correlated content?* — not the correlation number. Target the side ratio in the modern-production range (Daft Punk 3%, Chic 8%, STP and Queens of the Stone Age ~14%); don't chase Bill Evans-era hard-panned width.

**Acceptance:**
- `mix:report --scene=<any>`: full-mix `sideRatio ≥ 0.03` (Get Lucky baseline) for every scene.
- `mix:report --scene=jazz-ride`: "functionally mono" auto-finding stops firing.
- Side ratio doesn't exceed 0.20 (don't out-pan Miles).
- Listening: no instrument feels hard-panned; mono compatibility intact (no phase cancellation when L+R summed).

**Effort:** ~3h. **Model:** opus (placement by ear). **Reviewer:** synth-graph-reviewer. **Source:** Reference comparison (8 tracks across 6 genres; see `tmp/references/calibration.json`).

### S2. EQ rebalance for jazz-ride
Jazz reference (Miles "So What", small sextet with horns) sits at 47% sub+low and centroid 753 Hz. Our jazz-ride render is 74% sub+low and centroid 410 Hz — the spectral fingerprint of a kit-and-electric-bass mix, not a small jazz combo with horns. The fix is per-scene EQ, not a global one: when the scene's `genreFeel` is Jazz, the bass bus low-shelf at 100 Hz should soften, and the chord bus low-mid (~350 Hz) should pull back. Other genres' EQ should remain untouched — they already match their references.

**Important caveat — instrumentation, not genre.** The reference expansion exposed that "jazz" isn't one spectral target: Bill Evans Trio (piano + bass + brushes, no horns) sits at 83% sub+low — *higher than blues*. Miles's 47% is the right target for **our** `jazz-ride` scene because that scene has horns enabled, not because all jazz hits 47%. A hypothetical future `jazz-trio` scene without horns would calibrate differently. Don't generalize the EQ profile across all scenes labeled Jazz; key it on what's actually in the scene.

Implementation lever: read `groove.genreFeel` plus instrumentation flags in `initAudio()` (or expose a per-scene mix profile) and select bus EQ settings accordingly. Avoid hardcoding per-genre branches deep inside synth-*.ts — the conductor / mix layer is the right home.

**Acceptance:**
- `mix:report --scene=jazz-ride`: full-mix `sub+low ≤ 55%`, "bottom-heavy" auto-finding stops firing. Target: 47% (Miles).
- `mix:report --scene={rock-backbeat,blues-shuffle,funk-pocket}`: no `sub+low` change beyond ±3% from current values (don't regress the non-jazz scenes).
- Listening: jazz-ride render sits closer to the Miles reference; rock/blues/funk renders sound unchanged.

**Effort:** ~6h (per-genre profile plumbing is the bulk; the EQ values themselves are ~30 min of A/B). **Model:** opus. **Reviewer:** synth-graph-reviewer, state-discipline-reviewer (per-genre mix profile likely lives in a state slice). **Source:** Reference comparison (Miles 47% vs our 74%).

### S3. High-register / air content
Air (>5 kHz) is the one finding where even non-jazz references beat us by some measures: Chic and STP at 1.7%, ours at 1.3%, Miles at 4.5%. **But the 8-reference expansion exposed a measurement problem worth checking before the engine work.** Daft Punk "Get Lucky" — a track with audibly aggressive hi-hat / shaker content and pristine modern production — registers only 0.5% air at our 7.2 kHz Goertzel probe. *Lower than our engine at 1.3%.* That can't be right; the probe is missing where the energy actually lives.

**S3 has two sub-stories, in this order:**

**S3a (must come first). Re-locate the air probe.** Add a second spectral probe at 5 kHz alongside the existing 7.2 kHz one (and possibly relocate "presence" from 2.8 kHz which sits in vocal/snare territory). Re-run all 8 references and the engine. If the modern-production references light up at 5 kHz where they were dark at 7.2 kHz, the engine's "missing air" finding may be exaggerated, and the threshold-vs-engine gap may shrink considerably. Effort: ~1h.

**S3b. Generate real high-register content** (only if S3a still shows a gap). Two paths:
- **(a) Enable orphaned aux percussion.** `groove.ts` state already contains lanes for shaker/conga/clave/etc. (`project_orphaned_latin_content.md`), but no UI surface triggers them, and Epic 4 S6's listening gate confirmed they aren't auditioned. Wire a UI trigger path so the Jazz / Latin presets actually play their existing percussion lanes — shaker is the most direct air-band producer.
- **(b) Add a shimmer/wash layer.** A sparse, high-register synth voice triggered by the chord engine on certain genre/intensity combinations.

Lean toward (a) — uses content we already half-built and addresses the `project_orphaned_latin_content.md` debt simultaneously. (b) is the fallback if (a) is a bigger surface than expected.

**Acceptance:**
- S3a: probes re-located, references + engine re-measured, decision documented on whether S3b is still warranted.
- If S3b proceeds: `mix:report --scene=jazz-ride` max stem air ratio ≥ Miles equivalent at the new probe location. `--scene={blues-shuffle,funk-pocket}` ≥ Chic equivalent.
- The UI path to enable new percussion lanes is discoverable (not a hidden flag).
- Listening: new content sounds like part of the arrangement, not bolted-on.

**Effort:** ~1h for S3a; ~2 days for S3b path (a); ~1 day for (b). **Model:** opus. **Reviewer:** synth-graph-reviewer, music-theory-reviewer (percussion lane content choices). **Source:** Reference comparison (Miles 4.5% / Get Lucky 0.5% at 7.2 kHz probe — the gap exposes the probe-location problem).

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
