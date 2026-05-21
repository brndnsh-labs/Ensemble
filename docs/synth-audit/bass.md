# Discovery Report — Bass Synthesis (`public/engine/synth-bass.ts`)

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

## 1. Synthesis method

Three-layer voice modeling a P-Bass with flatwound strings, plus a noise transient (`playBassNote`, 26–204):

- **Layer 1 — "The Thump"** (74–94): `sine` + `triangle` at the fundamental → `bodyMix` (gain 0.8) → `WaveShaper` cubic soft-clip (4× oversample). Passive saturation coloration.
- **Layer 2 — "The Growl"** (97–124): `sawtooth` through two cascaded lowpass biquads (Q 1.0 each, ~24 dB/oct). Cutoff pitch- and intensity-tracked (`growlBase = 200 + midi*5 + bandIntensity*400`) + velocity term. Mixed at `tonalVol * 0.35`.
- **Layer 3 — "The Impact"** (126–138): one-shot noise burst via `playPercussiveStrike` through a pitch-tracked bandpass — 1ms attack, 20ms decay, 100ms life.
- **Body EQ** (141–145): peaking +4 dB at 120 Hz, Q 0.8 on the master sum.
- **Envelope** (60–157): multi-stage `setTargetAtTime` AHDSR — 8ms attack, decay to 50% at +15ms, to 20% at +80ms, then release.
- Strictly **monophonic**. Expressive plumbing: `bendStartInterval` pitch glide (funk walk-ups, 808 slides); `muteAmount` reshapes cutoff/tail/release for palm mutes. `Math.sqrt(velocity)` dynamics compression.

**Verdict: genuinely solid, professionally-conceived synthesis.** "Synthy-but-good," not toy-ish. Needs *finishing*, not a rebuild.

## 2. Toy-ish causes (mild — a finishing list)

- **No dedicated sub layer / octave-down reinforcement** (74–94). A real P-Bass DI has deliberate sub-fundamental energy. On small speakers the weight is thin. *The single biggest "synthy" tell.*
- **Velocity → timbre is shallow.** Velocity affects amplitude and weakly nudges growl cutoff, but the attack-transient volume (`vol*0.4`, 132) and saturator drive are velocity-blind. Hard and soft plucks have nearly the same click and saturation.
- **Static saturator drive.** `bodyMix.gain` fixed at 0.8 (90) — same waveshaping every note regardless of dynamics.
- **Growl layer has no harmonic motion.** The two LPFs are set with `setValueAtTime` only (117–118) — cutoff frozen for the note's life. Real plucks have a fast downward filter sweep as pluck energy decays.
- **Triangle+sine is a thin pairing for body.** Only one sawtooth as a grit source; the midrange finger-noise/string-buzz presence band is absent beyond the 100ms impact click.
- **`0.95 + Math.random()*0.1` is the only per-note variation** (53) — ±5% amplitude. No timbral humanization.

## 3. Craft path (pure synthesis — no samples)

**Quick wins:** (1) add a sub layer — second `sine` an octave down, ~0.3–0.4 gain, low-passed; biggest bang for the buck; (2) velocity-drive the saturator (`bodyMix.gain` scales with velocity); (3) velocity-scale the impact transient brightness, not just volume; (4) animate the growl cutoff — `setTargetAtTime` downward sweep on `lp1/lp2.frequency`.

**Deep rework:** (5) pluck-position modeling; (6) a gentle bus compressor on `playback.bassGain`; (7) subtle string-resonance tail. Items 1–4 alone plausibly move the bass to "expensive."

## 4. Pack candidacy

**No.** A sample pack would not beat this and would *lose* features — continuous `bendStartInterval` glides and continuous `muteAmount` morphing can't be replicated by a static sample library without round-robins + articulation layers, and bends would be pitch-shift artifacts. Pure synthesis is clearly correct here.

## 5. Audio-graph hygiene

- **The NaN-guard comment at line 111 overpromises.** `bandIntensity` undefined → `growlBase`/`growlDepth` NaN; line 115's `Math.max(0, ...)` does NOT sanitize NaN (`Math.max(0, NaN) === NaN`), so a NaN cutoff can reach `lp1.frequency.setValueAtTime` (117–118). In production `bandIntensity` is always defined, but tests/edge cases need a real `Number.isFinite` fallback.
- Node cleanup good — `oscSine.onended` disconnects all 10 persistent nodes; impact sub-graph self-cleans.
- Audio-clock scheduling — clean.
- Minor: release math collapses to 15ms at `muteAmount=1`; `densityDuck`/`mixState` is module-global (fine for monophonic, but confirm export uses a separate path).

## 6. Footprint

No threat. ~7.6 KB source, zero assets. `createSoftClipCurve` is a runtime-built cached `Float32Array` — 0 bundle bytes. Quick wins add a few hundred bytes of code.

**Bottom line:** The bass is synthy-but-good — a legitimate, professionally-architected voice. It needs finishing: a sub layer, velocity-driven saturation/transient, and an animated growl cutoff. One genuine hygiene nit: the NaN-guard comment at line 111 overpromises.
