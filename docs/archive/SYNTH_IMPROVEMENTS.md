# Synthesis Improvements — Plan & Tracker

A structured plan for improving audio realism across all instrument families without adding soundfonts, samples, or external dependencies. All improvements use Web Audio API primitives only.

## How to use this file

- **Starting a session:** find the first item with status `next-up` — read its Implementation Notes before touching code.
- **Finishing an item:** update Status to `done`, fill in Date, add any Notes (deviations, follow-ups, surprises).
- **Blocking issue:** set status to `blocked`, describe in Notes. Don't start the next item.
- Run `npm run typecheck && npm test` before marking anything `done`.

Statuses: `done` · `in-progress` · `next-up` · `blocked` · `not-started` · `skipped`

---

## Background

Findings from a full synthesis audit (May 2026), corrected after reading `public/engine/engine.js` in detail. The engine is more mature than the initial survey suggested — the audit looked at synth files but the global bus architecture lives in `initAudio()`.

**What's already in place (don't re-implement):**
- ConvolverNode reverb with synthetic IR (`createReverbImpulse` in `utils.js`, 1.5s, power-law decay)
- Abbey Road-style reverb pre-filter: HPF 600Hz → LPF 6000Hz → ConvolverNode → masterGain
- Per-module reverb sends with tuned wet levels (chords 0.3, soloist 0.6, harmony 0.4, drums 0.2, bass 0.05) — controlled by `m.state.reverb`, user-adjustable
- Master bus chain: masterGain → WaveShaper saturator (4x) → DynamicsCompressor → destination
- Per-bus EQ chains: chords (low shelf + presence notch + panner -0.2), bass (low shelf + scoop + definition), soloist (presence peak), harmonies (warmth + panner +0.2)

**Where the real gaps are:**
1. **Global mix refinements** — IR has no pre-delay/early reflections (washy rather than roomy); limiter is too soft (knee 30, ratio 12); drums bus has no EQ at all
2. **Percussion** — additive layers missing from kick and hi-hat; crash decay too short; bass impact not pitch-aware; mute is binary
3. **Melodic instruments** — chord piano needs unison width; distortion onset is a hard gate; organ Leslie is static; saxophone breath is gain-only LFO

---

## Epic 1 — Global Mix Refinements

These are refinements to the existing bus architecture, not new systems.

| Item | Title | Status | Date | Notes |
|---|---|---|---|---|
| 1.1 | Improve reverb IR (pre-delay + early reflections) | done | 2026-05-13 | `createReverbImpulse` in `utils.js` rewritten; 6 early reflections 15–75ms, normalized exponential tail |
| 1.2 | Tighten master limiter | done | 2026-05-13 | knee 30→3, ratio 12→20, attack 2ms→1ms, release 80ms→150ms, threshold -1.5→-2.0 |
| 1.3 | Drums bus EQ | done | 2026-05-13 | HP @40Hz + peaking +2dB @5kHz Q=1.2; `playback.drumsEQ` stored for future access |

### 1.1 — Improve reverb IR: pre-delay + early reflections

**Why:** The current IR is `(Math.random() * 2-1) * (1 - i/length)^3` — a clean power-law noise decay with no attack shape. Real rooms have a brief pre-delay (5–25ms of silence before reverb arrives), then a cluster of early reflections, then the diffuse tail. Without this the reverb sounds "pasted on" rather than placing instruments in a space.

**Approach:** Rewrite `createReverbImpulse` in `public/utils.js` (lines 711–722). Keep the same function signature so callers are unaffected. New algorithm:
1. Pre-delay: zero-fill the first `predelayMs` samples (suggest 12ms → `sampleRate * 0.012` samples)
2. Early reflections: 6–8 exponentially-spaced impulses from `predelayMs` to ~80ms, amplitude 0.4–0.8, each at a randomized sample offset. Adds "size" cue.
3. Diffuse tail: after 80ms, standard exponential noise decay `e^(-6t/duration)` — switch from power law to true exponential for a more natural tail shape
4. Stereo decorrelation: use independent `Math.random()` per channel (already done), but offset channel 1 by `predelayMs * 1.07` (7% longer) for wider perceived image

**File:** `public/utils.js` lines 711–722. No caller changes needed.

---

### 1.2 — Tighten master limiter

**Why:** Current settings (threshold -1.5, knee 30, ratio 12, attack 2ms, release 80ms) are a soft compressor, not a limiter. Knee 30 means gain reduction starts ~15dB above threshold — very gradual. Dense passages can clip.

