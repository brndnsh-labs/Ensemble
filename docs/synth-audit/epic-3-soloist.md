# Epic 3: Soloist Expressiveness

## Why this epic exists

Owner triage: "soloist sounds synthy, very tough to get this one right since it can be so prominent." It is the highest-risk voice — the most exposed instrument, so flaws are least forgivable. Discovery's verdict: not broken, a competent two-osc subtractive lead, but "toy" for three concrete reasons:

1. **Frozen sustains** — no timbral movement once the attack settles.
2. **Velocity drives loudness, never brightness.**
3. **Zero per-note timbral variation** — every repeated note is byte-identical.

Plus a dead-code find: the legato/portamento path is fully built but `isLegato` is hardcoded `false` at `scheduler-core.ts:797`, so it never runs.

## Source findings

`soloist.md` §1–§6.

## Stories

### S1. Wake the dead legato / portamento path
`isLegato` is hardcoded `false` at the scheduler call site (`scheduler-core.ts:797`), so the legato branch and its 0.03–0.06 s portamento glide in `applyPitchEnvelope` are dead. Drive `isLegato` from note adjacency in `scheduleSoloist` (`scheduler-core.ts:789–799`) — when a note begins where the previous ended, it's legato. Owner explicitly asked to revive this.

**Acceptance:** A/B — connected solo phrases glide between notes; separated notes still re-attack cleanly.
**Effort:** ~3h. **Model:** opus (adjacency rule + by-ear glide). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3; owner request.

