# Discovery Report — Harmony-Voice Synthesis (`public/engine/synth-harmonies.ts`)

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

## 1. Synthesis method

One monolithic `playHarmonyNote()` (38–569) does everything. Per-note graph:

- **Oscillators:** `osc1` + `osc2` always (205–206); optional `sub` only when `freq > 250` (208–209). Waveforms picked by a branching ladder keyed on `groove.genreFeel` first, then `style` (288–398).
- **Filter:** a single `lowpass` (198) with a per-style "bloom" envelope — high cutoff, exponential ramp down ~0.1s (425–458).
- **Envelope:** raw linear attack to `finalVol` then a single `setTargetAtTime(0, ...)` release (526–528). **AR, not ADSR — no decay, no sustain stage.**
- **Pan:** `createSimplePanner` at a random position.
- **Organ special-case** (227–361): the only style with real depth — WaveShaper saturator, Leslie LFO, tremolo LFO, 5th-harmonic osc, square key-click, highpass. Genuinely well-built.
- Routing: osc → filter → gain → panner → `harmoniesGain`.

**Copy-paste lineage — the core finding.** The non-organ harmony voice is a near-verbatim clone of the soloist preset pattern — compare the default branch against `playNeoJuno` (`synth-soloist.ts:480–564`) and `playShred` (633–696): same two-saw/two-tri unison-detune skeleton, same single-lowpass-with-ramp, same `osc.onended = safeDisconnect`. The harmony voice has **no dedicated timbral identity outside the organ branch** — it is the generic soloist skeleton with a style switch bolted on.

## 2. Toy-ish causes + "bolted on" diagnosis

- **No dedicated voice design.** Soloist has 5 named hand-tuned presets with formant filters, breath noise, bell EQ. Chords has named `INSTRUMENT_PRESETS`. Harmony has **one function and a switch statement** (288–398) picking `osc.type` strings — a horn section and a string pad differ only by waveform and detune. Textbook toy synth.
- **No formant / spectral character.** Just a lowpass. Raw sawtooth + lowpass is the most generic "synth pad" there is.
- **AR envelope, no decay/sustain** (526–528). Every note has the same flat held-tone shape. The single biggest "synthy" tell for pads.
- **No per-voice space / dimension.** One random pan + the shared convolver send. No ensemble detune, no per-voice movement — a duo, not a section.
- **`genreFeel` overrides `style`** (288–303). Rock/Metal and Neo-Soul/Acoustic feels are checked *before* the style switch, so a "stabs" style under a Neo-Soul feel never reaches the stabs branch. Timbre is hijacked by a global feel flag — "bolted on" made literal.
- **No bus character of its own.** The harmony bus EQ (`engine.ts:257–271`) is a single peaking filter at 1200 Hz with **+1 dB gain** — an inaudible no-op. The thinnest, least-developed bus in the mixer.
- **Brightness mapped to a single global** — `brightnessMult = 1 + intensity*2` (423); every note tracks one global knob identically.

## 3. Craft path

**Verdict: rebuild the non-organ voice, not polish. Leave the organ branch alone.**

**Quick wins:** add a decay stage to the envelope; add a real harmony bus character (air shelf + low-mid scoop); decouple `style` from `genreFeel`; widen the unison (3rd detuned osc + few-ms attack stagger).

**Deep rework:** build **named harmony voice presets** mirroring the soloist's architecture — a "Horn Section" voice (saw + bandpass formants ~1.2k/2.5k, brass bell peak, fast attack with a tiny swell) and a "String Pad" voice (multi-detuned saw ensemble of 4–6 layers, slow attack, ensemble chorus LFO, gentle moving lowpass, body resonance peak). Reuse the chords `INSTRUMENT_PRESETS` config pattern. Add formant/EQ shaping per voice. Add ensemble detune + per-layer time offset for strings. Consider a shared noise-breath layer for horn stabs (sax already has the technique at `synth-soloist.ts:448–466`).

## 4. Pack candidacy

**Strings are the one place a sample pack would genuinely win** — real strings are dozens of independently-bowed players with continuous micro-pitch variation; a good synth ensemble gets ~80%. **Horn stabs** synthesize extremely well (short, transient-dominated) — not a pack candidate. **Organ** is inherently a synthesis instrument — not a pack candidate. Do the rebuild now; revisit strings-only for the pack workstream later.

## 5. Audio-graph hygiene

- **NaN/zero-into-AudioParam risk — `slideInterval` slide** (401–412): `exponentialRampToValueAtTime` throws if target/current ≤ 0; `freq` is finite-checked (58) but not `> 0`. Uncaught.
- **Organ click** (330–331): `clickGain` starts at `finalVol * 0.6` — if `finalVol` is 0 the exponential ramp throws. Uncaught.
- **Release math can schedule in the past** (528): for pad styles `release = 0.5` while `duration` can be ~0.125s — start time `playTime - 0.375`. Legal but means short pad notes never reach `finalVol` before decay starts — a contributor to the weak pad sound.
- **`tremoloGain` is created but never connected** (262–272) — allocated, given a value, pushed to `voiceNodes`, never wired into the graph. Dead node.
- Scheduling clock correct; node cleanup correct but fragile (hangs off `osc1.onended`).

## 6. Footprint

No sub-1MB threat — pure code, the ~24 KB is mostly comment essays (stripped in build). **Dead/wasted code:** `tremoloGain` unconnected (§5); the organ saturator builds a fresh 44100-sample `Float32Array` WaveShaper curve **on every organ note** (236–245) — the chords file caches this exact pattern (`cachedShaperCurve`) and harmony does not; the huge S1/S4 comment essays read as compensation for a voice that lacks design.

**Summary:** The harmony voice feels bolted-on because it literally is — the generic two-oscillator soloist skeleton with a style switch and a global `genreFeel` override, lacking the formant shaping, ADSR, ensemble width, and bus character that make the other voices sound like instruments. The organ branch is the exception and is genuinely good. Rebuild the non-organ voice into named formant-based "Horn Section" and "String Pad" presets; strings are the only legitimate future pack candidate.