**Approach:** Adjust `playback.masterLimiter` in `public/engine/engine.js` lines 116–121:
- `threshold`: -2.0 (slightly more headroom)
- `knee`: 3 (tight knee — limiting character, not compression)
- `ratio`: 20 (hard limiting)
- `attack`: 0.001s (1ms — catches fast transients)
- `release`: 0.15s (slightly longer to avoid pumping on kick)

**File:** `public/engine/engine.js` lines 117–121.

---

### 1.3 — Drums bus EQ

**Why:** Every other module (chords, bass, soloist, harmonies) has a bus EQ chain. Drums connect directly: `gainNode.connect(playback.masterGain)` (line 265). This means drums get no high-pass rumble removal, no presence shaping at the bus level.

**Approach:** Replace the direct connect with a small EQ chain inline (same pattern as other buses):
- Highpass @ 40Hz (remove sub-rumble from cymbal buffers)
- Peaking +2dB @ 5000Hz, Q=1.2 (cymbal air / stick definition)
- No panner (drums should stay centered)

Store `playback.drumsEQ` reference for future use.

**File:** `public/engine/engine.js` around line 264–265.

---

## Epic 2 — Percussion

Mostly additive layers. Low regression risk. Run `npm test` (no specific critique test for drums) after each item.

| Item | Title | Status | Date | Notes |
|---|---|---|---|---|
| 2.1 | Kick click component | done | 2026-05-13 | 5th layer: bandpass noise 2500–3300Hz, Q=4, 8ms decay; test updated to 5-layer model |
| 2.2 | Hi-hat sizzle layer | done | 2026-05-13 | Bandpass noise 3200–3600Hz Q=1.2 at 12% vol, closed hat only; test updated |
| 2.3 | Crash wash / longer tail | done | 2026-05-13 | Buffer duration 6.9→9s, partialDecay 1.35→0.8, noiseDecay 2.4→1.0, decayBase 2.7→3.5, stopTime 7→9s; sustain floor lifted to 0.42 |
| 2.4 | Bass pitch-aware impact | done | 2026-05-13 | Impact bandpass scales with freq: Math.max(200, min(1400, freq*1.6)); Q scales 1.5–4.9 |
| 2.5 | Bass mute gradations | done | 2026-05-13 | `muted` bool → `muteAmount` float 0–1; tonalVol, cutoff, releaseTime, releaseTc all interpolated; callers updated to 0/1 |

### 2.1 — Kick click component

**Why:** The kick beater sweep (2150→520Hz sine) covers the body but misses the 2–4kHz presence peak that makes kicks audible on earbuds and small speakers.

**Approach:** Add a second `playPercussiveStrike()` call inside the kick synthesis block with:
- `filterType: 'bandpass'`, `freq: 2500 + velocity * 800`, `Q: 4`
- `attack: 0.0003`, `decay: 0.008`, `duration: 0.05`
- `volume: vol * 0.25`

This is purely additive — no change to existing layers.

**File:** `public/engine/synth-drums.js` — inside `playKick()` around line 614, alongside existing beater strike.

---

### 2.2 — Hi-hat sizzle layer

**Why:** Hi-hats are bright at 6500Hz but have a presence gap in the 2–4kHz range. Real hats have metallic "sizzle" there that cuts through a mix.

**Approach:** After the existing cymbal buffer playback in `playHiHat()`, add a thin filtered noise layer using `groove.audioBuffers.noise`:
- Two BiquadFilters in series: highpass @ 2200Hz then lowpass @ 5000Hz
- GainNode with envelope: 0 → `vel * 0.12` over 1ms, → 0 over 40ms
- Connect to the existing hat output gain or directly to `playback.drumsGain`

**File:** `public/engine/synth-drums.js` — inside `playHiHat()` around line 750.

---

### 2.3 — Crash wash / longer tail

**Why:** Crash `stopTime` is 7.0s; real crashes ring 8–12s. The exponential falloff is also too clean — no "wash" bloom characteristic of large cymbals.

**Approach:** In `CYMBAL_RUNTIME_PROFILES` (or wherever crash stop time is set around line 126 of synth-drums.js), extend `stopTime` to 10.0. Separately, add a slow secondary gain automation: after the initial transient, schedule a slight gain bloom (+15%) at 200ms then decay — simulates the crash body opening after the initial strike.

**File:** `public/engine/synth-drums.js` — crash profile and playback routine.

---

### 2.4 — Bass pitch-aware impact

