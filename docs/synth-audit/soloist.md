# Discovery Report — Soloist / Lead-Voice Synthesis (`public/engine/synth-soloist.ts`)

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

## 1. Synthesis method

Pure subtractive, two-oscillator per voice. Five presets dispatched in `playSoloNote` (91–194):

- **Trumpet** (273–366): 2× sawtooth, osc2 +5c. Lowpass with a 3-stage cutoff sweep (base→max at 80ms→sustain at 150ms), Q 0.8. Peaking "bell" EQ at 1200 Hz, highshelf rolling off 6 kHz fizz. `setTargetAtTime` AD-ish envelope, attack 0.02 (0.005 legato), post-attack dip to `vol*0.9`, release at `duration*0.85`.
- **Saxophone** (368–478): sawtooth + triangle (osc2 −7c). Two parallel bandpass formants (900 Hz Q3, 2400 Hz Q4). A 3.5 Hz "breath" LFO on a master gain. Optional looped noise buffer through 1500 Hz highpass for breath texture — the only sampled element.
- **NeoJuno** (480–564): 2× sawtooth, two slow free-running LFOs (0.3/0.5 Hz) on detune for Juno drift. Lowpass with a downward sweep.
- **Vowel** (566–631): sawtooth + square, single bandpass Q5 swept 800→1200→800 Hz.
- **Shred** (633–696): 2× sawtooth, osc2 **+12c**, static lowpass at `freq*6`, Q2, 5ms attack.

Shared: `applyPitchEnvelope` (legato glide, pitch-bend intro), `createVibrato`/`attachVibrato` (LFO→gain into both oscs' `frequency`), per-voice random pan ±0.05, voice stealing in `manageVoices`.

## 2. Toy-ish causes (expressiveness gaps)

- **Static sustain — the single biggest offender.** Once the filter sweep settles, the held tone is a fixed-waveform sawtooth with no harmonic movement. The vibrato LFO modulates pitch only — no tremolo, no filter-cutoff LFO, no harmonic evolution. A 2-second held trumpet note is spectrally frozen.
- **No velocity→timbre.** `vol` scales output gain only. Filter cutoffs derive purely from `freq`, never from `vel`. A soft and a fortissimo note have identical spectra. The textbook "sampler-vs-toy" tell.
- **Uniform attacks.** Attack is a binary `isLegato ? 0.005 : 0.02` — and **`isLegato` is hardcoded `false` at the scheduler call site** (`scheduler-core.ts:797`), so the legato branch and its 0.03–0.06s portamento glide are **dead code** in normal playback. Every note gets the same 20ms attack.
- **No per-note timbral humanization.** Only randomization is pan ±0.05 and vibrato-speed jitter ±3%. Filter cutoff, Q, bell boost, detune, attack, decay — all deterministic from `freq`. Successive same-pitch notes are byte-identical.
- **Detune is static, not pitched-in.** Fixed constants (+5c/−7c/+12c). +12c on shred is nearly a quarter-tone wide and sounds sour. No attack-time detune settling.
- **Envelopes have no real decay stage.** `setTargetAtTime` exponentials; release always at a fixed 85% of duration with no relationship to articulation.
- **No body/space.** No per-voice resonant body, no shared reverb send visible — an exposed lead with zero ambience reads as "dry synth patch."
- **Vibrato is shallow and pitch-only** — depthFactor maxes ~±15c (timid for a lead); no coupled amplitude/timbre vibrato.

## 3. Craft path

**Quick wins:** (1) **velocity→cutoff coupling** on every preset — single highest-ROI change; (2) filter-cutoff LFO on sustain (slow, depth-ramped like vibrato) so held notes breathe; (3) per-note timbral humanization (cutoff ±8%, detune ±3c, attack ±20% — seeded via `scrambleHash`, not `Math.random`); (4) attack-time detune settle (ramp osc2 detune ±20c→final over 40–60ms); (5) tighten shred detune +12c→+6c; (6) wake the dead legato path or delete it.

**Deep rework:** (7) **coupled vibrato** — route the LFO into output gain and filter cutoff too; (8) proper ADSR with articulation-aware release; (9) harmonic evolution — attack transient brighter than sustain (brass "spit"); (10) **shared algorithmic reverb** for the soloist and band — likely the single most important deep change for an exposed lead; (11) PWM/wavetable morph on the synth-leaning presets.

## 4. Pack candidacy

The soloist is the **strongest pack candidate** of any voice — *and* the one where good synthesis can still win. A sampled trumpet/sax with round-robins beats this engine for *realistic acoustic* presets. But the synth-leaning presets (neo, vowel, shred) have no business being samples. Recommendation: treat acoustic-realism trumpet/sax as future pack territory; invest synthesis effort in making the synth-lead presets genuinely expensive now. Don't chase photoreal brass in pure synthesis.

## 5. Audio-graph hygiene

- **Vibrato exponential-from-zero** (812–817): `exponentialRampToValueAtTime` ramps from a `setValueAtTime(0,…)` start — exp ramp *from* 0 is invalid; works in practice but fragile. Worth an explicit small non-zero start.
- `finalVibDepth`, `vibSpeed`, trumpet/neo cutoff targets all guarded — OK.
- Node cleanup hangs entirely off `osc1.onended` — brittle coupling but low risk (all stops simultaneous).
- `createSimplePanner` silently no-ops pan on browsers without `createStereoPanner`.
- UI-clock vs audio-clock — clean. No `0*NaN` found.

## 6. Footprint

No threat. ~23.8 KB source, zero asset imports. The only buffer is the procedurally-generated shared noise buffer. Adding reverb (a small FDN) + LFO/humanization code adds ~3–8 KB. Spend freely on synthesis quality here.

**Bottom line:** The soloist isn't broken — it's a competent two-osc subtractive lead. It reads as "toy" for three concrete reasons: (1) frozen sustains — no timbral movement once the attack settles; (2) velocity drives loudness only, never brightness; (3) zero per-note timbral variation. Fix those three plus add a shared reverb and the synth-lead presets reach "expensive." Realistic acoustic trumpet/sax remain future pack territory.

## 7. Epic 3 resolution notes (2026-05-22)

Epic 3 shipped all 7 stories — the §3 quick wins and deep rework (1)–(8). Two findings refined the discovery premises during the work:

- **The dead legato branch's attack was *inverted*, not just dead (S1).** `isLegato` was hardcoded `false` at the scheduler, so the legato branch never ran — but its internal tuning was also wrong: legato set a *sharper* attack (5 ms) than non-legato (20 ms), the opposite of a slur. A dead branch's constants are unaudited guesses; waking it (§3 item 6) required fixing the attack sign, not just the wiring.
- **velocity→cutoff coupling needed band-intensity coupling too (S2).** The §3-item-(1) coupling was correct, but the soloist's per-note velocity only picks up `intensity * 0.08` from the band-intensity knob — so the owner's natural test (sweep the intensity slider) showed almost no brightness change. The shipped `soloistBrightnessDrive` blends per-note velocity *and* band intensity.

Hygiene note §5's "vibrato exponential-from-zero" (the bend ramp in `applyPitchEnvelope`) was **not** addressed by Epic 3 — still open if it ever matters.
