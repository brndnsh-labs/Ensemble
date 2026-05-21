# Discovery Report — Chord/Comping Synthesis (`public/engine/synth-chords.ts`)

Opus reviewer, 2026-05-21. Raw findings — untouched; new findings during epic work append here.

## 1. Synthesis method

`playNote` (97), two presets `Warm` and `Piano` (20–43).

- **Component A — "Hammer Strike"** (152–169, Piano-only): one-shot noise burst from `groove.audioBuffers.noise` through a bandpass, via `playPercussiveStrike`. Center freq `800 + (freq/440)*600 + finalVol*500` clamped 800–4000 Hz, Q 1.5, attack 1ms, decay 10ms, life 100ms.
- **Component B — "Harmonic Body"** (172–293): one main `OscillatorNode`. Piano uses a cached custom `PeriodicWave` (`createPianoWave`, 45) — a **fixed 10-partial harmonic series** `[0,1,0.6,0.4,0.25,0.15,0.1,0.08,0.05,0.03]`, all-real. `Warm` uses `preset.fundamental` (triangle). A second "unison" osc for Piano (178–187), detuned 6–10 cents, gain 0.6. Chain: `osc → lowpass → [waveShaper] → mainGain → bodyShape(peaking) → hpf(150 Hz) → panner → chordsGain`. Filter sweeps from `velocityCutoff` toward `preset.filterBase` via `setTargetAtTime`. WaveShaper `atan` soft-clip, drive from `(intensity-0.5)*4`, curve cached. `bodyShape` peaking at 330 Hz cuts 0–4 dB. Sustain pedal via `playback.heldNotes`, capped 64.

Triggering (`scheduler-core.ts:881–951`): `scheduleChords` counts non-muted voices for `1/sqrt(numVoices)` polyphony compensation. Audio-clock based.

## 2. Toy-ish causes

- **The "piano" wave is a static harmonic series with no inharmonicity** (45–49). Real piano partials are stretched-sharp and amplitudes differ enormously bass↔treble. One fixed wave for all 88 keys reads as "organ-ish synth."
- **No per-partial decay.** A single oscillator + one amp envelope decays all partials together. The lowpass sweep fakes darkening uniformly, not partial-by-partial. Sustained notes stay "buzzy stable."
- **Attack has no real transient.** The hammer strike is only `finalVol*0.15`, a diffuse bandpass-noise blip, 10ms decay. Too quiet/diffuse to give an attack edge. **The #1 reason chords get buried** — nothing for the ear to latch onto.
- **Spectrum is dull in the presence region.** Heavily low-passed (`filterBase` 400 Hz Piano); no sustained 2–5 kHz energy. The only HF is the noise blip, gone in 100ms.
- **`highpass at 150 Hz` + 330 Hz `bodyShape` cut** thin the lows too — the voice occupies only a narrow congested midband where bass/soloist live.
- **Polyphony compensation is aggressive.** `1/sqrt(numVoices)` — a 4-note chord plays each voice at 0.5×, so a full chord is *quieter* than a single note. Works directly against "chords get buried."
- **Dead per-voice stagger.** `scheduleChords` always passes `index: 0` (`scheduler-core.ts:931`), so the `index * stagger` humanize term (137) is always 0. Every chord note starts perfectly simultaneously — no strum, no human spread.
- **WaveShaper drive is intensity-only** — floors at 0.001 (bypassed) for `intensity ≤ 0.5`.
- **Velocity only moves filter cutoff and gain**, not wave content. Soft and hard hits are the same wave.
- **No release character** — 30ms fade, no damper noise.

## 3. Craft path

**Quick wins:** (1) fix the dead stagger / add a 4–12ms humanized strum spread; (2) make the hammer transient louder, pitched, and present (raise toward 0.4–0.6×, add a fast pitched click in 2–4 kHz); (3) velocity→brightness of the wave (crossfade mellow/bright periodic waves); (4) hold presence energy (raise `filterBase`, add a +2–4 dB shelf around 3 kHz); (5) soften polyphony comp (`1/numVoices^0.3` or a cap).

**Deep rework:** (6) **per-partial additive voice** — replace the single periodic-wave osc with ~6–10 individually-enveloped sine partials, upper partials with shorter decay. *The* technique that makes synthetic piano stop sounding synthetic; (7) **inharmonicity** — `f_n = n·f0·sqrt(1+B·n²)`; (8) two-stage decay + damper noise on release.

**How close can pure synthesis get?** Very convincing for an **electric piano** (Rhodes/Wurli/FM tine) — those are synthesis instruments. For a **convincing acoustic grand**, synthesis has a real ceiling. Recommendation: aim the synthesized core at a great electric piano + a serviceable acoustic.

## 4. Pack candidacy

A sample-based **acoustic grand** pack would genuinely beat synthesis — multi-velocity, multi-key sampled piano is the one instrument where samples have a clear edge. A sampled **electric piano** would NOT meaningfully beat a well-built synthesized EP. The current voice is far below its own synthesis ceiling, so the pack question is premature — most of the perceived "toy" gap is fixable in pure synthesis.

## 5. Audio-graph hygiene

- `freq` is `Number.isFinite`-guarded (111) — good.
- **`vol` / `velocity` unguarded.** Comes straight from `n.velocity`. A NaN velocity → `finalVol` NaN → poisons `mainGain.gain`, filter cutoff, shaper drive silently. **Recommend a guard.**
- **`duration` unguarded** — `osc.stop(NaN)` throws (caught, note silently never schedules).
- `bandIntensity` NaN would poison `velocityCutoff` past `Math.max(100, NaN) === NaN`.
- Sustained-note leak path: `osc.stop` is deferred to `stopNote`; on a teardown that doesn't call `killAllPianoNotes` with the pedal held, oscillators never fire `onended` and leak.
- Clock correct; `Math.random()` for stagger/detune is non-deterministic (fine for jitter).

## 6. Footprint

No threat. ~11 KB pure code. `cachedShaperCurve` is a runtime `Float32Array` (~176 KB RAM, 0 bundle) — could be smaller (8–16K samples plenty). Craft-path items add code only.

**Bottom line:** Chords are buried because they have no transient, no sustained presence-band energy, and mechanically simultaneous + polyphony-attenuated onsets. The biggest realism ceiling is the single static harmonic wave with one shared decay — per-partial additive + inharmonicity + velocity-morphing moves it from "toy" to "expensive electric piano." A true sampled acoustic grand is the one honest pack candidate, but premature.