**Why:** The finger-thud strike is hardcoded at `freq: 600` bandpass regardless of note pitch. A low E (41Hz) and a high C# (277Hz) produce identical click character.

**Approach:** In `playBassNote()` replace the hardcoded `freq: 600` with:
```js
freq: Math.max(200, Math.min(1400, freq * 1.6))
```
Also scale Q: `Q: 1.5 + (freq / 440) * 1.5` (higher notes = tighter click).

**File:** `public/engine/synth-bass.js` line 110 — `playPercussiveStrike()` call parameters.

---

### 2.5 — Bass mute gradations

**Why:** Palm muting is binary (`muted ? vol * 0.15 : vol`, `muted ? 15ms : duration`). Real palm muting is a spectrum.

**Approach:** Change the `muted` boolean parameter to a `muteAmount` float (0.0–1.0). Update internal calculations:
- `tonalVol = vol * (1 - muteAmount * 0.85)`
- `cutoff = muteAmount > 0 ? 300 + (1 - muteAmount) * (growlBase - 300) : growlBase + vol * growlDepth`
- `releaseTime = muted ? 0.015 : duration` → `releaseTime = duration * (1 - muteAmount * 0.97) + 0.015 * muteAmount`

Callers passing `true` → `1.0`, `false` → `0.0`. Fully backwards-compatible after updating callers in `bass-engine.js`.

**File:** `public/engine/synth-bass.js` lines 35, 59, 95, 126. Update callers in `bass-engine.js`.

---

## Epic 3 — Melodic Instruments

More delicate — touches the musical core. Run the relevant critique test from `tests/standards/` after each item.

| Item | Title | Status | Date | Notes |
|---|---|---|---|---|
| 3.1 | Chord piano unison layer | done | 2026-05-13 | Second PeriodicWave osc +6–10¢, 0.6× gain, routed through same filter; stops with primary |
| 3.2 | Chord distortion soft-knee | done | 2026-05-13 | WaveShaper always connected when !muted; drive = max(0.001, (intensity−0.5)×4.0) |
| 3.3 | Hammer noise pitch-aware | done | 2026-05-13 | freq = max(800, min(4000, 800+(freq/440)×600+finalVol×500)) |
| 3.4 | Leslie speed variation | done | 2026-05-13 | leslieSpeed derived from bandIntensity: 0.7Hz (<0.4) → 6.2Hz (>0.6), linear interp between |
| 3.5 | Saxophone breath texture | done | 2026-05-13 | Noise buffer → HP 1500Hz → gain (4% of note vol) → masterGainNode; looped, envelope-gated |
| 3.6 | Vibrato depth variation | done | 2026-05-13 | 0.12Hz depthMod osc ±20% of finalVibDepth; starts at vibDelay, returned as depthModNodes |
| 3.7 | Harmony voice detuning jitter | done | 2026-05-13 | osc1 ±2¢ + osc2 ±2¢ jitter at note creation; applied at detuneMult override line |

### 3.1 — Chord piano unison layer

**Why:** Each piano note is a single PeriodicWave oscillator. Real pianos have paired strings per note with inharmonic detuning — gives the characteristic wide, shimmering spread.

**Approach:** Piano preset only — create a second `OscillatorNode` alongside the first with the same `PeriodicWave`, detuned `+6 + Math.random() * 4` cents (6–10¢, fresh random per note). Mix at 0.6 gain relative to primary. Costs one oscillator per chord note; disconnect it alongside the primary in `oscSine.onended`.

**File:** `public/engine/synth-chords.js` — oscillator creation block around line 174. Gate on `preset === pianoPreset`.

---

### 3.2 — Chord distortion soft-knee

**Why:** WaveShaper only connects at `intensity >= 0.8` — hard gate, perceptible step in the sound.

**Approach:** Always connect the WaveShaper (no `if` guard) but vary drive continuously:
```js
const drive = Math.max(0.001, (intensity - 0.5) * 4.0);
```
At intensity 0.5 → drive 0.001 (transparent); at 1.0 → drive 2.0. Pass `drive` into `createSoftClipCurve(drive)` — verify that function accepts a drive param (it does, line 238–242 of synth-chords.js uses a `drive` local already; just need to expose it).

**File:** `public/engine/synth-chords.js` lines 231–250.

---

### 3.3 — Hammer noise pitch-aware

**Why:** Strike bandpass is `1200 + finalVol * 800 Hz` regardless of note pitch. Low bass chords and high treble chords have identical strike character.

