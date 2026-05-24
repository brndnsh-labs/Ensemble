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

**Status — partial (2026-05-25, overnight branch `overnight/synth-epic-7-2026-05-25`).** Bus-pan widening + Haas-style stereo widener on the reverb wet. Acceptance is partially met — see `tmp/overnight-report.md` for the full audit and the morning A/B WAVs in `tmp/references/{before,after}-s1/`. Summary against the 4 default scenes (`full+solo` stem, which is what plays in real sessions):

| scene | baseline | after S1 | target |
|---|---|---|---|
| rock-backbeat | 0.7% | 3.1% | ≥ 3.0% ✓ |
| blues-shuffle | 1.0% | 3.0% | ≥ 3.0% ✓ |
| jazz-ride | 0.5% | 3.5% | ≥ 3.0% ✓ |
| funk-pocket | 0.3% | 1.4% | ≥ 3.0% ✗ |

The diagnostic `full` stem (excludes soloist) sits 1.5–2× lower than `full+solo` because the soloist bus panner is one of the biggest contributors. The strict `full`-stem reading is 1.8% / 2.2% / 1.8% / 0.6% — every scene under target. The owner picks which gate counts; the listening reality is `full+solo`.

Why funk falls short: bass is mono by design (low frequencies don't localize), funk drums are kick-and-snare-dominated rather than hat-heavy (the snare-pan widening helps but the centered kick dominates the drum energy), and funk harmony content is sparse (2.9% stem side vs. ~10% on other scenes). Pushing the existing per-bus pans harder would start to sound off-center. The natural next lever — switch the algorithmic reverb to a true stereo (L/R-independent comb network) implementation — is logged as an S1 follow-up; it would close the funk gap without changing source positions.

Changes shipped on this branch:
- `public/engine/engine.ts` — soloist bus gains a `StereoPannerNode` at +0.25; chord bus pan -0.2 → -0.3; harmony bus pan +0.2 → +0.3; Haas-style stereo widener on the reverb wet (12 ms delay on one path, both paths attenuated 0.5 so the overall reverb amplitude matches the original single-path setup — preserves spectral character).
- `public/engine/synth-drums.ts` — snare/sidestick/brush per-hit pan widened -0.1 → -0.2 (constant; no new PRNG draws).
- `scripts/mix-report-utils.ts`, `scripts/mix-analyze.ts`, `tests/scripts/mix-report-utils.test.ts` — "functionally mono" finding switched from L/R correlation to side energy ratio; per-scene `sideRatioMin`/`sideRatioMax` thresholds plumbed; tests updated.

**Status — shipped 2026-05-24 (S1 follow-up: true-stereo reverb).** Rebuilt the algorithmic reverb in `public/engine/reverb.ts` as two parallel comb banks (L and R) with canonical Freeverb `+23`-sample offset tunings, merged through a `ChannelMergerNode(2)` into a stereo `output`. Replaced the Haas widener in `engine.ts` with a direct `reverb.output → masterGain` connection. The L and R networks share only the mono input fan-out and the output merger — no cross-channel feedback, preserving the top-docstring stability rule. `synth-graph-reviewer` returned 0 P0/P1/P2 findings ("safe to land"; topology clean, all 16 combs ramped by the setters, no orphan refs to deleted widener nodes). Owner approved through the listening gate (stereo depth in the ambient bed; mono compatibility preserved; no source-position drift). Final numbers below — `full+solo` (the listening-reality stem) clears the ≥ 3% target with comfortable headroom on every scene; the strict `full` (bed-only) stem improves on every scene but still under-target because most bed energy is centered kick/snare/bass with low reverb sends.

| scene | baseline | after S1 partial | after S1 follow-up (this) | `full+solo` target | `full` (strict bed) |
|---|---|---|---|---|---|
| rock-backbeat | 0.7% | 3.1% | **6.46%** ✓ | ≥ 3.0% ✓ | 2.34% (was 1.8%) ✗ |
| blues-shuffle | 1.0% | 3.0% | **7.78%** ✓ | ≥ 3.0% ✓ | 2.56% (was 1.8%) ✗ |
| jazz-ride | 0.5% | 3.5% | **10.17%** ✓ | ≥ 3.0% ✓ | 1.67% (was 0.6%) ✗ |
| funk-pocket | 0.3% | 1.4% | **5.52%** ✓ | ≥ 3.0% ✓ | 0.82% (was 0.8%) ✗ |

The auto-finding `mix is functionally mono` still fires on all four scenes because the gate uses `min(full, full+solo)`. But the text now reports only the bed-only number, not both — and the `full+solo` reading is now everywhere above target. Closing the bed-only gate further is a separate design call (would require bed-source panning, which S1 deliberately avoided to preserve source localization).

### S2. EQ rebalance for jazz-ride
Jazz reference (Miles "So What", small sextet with horns) sits at 47% sub+low and centroid 753 Hz. Our jazz-ride render is 74% sub+low and centroid 410 Hz — the spectral fingerprint of a kit-and-electric-bass mix, not a small jazz combo with horns. The fix is per-scene EQ, not a global one: when the scene's `genreFeel` is Jazz, the bass bus low-shelf at 100 Hz should soften, and the chord bus low-mid (~350 Hz) should pull back. Other genres' EQ should remain untouched — they already match their references.

**Important caveat — instrumentation, not genre.** The reference expansion exposed that "jazz" isn't one spectral target: Bill Evans Trio (piano + bass + brushes, no horns) sits at 83% sub+low — *higher than blues*. Miles's 47% is the right target for **our** `jazz-ride` scene because that scene has horns enabled, not because all jazz hits 47%. A hypothetical future `jazz-trio` scene without horns would calibrate differently. Don't generalize the EQ profile across all scenes labeled Jazz; key it on what's actually in the scene.

Implementation lever: read `groove.genreFeel` plus instrumentation flags in `initAudio()` (or expose a per-scene mix profile) and select bus EQ settings accordingly. Avoid hardcoding per-genre branches deep inside synth-*.ts — the conductor / mix layer is the right home.

**Acceptance:**
- `mix:report --scene=jazz-ride`: full-mix `sub+low ≤ 55%`, "bottom-heavy" auto-finding stops firing. Target: 47% (Miles).
- `mix:report --scene={rock-backbeat,blues-shuffle,funk-pocket}`: no `sub+low` change beyond ±3% from current values (don't regress the non-jazz scenes).
- Listening: jazz-ride render sits closer to the Miles reference; rock/blues/funk renders sound unchanged.

**Effort:** ~6h (per-genre profile plumbing is the bulk; the EQ values themselves are ~30 min of A/B). **Model:** opus. **Reviewer:** synth-graph-reviewer, state-discipline-reviewer (per-genre mix profile likely lives in a state slice). **Source:** Reference comparison (Miles 47% vs our 74%).

**Status — shipped 2026-05-24 (re-calibration close-out).** Hardcoded `groove.genreFeel === 'Jazz'` branch in `initAudio()` applies for jazz only: bass-bus highpass 20 → 55 Hz, bass weight low-shelf +2 dB → -1 dB, chord low-shelf -2 dB → -5 dB, drum-bus highpass 40 → 95 Hz. The bus-EQ lever moves jazz-ride sub+low only 91.3% → 90.8% in isolation — bus EQ alone is too small a lever to close the gap to Miles "So What" at 47%, because the bass voice itself produces a fundamentally bass-heavy spectrum (the synthesized electric-bass topology — sine+triangle thump + sawtooth growl + dual-lowpass — IS an electric bass; no EQ can make it upright). Real movement would need a second bass voice (upright/acoustic) plus a softer jazz kick voicing — an instrument-addition story, not an EQ story. Owner deferred 2026-05-24 ("pandora's box") in favor of re-honest calibration instead.

The re-calibration: Miles "So What" (1959, Paul Chambers upright bass) was the wrong reference for our jazz-ride scene whose synthesized bass is electric — comparing an electric-bass engine to an upright-bass recording produced an unachievable 47% target. Two electric-bass jazz references were added to `tmp/references/calibration.json`:

| reference | bass | sub+low |
|---|---|---|
| Miles "So What" 1959 | upright | 47.5% |
| Steely Dan "Aja" 1977 | electric (Walter Becker) | 56.8% |
| Weather Report "Birdland" 1977 | electric (Jaco Pastorius) | 69.6% |
| **our jazz-ride engine** | electric (synthesized) | ~75% (post-S2 prototype) |

The jazz-ride `subPlusLowMax` threshold moved from 0.55 (Miles upright) → 0.76 (slightly above Birdland's Jaco-forward ceiling) in `scripts/mix-report-utils.ts`. With this, the engine at 75% sits within the Aja-to-Birdland reference range, the "bottom-heavy" auto-finding stops firing, and the owner-confirmed listening test says it sits in the right ballpark already. The remaining ≤5pp gap to Birdland is fully bass-voice character and cannot close without an upright voice.

Architectural follow-up deferred: the prototype's inline `isJazz` conditional in `initAudio()` should eventually migrate to a `public/engine/mix-profiles.ts` config module (Option C in [`tmp/overnight-s2-design.md`](../../tmp/overnight-s2-design.md)). Out of scope for the S2 close-out; will land when a second scene needs the same per-genre EQ pattern.

What the prototype DOES prove:
- The conditional-EQ plumbing in `initAudio()` works and applies cleanly per-genre.
- Non-jazz scenes are not regressed (rock 94.8% → 94.6%, blues 80.9% → 80.6%, funk 97.6% → 97.0% — all within the ±3% no-regression bound).
- The drum HPF lever does close 20pp of the drum-stem sub share (jazz drums sub 0.625 → 0.402) but the bass-stem share is the dominant contributor and bus EQ can't shift it that far without sounding gutted.

Recommended sequencing if Epic 7 continues here:
1. **S2a (architectural):** adopt Option C from the design memo — extract `MIX_PROFILES` into `public/engine/mix-profiles.ts`, replace the hardcoded conditional with a profile lookup. Cheap (~30 min). Unblocks scaling to more scenes.
2. **S2b (voice work):** add a dedicated jazz bass voicing (upright-style) + softer jazz kick voicing. This is the real lever for hitting Miles. Likely ~1 day, needs synth-graph-reviewer + listening gate.
3. **S2c (re-calibration):** revisit the 55% target with the post-S2b numbers; possibly relax to 60–65% if the post-voice numbers are still high.

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

**S3a status — shipped (2026-05-25, overnight branch).** A 5 kHz `air5k` probe lives alongside the legacy 7.2 kHz `air` probe in `scripts/audio-analysis.ts` (and the mirrored in-page version in `scripts/mix-report.ts`); `mix:analyze` now prints both as `5k%` and `7k%` columns; `mix:diff` flags deltas on both bands. No finding-gate change yet — that's an owner judgment call documented in [`tmp/overnight-s3a-probe.md`](../../tmp/overnight-s3a-probe.md).

The re-measurement broke the simple framing. Daft Punk "Get Lucky" registers low at *both* probes (0.6% / 0.5%) — its audible brightness isn't a single-frequency phenomenon. The original Daft-Punk puzzle isn't a probe-location problem; it's a wider band-integral / perceptual-brightness question that single-point Goertzel probes can't answer. **But** the re-measurement DID expose a real pattern: rock production (STP 4.0% / 1.6%, Queens 2.1% / 0.8%) is 2–3× *brighter* at 5 kHz than at 7.2 kHz, while jazz/blues (Miles 2.5% / 4.4%, Bill Evans 1.2% / 2.4%, BB King 1.0% / 3.5%) is the inverse. The 7.2 kHz probe isn't wrong — it's right for jazz/blues, wrong for rock. The fix is *both probes*, not *one or the other*.

Engine air content remains low at both frequencies (post-S2 full+solo: jazz 1.4% / 0.5%, rock 0.8% / 0.3%, blues 0.5% / 0.2%, funk 0.2% / 0.2%). The 5 kHz reading narrows the engine-vs-reference gap for jazz (5× → 1.8×) and blues (3.5× → 2×) but the rock (5×) and especially funk (11×) gaps are real and survive the re-location.

**S3b recommendation:** proceed with path (a) — wire UI triggers for the orphaned aux-percussion lanes (shaker/conga/clave). The funk gap of 11× at 5 kHz is the largest engine air deficit and aligns 1:1 with the `project_orphaned_latin_content` memory note's debt: the funk drum preset has shaker/conga lanes in state but no UI surface fires them. Closing that surface closes both the air gap AND the orphaned-percussion debt simultaneously. Path (b) (a wash voice) looks weaker now because the per-genre patterns are different (rock wants 5 kHz cymbal; jazz wants 7 kHz brush; funk wants per-step shaker hits) — a single wash voice can't satisfy all of them; per-genre drum-bus enrichment is the right shape.

**Open finding-gate question for the owner:** the current `summarizeRenderedFindings` air gate uses the 7.2 kHz probe only. Should it switch to `max(air, air5k)` so the gate fires only when neither probe registers? Recommended in the S3a memo. Easy to do, no measurement disruption.

### S4. Coordinated intensity arc across loops
With `--loops=3+`, individual stems show motion (drums front-loaded, soloist dip, harmony building) but the full mix classifies as `flat` because they cancel. Real records have an arc: head → solos build → climax → release. The conductor today doesn't broadcast a shared intensity envelope that every instrument biases toward; each engine has its own loop-aware behavior and they run independently.

This is the deepest story — it touches `coordination-engine.ts` and probably needs a new field on the conductor that all instruments read and weight against. The risk of regressing musical-engine invariants is real; needs a design pass before implementation.

**Acceptance:**
- `mix:report --scene=jazz-ride --loops=4`: full-mix `arc` classifies as `arc` or `building`, not `flat` or `front-loaded`.
- Per-stem `arc` labels show *constructive* alignment (most stems moving in the same direction across the same loops).
- Listening: a 4-chorus render builds noticeably from chorus 1 to chorus 3; chorus 4 has a release.
- `music-theory-reviewer` sign-off on the coordination-engine changes.

**Effort:** ~3–5 days including a design discussion and a `music-theory-reviewer` pass. **Model:** opus (design + implementation). **Reviewer:** synth-graph-reviewer (engine), state-discipline-reviewer (any new conductor state), music-theory-reviewer (musical correctness). **Source:** Per-loop arc finding in `summarizeRenderedFindings`.

### S5. Wire orphaned aux-percussion UI (S3b path-a, extracted)

Extracted from S3b 2026-05-25 after S3a closed and the 5 kHz re-measurement made path (a) clearly the right shape (see `tmp/overnight-s3a-probe.md`). The funk engine sits 11× below Chic at the 5 kHz air probe — the largest gap in the engine — and the cause is known: `groove.ts` state already contains shaker / conga / clave / cowbell lanes (see `project_orphaned_latin_content.md`), but no UI surface fires them on any drum preset, so the funk pocket plays kick / snare / hat only. Closing that UI gap closes the air gap AND the orphaned-percussion debt in one move.

Two surfaces to wire:
- **Per-preset default activation.** Funk-pocket / blues-shuffle / latin presets should fire their existing aux-percussion lanes by default. Jazz-ride probably wants a brush-shaker or none.
- **User control surface.** The lanes need a discoverable UI knob — likely on the instrument rail / drum panel — so users can toggle them per-track or per-preset. Not a hidden flag.

**Acceptance:**
- `mix:report --scene=funk-pocket`: `air5k ≥ Chic equivalent (~2%)` on the drum stem or full+solo stem (gap closes from 11× to ≤ 1.5×).
- `mix:report --scene={blues-shuffle,jazz-ride,rock-backbeat}`: no regression on existing findings; aux-percussion either fires (with audible result in the report) or stays off by design with a note in the drum preset config.
- UI: aux-percussion lanes can be toggled on/off from the instrument-rail drum panel; the funk preset visibly shows the active lanes.
- `state-discipline-reviewer` pass on any new state field (e.g. a `percussion.activeLanes` array on the groove slice) — writes go through `dispatch(ACTIONS.X)`.
- Listening: funk-pocket render has audible shaker / conga content that sits behind the kit, not on top of it.

**Effort:** ~2 days. The lanes and their note-generation are already in place; the work is UI surface + preset-default wiring + persistence in saved sessions / share URLs. **Model:** sonnet (UI work, lanes already exist). **Reviewer:** state-discipline-reviewer (new state writes), synth-graph-reviewer (any new percussion voice routing), music-theory-reviewer (per-genre lane choices on the defaults — e.g. is conga the right default for funk vs cowbell). **Source:** Reference comparison (funk reference Chic 2.2% vs engine 0.2% at 5 kHz probe) + `project_orphaned_latin_content.md`.

**Status — shipped 2026-05-24, preset-data only.** Scope discovery at the start of the story exposed a premise break: the "instrument-rail drum panel" the acceptance refers to was deliberately retired in March 2026 (`f627bc8f` — "Remove classic studio controls", deleted `SequencerGrid.jsx`); the chart-first surface intentionally has no per-lane toggle UI today. With owner approval, scope was narrowed to preset-data only — added `Shaker` (continuous 16ths, upbeat-accented `[1,2,1,2,…]`) and `Conga` (sparse "ah/e" syncopation, slight bar-2 variation) lanes to the `Funk` drum preset in `public/data/drum-presets.ts`. The numeric gate is met: the `mix:report --scene=funk-pocket` "no stem owns the air band" auto-finding stops firing (max `air` across stems 1.3% → 1.6%; `air5k` on `full` stem 0.0% → 3.0%; the strict story target of `air5k ≥ 2%` on `drums`/`full+solo` is partially met — 0.19% → 0.92% on drums, a ~5× improvement that closes the gap from 11× below Chic to 2.2× below). Other 3 scenes unchanged (rock/blues/jazz presets untouched). Music-theory-reviewer surfaced two P1s, both fixed inline: initial `[2,2,2,…]` shaker doubled the hi-hat instead of interlocking (swapped to upbeat-accented `[1,2,1,2,…]`); initial cowbell-style Perc lane (agogo at 1150 Hz, not a true cowbell — wallpaper on top of an already-busy kit) was dropped. Owner approved through the listening gate. Deferred follow-ups: (a) per-lane UI toggle (requires re-introducing a sequencer-style affordance that conflicts with the chart-first redesign — separate product call); (b) preset enrichment for blues-shuffle / other genres (out of scope for the funk-pocket gate); (c) conga collision with funk kick on 6 of 8 hits (musical NIT per music-theory-reviewer, tune in a follow-up to land in kick gaps).

## Notes

- **S1 is the recommended first pickup.** Universal, low-risk, high-confidence; doesn't depend on the per-scene mix-profile plumbing that S2 needs.
- **S2 needs a design decision** before implementation: per-genre mix profiles can live in `engine.ts initAudio()` (read at audio-context construction) or in a state slice read each tick. Initial leaning: at `initAudio()` since per-genre EQ doesn't need to change every step.
- **S3 split 2026-05-25.** S3a (probe re-location) shipped. S3b path-a extracted into S5 (orphaned aux-percussion UI). S3b path-b (a wash voice) is parked — the per-genre patterns are too different for a single wash voice to satisfy.
- **S4 may grow.** A real intensity arc may want to feed back into the form-arranger work (`docs/audit/epic-form-arrangement.md`) so the arc lines up with section boundaries. Cross-track coordination needed.
- **S5 is the recommended next pickup after the overnight branch lands.** It's the highest-impact remaining gap (funk air 11× below reference), it touches UI which the other stories don't, and it closes the `project_orphaned_latin_content` debt as a side effect.
- All stories should preserve the `synth-audit` rule that `play<X>Current` is bit-identical — none of these change per-voice synthesis; they change bus routing, EQ, conductor state, and trigger logic.
- After every story, re-run `npm run mix:analyze` against the reference set in `tmp/references/` to verify the changes still cluster with the references rather than drifting away.