**Status:** Shipped 2026-05-22. `isLegato` is now driven by rhythmic adjacency in `scheduleSoloist` (gap to the previous note's grid-slot end under half a 16th-step → legato), replacing the hardcoded `false`. First listening gate revealed the dead legato branch had legato attacking *harder* (5 ms) than normal notes — re-articulating every note — so a follow-up pass flipped the legato attack to a gentle swell across all 5 presets and lengthened the portamento glide (60→85 ms non-guitar). synth-graph-reviewer: clean on both passes (one deferred P2 noted below re: `lastNoteEnd` reset coverage). Owner approved.

### S2. Velocity → cutoff coupling
Filter cutoffs derive purely from `freq`, never `vel`. Make every preset's filter cutoff (and bell/formant gains) a function of velocity via the Epic 0 S7 helper. Discovery's single highest-ROI change.

**Acceptance:** A/B — hard and soft solo notes are timbrally distinct (brighter when dug in), not just louder.
**Effort:** ~3h. **Model:** opus (curve by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

**Status:** Shipped 2026-05-22. All 5 soloist presets now couple filter brightness to a `soloistBrightnessDrive` that blends per-note accent velocity (via the Epic 0 S7 `velocityTimbre` helper, convex curve 1.6) with whole-band intensity (`drive = brightness*0.5 + bandIntensity*0.6`, clamped). Lowpass presets (trumpet/neo/shred) open the cutoff ±~30%; formant presets (sax/vowel) shift formants modestly; trumpet also lifts its bell formant. Gated on `soloist.voice === 'new'` — this is the first story to make the soloist "New Sound" toggle audible (it was a no-op delegate before). First listening gate found the band-intensity knob barely moved brightness (note velocity only picks up `intensity*0.08`); owner chose to also couple to band intensity directly — hence the blend. synth-graph-reviewer: clean both passes (1 P2 NaN-hardening nit fixed — both `bandIntensity` readers now `Number.isFinite`-guarded). Owner approved.

### S3. Filter-cutoff LFO on sustain
Held notes are spectrally frozen. Add a slow (0.15–0.4 Hz) cutoff LFO, depth-ramped in like the existing vibrato delay, so sustained notes breathe.

**Acceptance:** A/B — a 2-second held note evolves in brightness instead of sitting dead.
**Effort:** ~3h. **Model:** opus (movement by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

**Status:** Shipped 2026-05-22. A shared `attachCutoffLfo` helper adds a slow sine LFO (0.15–0.4 Hz, per-note random spread) summed additively onto each preset's filter cutoff, with depth held at 0 through the attack then ramped in over ~0.5 s — mirroring the vibrato delay — so only the sustained tail breathes. Lowpass presets (trumpet/neo/shred) wobble cutoff ±~12%, sax modulates its bright formant only, vowel gets a slow formant drift. Gated on `voice === 'new'` and `duration > 0.5 s`. synth-graph-reviewer caught a P1 — shred's `osc1` hard-stop (`+0.1 s`) lagged the LFO stop (`+0.2 s`), disconnecting the LFO mid-output for a cutoff-step click; fixed by aligning shred's `stopTime` to `+0.2 s` (matches the other four presets, gain envelope already released). Owner approved.

### S4. Coupled vibrato
Vibrato modulates pitch only. Route the vibrato LFO (scaled) into output gain and filter cutoff as well — real vibrato is a 3-way correlated wobble. Consider widening the timid ~±15c pitch depth.

**Acceptance:** A/B — vibrato has body (amplitude + timbre move with pitch), not a thin pitch-only wobble.
**Effort:** ~3h. **Model:** opus (vibrato design by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

**Status:** Shipped 2026-05-22. `createVibrato` now taps the same vibrato LFO three ways: pitch (widened ~±14c → ~±18c via `depthFactor *= 1.3`), a correlated amplitude tremolo (`vibrato → ampDepthGain → outputGain.gain`, depth `vol*0.04`), and a correlated cutoff wobble (`vibrato → cutoffDepthGain → filterFreq`, depth `freq*0.05`). The 5 preset `attachVibrato` calls were moved to after filter creation so each can pass its filter's `frequency` param (sax passes its bright formant `f2`). Both new depth gains land in `depthModNodes` for cleanup; the vibrato osc stop already matches the preset osc1 stop. synth-graph-reviewer: clean (0 P0/P1), 2 P2 deferred — a ~4% release-tail phase-inversion (predicted inaudible, noted) and a cutoff-sum check that was resolved (all 5 presets' worst-case troughs stay comfortably positive). Owner approved.

### S5. Per-note timbral humanization
Successive same-pitch notes are byte-identical. Jitter cutoff ±8%, detune ±3c, attack ±20%, bell freq ±5% — seeded via the Epic 0 S6 humanization helper (`scrambleHash`, not `Math.random`, per repo convention).

**Acceptance:** A/B — repeated notes vary subtly; the "machine playing the same note" tell is gone. Deterministic under a fixed session seed.
**Effort:** ~3h. **Model:** opus (variation range by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

**Status:** Shipped 2026-05-22. New helper `soloistTimbreJitter(seed, scale)` draws four independent `scrambleHash` values off one seed (distinct XOR constants) — jittering cutoff ±8%, detune ±3c, attack ±20%, bell freq ±5%, scaled by the `groove.humanize` knob. A `noteSeed` (defaulted last param) is threaded scheduler → `playSoloNote` → `playSoloNoteCurrent`, seeded `humanizeSeed(step, 'soloist', voiceIndex)`; `playSoloNoteCurrent` builds the `timbre` object (neutral `NO_TIMBRE_JITTER` for the Current voice — bit-identical) and passes it to all 5 presets. Deterministic — looped phrases reproduce exactly. synth-graph-reviewer: clean (0 P0/P1); one P2 fixed — the manual-trigger path (`performance-controller.ts`) bypassed the jitter via the defaulted seed, now seeded by a monotonic per-call counter. Owner approved.

### S6. Attack-time detune settle + tighten shred
osc2 detune is a fixed constant per preset; +12c on shred is nearly a quarter-tone and sounds sour. Tighten shred to ~+6c (or add a third osc for fatness), and ramp osc2 detune from a wide value (~±20c) to its final over 40–60 ms so unisons "lock in" on the attack.

**Acceptance:** A/B — shred is tight, not chorused-sour; all presets have a subtle unison-settle on attack.
**Effort:** ~3h. **Model:** opus (detune by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

**Status:** Shipped 2026-05-22. New helper `applyDetuneSettle(osc2, currentCents, newCents, playTime, isNew)` replaces each preset's static `osc2.detune.value` assignment. The Current voice keeps its fixed detune (bit-identical, including neo's explicit-zero). The New voice starts osc2 ~20c wider and `linearRampToValueAtTime`s inward to the final detune over 50 ms, so the unison locks in on the attack. Shred's New voice tightens its detune from a sour `+12c` near-quarter-tone to `+6c`. synth-graph-reviewer: clean (0 P0/P1/P2) — ramp finite and anchored, composes correctly with neo's detune LFO and the S4 vibrato (which taps `osc2.frequency`, a different param). Owner approved.

### S7. Articulation-aware ADSR release
Release is always a fixed 85% of duration with no decay stage and no relationship to articulation. Add a real decay stage and tie release length to staccato/legato/duration.

**Acceptance:** A/B — staccato notes are crisp, sustained notes have a natural tail; release feels played, not clamped.
**Effort:** ~4h. **Model:** opus (envelope by ear). **Reviewer:** synth-graph-reviewer. **Source:** `soloist.md` §2, §3.

## Notes

- The soloist's shared algorithmic reverb need is satisfied by Epic 0 S4 (FDN) — confirm the soloist bus has a sensible send during this epic.
- S1 is the owner-requested dead-code revival — a satisfying early win. S2/S3/S4/S5 are independent and can fan out. S6, S7 touch the per-preset envelopes.
- Acoustic-realism trumpet/sax remain Epic 6 pack territory — this epic makes the *synth-lead* presets genuinely expensive; don't chase photoreal brass in pure synthesis.
- S4 P2 (deferred): the coupled-vibrato amplitude tap (`vibrato → ampDepthGain → outputGain.gain`) sums ±`vol*0.04` onto the gain envelope; during the release tail the scheduled gain falls below that, so troughs go briefly negative (phase inversion, not a crash). Bounded to ~4% on a near-silent tail — likely inaudible. If the release tail ever sounds gritty, ramp `ampDepthGain.gain` back to 0 at the release start (~`duration*0.8`). The cutoff-sum worst case was checked and is comfortable for all 5 presets (neo trough floor ≈ `freq*0.775`, shred ≈ `freq*3.85`).
- S1 P2 (deferred): `soloist.audio.lastNoteEnd` is reset to 0 only on the transport-reset action (`instruments.ts:436`). A stop/restart that does not run that reset can leave a stale future audio-clock time, so the first note after restart may be spuriously legato-flagged. Bounded benign — `applyPitchEnvelope`'s `Math.abs(freq - prevFreq) < freq * 0.5` magnitude gate caps the worst case at one brief, in-range glide. Revisit only if the restart glide is audible.