**Approach:** Factor note frequency into the center:
```js
freq: Math.max(800, Math.min(4000, 800 + (freq / 440) * 600 + finalVol * 500))
```
Low A1 (55Hz): ~880Hz center (dull thud). High C6 (1047Hz): ~2230Hz center (sharp click).

**File:** `public/engine/synth-chords.js` — `playPercussiveStrike()` call around line 165.

---

### 3.4 — Leslie speed variation

**Why:** Organ Leslie LFO is hardcoded at 6.2Hz (fast tremolo). Real Leslies have a slow chorale mode (~0.7Hz) that kicks in at low intensity, with a ramp between modes.

**Approach:** The Leslie LFO node's `frequency` AudioParam is reachable after organ note creation. Hook into the note's intensity parameter: when `playback.bandIntensity < 0.4`, target 0.7Hz; when > 0.6, target 6.2Hz; ramp between via `exponentialRampToValueAtTime` over 0.5s.

The LFO is created fresh per note in `synth-harmonies.js` — store a reference to the LFO frequency on the returned voice object or coordinate via a module-level variable similar to how `soloist.lastRenderedFreq` works.

**File:** `public/engine/synth-harmonies.js` — organ preset section around line 147.

---

### 3.5 — Saxophone breath texture

**Why:** Breath modulation is a single 3.5Hz gain LFO. Real saxophone has turbulence noise mixed into the signal — audible between and within notes as "air."

**Approach:** In the saxophone preset path, create a noise source from `groove.audioBuffers.noise` (or a `createBuffer` with white noise), gate it through a gain node driven by the note envelope, highpass filter at 1500Hz, and mix at ~4% into the oscillator chain before the bandpass filters. The noise rides through the same filters, getting shaped like the instrument — gives "air in the reed" rather than just volume wobble.

**File:** `public/engine/synth-soloist.js` — saxophone preset block, lines 387–491.

---

### 3.6 — Vibrato depth variation

**Why:** Once vibrato onset completes, depth is static. Real wind players swell and taper vibrato expressively within sustained notes.

**Approach:** Add a secondary slow LFO (~0.12Hz) modulating the vibrato depth GainNode ±20% of its target. This is a second `OscillatorNode` (type: 'sine') at 0.12Hz connected to a GainNode, which connects to the vibrato depth gain's `gain` AudioParam. Start it with the note and stop with it.

**File:** `public/engine/synth-soloist.js` — vibrato section, lines 861–939.

---

### 3.7 — Harmony voice detuning jitter

**Why:** Harmony sub-oscillator is exactly 0.5× frequency — too locked. Style detuning constants (e.g. +5¢, +4¢) are fixed per style, not per note.

**Approach:** At oscillator creation time, add ±2¢ random jitter to both primary and sub oscillator `detune` AudioParams:
```js
osc.detune.setValueAtTime(baseDetune + (Math.random() - 0.5) * 4, startTime);
```
Apply to all style branches (organ, plucks, disco, stabs, counter, strings) in the style config block, lines 146–311.

**File:** `public/engine/synth-harmonies.js` — all oscillator creation branches.

---

## Reference: Key File Locations

| Concern | File |
|---|---|
| Audio graph / bus wiring | `public/engine/engine.js` — `initAudio()` |
| Reverb IR generation | `public/utils.js` — `createReverbImpulse()` |
| Gain bus restore on context recovery | `public/engine/engine.js` — `restoreGains()` |
| Reverb & gain defaults | `public/state/instruments.js` — `INSTRUMENT_REVERB_DEFAULTS` |
| Bus gain multipliers | `public/config.js` — `MIXER_GAIN_MULTIPLIERS` |
| Chord synthesis | `public/engine/synth-chords.js` |
| Chord voicing / intervals | `public/engine/chords-engine.js`, `chords-styles.js` |
| Bass synthesis | `public/engine/synth-bass.js` |
| Bass rhythm patterns | `public/engine/bass-styles.js`, `bass-engine.js` |
| Drum synthesis | `public/engine/synth-drums.js` |
| Drum grooves | `public/engine/groove-engine.js`, `engine/grooves/*.js` |
| Soloist synthesis | `public/engine/synth-soloist.js` |
| Soloist generation | `public/engine/soloist.js`, `soloist-config.js` |
| Harmony synthesis | `public/engine/synth-harmonies.js` |
| Harmony generation | `public/engine/harmonies.js` |
| Shared synth utilities | `public/engine/synth-utils.js` |
| Global audio utilities | `public/utils.js` |
