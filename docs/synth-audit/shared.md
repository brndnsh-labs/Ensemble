# Discovery Report — Shared / Cross-Cutting Audio Layer

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

**Premise correction:** the brief asked to "evaluate feasibility of algorithmic reverb" and flagged "no compression/limiting/glue" as open questions. Both already exist — there is a master limiter, a saturator, and a per-instrument reverb send. The findings below are about *quality and topology*, not absence. The actual audio-graph construction lives in `public/engine/engine.ts` `initAudio()` (41–316), not the three files originally scoped — `scheduler-core.ts` only *consumes* the graph.

## 1. Audio graph & routing

Built once in `initAudio()`, stored as loose properties on `playback`.

```
per-instrument synth voices ─> [name]Gain ─> busEQ chain ─> masterGain
                                  └─> [name]Reverb ─> reverbPreFilter(HPF 600) ─> reverbLPF(6k) ─> reverbNode(Convolver) ─> masterGain
master path:  masterGain ─> saturator(WaveShaper soft-clip 4x) ─> masterLimiter(DynamicsCompressor) ─> destination
```

- Master bus: `masterGain` → `saturator` → `masterLimiter` → `destination`.
- Five per-instrument buses (chords, bass, soloist, harmonies, drums), each with an EQ/pan chain and a parallel reverb send.
- One global reverb send (convolver), pre-filtered HPF 600 / LPF 6k.
- Bass bus has a `bassSidechain` gain ducked by the kick.
- Count-in/metronome connect directly to `masterGain`, bypassing buses + limiter.

**Architectural weak point:** the graph is a flat bag of named properties on `playback` (`playback.chordsGain`, `playback.bassEQ`, `Record<string,GainNode>` casts). No typed bus object, no FX-bus abstraction. Any new shared processor means more untyped property soup. **The single biggest thing to refactor before the sound work.**

## 2. Mix & gain-staging — the "chords get buried" diagnosis

Three independent mechanisms all push chords down:

- **Static level config** `MIXER_GAIN_MULTIPLIERS` (`config.ts:105–112`): chords 0.13, bass 0.1575, soloist 0.15, harmonies 0.10, drums 0.26. Drums sit 2× louder than chords by design; soloist and bass are both above chords.
- **The chord bus is EQ'd *down* in its own critical range.** `engine.ts:198–202`: a peaking notch at **2500 Hz, −2 dB** — exactly the presence/intelligibility band for keys. Meanwhile soloist gets **+2 dB at 3500 Hz** and drums **+2 dB at 5000 Hz**. The mix scoops chords and boosts everything that competes with them. A low-shelf −2 dB at 350 Hz further thins them.
- **Polyphony compensation** makes chords quieter the fuller they are (`1/sqrt(N)` per-note scaling).
- **No glue compression.** The only dynamics is the brick-wall `masterLimiter`. When drums+bass+soloist peak together it pulls the *whole mix* down — and chords, already quietest, vanish first.

**Fix is architectural:** give chords a dedicated midrange pocket (invert/remove the 2500 Hz notch, move competing boosts), raise the `chords` multiplier relative to soloist/drums, and add a bus/glue compressor so chords aren't limiter-pumped.

## 3. Space / reverb

There IS reverb — a `ConvolverNode` fed by a procedurally-generated impulse (`createReverbImpulse`, `utils.ts:653–698`). Already zero-bundle-cost (IR synthesized at runtime, not downloaded). But: a single fixed 1.5s/decay-3.0 space for every genre and tempo; the tail is **pure white noise** with no modulation and no frequency-dependent decay — a classic "synthy/cheap" tell; no real decorrelation design.

**FDN recommendation — strongly yes.** A feedback-delay-network reverb (4–8 delay lines + Hadamard mixing + per-line damping lowpass + slight LFO modulation on delay times), built from `DelayNode` + `BiquadFilter` + `GainNode`:
- Zero bundle cost, like the current IR.
- Modulated delay lines eliminate the static metallic tail — *this* is the synthy↔real difference.
- Real-time tweakable (decay, size, damping as `AudioParam`s); per-genre presets become trivial.
- The send architecture already exists — an FDN drops in as a replacement for `reverbNode` with the same input/output contract. Low risk, high payoff. **The first recommendation.**

## 4. Humanization / per-note variation

