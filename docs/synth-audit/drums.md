# Discovery Report — Drum Synthesis (`public/engine/synth-drums.ts`)

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

## 1. Synthesis method (per voice, as built)

**Shared helpers (`synth-utils.ts`):** `playResonantTone` — single `OscillatorNode` → `GainNode`, `setTargetAtTime` attack + decay, optional `exponentialRampToValueAtTime` pitch glide. `playPercussiveStrike` — one `BufferSource` (shared white-noise buffer) → `BiquadFilter` → `GainNode`, same two-`setTargetAtTime` AD envelope.

- **Kick** (828–900): 5 layers — beater sine 2.1–3.1kHz→520Hz (6ms glide), noise "skin" bandpass, triangle "knock" 150Hz→54Hz, sine "shell" ~48Hz, noise "click" bandpass 2.5kHz Q4. Velocity→timbre via `getKickVoiceConfig`. Most fully-realized voice.
- **Snare** (901–983): low triangle body ~182Hz, high sine body ~318Hz, optional triangle "crack" 2.2kHz→1.5kHz, noise "wires" bandpass. `getSnareVoiceConfig` gives accent/ghost split.
- **Sidestick** (906–937): sine 6.5kHz click + triangle 330Hz body + noise highpass.
- **HiHat / Open / Ride** (984–1106): pre-rendered metallic `AudioBuffer` (`createMetallicBuffer`, 1457) of 6–7 inharmonic partials + noise + transient, through bandpass→highpass→gain. Closed hat adds a noise "sizzle." Ride adds a triangle "ping" only at `velocity > 0.92`.
- **Crash / China** (1107–1177): buffer-source + bandpass→highpass, longer buffers, shared `lastCrashGain` choke lane.
- **Toms** (1292–1339): stick sine + noise skin + triangle body (pitch-glided) + sine shell. Per-register profiles.
- **Cowbell** (1340–1385): two triangles 540/800Hz (TR-808 ratio) + noise click.
- **Clave / Conga / Bongo / Agogo / Perc / Guiro / Shaker / Brush** (1178–1453): mostly 1–3 `playResonantTone` calls plus a noise strike.
- `createMetallicBuffer` (1457–1495): additive partials with `exp` decay, randomized phase/detune/weight per buffer, an 8ms transient, one-pole smoothing, `tanh` saturation — genuinely good FM-ish metal synthesis.

## 2. Toy-ish causes (file:line)

- **Closed hat is choked by design — three independent decay-shorteners stack.** `getCymbalVoiceConfig` collapses `decayBase` 0.058 → `minDecay` 0.041 under velocity/intensity (633–638), then `hatDecayMult` 0.92–1.10 (997), then `decayDelay` jitter ×0.95–1.15 (1052). At high velocity/intensity the gain envelope `tc` lands ~0.038s — the buffer still has body but the gain envelope guillotines it. **This is the "choked" sound.** Too-aggressive envelope, not a bug.
- **No in-between hat positions exist.** Dispatcher knows only `'HiHat'` and `'Open'` (984). No quarter/half-open articulation, no foot-pedal "chick," no continuous openness parameter.
- **Open hat decay is fixed, not pedal-controlled.** `Open` always rings `decayBase` 0.62s → `stopTime` 3.1s (382–400).
- **Single shared white-noise buffer for every noise layer.** Kick skin, snare wires, hat sizzle, toms, shaker, guiro, brush, cowbell click all read `groove.audioBuffers.noise`. White noise is spectrally flat and static; a core "synthy" tell.
- **No velocity→timbre on most percussion.** Clave (1178), Conga/Bongo (1198), Agogo/Perc (1228), Shaker (1282), Guiro (1259) take `velocity` only as a volume scalar — frequencies, cutoffs, decay times constant.
- **Static cymbal buffers — every HiHat hit is the SAME waveform.** `createMetallicBuffer` randomizes once per buffer, then the buffer is cached (`ensureCymbalBuffer`, 532–545) and replayed. Per-hit variation is only `playbackRate` ±2.2% and filter jitter.
- **Ride "ping" is binary and rare** — fires only above `velocity > 0.92` (1067). Below that the ride is pure wash with no stick definition.
- **Naive AD envelopes everywhere.** No hold, no two-stage decay, no pitch-dependent decay.
- **Agogo/Perc has no transient** (1228–1258). **Shaker is one noise burst** (1282–1291), no two-stroke gesture.
- **`velJitter` humanization is amplitude-only** (802) — never touches timing or timbre.

## 3. Craft path

**Quick wins:** (1) fix the choked hat — raise `minDecay`/`decayBase` in `CYMBAL_RUNTIME_PROFILES.HiHat`, stop multiplying three shorteners; (2) add a continuous "openness" articulation for hats; (3) per-hit cymbal variation via a small buffer pool / per-hit detune; (4) ride ping on every hit, scaled by velocity; (5) velocity→timbre on congas/bongos/agogo/clave (map velocity to cutoff + decay); (6) foot-pedal hat "chick."

**Deep rework:** (7) replace the single white-noise buffer with voice-specific colored/time-varying noise — the single biggest move against global "synthy"; (8) two-stage decay envelopes in the shared helpers; (9) shaker two-stroke model; (10) a tiny procedural early-reflection bus for the kit.

## 4. Pack candidacy

- **Cymbals (hats, ride, crash, china):** samples would clearly win — real cymbal spectra are wildly inharmonic and evolve nonlinearly. Strong pack candidate.
- **Kick / snare / toms:** synthesis is competitive; with craft work these reach "expensive." Weak pack candidacy.
- **Hand percussion:** mixed; clave/cowbell synthesize well, brush/shaker/guiro borderline.
- **Bottom line:** core stays synthesis; the one defensible pack is acoustic cymbals.

## 5. Audio-graph hygiene

- **`StereoPannerNode` leak — the one concrete bug.** A panner is created unconditionally at line 820 for every drum hit. `playResonantTone`/`playPercussiveStrike`'s `onended` disconnects only `[osc, gain]`, not the panner. Only HiHat/Crash/Guiro/Brush explicitly include `panner` in `safeDisconnect`. **The other ~9 of 14 voice branches (Kick, Snare, Sidestick, Clave, Conga/Bongo, Agogo, Shaker, Tom, Cowbell) leak one panner per hit** — at dense tempos, dozens of orphaned `StereoPannerNode`s per second, still connected to `drumsGain`, never GC'd.
- No NaN reaches AudioParams (configs route through `clamp01`/`Math.max` floors).
- Scheduling is audio-clock correct (`playTime`/`finalTime` from `playback.audio.currentTime`).
- `updateDensityDucking` mutates module-global `mixState` — fine for a single context.

## 6. Footprint

No threat. ~54 KB source (trivial gzipped), zero static audio assets — all buffers generated at runtime. Craft-path items are algorithmic, add no download weight. Do NOT implement per-hit cymbal variation by shipping multiple buffers — generate the pool at runtime.

**Summary:** Drums are the strongest synth voice; bones are good. The "choked hat" is an over-aggressive triple-stacked decay envelope (config-only fix). In-between hat positions are unimplemented (a half-day feature). Broadest "synthy" tells: the single shared white-noise buffer and static/reused cymbal buffers. One concrete bug regardless: the panner leak.