Partial, scattered, inconsistent — no shared layer. Timing: `scheduleGlobalEvent` adds one `Math.random()` jitter to the drum time, which then *also* feeds bass/chords/harmony — so the whole rhythm section shares one offset per step rather than each instrument breathing independently; the soloist gets no jitter at all. Pitch/amplitude: ad-hoc per-synth detune randomness, no shared per-note drift.

**Where a shared layer should live:** a new helper in `synth-utils.ts` (e.g. `humanizeNote(noteEvent, profile)` → `{timeOffset, velocityMult, detuneCents}`), called from each `schedule*` function in `scheduler-core.ts` before the `play*` call. Per-instrument profiles, **independent** draws per instrument per note. Repo convention favors *seeded* PRNG (`scrambleHash` / `hash-utils.ts`) over `Math.random()` — seed on `(step, instrument, voiceIndex)`.

## 5. Shared helpers quality (`synth-utils.ts`)

Generally solid — node-creating helpers wire `onended → safeDisconnect`. Findings:

- **`rampGain` exponential branch** (16–22): `exponentialRampToValueAtTime` with no preceding `setValueAtTime` anchor — ramp starts from whenever the last automation event was, can click. `duration` is named like a linear time but is a `setTargetAtTime` time-constant in the other branch — misleading.
- **No NaN guard before AudioParam writes.** `playResonantTone` does `Math.max(1, freqEnd)` (`Math.max(1, NaN) === NaN`); `freqStart` `setValueAtTime` (201) has no guard — a NaN freq throws into a bare `catch {}` and the tone silently drops. Given `audio-recovery.ts` exists to catch NaN corruption, helpers should `Number.isFinite`-guard and fail fast.
- **`updateDensityDucking`** (60–77): `recentHits` decay only fires when `now - lastTick > 0.5`; in a continuously busy passage it grows unbounded (output clamped, so no audible runaway — latent smell).
- `createSimplePanner` GainNode fallback silently ignores `panValue` — acceptable degradation.

## 6. Pack / sample-loader feasibility

Confirmed: **no `decodeAudioData` anywhere.** The only `AudioBuffer` usage is procedurally-generated noise/cymbal buffers and the reverb IR. No fetch-and-decode path, no asset manifest, no audio-asset caching.

To add lazy sample packs (audio path):
- **Loading hook:** a new `sample-loader.ts` — `fetch → arrayBuffer → decodeAudioData`, cached in an `AudioBuffer` map (`groove.audioBuffers` already documents a "decoded drum samples" slot). Decode after `initAudio()`.
- **Playback hook:** `playPercussiveStrike` already takes an `AudioBuffer | null` + `destination` — a sampled drum routes through nearly the identical path. Pitched instruments need a new `playSampledNote` (playbackRate-based pitch-shift from a root buffer), connecting to the existing `[name]Gain` bus to inherit EQ/reverb/limiting.
- **PWA caching:** a service-worker runtime-cache rule for pack URLs, separate from the precached <1 MB core.

**Architectural blockers for entitlement-gating (paid packs):**
1. **Synthesis selection is hardcoded, not data-driven.** `scheduleChords` hardcodes `instrument || 'Piano'`; `INSTRUMENT_PRESETS` is a static export. To gate packs you need an indirection layer — an instrument registry resolving each voice to a synth function *or* a sample buffer, checked against entitlement at resolution time.
2. **State has no entitlement slice.** An entitlement check needs a state field (or a separate non-persisted service). It must NOT live in persisted/shareable state, or a share URL would leak/forge entitlements.
3. **`initAudio` builds a fixed 5-module graph.** Genuinely new instruments need the bus list to become data-driven.
4. **Graceful degradation:** every sample-backed instrument needs a synth fallback if the pack isn't downloaded/entitled — the registry indirection (blocker 1) is what makes that fallback clean.

The audio *path* is already well-suited to receive sampled audio; the workstream should be preceded by the instrument-source indirection refactor + a non-persisted entitlement service.

## Top recommendations, ranked

1. **Swap the noise-convolution reverb for a modulated FDN reverb** (pure Web Audio, zero bundle). Biggest single "not-synthy" lever.
2. **Fix chord gain-staging** — raise the `chords` multiplier, remove/invert the −2 dB 2500 Hz notch, add a glue/bus compressor.
3. **Add a shared, seeded per-note humanization layer** — independent draws, not the current single shared jitter.
4. **Refactor the audio graph off loose `playback.*` properties** into a typed bus/FX abstraction before the pack work.
5. **Harden `synth-utils.ts` helpers** with `Number.isFinite` guards (fail-fast) and clarify `rampGain`'s misleading semantics.
